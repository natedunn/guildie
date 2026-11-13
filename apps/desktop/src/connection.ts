// Being connected to one Guildie site, and the helper's job while connected
// (packages/sync): upload the addon's saved data when the game rewrites it,
// and keep GuildieData.lua fresh. The token comes from the site itself
// (setToken, after the user signs in in the window) or, as a fallback, from
// the pairing flow the helper uses.

import { hostname } from "node:os";
import {
	Api,
	isTokenShaped,
	isWowFolder,
	type LastUpload,
	type Log,
	loadedAddonVersion,
	SyncEngine,
} from "@guildie/sync";
import { net } from "electron";
import { type CaptureConfig, LivePixels, type PixelStatus } from "./live-pixels.ts";
import { forgetToken, loadToken, saveToken, settings } from "./settings.ts";
import type { UpdateState } from "./updater.ts";

export type Status = {
	livePixelsEnabled?: boolean;
	livePixelsAvailable?: boolean;
	livePixels?: PixelStatus;
	connected: boolean;
	account?: string;
	lastUpload?: LastUpload;
	guildDataAt?: number;
	wowFolder?: string;
	/** While connecting through the pairing flow: the code to approve. */
	pairingCode?: string;
	/** The Guildie addon's version in the WoW folder (undefined: not installed). Set by main (addon.ts). */
	addonVersion?: string;
	/** False after the player uninstalled the addon: the app leaves it out until they install it again. */
	addonManaged?: boolean;
	/** The addon version this app installs. */
	addonBundled?: string;
	/**
	 * The addon version the game last ran (saved at /reload or logout): older
	 * than `addonVersion` means WoW needs a /reload. null: an addon from before
	 * 0.10.1 (it didn't say); undefined: nothing saved yet.
	 */
	addonLoaded?: string | null;
	/** An app update downloaded and waiting for a restart (updater.ts). */
	updateReady?: string;
	/** Where updating stands (updater.ts UpdateState). */
	update?: UpdateState;
};

const TICK_MS = 2_000;
const RETRY_MS = 60_000;

export class Connection {
	/** The site's origin, which the token is kept under. */
	readonly origin: string;
	private readonly api: Api;
	private readonly sync: SyncEngine;
	private readonly log: Log;
	private account: string | undefined;
	private pairingCode: string | undefined;
	private addonVersion: string | undefined;
	private addonManaged: boolean | undefined;
	private addonBundled: string | undefined;
	private addonLoaded: string | null | undefined;
	private updateReady: string | undefined;
	private update: UpdateState | undefined;
	private timer: NodeJS.Timeout | undefined;
	private lastRetry = 0;
	private readonly pixels: LivePixels | undefined;
	private pixelStatus: PixelStatus | undefined;
	private pixelsEnabled = false;
	private readonly listeners = new Set<(status: Status) => void>();
	/** Notices for the user (shown as notifications by main). */
	onNotice: (title: string, body: string) => void = () => {};
	/** The WoW folder was chosen (main installs or updates the addon there). */
	onWowFolder: (folder: string) => void = () => {};

	constructor(origin: string, log: Log, pixelConfig?: CaptureConfig) {
		this.origin = origin;
		this.log = log;
		this.pixelsEnabled = !!pixelConfig && (!("auto" in pixelConfig) || settings.livePixelsEnabled(origin));
		const saved = loadToken(origin);
		// Electron's network stack: the system's proxy and certificates, and
		// *.localhost's self-signed certificate (see main.ts).
		this.api = new Api(origin, saved?.token, (url, init) => net.fetch(url, init));
		this.sync = new SyncEngine(this.api, settings.wow, {
			log,
			onUnauthorized: async () => {
				await this.disconnect(false);
				this.onNotice("Guildie", "This computer was disconnected from Guildie. Sign in again to keep uploading.");
			},
			onUpload: () => this.emit(),
			onGuildData: () => this.emit(),
			onUnmatched: (names) =>
				this.onNotice("Guildie", `Not claimed on Guildie yet: ${names.join(", ")}. Claim them on your account page.`),
		});
		if (pixelConfig)
			this.pixels = new LivePixels(
				pixelConfig,
				(data) => {
					if (this.account && !this.sync.queuePixelSnapshot(data)) log("Live pixels: invalid snapshot ignored.");
				},
				(state) => {
					this.pixelStatus = state;
					log(`Live pixels: ${state}`);
					this.emit();
				},
			);
	}

	get status(): Status {
		return {
			livePixelsEnabled: this.pixelsEnabled,
			livePixelsAvailable: !!this.pixels,
			livePixels: this.pixelStatus,
			connected: !!this.account,
			account: this.account,
			lastUpload: this.sync.lastUpload,
			guildDataAt: this.sync.guildDataAt,
			wowFolder: this.sync.wowFolder,
			pairingCode: this.pairingCode,
			addonVersion: this.addonVersion,
			addonManaged: this.addonManaged,
			addonBundled: this.addonBundled,
			addonLoaded: this.addonLoaded,
			updateReady: this.updateReady,
			update: this.update,
		};
	}

	/** What main knows about the addon and app updates, shown with the sync status. */
	setExtras(extras: {
		addonVersion?: string;
		addonManaged?: boolean;
		addonBundled?: string;
		updateReady?: string;
		update?: UpdateState;
	}) {
		if ("update" in extras) this.update = extras.update;
		if ("addonBundled" in extras) this.addonBundled = extras.addonBundled;
		if ("addonVersion" in extras) this.addonVersion = extras.addonVersion;
		if ("addonManaged" in extras) this.addonManaged = extras.addonManaged;
		if ("updateReady" in extras) this.updateReady = extras.updateReady;
		this.emit();
	}

	onStatus(listener: (status: Status) => void) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private emit() {
		const status = this.status;
		for (const listener of this.listeners) listener(status);
	}

	/** Check the saved token, then sync every couple of seconds while connected. */
	async start() {
		if (this.api.token) await this.verify().catch((e: Error) => this.log(`Can't reach ${this.origin}: ${e.message}`));
		this.timer = setInterval(() => void this.tick(), TICK_MS);
		this.emit();
	}

	stop() {
		clearInterval(this.timer);
		this.pixels?.stop();
		this.sync.reset();
	}

	setLivePixels(enabled: unknown) {
		if (typeof enabled !== "boolean") throw new Error("Expected a boolean");
		if (enabled && !this.pixels) throw new Error("Live capture is unavailable in this build");
		this.pixelsEnabled = enabled;
		settings.setLivePixels(this.origin, enabled);
		this.sync.clearPixelSnapshot();
		this.pixels?.stop();
		if (enabled && this.account) this.pixels?.start();
		this.emit();
	}

	private async tick() {
		// Which addon the game last ran changes when it saves (at /reload or logout).
		const loaded = loadedAddonVersion(this.sync.wowFolder);
		if (loaded !== this.addonLoaded) {
			this.addonLoaded = loaded;
			this.emit();
		}
		if (this.account) return this.sync.tick();
		// Offline at start (or since): try the saved token again every minute.
		if (this.api.token && Date.now() - this.lastRetry > RETRY_MS) {
			this.lastRetry = Date.now();
			await this.verify().catch(() => undefined);
		}
	}

	/** Asks the site who the token belongs to. False (and forgotten) if it's not accepted. */
	private async verify() {
		const me = await this.api.me();
		if (!me) {
			this.log("The saved token no longer works.");
			await this.disconnect(false);
			return false;
		}
		this.account = me.battletag ?? this.account ?? "you";
		if (this.pixelsEnabled) this.pixels?.start();
		if (this.api.token) saveToken(this.origin, this.api.token, this.account);
		this.log(`Connected to ${this.origin} as ${this.account}`);
		if (!me.characters.length)
			this.onNotice("Guildie", "No claimed characters yet. Claim them on your Guildie account page.");
		this.emit();
		return true;
	}

	/** The site hands over a token after the user signs in. Checked with the site before it's kept. */
	async setToken(token: unknown, account?: unknown) {
		if (!isTokenShaped(token)) throw new Error("That isn't a Guildie token.");
		if (account !== undefined && (typeof account !== "string" || account.length > 100))
			throw new Error("Invalid account name.");
		if (token === this.api.token && this.account) return;
		const me = await new Api(this.origin, token, (url, init) => net.fetch(url, init)).me();
		if (!me) throw new Error("Guildie didn't accept that token.");
		this.api.token = token;
		this.account = me.battletag ?? account ?? "you";
		if (!saveToken(this.origin, token, this.account))
			this.log("Can't encrypt the token on this computer; it's kept until the app quits.");
		this.sync.reset();
		this.pixels?.stop();
		if (this.pixelsEnabled) this.pixels?.start();
		this.log(`Connected to ${this.origin} as ${this.account}`);
		this.emit();
	}

	/** Disconnect this computer: the site forgets the token (unless it already has) and so do we. */
	async disconnect(revoke = true) {
		this.account = undefined;
		this.pixels?.stop();
		this.sync.reset();
		const revocation = revoke && this.api.token ? this.api.signOut() : undefined;
		this.api.token = undefined;
		forgetToken(this.origin);
		this.sync.reset();
		this.emit();
		await revocation;
	}

	/** "Upload now": upload the saved files again and refresh guild data. */
	uploadNow() {
		this.sync.now();
		void this.tick();
	}

	setWowFolder(folder: string) {
		if (!isWowFolder(folder))
			throw new Error("That folder doesn't look like World of Warcraft (no _classic_ or _forever_ folder inside).");
		settings.wow = folder;
		this.sync.setWow(folder);
		this.log(`WoW folder: ${folder}`);
		this.onWowFolder(folder);
		this.emit();
	}

	/**
	 * Sign in: the player approves this app in their own browser (any
	 * Battle.net login works there, Google included; inside the app's window it
	 * wouldn't), and the app gets its upload token plus a one-time code that
	 * `signedIn` uses to sign the window in. `openBrowser` opens the approval page.
	 */
	async pair(openBrowser: (connectUrl: string) => void, signedIn: (sessionCode: string) => void) {
		if (this.pairingCode) return;
		const previousToken = this.api.token;
		try {
			const { code, pollSecret, expiresInSeconds, connectUrl } = await this.api.startPairing(
				`Guildie app on ${hostname() || "this PC"}`,
				true,
			);
			this.pairingCode = code;
			this.emit();
			openBrowser(connectUrl);
			const until = Date.now() + expiresInSeconds * 1000;
			while (Date.now() < until) {
				await new Promise((resolve) => setTimeout(resolve, 2_000));
				const result = await this.api.pollPairing(code, pollSecret).catch(() => ({ status: "pending" as const }));
				if (result.status === "approved") {
					// Already connected (signing the window in again): retire the old token.
					if (previousToken && previousToken !== result.token) await this.api.signOut();
					this.account = undefined;
					await this.setToken(result.token);
					if (result.sessionCode) signedIn(result.sessionCode);
					this.onNotice(
						"Guildie",
						`Signed in as ${this.account}. Your addon data uploads when you log out of WoW or /reload.`,
					);
					return;
				}
				if (result.status === "expired") break;
			}
			this.onNotice("Guildie", "Signing in timed out. Choose Sign in to try again.");
		} catch (e) {
			this.log(`Connecting failed: ${(e as Error).message}`);
			this.onNotice("Guildie", `Couldn't connect to ${this.origin}.`);
		} finally {
			this.pairingCode = undefined;
			this.emit();
		}
	}
}
