// What differs on macOS and Linux outside the window: opening at login, the
// Linux app launcher entry, and whether a Linux desktop shows tray icons.
// Windows keeps Electron's own login item (main.ts).

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Log } from "@guildie/sync";

export type StartWithSystem = { get: () => boolean; set: (on: boolean) => void };

/** Writes a file only when its text changed (then via a temporary file, so it's never half written). */
function writeIfChanged(path: string, text: string, mode = 0o644) {
	try {
		if (readFileSync(path, "utf8") === text) return false;
	} catch {}
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(`${path}.tmp`, text, { mode });
	renameSync(`${path}.tmp`, path);
	return true;
}

// ---- macOS: a LaunchAgent, so it can start with --hidden ----

const LAUNCH_AGENT_LABEL = "club.guildie.desktop";
const launchAgentPath = () => join(homedir(), "Library", "LaunchAgents", `${LAUNCH_AGENT_LABEL}.plist`);

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The LaunchAgent that opens Guildie at login (RunAtLoad, never restarted after Quit). */
export function launchAgentPlist(executable: string, args: string[]) {
	const program = [executable, ...args].map((a) => `\t\t<string>${xml(a)}</string>`).join("\n");
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${LAUNCH_AGENT_LABEL}</string>
	<key>ProgramArguments</key>
	<array>
${program}
	</array>
	<key>RunAtLoad</key>
	<true/>
	<key>AssociatedBundleIdentifiers</key>
	<string>${LAUNCH_AGENT_LABEL}</string>
	<key>ProcessType</key>
	<string>Interactive</string>
</dict>
</plist>
`;
}

/**
 * Where the app can be started from at login: not a disk image or a copy
 * macOS moved aside (App Translocation, when it's opened from Downloads
 * without being moved to Applications): those paths don't last.
 */
export const isLastingMacPath = (executable: string) =>
	!executable.startsWith("/Volumes/") && !executable.includes("/AppTranslocation/");

function macLoginItem(executable: string, args: string[], log: Log): StartWithSystem | undefined {
	if (!isLastingMacPath(executable)) return undefined;
	const plist = launchAgentPlist(executable, args);
	// On: point it at this copy of the app (it may have moved since).
	if (existsSync(launchAgentPath()) && writeIfChanged(launchAgentPath(), plist)) log("Open at login: updated");
	return {
		get: () => existsSync(launchAgentPath()),
		set: (on) => {
			try {
				if (on) writeIfChanged(launchAgentPath(), plist);
				else rmSync(launchAgentPath(), { force: true });
				log(`Open at login: ${on ? "on" : "off"}`);
			} catch (e) {
				log(`Open at login: couldn't ${on ? "turn it on" : "turn it off"}: ${(e as Error).message}`);
			}
		},
	};
}

// ---- Linux: freedesktop .desktop files (AppImage only) ----

const configHome = () => process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
const dataHome = () => process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
const autostartPath = () => join(configHome(), "autostart", "guildie.desktop");

/**
 * Matches the window to its launcher entry: the Wayland app_id (from
 * package.json's desktopName, guildie.desktop, set by electron-builder) and
 * X11's WM_CLASS instance (the app's name lowercased; main.ts setName).
 */
export const LINUX_WM_CLASS = "guildie";

/**
 * An argument on a .desktop file's Exec line (the Desktop Entry spec): "%"
 * doubled; anything but plain characters double-quoted, where " ` and $
 * get two backslashes before them in the file and a backslash becomes four.
 */
export function desktopExecArg(arg: string) {
	const plain = arg.replace(/%/g, "%%");
	if (/^[\w@%+=:,./-]+$/.test(plain)) return plain;
	return `"${plain.replace(/["`$\\]/g, (c) => (c === "\\" ? "\\\\\\\\" : `\\\\${c}`))}"`;
}

/** A .desktop entry that runs the AppImage. */
export function desktopEntry(appImage: string, args: string[], extra: Record<string, string> = {}) {
	const lines = {
		Type: "Application",
		Name: "Guildie",
		Comment: "Your WoW: Forever guild, and the Guildie addon's uploader",
		Exec: [appImage, ...args].map(desktopExecArg).join(" "),
		Icon: "guildie",
		Terminal: "false",
		Categories: "Game;",
		StartupWMClass: LINUX_WM_CLASS,
		...extra,
	};
	return `[Desktop Entry]\n${Object.entries(lines)
		.map(([k, v]) => `${k}=${v}`)
		.join("\n")}\n`;
}

function linuxLoginItem(appImage: string, args: string[], log: Log): StartWithSystem {
	const entry = desktopEntry(appImage, args, { NoDisplay: "true", "X-GNOME-Autostart-enabled": "true" });
	// On: keep it pointed at this AppImage (an update may have renamed it).
	if (existsSync(autostartPath()) && writeIfChanged(autostartPath(), entry)) log("Open at login: updated");
	return {
		get: () => existsSync(autostartPath()),
		set: (on) => {
			try {
				if (on) writeIfChanged(autostartPath(), entry);
				else rmSync(autostartPath(), { force: true });
				log(`Open at login: ${on ? "on" : "off"}`);
			} catch (e) {
				log(`Open at login: couldn't ${on ? "turn it on" : "turn it off"}: ${(e as Error).message}`);
			}
		},
	};
}

/**
 * "Open at login" on macOS (a packaged app somewhere lasting) and Linux (an
 * AppImage), started with `args` (--hidden). Undefined where it isn't offered.
 */
export function loginItem(args: string[], packaged: boolean, log: Log): StartWithSystem | undefined {
	if (!packaged) return undefined;
	if (process.platform === "darwin") return macLoginItem(process.execPath, args, log);
	if (process.platform === "linux" && process.env.APPIMAGE) return linuxLoginItem(process.env.APPIMAGE, args, log);
	return undefined;
}

/**
 * Linux, in an AppImage: puts Guildie in the app launcher (a .desktop entry
 * and its icon), and keeps it pointed at the current AppImage (updates may
 * rename it). Only writes what changed.
 */
export function integrateLinuxDesktop(iconPng: () => Buffer, log: Log) {
	const appImage = process.env.APPIMAGE;
	if (process.platform !== "linux" || !appImage) return;
	try {
		const icon = join(dataHome(), "icons", "hicolor", "256x256", "apps", "guildie.png");
		if (!existsSync(icon)) {
			mkdirSync(dirname(icon), { recursive: true });
			writeFileSync(icon, iconPng());
		}
		const launcher = join(dataHome(), "applications", "guildie.desktop");
		if (writeIfChanged(launcher, desktopEntry(appImage, []))) log(`App launcher entry: ${launcher}`);
	} catch (e) {
		log(`Couldn't add Guildie to the app launcher: ${(e as Error).message}`);
	}
}

/**
 * Linux: whether the desktop shows tray icons (a StatusNotifierItem host:
 * KDE, Cinnamon, XFCE...; GNOME only with the AppIndicator extension).
 * Undefined when it can't tell (no gdbus or dbus-send).
 */
export function linuxTrayHost(): Promise<boolean | undefined> {
	const name = "org.kde.StatusNotifierWatcher";
	const run = (cmd: string, args: string[]) =>
		new Promise<string | undefined>((resolve) =>
			execFile(cmd, args, { timeout: 3_000 }, (error, stdout) => resolve(error ? undefined : stdout)),
		);
	return run("gdbus", [
		"call",
		"--session",
		"--dest",
		"org.freedesktop.DBus",
		"--object-path",
		"/org/freedesktop/DBus",
		"--method",
		"org.freedesktop.DBus.NameHasOwner",
		name,
	]).then(async (out) => {
		if (out !== undefined) return out.includes("true");
		const viaDbusSend = await run("dbus-send", [
			"--session",
			"--print-reply",
			"--dest=org.freedesktop.DBus",
			"/org/freedesktop/DBus",
			"org.freedesktop.DBus.NameHasOwner",
			`string:${name}`,
		]);
		return viaDbusSend === undefined ? undefined : /boolean true/.test(viaDbusSend);
	});
}
