import assert from "node:assert/strict";
import { test } from "node:test";
import { desktopEntry, desktopExecArg, isLastingMacPath, launchAgentPlist } from "./platform.ts";

test("Linux: .desktop Exec arguments", () => {
	assert.equal(desktopExecArg("/home/me/Apps/Guildie.AppImage"), "/home/me/Apps/Guildie.AppImage");
	assert.equal(desktopExecArg("--hidden"), "--hidden");
	assert.equal(desktopExecArg("/home/me/My Apps/Guildie.AppImage"), '"/home/me/My Apps/Guildie.AppImage"');
	assert.equal(desktopExecArg("100%"), "100%%");
	assert.equal(desktopExecArg('a "b" $c'), '"a \\\\"b\\\\" \\\\$c"');
	assert.equal(desktopExecArg("a\\b c"), '"a\\\\\\\\b c"');
});

test("Linux: the launcher and autostart entries run the AppImage", () => {
	const entry = desktopEntry("/home/me/Guildie.AppImage", ["--hidden"], { NoDisplay: "true" });
	assert.match(entry, /^\[Desktop Entry\]\n/);
	assert.match(entry, /\nExec=\/home\/me\/Guildie.AppImage --hidden\n/);
	assert.match(entry, /\nIcon=guildie\n/);
	assert.match(entry, /\nStartupWMClass=guildie\n/);
	assert.match(entry, /\nNoDisplay=true\n/);
});

test("macOS: the login LaunchAgent starts hidden, and only from a lasting place", () => {
	const plist = launchAgentPlist("/Applications/Guildie.app/Contents/MacOS/Guildie", [
		"--hidden",
		"--url",
		"https://a.b/?x=1&y=<2>",
	]);
	assert.match(
		plist,
		/<string>\/Applications\/Guildie.app\/Contents\/MacOS\/Guildie<\/string>\n\t\t<string>--hidden<\/string>/,
	);
	assert.match(plist, /https:\/\/a.b\/\?x=1&amp;y=&lt;2&gt;/);
	assert.match(plist, /<key>RunAtLoad<\/key>\n\t<true\/>/);
	assert.ok(isLastingMacPath("/Applications/Guildie.app/Contents/MacOS/Guildie"));
	assert.ok(!isLastingMacPath("/Volumes/Guildie/Guildie.app/Contents/MacOS/Guildie"));
	assert.ok(!isLastingMacPath("/private/var/folders/x/T/AppTranslocation/ABC/d/Guildie.app/Contents/MacOS/Guildie"));
});
