// The notification-area icon and its menu. Left-click opens the window.

import { join } from "node:path";
import { displayName } from "@guildie/sync";
import { Menu, nativeImage, Tray } from "electron";
import type { Status } from "./connection.ts";

export type TrayActions = {
	setLivePixels: (enabled: boolean) => void;
	open: () => void;
	connect: () => void;
	uploadNow: () => void;
	chooseWow: () => void;
	/** Install the addon, or put a fresh copy over the installed one. */
	reinstallAddon: () => void;
	/** Open the window's Addon page. */
	manageAddon: () => void;
	/** Quit and install the downloaded app update. */
	restartToUpdate: () => void;
	/** Check for an app update now. */
	checkForUpdates: () => void;
	startWithSystem: { get: () => boolean; set: (on: boolean) => void } | undefined;
	about: () => void;
	signOut: () => void;
	quit: () => void;
};

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function createTray(actions: TrayActions) {
	const icon =
		process.platform === "win32"
			? nativeImage.createFromPath(join(__dirname, "assets", "guildie.ico"))
			: nativeImage.createFromPath(join(__dirname, "assets", "guildie-256.png")).resize({ width: 18, height: 18 });
	const tray = new Tray(icon);
	tray.setToolTip("Guildie");
	tray.on("click", actions.open);

	const update = (status: Status) => {
		const statusLine = status.pairingCode
			? `Approve ${status.pairingCode} in your browser`
			: status.connected
				? `Connected as ${status.account}`
				: "Not connected";
		const lastLine = status.lastUpload
			? `Last upload: ${status.lastUpload.characters.map(displayName).join(", ")} at ${time(status.lastUpload.at)}`
			: "No uploads yet";
		tray.setToolTip(`Guildie: ${statusLine}`);
		tray.setContextMenu(
			Menu.buildFromTemplate([
				{ label: statusLine, enabled: false },
				{ label: lastLine, enabled: false },
				...(status.livePixels ? [{ label: `Live capture: ${status.livePixels}`, enabled: false }] : []),
				{ label: status.wowFolder ? `WoW: ${status.wowFolder}` : "WoW folder not found", enabled: false },
				status.addonVersion
					? { label: `Addon: ${status.addonVersion}`, enabled: false }
					: { label: "Addon: not installed — Install", enabled: !!status.wowFolder, click: actions.reinstallAddon },
				...(status.updateReady
					? [
							{ type: "separator" as const },
							{ label: `Restart to update (${status.updateReady})`, click: actions.restartToUpdate },
						]
					: []),
				{ type: "separator" },
				{ label: "Open Guildie", click: actions.open },
				{ label: "Sign in...", visible: !status.connected && !status.pairingCode, click: actions.connect },
				{ label: "Upload now", enabled: status.connected, click: actions.uploadNow },
				{ label: "Choose World of Warcraft folder...", click: actions.chooseWow },
				{ label: "Manage addon...", click: actions.manageAddon },
				{
					label: "Experimental live sync",
					type: "checkbox",
					checked: status.livePixelsEnabled === true,
					enabled: status.livePixelsAvailable === true,
					click: (item) => actions.setLivePixels(item.checked),
				},
				...(actions.startWithSystem
					? [
							{
								label: process.platform === "win32" ? "Start with Windows" : "Start at login",
								type: "checkbox" as const,
								checked: actions.startWithSystem.get(),
								click: (item: Electron.MenuItem) => actions.startWithSystem?.set(item.checked),
							},
						]
					: []),
				{ type: "separator" },
				updateItem(status, actions),
				{ label: "About Guildie", click: actions.about },
				{ label: "Sign out", visible: status.connected, click: actions.signOut },
				{ label: "Quit", click: actions.quit },
			]),
		);
	};
	return { tray, update };
}

/** "Check for updates", or what's happening with one. */
function updateItem(status: Status, actions: TrayActions): Electron.MenuItemConstructorOptions {
	const u = status.update;
	if (u?.state === "checking") return { label: "Checking for updates...", enabled: false };
	if (u?.state === "downloading")
		return { label: `Downloading ${u.version}${u.percent !== undefined ? ` (${u.percent}%)` : ""}...`, enabled: false };
	// Ready: "Restart to update" is already at the top of the menu.
	if (u?.state === "ready") return { label: "Check for updates", visible: false };
	return { label: "Check for updates", click: actions.checkForUpdates };
}
