// What the app remembers, in <userData>/settings.json. Tokens are encrypted
// with Electron's safeStorage (DPAPI on Windows, the Keychain on macOS) and
// kept per site origin, so a preview's token never applies to guildie.club.

import { copyFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { app, safeStorage } from "electron";

export type Bounds = { x: number; y: number; width: number; height: number; maximized?: boolean };

type Stored = {
	livePixelsOrigins?: string[];
	/** origin -> encrypted token (base64) and the account it belongs to. */
	tokens: Record<string, { token: string; account?: string }>;
	wow?: string;
	bounds?: Bounds;
	/** The "still running in the tray" notice was shown once. */
	trayNoticeShown?: boolean;
	/** False after the player uninstalls the addon: don't put it back until they install it again. */
	addonManaged?: boolean;
};

const file = () => join(app.getPath("userData"), "settings.json");

let cache: Stored | undefined;

function load(): Stored {
	if (cache) return cache;
	let text: string;
	try {
		text = readFileSync(file(), "utf8");
	} catch (error) {
		// No file yet: a fresh start. Any other failure (the file locked by
		// antivirus, say) is not cached, and save() won't write over a file it
		// couldn't read: the player's settings are never replaced with nothing.
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return (cache = { tokens: {} });
		return { tokens: {} };
	}
	try {
		const raw = JSON.parse(text) as Partial<Stored>;
		cache = { ...raw, tokens: raw.tokens && typeof raw.tokens === "object" ? raw.tokens : {} };
	} catch {
		// Unreadable JSON: keep a copy before starting over.
		try {
			copyFileSync(file(), `${file()}.broken-${Date.now()}`);
		} catch {}
		cache = { tokens: {} };
	}
	return cache;
}

function save() {
	// Not loaded (the file couldn't be read): writing now would erase it.
	if (!cache) return;
	const path = file();
	mkdirSync(dirname(path), { recursive: true });
	// Write then rename, so a crash never leaves half a file.
	writeFileSync(`${path}.tmp`, JSON.stringify(cache, null, 2));
	renameSync(`${path}.tmp`, path);
}

export const settings = {
	livePixelsEnabled(origin: string) {
		const origins = load().livePixelsOrigins;
		return origins === undefined || origins.includes(origin);
	},
	setLivePixels(origin: string, enabled: boolean) {
		const origins = new Set(load().livePixelsOrigins ?? []);
		if (enabled) origins.add(origin);
		else origins.delete(origin);
		load().livePixelsOrigins = [...origins];
		save();
	},
	get wow() {
		return load().wow;
	},
	set wow(wow: string | undefined) {
		load().wow = wow;
		save();
	},
	get bounds() {
		return load().bounds;
	},
	set bounds(bounds: Bounds | undefined) {
		load().bounds = bounds;
		save();
	},
	get addonManaged() {
		return load().addonManaged !== false;
	},
	set addonManaged(on: boolean) {
		load().addonManaged = on ? undefined : false;
		save();
	},
	get trayNoticeShown() {
		return !!load().trayNoticeShown;
	},
	set trayNoticeShown(shown: boolean) {
		load().trayNoticeShown = shown;
		save();
	},
};

/** The token saved for a site, decrypted; undefined if none (or it can't be decrypted here). */
export function loadToken(origin: string): { token: string; account?: string } | undefined {
	const saved = load().tokens[origin];
	if (!saved || !safeStorage.isEncryptionAvailable()) return undefined;
	try {
		return { token: safeStorage.decryptString(Buffer.from(saved.token, "base64")), account: saved.account };
	} catch {
		return undefined;
	}
}

/** Saves a site's token encrypted. Returns false when the OS can't encrypt (then it's kept for this run only). */
export function saveToken(origin: string, token: string, account?: string) {
	if (!safeStorage.isEncryptionAvailable()) return false;
	load().tokens[origin] = { token: safeStorage.encryptString(token).toString("base64"), account };
	save();
	return true;
}

export function forgetToken(origin: string) {
	if (!(origin in load().tokens)) return;
	delete load().tokens[origin];
	save();
}
