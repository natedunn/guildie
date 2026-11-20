// Where World of Warcraft is on each system, and paths inside it that hold up
// on case-sensitive file systems.
//
// Windows: the usual install folders. macOS: /Applications. Linux: WoW runs
// under Wine or Proton, so it's inside a Wine prefix (~/.wine, Lutris,
// Bottles, Steam, Heroic, Faugus...): each prefix's drive_c is searched one
// directory level deep, never recursively.

import { existsSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

/** A game install's flavor folder: _classic_, _retail_, _forever_... */
export const isFlavorName = (name: string) => /^_.+_$/.test(name);

/** Whether a folder looks like a World of Warcraft install (has a _flavor_ folder). */
export function isWowFolder(folder: string) {
	try {
		return readdirSync(folder).some(isFlavorName);
	} catch {
		return false;
	}
}

/**
 * `dir/name`, spelled the way it already is on disk when only the case
 * differs (Linux: "Interface/Addons" made by hand, which the game under Wine
 * reads as AddOns). Windows and macOS file systems ignore case, so there it's
 * just the join.
 */
export function childPath(dir: string, name: string, platform = process.platform): string {
	const exact = join(dir, name);
	if (platform === "win32" || existsSync(exact)) return exact;
	try {
		const lower = name.toLowerCase();
		const hit = readdirSync(dir).find((entry) => entry.toLowerCase() === lower);
		if (hit) return join(dir, hit);
	} catch {}
	return exact;
}

/** `root/a/b/c`, each part matched case-insensitively against what's there (childPath). */
export function wowPath(root: string, ...parts: string[]): string {
	return parts.reduce((dir, part) => childPath(dir, part), root);
}

/** Where WoW goes inside a Wine prefix's C: drive. */
const IN_DRIVE_C = [
	["Program Files (x86)", "World of Warcraft"],
	["Program Files", "World of Warcraft"],
	["World of Warcraft"],
	["Games", "World of Warcraft"],
];

/**
 * Wine prefixes WoW is usually in, most likely first. A "*" part is any one
 * folder there (Lutris names a prefix after the game, Bottles after the bottle,
 * Steam after the app id).
 */
const LINUX_PREFIXES = [
	[".wine"],
	// Lutris (Battle.net installer: ~/Games/battlenet), and other "~/Games/<game>" prefixes.
	["Games", "*"],
	// Bottles, native and Flatpak.
	[".local", "share", "bottles", "bottles", "*"],
	[".var", "app", "com.usebottles.bottles", "data", "bottles", "bottles", "*"],
	// Steam (a non-Steam game run with Proton), native and Flatpak.
	[".steam", "steam", "steamapps", "compatdata", "*", "pfx"],
	[".local", "share", "Steam", "steamapps", "compatdata", "*", "pfx"],
	[".var", "app", "com.valvesoftware.Steam", ".local", "share", "Steam", "steamapps", "compatdata", "*", "pfx"],
	[".var", "app", "com.valvesoftware.Steam", "data", "Steam", "steamapps", "compatdata", "*", "pfx"],
	// Heroic: ~/Games/Heroic/Prefixes/default/<game>.
	["Games", "Heroic", "Prefixes", "default", "*"],
	["Games", "Heroic", "Prefixes", "*"],
	// Faugus Launcher.
	["Faugus", "*"],
];

/** Folders matching a pattern under `base`, "*" being any one folder there (sorted, so the order is stable). */
function expand(base: string, parts: string[]): string[] {
	let found = [base];
	for (const part of parts) {
		const next: string[] = [];
		for (const dir of found) {
			if (part !== "*") {
				next.push(join(dir, part));
				continue;
			}
			try {
				for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
					if (entry.isDirectory() || entry.isSymbolicLink()) next.push(join(dir, entry.name));
				}
			} catch {}
		}
		found = next;
	}
	return found;
}

export type WowSearchEnv = { platform: NodeJS.Platform; home: string; winePrefix?: string };

/** The Wine prefixes on this computer worth looking in ($WINEPREFIX first). */
export function linuxPrefixes(env: WowSearchEnv): string[] {
	const prefixes = env.winePrefix ? [env.winePrefix] : [];
	for (const pattern of LINUX_PREFIXES) {
		for (const prefix of expand(env.home, pattern)) {
			if (!prefixes.includes(prefix) && existsSync(join(prefix, "drive_c"))) prefixes.push(prefix);
		}
	}
	return prefixes;
}

/** The usual World of Warcraft folders on a system, most likely first. On Linux, only ones that exist. */
export function defaultWowFolders(env: WowSearchEnv): string[] {
	if (env.platform === "win32") {
		return [
			"C:\\Program Files (x86)\\World of Warcraft",
			"C:\\Program Files\\World of Warcraft",
			"D:\\World of Warcraft",
			"D:\\Games\\World of Warcraft",
		];
	}
	if (env.platform === "darwin") {
		return [
			"/Applications/World of Warcraft",
			join(env.home, "Applications", "World of Warcraft"),
			"/Applications/Games/World of Warcraft",
		];
	}
	// ~/.steam/steam is usually a link to ~/.local/share/Steam: one folder, listed once.
	const found = new Map<string, string>();
	for (const prefix of linuxPrefixes(env)) {
		for (const inside of IN_DRIVE_C) {
			const folder = wowPath(prefix, "drive_c", ...inside);
			try {
				const real = realpathSync(folder);
				if (!found.has(real)) found.set(real, folder);
			} catch {}
		}
	}
	return [...found.values()];
}

const SEARCH_EVERY_MS = 60_000;
let searched: { at: number; folders: string[] } | undefined;

/**
 * Default World of Warcraft folders, most likely first; just `[wow]` when one
 * was chosen. The search lists folders on Linux, and this is asked every few
 * seconds, so it's redone at most once a minute.
 */
export function wowCandidates(wow?: string, env?: WowSearchEnv): string[] {
	if (wow) return [wow];
	if (env) return defaultWowFolders(env);
	if (!searched || Date.now() - searched.at > SEARCH_EVERY_MS) {
		searched = {
			at: Date.now(),
			folders: defaultWowFolders({
				platform: process.platform,
				home: homedir(),
				winePrefix: process.env.WINEPREFIX || undefined,
			}),
		};
	}
	return searched.folders;
}

/**
 * The WoW folder for a folder the player chose: the folder itself, or the
 * WoW folder above it (they chose _forever_, or something inside it like the
 * game's .app), or the one inside it (they chose a Wine prefix or its drive_c).
 * Undefined when there's none.
 */
export function resolveWowFolder(folder: string): string | undefined {
	if (isWowFolder(folder)) return folder;
	// Up: <wow>/_forever_, or <wow>/_classic_/World of Warcraft Classic.app.
	let child = folder;
	for (let i = 0; i < 3; i++) {
		const parent = dirname(child);
		if (parent === child) break;
		if (isFlavorName(basename(child)) && isWowFolder(parent)) return parent;
		child = parent;
	}
	// Down: a Wine prefix, its drive_c, or a folder that holds "World of Warcraft".
	for (const inside of [["World of Warcraft"], ...IN_DRIVE_C.map((p) => ["drive_c", ...p]), ...IN_DRIVE_C]) {
		const candidate = wowPath(folder, ...inside);
		if (isWowFolder(candidate)) return candidate;
	}
	return undefined;
}
