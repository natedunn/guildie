// Whether WoW is open. For the download when WoW opens and for reload reminders.
//
// Windows: a window titled "World of Warcraft..." (what the capture helper
// looks for too, capture/discovery.py), asked directly with EnumWindows and GetWindowTextW through koffi (as
// window-border.ts uses dwmapi): Windows keeps every top-level window's
// title, so this reads a few hundred short strings in a fraction of a
// millisecond, without asking WoW anything. If koffi can't load, tasklist
// (a separate program, so a slower check; the caller checks it less often).
//
// macOS: a process running from a "World of Warcraft....app" bundle, from
// `ps` (a separate program: checked less often).
//
// Linux: WoW runs under Wine or Proton, where the game's process is named
// after its .exe (Wow.exe, WowClassic.exe...). /proc/<pid>/comm holds that
// name: a few hundred tiny reads, no program to start.

import { execFile } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import type { Log } from "@guildie/sync";

/** Reload reminders and the download on launch need to know when WoW is open. */
export const canTellWowRunning =
	process.platform === "win32" || process.platform === "darwin" || process.platform === "linux";

/**
 * "World of Warcraft" (and anything after it), but not a browser tab about
 * WoW ("World of Warcraft - Google Chrome"): browsers add " - " or " — ".
 */
export const isWowTitle = (title: string) => /^world of warcraft/i.test(title) && !/ [-—–] /.test(title);

/**
 * The game's .exe under Wine: Wow.exe, WowClassic.exe, Wow-64.exe, WowT.exe,
 * WowB.exe... (any path before it, either slash). Linux cuts a process name
 * (comm) at 15 characters, so a cut-off ".exe" counts too ("WowClassicT.ex").
 * Not the launcher or Battle.net.
 */
export function isWowExe(name: string) {
	const base = name.trim().split(/[\\/]/).pop() ?? "";
	if (!/^wow/i.test(base) || /launcher/i.test(base)) return false;
	if (/^wow[\w-]*\.exe$/i.test(base)) return true;
	return base.length === 15 && /^wow[\w-]*\.e?x?$/i.test(base);
}

/**
 * The game on macOS, from `ps -axo comm=` (the executable's path): inside
 * "World of Warcraft....app/Contents/MacOS/". Not the Battle.net app, not a
 * crash reporter or helper inside the bundle (they live elsewhere in it).
 */
export function isMacWowProcess(path: string) {
	return /\/World of Warcraft[^/]*\.app\/Contents\/MacOS\/[^/]+$/i.test(path.trim());
}

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

/** Whether checks are the cheap direct kind (else: a program to run, check less often). */
export function wowCheckIsCheap(log: Log) {
	if (process.platform === "linux") return true;
	return process.platform === "win32" && loadDirect(log) !== null;
}

/** The first few checks are logged with how long they took, to see what they cost. */
let timed = 0;

export async function wowRunning(log: Log): Promise<boolean> {
	if (!canTellWowRunning) return false;
	if (process.platform !== "win32") {
		const started = performance.now();
		const running = process.platform === "linux" ? viaProc() : await viaPs();
		if (timed < 5) {
			timed++;
			log(
				`WoW check: ${running ? "open" : "closed"} in ${(performance.now() - started).toFixed(2)} ms (${process.platform === "linux" ? "/proc" : "ps"})`,
			);
		}
		return running;
	}
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

/** Linux: any process named like the game's .exe (Wine sets the name; the command line has the path too). */
function viaProc(): boolean {
	let pids: string[];
	try {
		pids = readdirSync("/proc").filter((p) => /^\d+$/.test(p));
	} catch {
		return false;
	}
	for (const pid of pids) {
		try {
			const comm = readFileSync(`/proc/${pid}/comm`, "utf8");
			if (isWowExe(comm)) return true;
			// Some Wine versions leave the name as "wine64-preloader" or similar: the first argument is the .exe.
			if (/^(wine|wine64|wine-preloader|wine64-preloader|preloader)$/.test(comm.trim())) {
				const argv0 = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0")[0] ?? "";
				if (isWowExe(argv0)) return true;
			}
		} catch {
			// The process ended meanwhile, or isn't ours to read.
		}
	}
	return false;
}

/** macOS: every process's executable path, from ps. */
function viaPs(): Promise<boolean> {
	return new Promise((resolve) => {
		execFile("ps", ["-axo", "comm="], { timeout: 10_000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) =>
			resolve(!error && stdout.split("\n").some(isMacWowProcess)),
		);
	});
}
