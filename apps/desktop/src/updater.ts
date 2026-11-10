// The app updates itself from GitHub Releases (electron-updater; the feed is
// the `publish` block in electron-builder.yml, baked into the installed app as
// resources/app-update.yml). It downloads in the background and installs when
// the app quits, or right away from the tray's "Restart to update".

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Log } from "@guildie/sync";
import { app } from "electron";
import { autoUpdater } from "electron-updater";

// Hourly: a check is one small file (latest.yml) from GitHub.
const CHECK_EVERY_MS = 60 * 60_000;

/**
 * Only the NSIS install can update itself: it's what the downloaded installer
 * replaces. An unzipped copy would get a second, installed Guildie instead.
 */
export function canSelfUpdate() {
	if (!app.isPackaged || process.platform !== "win32") return false;
	return existsSync(join(dirname(process.execPath), `Uninstall ${app.getName()}.exe`));
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

export function startUpdater(
	log: Log,
	notify: (title: string, body: string) => void,
	onChange: (state: UpdateState) => void,
): Updater {
	autoUpdater.logger = {
		info: (m: unknown) => log(`Update: ${String(m)}`),
		warn: (m: unknown) => log(`Update: ${String(m)}`),
		error: (m: unknown) => log(`Update error: ${String(m)}`),
	};
	autoUpdater.autoDownload = true;
	autoUpdater.autoInstallOnAppQuit = true;

	let state: UpdateState = { state: "idle" };
	let lastPercent = -1;
	const set = (next: UpdateState) => {
		state = next;
		onChange(next);
	};
	autoUpdater.on("checking-for-update", () => {
		if (state.state !== "downloading" && state.state !== "ready") set({ state: "checking" });
	});
	autoUpdater.on("update-available", (info) => {
		log(`Update: ${info.version} available, downloading`);
		set({ state: "downloading", version: info.version });
	});
	autoUpdater.on("download-progress", (p) => {
		if (state.state !== "downloading") return;
		// Whole percents only: the page and tray don't need every byte.
		const percent = Math.floor(p.percent);
		if (percent === lastPercent) return;
		lastPercent = percent;
		set({ ...state, percent });
	});
	autoUpdater.on("update-not-available", () => {
		log("Update: up to date");
		set({ state: "current", checkedAt: Date.now() });
	});
	autoUpdater.on("update-downloaded", (info) => {
		if (state.state === "ready" && state.version === info.version) return;
		set({ state: "ready", version: info.version });
		notify(
			`Guildie ${info.version} is ready`,
			"Choose Restart to update in the tray, or it installs when you quit Guildie.",
		);
	});
	// Offline or GitHub down: try again at the next check, quietly.
	autoUpdater.on("error", (e) => {
		log(`Update failed: ${e.message}`);
		if (state.state !== "ready") set({ state: "failed", checkedAt: Date.now(), message: e.message });
	});

	const check = async (): Promise<UpdateState> => {
		if (state.state === "ready" || state.state === "downloading" || state.state === "checking") return state;
		try {
			await autoUpdater.checkForUpdates();
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
		// Silent install, then start the new version.
		restart: () => autoUpdater.quitAndInstall(true, true),
	};
}
