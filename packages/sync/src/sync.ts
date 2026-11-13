// The helper's job, shared by the helper and the desktop app: upload the
// addon's SavedVariables when the game rewrites them, and keep each installed
// addon's GuildieData.lua fresh. The host (helper or desktop app) decides when
// it's connected and calls tick() every couple of seconds while it is.

import type { Api } from "./api.ts";
import type { Log } from "./config.ts";
import { writeGuildData } from "./luaData.ts";
import { findAddonFolders, findWowFolder, Watcher } from "./watcher.ts";

export const GUILD_DATA_EVERY_MS = 15 * 60_000;

export type LastUpload = { at: number; characters: string[] };

export type SyncEvents = {
	log: Log;
	/** The site no longer accepts the token: disconnect. */
	onUnauthorized: () => void | Promise<void>;
	/** An upload went through and updated these characters (slugs). */
	onUpload?: (upload: LastUpload) => void;
	/** Characters the site doesn't know as yours yet (each named once). */
	onUnmatched?: (names: string[]) => void;
	/** Guild data was downloaded (and written where it changed). */
	onGuildData?: (at: number) => void;
};

/** "brenna-ironfoot" -> "Brenna". */
export const displayName = (slug: string) => (slug.split("-")[0] ?? slug).replace(/^./, (c) => c.toUpperCase());

export class SyncEngine {
	lastUpload: LastUpload | undefined;
	guildDataAt: number | undefined;
	private wowSetting: string | undefined;
	private readonly api: Api;
	private readonly events: SyncEvents;
	private readonly watcher: Watcher;
	private readonly warnedUnmatched = new Set<string>();
	private lastGuildDataTry = 0;
	private busy = false;
	private pixelSnapshot: string | undefined;
	private pixelUploaded: string | undefined;
	private pixelAttemptAt = 0;

	constructor(api: Api, wow: string | undefined, events: SyncEvents) {
		this.api = api;
		this.wowSetting = wow;
		this.events = events;
		this.watcher = new Watcher(wow, (file, payload) => this.upload(file, payload), events.log);
	}

	/** The WoW folder in use: the chosen one, or the one found in the usual places. */
	get wowFolder() {
		return findWowFolder(this.wowSetting);
	}

	setWow(wow: string | undefined) {
		this.wowSetting = wow;
		this.watcher.setWow(wow);
		this.lastGuildDataTry = 0;
	}

	/** One round: upload what changed, and download guild data when it's due. */
	async tick() {
		if (this.busy) return;
		this.busy = true;
		try {
			await this.watcher.tick();
			const snapshot = this.pixelSnapshot;
			if (snapshot && this.api.token && Date.now() - this.pixelAttemptAt >= 30_000) {
				this.pixelAttemptAt = Date.now();
				const token = this.api.token;
				if (await this.upload("live pixel snapshot", snapshot)) {
					if (this.api.token === token) this.pixelUploaded = snapshot;
					if (this.pixelSnapshot === snapshot) this.pixelSnapshot = undefined;
				}
			}
			if (this.api.token && Date.now() - this.lastGuildDataTry > GUILD_DATA_EVERY_MS) await this.refreshGuildData();
		} catch (e) {
			this.events.log(`Sync failed: ${(e as Error).message}`);
		} finally {
			this.busy = false;
		}
	}

	/** "Upload now": upload the saved files again and download guild data on the next tick. */
	now() {
		this.watcher.forget();
		this.lastGuildDataTry = 0;
	}

	/** After signing out: forget what was uploaded, so connecting again uploads everything. */
	reset() {
		this.pixelSnapshot = undefined;
		this.pixelUploaded = undefined;
		this.pixelAttemptAt = 0;
		this.watcher.forget();
		this.warnedUnmatched.clear();
		this.lastUpload = undefined;
		this.guildDataAt = undefined;
		this.lastGuildDataTry = 0;
	}

	/** Complete snapshots only; character ownership and field validation remain server-side. */
	clearPixelSnapshot() {
		this.pixelSnapshot = undefined;
		this.pixelUploaded = undefined;
	}

	queuePixelSnapshot(value: unknown) {
		if (!this.api.token || !value || typeof value !== "object") return false;
		const { version, characters } = value as { version?: unknown; characters?: unknown };
		if (![1, 2, 3, 4, 5].includes(version as number) || !Array.isArray(characters) || !characters.length) return false;
		const payload = JSON.stringify({ version, characters });
		if (Buffer.byteLength(payload, "utf8") > 1024 * 1024) return false;
		this.pixelSnapshot = payload !== this.pixelUploaded ? payload : undefined;
		return true;
	}

	private async upload(file: string, payload: string) {
		if (!this.api.token) return false;
		const token = this.api.token;
		const { ok, status, body } = await this.api.upload(payload);
		// A request begun before sign-out/account switching must not update the new session.
		if (this.api.token !== token) return false;
		if (status === 401) {
			this.events.log("The site no longer accepts this token; disconnecting.");
			await this.events.onUnauthorized();
			return false;
		}
		if (!ok) {
			this.events.log(`Upload failed (${status}): ${body.error ?? "unknown error"}`);
			return false;
		}
		this.events.log(`Uploaded ${file}: updated ${body.accepted?.join(", ") || "nothing"}`);
		if (body.rejected?.length)
			this.events.log(`The site refused data for ${body.rejected.join(", ")} (malformed; is the addon current?)`);
		if (body.accepted?.length) {
			this.lastUpload = { at: Date.now(), characters: body.accepted };
			this.events.onUpload?.(this.lastUpload);
			// Download guild data again right after (this same tick): it carries
			// what Guildie now shows for your characters, so the addon's window
			// reads "up to date" at the next /reload instead of up to 15 min later.
			this.lastGuildDataTry = 0;
		}
		const newlyUnmatched = (body.unmatched ?? []).filter((n) => !this.warnedUnmatched.has(n));
		if (newlyUnmatched.length) {
			for (const n of newlyUnmatched) this.warnedUnmatched.add(n);
			this.events.onUnmatched?.(newlyUnmatched);
		}
		return true;
	}

	/** Download the guild data into GuildieData.lua in each installed copy of the addon. */
	async refreshGuildData() {
		this.lastGuildDataTry = Date.now();
		const folders = findAddonFolders(this.wowSetting);
		if (!folders.length) return;
		let data: Awaited<ReturnType<Api["guildData"]>>;
		try {
			data = await this.api.guildData();
		} catch (e) {
			this.events.log(`Guild data download failed: ${(e as Error).message}`);
			return;
		}
		if (!data) {
			this.events.log("The site no longer accepts this token; disconnecting.");
			await this.events.onUnauthorized();
			return;
		}
		writeGuildData(folders, data, this.events.log);
		this.guildDataAt = Date.now();
		this.events.onGuildData?.(this.guildDataAt);
	}
}
