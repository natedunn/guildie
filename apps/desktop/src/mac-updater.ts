// macOS self-update for the unsigned (ad-hoc signed) app. electron-updater's
// MacUpdater goes through Squirrel.Mac, which only installs updates signed
// with a Developer ID, so until the app is signed it updates itself:
//
// 1. Read latest-mac.yml from the repo's Latest release (electron-builder
//    writes it next to Guildie-mac-universal.zip).
// 2. If it's newer, download the zip into userData/update, check its sha512
//    against the yml, unzip it with ditto and check the app inside (bundle id,
//    version, the bundled addon).
// 3. When Guildie quits (or "Restart to update"), a detached /bin/sh script
//    waits for this process to exit, swaps the new Guildie.app in place of the
//    old (rolling back if the move fails), clears the quarantine flag, and on
//    a restart opens it again.
//
// It emits electron-updater's events, so src/updater.ts drives both the same
// way. No Electron import here: the tests run it under plain Node, and
// updater.ts hands in what it needs from Electron. Once the app is signed for
// real (README.md, "Signing the macOS app"), electron-updater can take over.

import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter, once } from "node:events";
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { Log } from "@guildie/sync";

const run = promisify(execFile);

/** Same release electron-updater reads on Windows and Linux: the repo's Latest one. */
export const MAC_FEED = "https://github.com/natedunn/guildie/releases/latest/download/latest-mac.yml";
export const BUNDLE_ID = "club.guildie.desktop";

export type UpdateFile = { url: string; sha512: string; size?: number };
export type UpdateInfo = { version: string; files: UpdateFile[]; path?: string; sha512?: string };

const unquote = (value: string) => {
	const v = value.trim();
	if (v.length >= 2 && ((v[0] === "'" && v.endsWith("'")) || (v[0] === '"' && v.endsWith('"')))) return v.slice(1, -1);
	return v;
};

/**
 * Reads the few fields of electron-builder's latest-mac.yml the updater uses:
 * `version`, the `files` list (url, sha512, size) and the older top-level
 * `path` / `sha512`. Not a YAML parser: just that file's shape.
 */
export function parseUpdateInfo(text: string): UpdateInfo {
	const info: Partial<UpdateInfo> & { files: UpdateFile[] } = { files: [] };
	let inFiles = false;
	let file: Partial<UpdateFile> | undefined;
	const addFile = () => {
		if (file?.url && file.sha512) info.files.push(file as UpdateFile);
		file = undefined;
	};
	for (const raw of text.split(/\r?\n/)) {
		if (!raw.trim() || raw.trimStart().startsWith("#")) continue;
		const top = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(raw);
		if (top) {
			addFile();
			const [, key, value] = top;
			inFiles = key === "files" && value.trim() === "";
			if (key === "version") info.version = unquote(value);
			else if (key === "path") info.path = unquote(value);
			else if (key === "sha512") info.sha512 = unquote(value);
			continue;
		}
		if (!inFiles) continue;
		const item = /^\s+(-\s+)?([A-Za-z0-9_]+):\s*(.*)$/.exec(raw);
		if (!item) continue;
		const [, dash, key, value] = item;
		if (dash) {
			addFile();
			file = {};
		}
		if (!file) continue;
		if (key === "url") file.url = unquote(value);
		else if (key === "sha512") file.sha512 = unquote(value);
		else if (key === "size") file.size = Number(unquote(value)) || undefined;
	}
	addFile();
	if (!info.version || !/^\d+\.\d+\.\d+/.test(info.version)) throw new Error("latest-mac.yml has no version");
	return info as UpdateInfo;
}

/** The zip in the release (what the updater installs), or undefined when there's none. */
export function pickZip(info: UpdateInfo): UpdateFile | undefined {
	const zip = info.files.find((f) => f.url.toLowerCase().endsWith(".zip"));
	if (zip) return zip;
	if (info.path?.toLowerCase().endsWith(".zip") && info.sha512) return { url: info.path, sha512: info.sha512 };
	return undefined;
}

/** Semver order of a and b (1.2.3, 1.2.3-beta.1; build metadata ignored): negative, 0 or positive. */
export function compareSemver(a: string, b: string): number {
	const split = (v: string) => {
		const [core, pre] = v.trim().replace(/^v/, "").split("+")[0].split(/-(.*)/s);
		return { core: core.split(".").map((n) => Number.parseInt(n, 10) || 0), pre: pre ? pre.split(".") : [] };
	};
	const x = split(a);
	const y = split(b);
	for (let i = 0; i < 3; i++) {
		const d = (x.core[i] ?? 0) - (y.core[i] ?? 0);
		if (d) return d;
	}
	// A release is newer than its pre-releases.
	if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length;
	for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
		const p = x.pre[i];
		const q = y.pre[i];
		if (p === undefined) return -1;
		if (q === undefined) return 1;
		if (p === q) continue;
		const pn = /^\d+$/.test(p);
		const qn = /^\d+$/.test(q);
		if (pn && qn) return Number(p) - Number(q);
		if (pn) return -1;
		if (qn) return 1;
		return p < q ? -1 : 1;
	}
	return 0;
}

/** The .app bundle the running executable is in (…/Guildie.app/Contents/MacOS/Guildie), if any. */
export function appBundleOf(execPath: string): string | undefined {
	return /^(\/.+\.app)\/Contents\/MacOS\/[^/]+$/.exec(execPath)?.[1];
}

/**
 * Why this copy can't replace itself, or undefined when it can. `writable`:
 * whether the bundle and the folder it's in can be written.
 */
export function macUpdateBlocker(bundle: string | undefined, writable: boolean): string | undefined {
	if (!bundle) return "not running from an .app bundle";
	// Gatekeeper runs a quarantined app that wasn't moved from where it was
	// opened from a random read-only copy; moving it (to Applications) fixes it.
	if (bundle.includes("/AppTranslocation/"))
		return "macOS is running it from a temporary copy (App Translocation); move Guildie to Applications";
	if (bundle.startsWith("/Volumes/") && !writable)
		return "running from the disk image; drag Guildie to Applications and open it from there";
	if (!writable) return `can't write to ${dirname(bundle)}`;
	return undefined;
}

/**
 * Swaps the new app in once Guildie has quit: `sh install.sh <pid> <app>
 * <new app> <relaunch 1|0> <log file>`. Moves the new app next to the old one
 * first (the same volume, so the swap is two renames), moves the old one
 * aside, the new one in, then deletes the old; puts the old one back if the
 * new one won't go in.
 */
export const SWAP_SCRIPT = `#!/bin/sh
pid="$1"; app="$2"; new="$3"; relaunch="$4"; log="$5"
say() { printf '[%s] Update: %s\\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$log" 2>/dev/null; }
reopen() { if [ "$relaunch" = 1 ]; then open -n "$app" || say "couldn't open $app"; fi; }
n=0
while kill -0 "$pid" 2>/dev/null; do
	n=$((n + 1))
	if [ "$n" -ge 600 ]; then say "Guildie didn't quit in 2 minutes; the update wasn't installed"; exit 1; fi
	sleep 0.2
done
dir=$(dirname "$app")
stage="$dir/.Guildie-update-$$.app"
old="$dir/.Guildie-old-$$.app"
if ! mv "$new" "$stage"; then
	say "couldn't move the update next to $app; kept the old version"
	rm -rf "$stage"; reopen; exit 1
fi
if ! mv "$app" "$old"; then
	say "couldn't move $app aside; kept the old version"
	rm -rf "$stage"; reopen; exit 1
fi
if mv "$stage" "$app"; then
	rm -rf "$old"
	xattr -dr com.apple.quarantine "$app" 2>/dev/null || true
	say "installed into $app"
else
	mv "$old" "$app"
	rm -rf "$stage"
	say "couldn't move the update into $app; kept the old version"
fi
reopen
exit 0
`;

export type MacUpdaterOptions = {
	/** The running version (__VERSION__). */
	currentVersion: string;
	/** The running Guildie.app, the one replaced. */
	bundle: string;
	/** Where downloads go (userData/update); emptied at start. */
	workDir: string;
	/** guildie.log, for the swap script's lines. */
	logFile: string;
	feedUrl?: string;
	fetch: typeof fetch;
	log: Log;
	/** Registers the install for when the app quits (Electron's will-quit). */
	onQuit: (install: () => void) => void;
	/** Quits the app (app.quit). */
	quit: () => void;
	/** Reads a key from an Info.plist; plutil by default. */
	readPlist?: (plist: string, key: string) => Promise<string>;
	/** Unzips; ditto by default (keeps the bundle's symlinks, permissions and signature). */
	unzip?: (zip: string, into: string) => Promise<void>;
	/** Starts the swap script; a detached /bin/sh by default. */
	spawnInstaller?: (script: string, args: string[]) => void;
	/** The running process, which the script waits on. */
	pid?: number;
};

const plutil = async (plist: string, key: string) =>
	(await run("plutil", ["-extract", key, "raw", "-o", "-", plist])).stdout.trim();
const ditto = async (zip: string, into: string) => {
	await run("ditto", ["-x", "-k", zip, into]);
};
const detached = (script: string, args: string[]) =>
	spawn("/bin/sh", [script, ...args], { detached: true, stdio: "ignore" }).unref();

/**
 * Checks, downloads and installs updates; events as electron-updater's:
 * checking-for-update, update-available, download-progress ({ percent }),
 * update-not-available, update-downloaded, error.
 */
export class MacUpdater extends EventEmitter {
	private readonly o: MacUpdaterOptions;
	private readonly feed: string;
	/** The checked, unzipped update waiting for a quit. */
	private downloaded: { version: string; app: string } | undefined;
	private downloading: string | undefined;
	private relaunch = false;
	private installing = false;

	constructor(options: MacUpdaterOptions) {
		super();
		this.o = options;
		this.feed = options.feedUrl ?? MAC_FEED;
		// What's left from a previous run (a download cut short, an update
		// already installed) is never needed again.
		rmSync(options.workDir, { recursive: true, force: true });
		options.onQuit(() => this.install());
	}

	/** Resolves once the check is done; a download carries on in the background. */
	async checkForUpdates(): Promise<void> {
		this.emit("checking-for-update");
		let info: UpdateInfo;
		try {
			const res = await this.o.fetch(this.feed, { cache: "no-store" });
			if (!res.ok) throw new Error(`latest-mac.yml: HTTP ${res.status}`);
			info = parseUpdateInfo(await res.text());
		} catch (e) {
			this.emit("error", e instanceof Error ? e : new Error(String(e)));
			return;
		}
		if (compareSemver(info.version, this.o.currentVersion) <= 0) {
			this.emit("update-not-available", { version: info.version });
			return;
		}
		if (this.downloaded?.version === info.version) {
			this.emit("update-downloaded", { version: info.version });
			return;
		}
		if (this.downloading === info.version) return;
		this.emit("update-available", { version: info.version });
		this.downloading = info.version;
		void this.download(info)
			.catch((e: unknown) => {
				rmSync(this.o.workDir, { recursive: true, force: true });
				this.emit("error", e instanceof Error ? e : new Error(String(e)));
			})
			.finally(() => {
				this.downloading = undefined;
			});
	}

	/** "Restart to update": quit now; the update goes in and Guildie opens again. */
	quitAndInstall() {
		this.relaunch = true;
		this.o.quit();
	}

	private async download(info: UpdateInfo) {
		const zip = pickZip(info);
		if (!zip) throw new Error(`latest-mac.yml for ${info.version} lists no zip`);
		const url = new URL(zip.url, this.feed).toString();
		rmSync(this.o.workDir, { recursive: true, force: true });
		const dir = join(this.o.workDir, info.version);
		mkdirSync(dir, { recursive: true });
		const zipPath = join(dir, "update.zip");

		const res = await this.o.fetch(url);
		if (!res.ok || !res.body) throw new Error(`${zip.url}: HTTP ${res.status}`);
		const total = Number(res.headers.get("content-length")) || zip.size || 0;
		const hash = createHash("sha512");
		const out = createWriteStream(zipPath);
		const reader = res.body.getReader();
		let got = 0;
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				hash.update(value);
				got += value.length;
				if (!out.write(value)) await once(out, "drain");
				if (total)
					this.emit("download-progress", { percent: Math.min(100, (got / total) * 100), transferred: got, total });
			}
		} finally {
			out.end();
			await once(out, "close");
		}
		if (hash.digest("base64") !== zip.sha512) throw new Error(`${zip.url}: sha512 doesn't match latest-mac.yml`);

		const unzipped = join(dir, "app");
		mkdirSync(unzipped);
		await (this.o.unzip ?? ditto)(zipPath, unzipped);
		rmSync(zipPath, { force: true });
		const apps = readdirSync(unzipped).filter((f) => f.endsWith(".app"));
		if (apps.length !== 1) throw new Error(`the update zip has ${apps.length} apps in it, not 1`);
		const app = join(unzipped, apps[0]);
		await this.verify(app, info.version);

		this.downloaded = { version: info.version, app };
		this.o.log(`Update: ${info.version} downloaded and checked, installs when Guildie quits`);
		this.emit("update-downloaded", { version: info.version });
	}

	/** The unzipped app is Guildie, the version the yml said, with the addon it installs. */
	private async verify(app: string, version: string) {
		const plist = join(app, "Contents", "Info.plist");
		const read = this.o.readPlist ?? plutil;
		const id = await read(plist, "CFBundleIdentifier");
		if (id !== BUNDLE_ID) throw new Error(`the update is ${id}, not ${BUNDLE_ID}`);
		const v = await read(plist, "CFBundleShortVersionString");
		if (v !== version) throw new Error(`the update is version ${v}, not ${version}`);
		if (!existsSync(join(app, "Contents", "Resources", "addon", "Guildie", "Guildie.toc")))
			throw new Error("the update has no addon in it");
	}

	/** On quit: hand the swap to a script that outlives us. */
	private install() {
		if (!this.downloaded || this.installing) return;
		if (!existsSync(this.downloaded.app)) return;
		this.installing = true;
		const script = join(this.o.workDir, "install.sh");
		writeFileSync(script, SWAP_SCRIPT, { mode: 0o755 });
		const args = [
			String(this.o.pid ?? process.pid),
			this.o.bundle,
			this.downloaded.app,
			this.relaunch ? "1" : "0",
			this.o.logFile,
		];
		this.o.log(
			`Update: installing ${this.downloaded.version} once Guildie has quit${this.relaunch ? ", then reopening" : ""}`,
		);
		(this.o.spawnInstaller ?? detached)(script, args);
	}
}
