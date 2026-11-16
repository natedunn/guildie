// Whether WoW is open, for reload reminders: a window titled "World of
// Warcraft..." (what the capture helper looks for too, capture/discovery.py).
// Windows only: tasklist, which every Windows has. Elsewhere: never open.

import { execFile } from "node:child_process";

export function wowRunning(): Promise<boolean> {
	if (process.platform !== "win32") return Promise.resolve(false);
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

/** Reload reminders need to know when WoW is open. */
export const canTellWowRunning = process.platform === "win32";
