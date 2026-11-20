// The app's one window: Guildie, with the system's own window buttons drawn
// over the site's title bar (titleBarOverlay), on Windows 11's Mica where there
// is one. Linux gets the same buttons as Windows (no Mica); macOS its traffic
// lights, centered in the title bar. Remembers its size and position, and
// navigates like a native app (mouse back/forward, Alt+Left/Right, Ctrl+R;
// on macOS Cmd+[ and Cmd+], Cmd+Left/Right, Cmd+R).

import { release } from "node:os";
import { join } from "node:path";
import { app, BrowserWindow, type Rectangle, screen, shell } from "electron";
import { isExternalOpenable, isGuildieUrl, staysInWindow } from "./origins.ts";
import { type Bounds, settings } from "./settings.ts";

declare const __VERSION__: string;

/**
 * The title bar strip, matching the site's sidebar and title bar (its CSS
 * token --chrome in apps/web/src/styles/app.css; symbols are --foreground).
 * The site leaves room for the buttons with env(titlebar-area-x/width) and
 * marks its title bar -webkit-app-region: drag. With Mica the strip is
 * transparent and the site's chrome is too.
 */
export const TITLEBAR = { color: "#13110e", symbolColor: "#eee9e1", height: 40 } as const;
const TRANSPARENT = "#00000000";

/** Windows 11 (build 22000+), where BrowserWindow's backgroundMaterial works. Win10 and macOS get the solid color. */
export const hasMica = () => process.platform === "win32" && Number(release().split(".")[2] ?? 0) >= 22000;

/** The system, as the site's user agent token names it. */
export const platformToken = (platform: NodeJS.Platform = process.platform) =>
	platform === "win32" ? "win" : platform === "darwin" ? "mac" : "linux";

/**
 * Tells the site it's in the app, from the very first request, so the server
 * renders the app's layout (html[data-desktop]) with no flash. "(Mica)" asks
 * for transparent chrome; "Platform/<win|mac|linux>" says which window
 * buttons to leave room for (apps without it are Windows ones). Parsed by
 * apps/web/src/lib/desktop.ts.
 */
export const desktopUserAgent = (base: string, mica: boolean, platform: NodeJS.Platform = process.platform) =>
	`${base} GuildieDesktop/${__VERSION__}${mica ? " (Mica)" : ""} Platform/${platformToken(platform)}`;

/** macOS: the traffic lights (about 14 px tall with their padding), centered in the title bar. */
const TRAFFIC_LIGHTS = { x: 14, y: Math.round((TITLEBAR.height - 14) / 2) };

/**
 * Sites from before the app shell (no .app-titlebar): make their header
 * draggable. Any rule of the site's wins (:where() has no specificity).
 */
const FALLBACK_DRAG_CSS = `
:where(html[data-desktop="true"] body:not(:has(.app-titlebar)) header) { -webkit-app-region: drag; }
:where(html[data-desktop="true"] body:not(:has(.app-titlebar)) header :is(a, button, input, select, textarea, label, [role="button"], [tabindex])) { -webkit-app-region: no-drag; }
`;

/** Whether the page's focus is somewhere you type (Cmd+Left/Right moves the cursor there). */
const EDITING_TEXT = `(() => {
	const el = document.activeElement;
	return !!el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName));
})()`;

/**
 * macOS: the mouse's back and forward buttons (3 and 4) arrive as page
 * events only; go back or forward in the page's own history, once per page.
 */
const MAC_MOUSE_BUTTONS = `(() => {
	if (window.__guildieMouseButtons) return;
	window.__guildieMouseButtons = true;
	window.addEventListener("mouseup", (e) => {
		if (e.button === 3) { e.preventDefault(); history.back(); }
		else if (e.button === 4) { e.preventDefault(); history.forward(); }
	}, true);
})()`;

const DEFAULT_SIZE = { width: 1200, height: 820 };

/** Saved bounds, if they're still on a screen (a monitor may have been unplugged). */
function savedBounds(): Bounds | undefined {
	const saved = settings.bounds;
	if (!saved) return undefined;
	const visible = screen.getAllDisplays().some(({ workArea: a }) => {
		const overlapX = Math.min(saved.x + saved.width, a.x + a.width) - Math.max(saved.x, a.x);
		const overlapY = Math.min(saved.y + saved.height, a.y + a.height) - Math.max(saved.y, a.y);
		return overlapX >= 100 && overlapY >= 40;
	});
	return visible ? saved : undefined;
}

export function createWindow(url: string, options: { show: boolean; preload: string }) {
	const saved = savedBounds();
	const mica = hasMica();
	const mac = process.platform === "darwin";
	const win = new BrowserWindow({
		...(saved ? { x: saved.x, y: saved.y, width: saved.width, height: saved.height } : DEFAULT_SIZE),
		minWidth: 420,
		minHeight: 320,
		show: false,
		title: "Guildie",
		// Mica shows through wherever the page is transparent (its sidebar and title bar).
		...(mica ? { backgroundMaterial: "mica" as const } : {}),
		backgroundColor: mica ? TRANSPARENT : TITLEBAR.color,
		// Windows: the multi-size icon for the running window/taskbar, as the tray
		// does. Linux: the PNG (the dock/taskbar may use the .desktop entry's).
		// macOS: the app bundle's icon.
		...(mac
			? {}
			: { icon: join(__dirname, "assets", process.platform === "win32" ? "guildie.ico" : "guildie-256.png") }),
		titleBarStyle: "hidden",
		// macOS draws its traffic lights itself (color and symbols are Windows and Linux only).
		titleBarOverlay: mac
			? { height: TITLEBAR.height }
			: {
					color: mica ? TRANSPARENT : TITLEBAR.color,
					symbolColor: TITLEBAR.symbolColor,
					height: TITLEBAR.height,
				},
		...(mac ? { trafficLightPosition: TRAFFIC_LIGHTS } : {}),
		autoHideMenuBar: true,
		webPreferences: {
			preload: options.preload,
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			webviewTag: false,
			spellcheck: true,
		},
	});
	// Explorer's taskbar group has its own icon metadata, separate from WM_SETICON
	// (the window icon above). Give it a real file: the shell cannot read ASAR paths.
	if (process.platform === "win32") {
		win.setAppDetails({
			appId: "club.guildie.desktop",
			appIconPath: app.isPackaged
				? join(process.resourcesPath, "guildie.ico")
				: join(__dirname, "assets", "guildie.ico"),
			appIconIndex: 0,
			relaunchDisplayName: "Guildie",
		});
	}
	// macOS keeps its application menu (main.ts) in the menu bar, not on the window.
	if (!mac) win.removeMenu();
	if (saved?.maximized) win.maximize();
	if (options.show) win.once("ready-to-show", () => win.show());

	// Remember size and position (the normal bounds, also while maximized).
	let saveTimer: NodeJS.Timeout | undefined;
	const remember = () => {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			if (win.isDestroyed() || win.isMinimized()) return;
			const b: Rectangle = win.getNormalBounds();
			settings.bounds = { ...b, maximized: win.isMaximized() };
		}, 500);
	};
	win.on("resize", remember);
	win.on("move", remember);
	win.on("maximize", remember);
	win.on("unmaximize", remember);

	const contents = win.webContents;
	contents.setUserAgent(desktopUserAgent(contents.getUserAgent(), mica));

	// Navigate like a native app. The site's own history (pushState) is the
	// window's, so the router follows along.
	const history = contents.navigationHistory;
	const back = () => history.canGoBack() && history.goBack();
	const forward = () => history.canGoForward() && history.goForward();
	// Windows and Linux: the mouse's back/forward buttons (and on Windows, keyboard media keys).
	win.on("app-command", (_event, command) => {
		if (command === "browser-backward") back();
		else if (command === "browser-forward") forward();
	});
	if (mac) {
		// Trackpads set to swipe between pages with three fingers.
		win.on("swipe", (_event, direction) => {
			if (direction === "right") back();
			else if (direction === "left") forward();
		});
		// Mouse back/forward buttons reach the page only: send them back here.
		contents.on("did-finish-load", () => {
			if (isGuildieUrl(contents.getURL())) void contents.executeJavaScript(MAC_MOUSE_BUTTONS).catch(() => undefined);
		});
	}
	contents.on("before-input-event", (event, input) => {
		if (input.type !== "keyDown") return;
		const key = input.key;
		const ctrl = input.control || input.meta;
		if (mac) {
			// Cmd+[ / Cmd+], Cmd+R. Option+Left/Right stays word by word in text.
			const cmd = input.meta && !input.control && !input.alt;
			if (cmd && key === "[") back();
			else if (cmd && key === "]") forward();
			else if (cmd && !input.shift && key.toLowerCase() === "r") contents.reload();
			else if (cmd && (key === "ArrowLeft" || key === "ArrowRight")) {
				// Cmd+Left/Right moves the cursor in text: go back or forward only outside text fields.
				void contents
					.executeJavaScript(EDITING_TEXT)
					.then((editing) => {
						if (editing) return;
						if (key === "ArrowLeft") back();
						else forward();
					})
					.catch(() => undefined);
				return;
			} else return;
			event.preventDefault();
			return;
		}
		if (input.alt && !ctrl && key === "ArrowLeft") back();
		else if (input.alt && !ctrl && key === "ArrowRight") forward();
		else if ((ctrl && !input.alt && key.toLowerCase() === "r") || key === "F5") contents.reload();
		else return;
		event.preventDefault();
	});

	// Our pages and the sign-in hops stay in the window; everything else opens in the browser.
	const guard = (event: { preventDefault: () => void }, target: string) => {
		if (staysInWindow(target)) return;
		event.preventDefault();
		if (isExternalOpenable(target)) void shell.openExternal(target);
	};
	contents.on("will-navigate", (event) => guard(event, event.url));
	contents.on("will-redirect", (event) => guard(event, event.url));
	contents.setWindowOpenHandler(({ url: target }) => {
		if (staysInWindow(target)) void win.loadURL(target);
		else if (isExternalOpenable(target)) void shell.openExternal(target);
		return { action: "deny" };
	});
	// No <webview>s, and no permission prompts (camera, location...): the site needs none.
	contents.on("will-attach-webview", (event) => event.preventDefault());
	contents.session.setPermissionRequestHandler((_wc, permission, callback) =>
		callback(permission === "clipboard-sanitized-write"),
	);

	contents.on("did-finish-load", () => void contents.insertCSS(FALLBACK_DRAG_CSS).catch(() => undefined));

	void win.loadURL(url);
	return win;
}
