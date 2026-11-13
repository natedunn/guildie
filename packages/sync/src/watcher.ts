import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Log } from "./config.ts";
import { extractPayload } from "./savedVariables.ts";

/** Default World of Warcraft folders, most likely first. */
export function wowCandidates(wow?: string) {
	if (wow) return [wow];
	if (process.platform === "win32") {
		return [
			"C:\\Program Files (x86)\\World of Warcraft",
			"C:\\Program Files\\World of Warcraft",
			"D:\\World of Warcraft",
			"D:\\Games\\World of Warcraft",
		];
	}
	return ["/Applications/World of Warcraft"];
}

/** A game install's flavor folders: _classic_, _retail_, _forever_... */
const flavorFolders = (root: string) => readdirSync(root).filter((d) => /^_.+_$/.test(d));

/** Whether a folder looks like a World of Warcraft install (has a _flavor_ folder). */
export function isWowFolder(folder: string) {
	try {
		return flavorFolders(folder).length > 0;
	} catch {
		return false;
	}
}

/** The WoW folder in use: the chosen one, or the first default that looks like an install. */
export function findWowFolder(wow?: string): string | undefined {
	return wowCandidates(wow).find(isWowFolder);
}

/** Every Guildie.lua under <wow>/_*_/WTF/Account/<account>/SavedVariables/, Forever's folder first. */
export function findSavedVariables(wow?: string): string[] {
	const found: string[] = [];
	for (const root of wowCandidates(wow)) {
		if (!existsSync(root)) continue;
		const flavors = flavorFolders(root).sort((a, b) => Number(b.includes("forever")) - Number(a.includes("forever")));
		for (const flavor of flavors) {
			const accounts = join(root, flavor, "WTF", "Account");
			if (!existsSync(accounts)) continue;
			for (const account of readdirSync(accounts)) {
				const file = join(accounts, account, "SavedVariables", "Guildie.lua");
				if (existsSync(file)) found.push(file);
			}
		}
	}
	return found;
}

/**
 * The addon version the game last ran: `addonVersion` in the newest saved
 * Guildie.lua (the addon writes it from 0.10.1; the game saves it at /reload
 * and logout). `null`: saved by an older addon. `undefined`: nothing saved yet.
 */
export function loadedAddonVersion(wow?: string): string | null | undefined {
	let newest: { file: string; at: number } | undefined;
	for (const file of findSavedVariables(wow)) {
		try {
			const at = statSync(file).mtimeMs;
			if (!newest || at > newest.at) newest = { file, at };
		} catch {}
	}
	if (!newest) return undefined;
	// The file can be a few MB: read it again only when the game rewrote it.
	if (lastRead?.file === newest.file && lastRead.at === newest.at) return lastRead.version;
	try {
		const match = readFileSync(newest.file, "utf8").match(/\["addonVersion"\]\s*=\s*"([^"\\]+)"/);
		lastRead = { ...newest, version: match ? match[1] : null };
		return lastRead.version;
	} catch {
		return undefined;
	}
}
let lastRead: { file: string; at: number; version: string | null } | undefined;

/** Every installed copy of the addon: <wow>/_*_/Interface/AddOns/Guildie. */
export function findAddonFolders(wow?: string): string[] {
	const found: string[] = [];
	for (const root of wowCandidates(wow)) {
		if (!existsSync(root)) continue;
		for (const flavor of flavorFolders(root)) {
			const folder = join(root, flavor, "Interface", "AddOns", "Guildie");
			if (existsSync(join(folder, "Guildie.toc"))) found.push(folder);
		}
	}
	return found;
}

/**
 * Watches the addon's saved files and calls `upload` with the payload whenever
 * it changes (the game rewrites the file on /reload and logout). `upload`
 * returns whether it worked; failures are retried after 30 s.
 */
export class Watcher {
	private files: string[] = [];
	private lastScan = 0;
	private seen = new Map<string, { mtime: number; payload: string | null; retryAt?: number }>();

	private wow: string | undefined;
	private readonly upload: (file: string, payload: string) => Promise<boolean>;
	private readonly log: Log;

	constructor(wow: string | undefined, upload: (file: string, payload: string) => Promise<boolean>, log: Log) {
		this.wow = wow;
		this.upload = upload;
		this.log = log;
	}

	/** Upload the current files again, even if nothing changed. */
	forget() {
		this.seen.clear();
	}

	/** Watch another WoW folder (undefined: find it again). */
	setWow(wow: string | undefined) {
		this.wow = wow;
		this.files = [];
		this.lastScan = 0;
		this.seen.clear();
	}

	async tick() {
		if (Date.now() - this.lastScan > 30_000 || this.files.length === 0) {
			const next = findSavedVariables(this.wow);
			if (next.join() !== this.files.join()) {
				this.files = next;
				this.log(
					next.length
						? `Watching:\n  ${next.join("\n  ")}`
						: "No Guildie.lua yet. Install the addon and log in to WoW once (it's written when you log out or /reload).",
				);
			}
			this.lastScan = Date.now();
		}
		for (const file of this.files) {
			let mtime: number;
			try {
				mtime = statSync(file).mtimeMs;
			} catch {
				continue;
			}
			const before = this.seen.get(file);
			if (before && before.mtime === mtime) continue;
			if (before?.retryAt && Date.now() < before.retryAt) continue;
			let text: string;
			try {
				text = readFileSync(file, "utf8");
			} catch {
				continue;
			}
			const payload = extractPayload(text);
			if (payload && payload !== before?.payload) {
				const ok = await this.upload(file, payload).catch((e: Error) => {
					this.log(`Upload failed: ${e.message}`);
					return false;
				});
				this.seen.set(
					file,
					ok ? { mtime, payload } : { mtime: 0, payload: before?.payload ?? null, retryAt: Date.now() + 30_000 },
				);
			} else {
				this.seen.set(file, { mtime, payload: before?.payload ?? payload });
			}
		}
	}
}

/** Latest saved Forever account preference. No game-memory reads or screen capture. */
export function savedLivePixelsEnabled(wow?: string): boolean {
	try {
		const files = findSavedVariables(wow).filter((file) => file.split(/[\\/]/).includes("_forever_"));
		const newest = files
			.map((file) => ({ file, at: statSync(file).mtimeMs, size: statSync(file).size }))
			.sort((a, b) => b.at - a.at)[0];
		if (!newest) return false;
		if (
			pixelPreference?.file === newest.file &&
			pixelPreference.at === newest.at &&
			pixelPreference.size === newest.size
		)
			return pixelPreference.enabled;
		// The addon owns this flat table; quoted JSON in payload uses escaped quotes.
		const lua = readFileSync(newest.file, "utf8");
		const table = lua.match(/\["livePixels"\]\s*=\s*\{([^{}]*)\}/)?.[1];
		const enabled = !!table && /\["enabled"\]\s*=\s*true\b/.test(table);
		pixelPreference = { ...newest, enabled };
		return enabled;
	} catch {
		// Missing, unreadable or partly written saves must never opt into capture.
		return false;
	}
}
let pixelPreference: { file: string; at: number; size: number; enabled: boolean } | undefined;
