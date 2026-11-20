// The app updates itself from GitHub Releases. It downloads in the background
// and installs when the app quits, or right away from the tray's "Restart to
// update".
// - Windows (NSIS install) and Linux (AppImage): electron-updater; the feed is
//   the `publish` block in electron-builder.yml, baked into the app as
//   resources/app-update.yml (latest.yml, latest-linux.yml).
// - macOS: src/mac-updater.ts (latest-mac.yml), since the app isn't signed
//   with a Developer ID and Squirrel.Mac won't install unsigned updates.

import type { EventEmitter } from "node:events";
import { accessSync, constants, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Log } from "@guildie/sync";
import { app, net } from "electron";
import { autoUpdater } from "electron-updater";
import { appBundleOf, MacUpdater, macUpdateBlocker } from "./mac-updater.ts";

// Hourly: a check is one small file (latest*.yml) from GitHub.
const CHECK_EVERY_MS = 60 * 60_000;

const writable = (...paths: string[]) => {
	try {
		for (const p of paths) accessSync(p, constants.W_OK);
		return true;
	} catch {
		return false;
	}
};

/**
 * Why this copy can't update itself, or undefined when it can:
 * - Windows: only the NSIS install, which the downloaded installer replaces
 *   (an unzipped copy would get a second, installed Guildie instead).
 * - macOS: a packaged Guildie.app it can replace: not run from the disk image
 *   or from a translocated (quarantined, unmoved) copy.
 * - Linux: only the AppImage (APPIMAGE is set by its runtime), which is
 *   swapped for the new one.
 */
export function selfUpdateBlocker(): string | undefined {
	if (!app.isPackaged) return "not packaged";
	if (process.platform === "win32") {
		return existsSync(join(dirname(process.execPath), `Uninstall ${app.getName()}.exe`))
			? undefined
			: "not the installed app (the zip build)";
	}
	if (process.platform === "darwin") {
		const bundle = appBundleOf(process.execPath);
		return macUpdateBlocker(bundle, !!bundle && writable(bundle, dirname(bundle)));
	}
	if (process.platform === "linux") return process.env.APPIMAGE ? undefined : "not the AppImage";
	return `no updates on ${process.platform}`;
}

/** Whether this copy can update itself (selfUpdateBlocker says why not). */
export function canSelfUpdate() {
	return !selfUpdateBlocker();
}

/** Where updating stands, for the tray and Settings → App. */
export type UpdateState =
	| { state: "off" }
	| { state: "idle" }
	| { state: "checking" }
	| { state: "downloading"; version: string; percent?: number }
	| { state: "ready"; version: string }
	| { state: "current"; checkedAt: number }
	| { state: "failed"; checkedAt: number; message: string };

export type Updater = {
	/** The version downloaded and waiting for a restart, if any. */
	readonly ready: string | undefined;
	readonly state: UpdateState;
	/** Check now (a manual check from the tray or Settings); resolves once the check itself is done. */
	check: () => Promise<UpdateState>;
	restart: () => void;
};

/** What both updaters have: electron-updater's events and a check. */
type Source = Pick<EventEmitter, "on"> & { checkForUpdates(): Promise<unknown> };

export function startUpdater(
	log: Log,
	notify: (title: string, body: string) => void,
	onChange: (state: UpdateState) => void,
): Updater {
	let source: Source;
	let restart: () => void;
	if (process.platform === "darwin") {
		const bundle = appBundleOf(process.execPath);
		if (!bundle) throw new Error("not running from an .app bundle");
		const mac = new MacUpdater({
			currentVersion: app.getVersion(),
			bundle,
			workDir: join(app.getPath("userData"), "update"),
			logFile: join(app.getPath("userData"), "guildie.log"),
			// For trying an update against a local server (README.md, "Testing a macOS update").
			feedUrl: process.env.GUILDIE_MAC_UPDATE_FEED || undefined,
			fetch: net.fetch as typeof fetch,
			log,
			onQuit: (install) => app.on("will-quit", install),
			quit: () => app.quit(),
		});
		source = mac;
		restart = () => mac.quitAndInstall();
	} else {
		autoUpdater.logger = {
			info: (m: unknown) => log(`Update: ${String(m)}`),
			warn: (m: unknown) => log(`Update: ${String(m)}`),
			error: (m: unknown) => log(`Update error: ${String(m)}`),
		};
		autoUpdater.autoDownload = true;
		autoUpdater.autoInstallOnAppQuit = true;
		// An EventEmitter too; its typed overloads just don't fit Source's.
		source = autoUpdater as unknown as Source;
		// Silent install, then start the new version.
		restart = () => autoUpdater.quitAndInstall(true, true);
	}

	let state: UpdateState = { state: "idle" };
	let lastPercent = -1;
	const set = (next: UpdateState) => {
		state = next;
		onChange(next);
	};
	source.on("checking-for-update", () => {
		if (state.state !== "downloading" && state.state !== "ready") set({ state: "checking" });
	});
	source.on("update-available", (info: { version: string }) => {
		log(`Update: ${info.version} available, downloading`);
		lastPercent = -1;
		set({ state: "downloading", version: info.version });
	});
	source.on("download-progress", (p: { percent: number }) => {
		if (state.state !== "downloading") return;
		// Whole percents only: the page and tray don't need every byte.
		const percent = Math.floor(p.percent);
		if (percent === lastPercent) return;
		lastPercent = percent;
		set({ ...state, percent });
	});
	source.on("update-not-available", () => {
		log("Update: up to date");
		set({ state: "current", checkedAt: Date.now() });
	});
	source.on("update-downloaded", (info: { version: string }) => {
		if (state.state === "ready" && state.version === info.version) return;
		set({ state: "ready", version: info.version });
		notify(
			`Guildie ${info.version} is ready`,
			"Choose Restart to update in the tray, or it installs when you quit Guildie.",
		);
	});
	// Offline or GitHub down: try again at the next check, quietly.
	source.on("error", (e: Error) => {
		log(`Update failed: ${e.message}`);
		if (state.state !== "ready") set({ state: "failed", checkedAt: Date.now(), message: e.message });
	});

	const check = async (): Promise<UpdateState> => {
		if (state.state === "ready" || state.state === "downloading" || state.state === "checking") return state;
		try {
			await source.checkForUpdates();
		} catch (e) {
			log(`Update check failed: ${(e as Error).message}`);
			set({ state: "failed", checkedAt: Date.now(), message: (e as Error).message });
		}
		return state;
	};
	void check();
	setInterval(() => void check(), CHECK_EVERY_MS).unref();

	return {
		get ready() {
			return state.state === "ready" ? state.version : undefined;
		},
		get state() {
			return state;
		},
		check,
		restart,
	};
}
