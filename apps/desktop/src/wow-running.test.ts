import assert from "node:assert/strict";
import { test } from "node:test";
import { isMacWowProcess, isWowExe, isWowTitle } from "./wow-running.ts";

test("WoW's window, not a browser tab about WoW", () => {
	assert.ok(isWowTitle("World of Warcraft"));
	assert.ok(isWowTitle("World of Warcraft: Forever"));
	assert.ok(!isWowTitle("World of Warcraft - Google Chrome"));
	assert.ok(!isWowTitle("World of Warcraft: Forever — Mozilla Firefox"));
	assert.ok(!isWowTitle("Guildie"));
});

test("Linux: the game's process under Wine, by its .exe", () => {
	assert.ok(isWowExe("Wow.exe\n"));
	assert.ok(isWowExe("WowClassic.exe"));
	assert.ok(isWowExe("Wow-64.exe"));
	assert.ok(isWowExe("WowT.exe"));
	assert.ok(isWowExe("C:\\Program Files (x86)\\World of Warcraft\\_forever_\\WowClassic.exe"));
	assert.ok(
		isWowExe("/home/me/Games/battlenet/drive_c/Program Files (x86)/World of Warcraft/_classic_/WowClassic.exe"),
	);
	// comm stops at 15 characters.
	assert.ok(isWowExe("WowClassicPTR.e"));
	assert.ok(!isWowExe("Battle.net.exe"));
	assert.ok(!isWowExe("World of Warcraft Launcher.exe"));
	assert.ok(!isWowExe("WowLauncher.exe"));
	assert.ok(!isWowExe("wowza"));
	assert.ok(!isWowExe("wine64-preloader"));
	assert.ok(!isWowExe(""));
});

test("macOS: the game's app bundle, not Battle.net or a helper", () => {
	assert.ok(
		isMacWowProcess(
			"/Applications/World of Warcraft/_classic_/World of Warcraft Classic.app/Contents/MacOS/World of Warcraft Classic",
		),
	);
	assert.ok(
		isMacWowProcess("/Applications/World of Warcraft/_retail_/World of Warcraft.app/Contents/MacOS/World of Warcraft"),
	);
	assert.ok(!isMacWowProcess("/Applications/Battle.net.app/Contents/MacOS/Battle.net"));
	assert.ok(
		!isMacWowProcess(
			"/Applications/World of Warcraft/_classic_/World of Warcraft Classic.app/Contents/Frameworks/Helper.app/Contents/MacOS/Helper",
		),
	);
	assert.ok(!isMacWowProcess("/usr/bin/World of Warcraft"));
});
