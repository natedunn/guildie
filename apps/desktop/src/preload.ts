// The bridge between Guildie (the website) and the app, exposed only on
// Guildie's own pages (never on Battle.net's sign-in pages or anything else).
// The token only ever goes in: nothing here hands it back to the page.
//
//   window.guildieDesktop = {
//     isDesktop: true, version,
//     getState(): Promise<{ connected, account? }>,
//     setToken(token, account?): Promise<void>,   // after the user signs in
//     signOut(): Promise<void>,                   // when the user signs out
//     signIn(): Promise<void>,                    // sign in via the browser (see connection.ts pair)
//     getStatus(): Promise<Status>,               // sync status, see connection.ts
//     onStatus(cb): () => void,                   // ...and its changes
//     addon: { info, install, uninstall({ savedData }), openFolder },  // the Addon page
//     chooseWowFolder(), uploadNow(), restartToUpdate(),
//   }

import { contextBridge, ipcRenderer } from "electron";
import { isGuildieUrl } from "./origins.ts";

declare const __VERSION__: string;

if (isGuildieUrl(location.href)) {
	contextBridge.exposeInMainWorld("guildieDesktop", {
		isDesktop: true,
		version: __VERSION__,
		getState: () => ipcRenderer.invoke("guildie:get-state"),
		setToken: (token: unknown, account?: unknown) => ipcRenderer.invoke("guildie:set-token", token, account),
		signOut: () => ipcRenderer.invoke("guildie:sign-out"),
		signIn: () => ipcRenderer.invoke("guildie:sign-in"),
		getStatus: () => ipcRenderer.invoke("guildie:get-status"),
		addon: {
			info: () => ipcRenderer.invoke("guildie:addon-info"),
			install: () => ipcRenderer.invoke("guildie:addon-install"),
			uninstall: (options?: unknown) => ipcRenderer.invoke("guildie:addon-uninstall", options),
			openFolder: () => ipcRenderer.invoke("guildie:addon-open-folder"),
		},
		chooseWowFolder: () => ipcRenderer.invoke("guildie:choose-wow"),
		uploadNow: () => ipcRenderer.invoke("guildie:upload-now"),
		restartToUpdate: () => ipcRenderer.invoke("guildie:restart-to-update"),
		checkForUpdates: () => ipcRenderer.invoke("guildie:check-updates"),
		setLivePixels: (enabled: unknown) => ipcRenderer.invoke("guildie:live-pixels", enabled),
		onStatus: (callback: unknown) => {
			if (typeof callback !== "function") throw new TypeError("onStatus needs a function");
			// The page gets the status only, never Electron's event object.
			const listener = (_event: unknown, status: unknown) => callback(status);
			ipcRenderer.on("guildie:status", listener);
			return () => {
				ipcRenderer.removeListener("guildie:status", listener);
			};
		},
	});

	// Lets the site style itself for the app (title bar room, no "get the app" links...).
	const mark = () => document.documentElement?.setAttribute("data-desktop", "true");
	mark();
	document.addEventListener("DOMContentLoaded", mark, { once: true });
}
