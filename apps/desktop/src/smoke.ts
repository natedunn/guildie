// --smoke-test: start hidden, load the site, check the bridge and the sync
// engine's wiring, print what passed, exit (0 when everything did).
// With GUILDIE_SMOKE_TOKEN (a real token for that site) it also connects,
// uploads a fake SavedVariables file and downloads guild data.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Log } from "@guildie/sync";
import { app, type BrowserWindow } from "electron";
import { readAddonVersion } from "./addon.ts";
import type { Connection } from "./connection.ts";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until<T>(what: () => T | Promise<T>, ms: number): Promise<T | undefined> {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		const value = await what();
		if (value) return value;
		await wait(250);
	}
	return undefined;
}

/** A WoW folder with an older addon installed and a saved file, like the game leaves it. */
function fakeWow() {
	const wow = mkdtempSync(join(tmpdir(), "guildie-smoke-wow-"));
	const saved = join(wow, "_forever_", "WTF", "Account", "SMOKE", "SavedVariables");
	const addon = join(wow, "_forever_", "Interface", "AddOns", "Guildie");
	mkdirSync(saved, { recursive: true });
	mkdirSync(addon, { recursive: true });
	writeFileSync(join(addon, "Guildie.toc"), "## Title: Guildie\n## Version: 0.0.1\n");
	writeFileSync(join(addon, "GuildieData.lua"), "-- smoke: the app's data, kept across updates\n");
	const payload = JSON.stringify({ version: 1, characters: [] });
	writeFileSync(join(saved, "Guildie.lua"), `GuildieDB = {\n\t["payload"] = "${payload.replace(/"/g, '\\"')}",\n}\n`);
	return { wow, addon };
}

export async function runSmokeTest(
	win: BrowserWindow,
	connection: Connection,
	url: string,
	log: Log,
	addonSource: string,
) {
	// The page's own errors and warnings, so a failing check shows why.
	win.webContents.on("console-message", (details) => {
		if (details.level === "error" || details.level === "warning") log(`page ${details.level}: ${details.message}`);
	});
	const results: { check: string; ok: boolean; detail?: string }[] = [];
	const check = (name: string, ok: boolean, detail?: unknown) => {
		results.push({ check: name, ok, detail: detail === undefined ? undefined : JSON.stringify(detail) });
		log(`${ok ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`);
	};
	const page = <T>(code: string) => win.webContents.executeJavaScript(code, true) as Promise<T>;

	try {
		const loaded = await until(
			() => !win.webContents.isLoading() && win.webContents.getURL().startsWith("http"),
			60_000,
		);
		check("page loads", !!loaded, win.webContents.getURL());
		await wait(1_500); // let the site hydrate

		const security = await page<Record<string, string>>(`({
			bridge: typeof window.guildieDesktop,
			keys: Object.keys(window.guildieDesktop || {}).sort().join(","),
			version: String(window.guildieDesktop?.version),
			isDesktop: String(window.guildieDesktop?.isDesktop),
			dataset: String(document.documentElement.dataset.desktop),
			require: typeof require,
			electron: String(typeof process === "object" && !!process?.versions?.electron),
			ipc: typeof ipcRenderer,
		})`);
		check("bridge exposed on the site", security.bridge === "object" && security.isDesktop === "true", security);
		check(
			"bridge has exactly the agreed functions",
			security.keys ===
				"addon,checkForUpdates,chooseWowFolder,getState,getStatus,isDesktop,onStatus,restartToUpdate,setLivePixels,setToken,signIn,signOut,uploadNow,version",
			security.keys,
		);
		check('html[data-desktop="true"]', security.dataset === "true");

		// The app's layout comes from the server (the user agent), not after load.
		const shell = await page<Record<string, string | boolean>>(`(async () => ({
			userAgent: navigator.userAgent,
			serverRendered: /<html[^>]*data-desktop="true"/.test(await fetch(location.href).then((r) => r.text())),
			// The app shell's title bar, or the sign-in card's drag strip (signed out).
			titlebar: [".app-titlebar", ".app-sidebar-drag"]
				.map((s) => document.querySelector(s))
				.filter(Boolean)
				.map((el) => getComputedStyle(el).display)
				.join(","),
			pageScrolls: getComputedStyle(document.body).overflow !== "hidden",
		}))()`);
		check("user agent says GuildieDesktop", String(shell.userAgent).includes(" GuildieDesktop/"), shell.userAgent);
		check("server renders the app layout", shell.serverRendered === true);
		check(
			"title bar shown, page doesn't scroll",
			/\b(flex|block)\b/.test(String(shell.titlebar)) && shell.pageScrolls === false,
			shell,
		);
		check(
			"no Node or Electron in the page",
			security.require === "undefined" && security.electron === "false" && security.ipc === "undefined",
		);

		const state = await page<{ connected: boolean }>("window.guildieDesktop.getState()");
		check("getState()", typeof state?.connected === "boolean", state);

		const rejects = async (code: string) =>
			page<string>(`${code}.then(() => "resolved", (e) => "rejected: " + e.message)`);
		const bad = await rejects('window.guildieDesktop.setToken("not-a-token")');
		const badCapture = await rejects('window.guildieDesktop.setLivePixels("yes")');
		check("capture rejects non-boolean input", badCapture.startsWith("rejected"));
		await page("window.guildieDesktop.setLivePixels(false)");
		check(
			"capture can be disabled",
			!(await page<{ livePixelsEnabled?: boolean }>("window.guildieDesktop.getStatus()")).livePixelsEnabled,
		);
		check("setToken rejects a malformed token", bad.startsWith("rejected"), bad);
		const unknown = await rejects('window.guildieDesktop.setToken("gld_' + "x".repeat(32) + '")');
		check("setToken rejects a token the site doesn't know", unknown.startsWith("rejected"), unknown);
		const badAccount = await rejects('window.guildieDesktop.setToken("gld_' + "x".repeat(32) + '", {})');
		check("setToken rejects a non-string account", badAccount.startsWith("rejected"), badAccount);
		const badCallback = await page<string>(
			'(() => { try { window.guildieDesktop.onStatus("x"); return "accepted"; } catch (e) { return "threw"; } })()',
		);
		check("onStatus rejects a non-function", badCallback === "threw");

		// The addon: a WoW install without it gets it.
		const shipped = readAddonVersion(addonSource);
		check("the app ships the addon", !!shipped, { addonSource, shipped });
		const bare = mkdtempSync(join(tmpdir(), "guildie-smoke-bare-"));
		mkdirSync(join(bare, "_forever_"));
		connection.setWowFolder(bare);
		const installed = join(bare, "_forever_", "Interface", "AddOns", "Guildie");
		check(
			"addon installed into a WoW folder without it",
			readAddonVersion(installed) === shipped && existsSync(join(installed, "GuildieData.lua")),
			readAddonVersion(installed),
		);

		// The sync engine: point it at a fake WoW folder and watch the status reach the page.
		await page(
			"window.__statuses = []; window.__off = window.guildieDesktop.onStatus((s) => window.__statuses.push(s)); 1",
		);
		const { wow, addon } = fakeWow();
		connection.setWowFolder(wow);
		check("older addon updated to the shipped version", readAddonVersion(addon) === shipped, readAddonVersion(addon));
		check(
			"GuildieData.lua survives the update",
			readFileSync(join(addon, "GuildieData.lua"), "utf8") === "-- smoke: the app's data, kept across updates\n",
		);
		const pushed = await until(
			() => page<{ wowFolder?: string }[]>("window.__statuses").then((s) => s.find((x) => x.wowFolder === wow)),
			5_000,
		);
		check("onStatus delivers the WoW folder to the page", !!pushed, pushed);
		const status = await page<{ wowFolder?: string; addonVersion?: string }>("window.guildieDesktop.getStatus()");
		check("getStatus() has the WoW folder", status.wowFolder === wow, status);
		check("getStatus() has the addon version", status.addonVersion === shipped, status.addonVersion);

		// The Addon page's calls: what's installed, uninstall (and that it stays
		// uninstalled), install again. Saved data goes only when asked.
		type Info = { bundled?: string; managed: boolean; installs: { version?: string }[] };
		const info = await page<Info>("window.guildieDesktop.addon.info()");
		check(
			"addon.info() shows the installed version",
			info.installs[0]?.version === shipped && info.bundled === shipped,
			info,
		);
		const saved = join(wow, "_forever_", "WTF", "Account", "SMOKE", "SavedVariables", "Guildie.lua");
		const after = await page<Info>("window.guildieDesktop.addon.uninstall({ savedData: false })");
		check(
			"addon.uninstall() removes the addon, keeps saved data, and stays uninstalled",
			!existsSync(addon) && existsSync(saved) && after.managed === false && !after.installs[0]?.version,
			after,
		);
		connection.setWowFolder(wow); // what a start or a folder change does: must not reinstall
		check("an uninstalled addon isn't put back by itself", !existsSync(addon));
		const back = await page<Info>("window.guildieDesktop.addon.install()");
		check("addon.install() puts it back", back.installs[0]?.version === shipped && back.managed === true, back);
		await page("window.guildieDesktop.addon.uninstall({ savedData: true })");
		check("uninstall with saved data removes Guildie's saved file too", !existsSync(addon) && !existsSync(saved));
		await page("window.guildieDesktop.addon.install()");

		const token = process.env.GUILDIE_SMOKE_TOKEN;
		if (token) {
			await page(`window.guildieDesktop.setToken(${JSON.stringify(token)}, "Smoke")`);
			const connected = await page<{ connected: boolean; account?: string }>("window.guildieDesktop.getState()");
			check("setToken connects (checked with /api/helper/me)", connected.connected, connected);
			const stored = readFileSync(join(app.getPath("userData"), "settings.json"), "utf8");
			check(
				"token saved encrypted, under the site's origin",
				!stored.includes(token) && stored.includes(connection.origin),
			);
			connection.uploadNow();
			const synced = await until(() => {
				const s = connection.status;
				return s.guildDataAt ? s : undefined;
			}, 20_000);
			check("guild data downloaded", !!synced?.guildDataAt, synced);
			const file = join(addon, "GuildieData.lua");
			check(
				"GuildieData.lua written",
				existsSync(file) && readFileSync(file, "utf8").startsWith("-- Written by the Guildie app"),
			);
			await page("window.guildieDesktop.signOut()");
			const after = await page<{ connected: boolean }>("window.guildieDesktop.getState()");
			check("signOut() disconnects", !after.connected, after);
		} else {
			log("(GUILDIE_SMOKE_TOKEN not set: skipping connect, upload and download)");
		}

		await page("window.__off(); 1");

		// The pairing fallback: someone approves the logged code on the site meanwhile.
		if (process.env.GUILDIE_SMOKE_PAIR) {
			// Signing in: the approval page would open in the browser; the session
			// code that comes back signs the window in (/desktop/session).
			let sessionCode: string | undefined;
			const pairing = connection.pair(
				(connectUrl) => log(`Pairing: the browser would open ${connectUrl}`),
				(code) => {
					sessionCode = code;
					void win.loadURL(`${new URL(url).origin}/desktop/session?code=${encodeURIComponent(code)}`);
				},
			);
			const code = await until(() => connection.status.pairingCode, 10_000);
			log(`Pairing code: ${code}`);
			await pairing;
			check("pairing connects", connection.status.connected, connection.status);
			check("pairing returns a session code", !!sessionCode);
			// The window goes to /desktop/session, which signs in and moves on to the guild or /me.
			await until(() => win.webContents.getURL().includes("/desktop/session"), 30_000);
			await until(() => !win.webContents.getURL().includes("/desktop/session") && !win.webContents.isLoading(), 30_000);
			const signedIn = await page<boolean>(
				"fetch('/me', { redirect: 'manual' }).then((r) => r.type !== 'opaqueredirect' && r.status === 200)",
			);
			check("the window is signed in with the session code", signedIn, win.webContents.getURL());
			await connection.disconnect();
			await win.loadURL(url);
			await until(() => !win.webContents.isLoading(), 30_000);
		}

		// Pages that aren't Guildie get nothing.
		await win.loadURL("about:blank");
		const blank = await page<string>("typeof window.guildieDesktop");
		check("no bridge on other pages", blank === "undefined", blank);
	} catch (e) {
		check("smoke test ran", false, (e as Error).message);
	}

	const failed = results.filter((r) => !r.ok);
	console.log(`\nSmoke test against ${url}: ${results.length - failed.length}/${results.length} passed`);
	return failed.length === 0;
}
