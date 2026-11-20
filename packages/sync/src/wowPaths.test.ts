import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { findAddonFolders, findSavedVariables } from "./watcher.ts";
import { childPath, defaultWowFolders, linuxPrefixes, resolveWowFolder, wowCandidates } from "./wowPaths.ts";

const temp = () => realpathSync(mkdtempSync(join(tmpdir(), "guildie-wow-paths-")));

/** A WoW install with a _forever_ folder at `wow`. */
function install(wow: string) {
	mkdirSync(join(wow, "_forever_"), { recursive: true });
	return wow;
}

test("Windows and macOS: the usual folders", () => {
	assert.equal(
		defaultWowFolders({ platform: "win32", home: "C:\\Users\\x" })[0],
		"C:\\Program Files (x86)\\World of Warcraft",
	);
	const mac = defaultWowFolders({ platform: "darwin", home: "/Users/x" });
	assert.deepEqual(mac.slice(0, 2), ["/Applications/World of Warcraft", "/Users/x/Applications/World of Warcraft"]);
	assert.deepEqual(wowCandidates("/somewhere/wow", { platform: "linux", home: "/nowhere" }), ["/somewhere/wow"]);
});

test("Linux: WoW in Wine, Lutris, Bottles and Steam prefixes", () => {
	const home = temp();
	const wine = install(join(home, ".wine", "drive_c", "Program Files (x86)", "World of Warcraft"));
	const lutris = install(join(home, "Games", "battlenet", "drive_c", "Program Files (x86)", "World of Warcraft"));
	const bottles = install(
		join(
			home,
			".var",
			"app",
			"com.usebottles.bottles",
			"data",
			"bottles",
			"bottles",
			"Battle",
			"drive_c",
			"Program Files (x86)",
			"World of Warcraft",
		),
	);
	const steam = install(
		join(
			home,
			".local",
			"share",
			"Steam",
			"steamapps",
			"compatdata",
			"123",
			"pfx",
			"drive_c",
			"Program Files",
			"World of Warcraft",
		),
	);
	// ~/.steam/steam -> ~/.local/share/Steam, as Steam sets it up: found once.
	mkdirSync(join(home, ".steam"));
	symlinkSync(join(home, ".local", "share", "Steam"), join(home, ".steam", "steam"));
	// A prefix without WoW, and a ~/Games folder that isn't a prefix.
	mkdirSync(join(home, "Games", "other", "drive_c"), { recursive: true });
	mkdirSync(join(home, "Games", "notes"), { recursive: true });

	const found = defaultWowFolders({ platform: "linux", home });
	assert.deepEqual(found.slice(0, 2), [wine, lutris]);
	assert.ok(found.includes(bottles));
	assert.equal(found.filter((f) => realpathSync(f) === realpathSync(steam)).length, 1);
	assert.equal(found.length, 4);
	assert.ok(!linuxPrefixes({ platform: "linux", home }).includes(join(home, "Games", "notes")));
});

test("Linux: $WINEPREFIX first", () => {
	const home = temp();
	const prefix = join(temp(), "my-prefix");
	const wow = install(join(prefix, "drive_c", "Program Files (x86)", "World of Warcraft"));
	install(join(home, ".wine", "drive_c", "Program Files (x86)", "World of Warcraft"));
	assert.equal(defaultWowFolders({ platform: "linux", home, winePrefix: prefix })[0], wow);
});

test("paths inside WoW keep the case that's on disk", () => {
	const wow = install(temp());
	mkdirSync(join(wow, "_forever_", "Interface", "Addons", "Guildie"), { recursive: true });
	writeFileSync(join(wow, "_forever_", "Interface", "Addons", "Guildie", "Guildie.toc"), "## Version: 1\n");
	mkdirSync(join(wow, "_forever_", "wtf", "Account", "ME", "SavedVariables"), { recursive: true });
	writeFileSync(join(wow, "_forever_", "wtf", "Account", "ME", "SavedVariables", "Guildie.lua"), "GuildieDB = {}\n");

	assert.equal(findAddonFolders(wow).length, 1);
	assert.equal(findSavedVariables(wow).length, 1);
	// Linux rules on any file system: "AddOns" resolves to the "Addons" that's there.
	const resolved = childPath(join(wow, "_forever_", "Interface"), "AddOns", "linux");
	assert.equal(readdirSync(join(wow, "_forever_", "Interface")).length, 1);
	assert.ok(resolved.endsWith("Addons") || resolved.endsWith("AddOns"));
	// Nothing there: the name as given.
	assert.equal(childPath(wow, "Nothing", "linux"), join(wow, "Nothing"));
});

test("a chosen folder: the WoW folder, _forever_ inside it, or a Wine prefix", () => {
	const wow = install(join(temp(), "World of Warcraft"));
	assert.equal(resolveWowFolder(wow), wow);
	assert.equal(resolveWowFolder(join(wow, "_forever_")), wow);
	const prefix = temp();
	const inPrefix = install(join(prefix, "drive_c", "Program Files (x86)", "World of Warcraft"));
	assert.equal(resolveWowFolder(prefix), inPrefix);
	assert.equal(resolveWowFolder(join(prefix, "drive_c")), inPrefix);
	assert.equal(resolveWowFolder(temp()), undefined);
});
