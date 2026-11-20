// Installs and updates the Guildie addon in WoW: Forever from the copy the app
// ships with (electron-builder extraResources). The app is how players get the
// addon: there's no addon-store release, and the app writes GuildieData.lua
// into the installed copy, so the two must stay in step.
//
// No Electron imports here, so the tests run under plain Node.
//
// Paths inside WoW go through wowPath: on Linux (case-sensitive) a hand-made
// "Interface/Addons" is used as it is, not doubled by a new "AddOns".

import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { wowPath } from "@guildie/sync";

export const ADDON = "Guildie";
/** The app's own file in the addon folder: kept across updates, never shipped. */
export const DATA_FILE = "GuildieData.lua";
/** What the addon loads until the app downloads guild data (the .toc lists the file, so it should exist). */
const EMPTY_DATA =
	"-- Written by the Guildie app from guildie.club; replaced on every refresh. Don't edit.\n" +
	"-- Empty until the app downloads your guild's data (it loads at login and /reload).\n" +
	"GuildieData = nil\n";
/** Leftovers of an install, named so WoW never loads them (the folder doesn't match Guildie.toc). */
const STAGING = ".Guildie-new";
const OLD = ".Guildie-old";

export type Log = (...parts: unknown[]) => void;

/** "## Version: 0.3.1" from a .toc's text. */
export function tocVersion(toc: string): string | undefined {
	return /^##\s*Version:\s*(\S+)/m.exec(toc)?.[1];
}

/** The version of the addon in a folder, or undefined (no folder, no .toc, no version). */
export function readAddonVersion(folder: string): string | undefined {
	try {
		return tocVersion(readFileSync(join(folder, `${ADDON}.toc`), "utf8"));
	} catch {
		return undefined;
	}
}

/** Compares "0.10.0" and "0.9.2" by number, part by part (missing parts are 0). */
export function compareVersions(a: string, b: string): number {
	const parts = (v: string) =>
		v
			.replace(/^v/i, "")
			.split(/[.-]/)
			.map((p) => Number.parseInt(p, 10) || 0);
	const pa = parts(a);
	const pb = parts(b);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (diff) return Math.sign(diff);
	}
	return 0;
}

export type AddonAction = "install" | "update" | "none";

/**
 * What to do with one install. `installed` is undefined when the folder is
 * missing, null when it's there but has no readable version (a broken copy:
 * replace it). A newer installed copy (a developer's) is left alone.
 */
export function decideAddonAction(installed: string | null | undefined, bundled: string): AddonAction {
	if (installed === undefined) return "install";
	if (installed === null) return "update";
	return compareVersions(installed, bundled) < 0 ? "update" : "none";
}

/** <wow>/_forever_/ (and _forever_ptr_ and the like): the game the addon is for (interface 16001). */
export function foreverFlavors(wow: string): string[] {
	try {
		return readdirSync(wow)
			.filter((d) => /^_forever\w*_$/i.test(d))
			.map((d) => join(wow, d));
	} catch {
		return [];
	}
}

/** <flavor>/Interface/AddOns, spelled as it is on disk. */
export const addOnsFolder = (flavor: string) => wowPath(flavor, "Interface", "AddOns");

/** The addon's files, as shipped: everything but GuildieData.lua. */
function shippedFiles(source: string) {
	return readdirSync(source, { withFileTypes: true }).filter((e) => e.name !== DATA_FILE && !e.name.startsWith("."));
}

function copyTree(from: string, to: string) {
	mkdirSync(to, { recursive: true });
	for (const entry of shippedFiles(from)) {
		const src = join(from, entry.name);
		if (entry.isDirectory()) copyTree(src, join(to, entry.name));
		else copyFileSync(src, join(to, entry.name));
	}
}

/**
 * A crash between the two renames in replaceAddon leaves the old copy under
 * OLD and no Guildie folder: put it back (it has the player's GuildieData.lua),
 * then clear any half-made staging folder.
 */
function recover(addOns: string, log: Log) {
	const target = join(addOns, ADDON);
	const old = join(addOns, OLD);
	if (!existsSync(target) && existsSync(old)) {
		renameSync(old, target);
		log(`Addon: restored ${target} after an interrupted update`);
	}
	for (const leftover of [STAGING, OLD]) {
		const path = join(addOns, leftover);
		if (existsSync(path)) rmSync(path, { recursive: true, force: true });
	}
}

/**
 * Puts the shipped addon at <addOns>/Guildie, keeping its GuildieData.lua.
 * Builds the new copy beside it, then swaps folders, so a crash leaves either
 * the old addon or the new one, never half of each. If the folder can't be
 * renamed (Windows: something has a file open), the files are overwritten one
 * by one instead, each written then renamed.
 */
export function replaceAddon(source: string, addOns: string, log: Log) {
	mkdirSync(addOns, { recursive: true });
	recover(addOns, log);
	const target = join(addOns, ADDON);
	const staging = join(addOns, STAGING);
	const old = join(addOns, OLD);

	copyTree(source, staging);
	const data = join(target, DATA_FILE);
	if (existsSync(data)) copyFileSync(data, join(staging, DATA_FILE));
	else writeFileSync(join(staging, DATA_FILE), EMPTY_DATA);

	if (!existsSync(target)) {
		renameSync(staging, target);
		return;
	}
	try {
		renameSync(target, old);
	} catch (e) {
		log(`Addon: can't move ${target} (${(e as Error).message}); overwriting its files instead`);
		rmSync(staging, { recursive: true, force: true });
		overwriteInPlace(source, target);
		return;
	}
	try {
		renameSync(staging, target);
	} catch (e) {
		renameSync(old, target);
		rmSync(staging, { recursive: true, force: true });
		throw e;
	}
	rmSync(old, { recursive: true, force: true });
}

/** The fallback: each shipped file copied next to its target, then renamed over it. GuildieData.lua is untouched. */
function overwriteInPlace(from: string, to: string) {
	mkdirSync(to, { recursive: true });
	for (const entry of shippedFiles(from)) {
		const src = join(from, entry.name);
		const dest = join(to, entry.name);
		if (entry.isDirectory()) {
			overwriteInPlace(src, dest);
			continue;
		}
		copyFileSync(src, `${dest}.tmp`);
		renameSync(`${dest}.tmp`, dest);
	}
}

export type AddonResult = {
	/** <flavor>/Interface/AddOns/Guildie */
	folder: string;
	action: AddonAction;
	/** The version there now (undefined if installing failed). */
	version?: string;
	error?: string;
};

/**
 * Installs or updates the addon in every Forever flavor of a WoW folder.
 * `force` reinstalls even when it's up to date (the tray's "Reinstall addon").
 */
export function ensureAddon(source: string, wow: string, log: Log, force = false): AddonResult[] {
	const bundled = readAddonVersion(source);
	if (!bundled) throw new Error(`No addon to install at ${source}`);
	return foreverFlavors(wow).map((flavor) => {
		const folder = join(addOnsFolder(flavor), ADDON);
		const present = existsSync(folder) && statSync(folder).isDirectory();
		const installed = present ? (readAddonVersion(folder) ?? null) : undefined;
		let action = decideAddonAction(installed, bundled);
		if (force && action === "none") action = "update";
		if (action === "none") return { folder, action, version: installed ?? undefined };
		try {
			replaceAddon(source, addOnsFolder(flavor), log);
			log(
				`Addon: ${action === "install" ? "installed" : `updated ${installed ?? "(unknown)"} ->`} ${bundled} in ${folder}`,
			);
			return { folder, action, version: bundled };
		} catch (e) {
			log(`Addon: ${action} failed in ${folder}: ${(e as Error).message}`);
			return { folder, action, version: installed ?? undefined, error: (e as Error).message };
		}
	});
}

/** One WoW: Forever install's copy of the addon, for the app's Addon page. */
export type AddonInstall = {
	/** <wow>/_forever_ */
	flavor: string;
	/** <flavor>/Interface/AddOns/Guildie */
	folder: string;
	/** The installed version; undefined when not installed. */
	version?: string;
	/** A folder is there but its .toc has no readable version. */
	broken?: boolean;
};

export function addonInstalls(wow: string): AddonInstall[] {
	return foreverFlavors(wow).map((flavor) => {
		const folder = join(addOnsFolder(flavor), ADDON);
		const present = existsSync(folder) && statSync(folder).isDirectory();
		const version = present ? readAddonVersion(folder) : undefined;
		return { flavor, folder, version, broken: present && !version ? true : undefined };
	});
}

/**
 * Removes the addon from every Forever flavor of a WoW folder: its folder
 * (with the app's GuildieData.lua) and any install leftovers. With
 * `savedData`, also the game's saved file for it (WTF/.../SavedVariables/
 * Guildie.lua and .bak, per account and per character). Never touches
 * anything else. Returns what it removed.
 */
export function uninstallAddon(wow: string, options: { savedData: boolean }, log: Log): string[] {
	const removed: string[] = [];
	const remove = (path: string) => {
		if (!existsSync(path)) return;
		rmSync(path, { recursive: true, force: true });
		removed.push(path);
		log(`Addon: removed ${path}`);
	};
	for (const flavor of foreverFlavors(wow)) {
		const addOns = addOnsFolder(flavor);
		for (const name of [ADDON, STAGING, OLD]) remove(join(addOns, name));
		if (!options.savedData) continue;
		const accounts = wowPath(flavor, "WTF", "Account");
		for (const account of safeList(accounts)) {
			const accountDir = join(accounts, account);
			removeSaved(wowPath(accountDir, "SavedVariables"), remove);
			// Per character: Account/<account>/<realm>/<character>/SavedVariables.
			for (const realm of safeList(accountDir)) {
				for (const character of safeList(join(accountDir, realm))) {
					removeSaved(wowPath(accountDir, realm, character, "SavedVariables"), remove);
				}
			}
		}
	}
	return removed;
}

function removeSaved(folder: string, remove: (path: string) => void) {
	for (const file of [`${ADDON}.lua`, `${ADDON}.lua.bak`]) remove(join(folder, file));
}

function safeList(folder: string): string[] {
	try {
		return readdirSync(folder, { withFileTypes: true })
			.filter((d) => d.isDirectory())
			.map((d) => d.name);
	} catch {
		return [];
	}
}
