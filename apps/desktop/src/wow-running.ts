// Whether WoW is open: a window titled "World of Warcraft..." (what the
// capture helper looks for too, capture/discovery.py). For the download
// when WoW opens and for reload reminders. Windows only; elsewhere never open.
//
// Asked directly with EnumWindows and GetWindowTextW through koffi (as
// window-border.ts uses dwmapi): Windows keeps every top-level window's
// title, so this reads a few hundred short strings in a fraction of a
// millisecond, without asking WoW anything. If koffi can't load, tasklist
// (a separate program, so a slower check; the caller checks it less often).

import { execFile } from "node:child_process";
import type { Log } from "@guildie/sync";

/** Reload reminders and the download on launch need to know when WoW is open. */
export const canTellWowRunning = process.platform === "win32";

/**
 * "World of Warcraft" (and anything after it), but not a browser tab about
 * WoW ("World of Warcraft - Google Chrome"): browsers add " - " or " — ".
 */
export const isWowTitle = (title: string) => /^world of warcraft/i.test(title) && !/ [-—–] /.test(title);

type Direct = () => boolean;
let direct: Direct | null | undefined;

function loadDirect(log: Log): Direct | null {
	if (direct !== undefined) return direct;
	try {
		// Loaded here, not at start: only Windows needs it.
		const koffi: typeof import("koffi") = require("koffi");
		const user32 = koffi.load("user32.dll");
		koffi.pointer("GuildieHWND", koffi.opaque());
		koffi.proto("bool __stdcall GuildieEnumWindowsProc(GuildieHWND hwnd, intptr_t lParam)");
		const enumWindows = user32.func(
			"bool __stdcall EnumWindows(GuildieEnumWindowsProc *callback, intptr_t lParam)",
		) as (callback: (hwnd: unknown) => boolean, lParam: number) => boolean;
		const getText = user32.func("int __stdcall GetWindowTextW(GuildieHWND hwnd, _Out_ void *text, int max)") as (
			hwnd: unknown,
			text: Buffer,
			max: number,
		) => number;
		const title = Buffer.alloc(256 * 2);
		direct = () => {
			let found = false;
			// A transient callback: koffi calls it only while EnumWindows runs.
			enumWindows((hwnd) => {
				const n = getText(hwnd, title, 256);
				if (n > 0 && isWowTitle(title.toString("utf16le", 0, n * 2))) {
					found = true;
					return false; // stop
				}
				return true;
			}, 0);
			return found;
		};
	} catch (e) {
		log(`WoW check: can't call Windows directly (${(e as Error).message}); using tasklist`);
		direct = null;
	}
	return direct;
}

/** Whether checks are the cheap direct kind (else: tasklist, check less often). */
export function wowCheckIsCheap(log: Log) {
	return canTellWowRunning && loadDirect(log) !== null;
}

/** The first few checks are logged with how long they took, to see what they cost. */
let timed = 0;

export async function wowRunning(log: Log): Promise<boolean> {
	if (!canTellWowRunning) return false;
	const check = loadDirect(log);
	const started = performance.now();
	let running: boolean;
	if (check) {
		try {
			running = check();
		} catch (e) {
			log(`WoW check failed (${(e as Error).message}); using tasklist`);
			direct = null;
			running = await viaTasklist();
		}
	} else running = await viaTasklist();
	if (timed < 5) {
		timed++;
		log(
			`WoW check: ${running ? "open" : "closed"} in ${(performance.now() - started).toFixed(2)} ms (${check ? "direct" : "tasklist"})`,
		);
	}
	return running;
}

function viaTasklist(): Promise<boolean> {
	return new Promise((resolve) => {
		execFile(
			"tasklist",
			["/FI", "WINDOWTITLE eq World of Warcraft*", "/NH", "/FO", "CSV"],
			{ windowsHide: true, timeout: 10_000 },
			// A match is a CSV row ("Wow.exe","1234",...); none is an INFO line.
			(error, stdout) => resolve(!error && /^"/m.test(stdout)),
		);
	});
}
