// Windows 11 draws a 1px border around every window, in the accent color
// when "Show accent color on title bars and window borders" is on (a bright
// blue line around our dark window). DwmSetWindowAttribute(DWMWA_BORDER_COLOR)
// gives this window our own subtle warm grey line instead, focused or not. Electron has no API for
// it, so this calls dwmapi.dll through koffi (a prebuilt FFI; its Windows
// binary ships in resources/koffi, electron-builder.yml).
//
// Best effort: Windows 10 doesn't have the attribute, and any failure just
// leaves Windows' border as it was.

import type { Log } from "@guildie/sync";
import type { BrowserWindow } from "electron";

const DWMWA_BORDER_COLOR = 34;
/** #4a443c (a light warm grey, faint against the dark app) as a COLORREF, 0x00BBGGRR. */
const BORDER = 0x003c444a;

type SetAttribute = (hwnd: number, attribute: number, value: number[], size: number) => number;
let setAttribute: SetAttribute | null | undefined;

function dwmSetWindowAttribute(log: Log): SetAttribute | null {
	if (setAttribute !== undefined) return setAttribute;
	try {
		// Loaded here, not at start: only Windows needs it.
		const koffi: typeof import("koffi") = require("koffi");
		const dwm = koffi.load("dwmapi.dll");
		setAttribute = dwm.func(
			"int32 __stdcall DwmSetWindowAttribute(intptr hwnd, uint32 attribute, _In_ uint32 *value, uint32 size)",
		) as SetAttribute;
	} catch (e) {
		log(`Window border: couldn't load dwmapi (${(e as Error).message})`);
		setAttribute = null;
	}
	return setAttribute;
}

let reported = false;

function apply(win: BrowserWindow, set: SetAttribute, log: Log, when: string) {
	if (win.isDestroyed()) return;
	try {
		const handle = win.getNativeWindowHandle();
		const hwnd = Number(handle.length >= 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE()));
		const result = set(hwnd, DWMWA_BORDER_COLOR, [BORDER], 4);
		// Once per run, so the log says whether it took (0 is S_OK; Windows 10
		// says E_INVALIDARG, which is fine: no such border there).
		if (!reported) {
			reported = true;
			log(
				`Window border: ${result === 0 ? "set" : `DwmSetWindowAttribute returned 0x${(result >>> 0).toString(16)}`} (${when})`,
			);
		}
	} catch (e) {
		log(`Window border: ${(e as Error).message}`);
	}
}

export function hideWindowBorder(win: BrowserWindow, log: Log) {
	if (process.platform !== "win32") return;
	const set = dwmSetWindowAttribute(log);
	if (!set) return;
	apply(win, set, log, "created");
	// Windows can put the accent border back when the window is shown or
	// becomes active (the outline appeared only while focused), so set it again then.
	win.once("ready-to-show", () => apply(win, set, log, "shown"));
	win.on("show", () => apply(win, set, log, "shown"));
	win.on("focus", () => apply(win, set, log, "focused"));
}
