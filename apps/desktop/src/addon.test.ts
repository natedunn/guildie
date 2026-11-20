import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	addonInstalls,
	compareVersions,
	DATA_FILE,
	decideAddonAction,
	ensureAddon,
	readAddonVersion,
	replaceAddon,
	tocVersion,
	uninstallAddon,
} from "./addon.ts";

const quiet = () => {};
const temp = () => mkdtempSync(join(tmpdir(), "guildie-addon-test-"));

/** A shipped addon: the real layout, with a GuildieData.lua that must never be copied. */
function source(version: string) {
	const dir = join(temp(), "Guildie");
	mkdirSync(join(dir, "media"), { recursive: true });
	writeFileSync(
		join(dir, "Guildie.toc"),
		`## Interface: 16001\n## Title: Guildie\n## Version: ${version}\n\nGuildieData.lua\nGuildie.lua\n`,
	);
	writeFileSync(join(dir, "Guildie.lua"), `-- ${version}\n`);
	writeFileSync(join(dir, "media", "icon.tga"), "icon");
	writeFileSync(join(dir, DATA_FILE), "-- repo placeholder\n");
	return dir;
}

function wow(...flavors: string[]) {
	const root = temp();
	for (const f of flavors) mkdirSync(join(root, f), { recursive: true });
	return root;
}

test("versions compare by number", () => {
	assert.equal(compareVersions("0.3.1", "0.3.1"), 0);
	assert.equal(compareVersions("0.3.0", "0.3.1"), -1);
	assert.equal(compareVersions("0.10.0", "0.9.9"), 1);
	assert.equal(compareVersions("1.0", "1.0.0"), 0);
	assert.equal(compareVersions("v1.2.0", "1.1.9"), 1);
	assert.equal(compareVersions("0.3.1", "0.3.10"), -1);
});

test("the version comes from the .toc", () => {
	assert.equal(tocVersion("## Interface: 16001\n## Version: 0.3.1\n"), "0.3.1");
	assert.equal(tocVersion("##Version:   1.2.3\r\n"), "1.2.3");
	assert.equal(tocVersion("## Title: Guildie\n"), undefined);
	assert.equal(readAddonVersion(join(temp(), "missing")), undefined);
});

test("install when missing, update when older or broken, leave newer alone", () => {
	assert.equal(decideAddonAction(undefined, "0.3.1"), "install");
	assert.equal(decideAddonAction(null, "0.3.1"), "update");
	assert.equal(decideAddonAction("0.3.0", "0.3.1"), "update");
	assert.equal(decideAddonAction("0.3.1", "0.3.1"), "none");
	assert.equal(decideAddonAction("0.4.0", "0.3.1"), "none");
});

test("installs into Forever only, with an empty GuildieData.lua, never the shipped one", () => {
	const root = wow("_forever_", "_classic_", "_retail_");
	const results = ensureAddon(source("0.3.1"), root, quiet);
	assert.deepEqual(
		results.map((r) => [r.action, r.version]),
		[["install", "0.3.1"]],
	);
	const folder = join(root, "_forever_", "Interface", "AddOns", "Guildie");
	assert.equal(readAddonVersion(folder), "0.3.1");
	assert.ok(existsSync(join(folder, "media", "icon.tga")));
	assert.match(readFileSync(join(folder, DATA_FILE), "utf8"), /GuildieData = nil/);
	assert.ok(!existsSync(join(root, "_classic_", "Interface")));
	assert.deepEqual(readdirSync(join(root, "_forever_", "Interface", "AddOns")), ["Guildie"]);
});

test("updates an older copy, keeps GuildieData.lua and other addons", () => {
	const root = wow("_forever_");
	const addOns = join(root, "_forever_", "Interface", "AddOns");
	ensureAddon(source("0.3.0"), root, quiet);
	writeFileSync(join(addOns, "Guildie", DATA_FILE), "GuildieData = { fresh = true }\n");
	writeFileSync(join(addOns, "Guildie", "Removed.lua"), "-- only in 0.3.0\n");
	mkdirSync(join(addOns, "Other"));
	writeFileSync(join(addOns, "Other", "Other.toc"), "## Version: 9\n");

	const [result] = ensureAddon(source("0.3.1"), root, quiet);
	assert.equal(result?.action, "update");
	assert.equal(readAddonVersion(join(addOns, "Guildie")), "0.3.1");
	assert.equal(readFileSync(join(addOns, "Guildie", "Guildie.lua"), "utf8"), "-- 0.3.1\n");
	assert.equal(readFileSync(join(addOns, "Guildie", DATA_FILE), "utf8"), "GuildieData = { fresh = true }\n");
	assert.ok(!existsSync(join(addOns, "Guildie", "Removed.lua")), "a clean copy, not a merge");
	assert.equal(readFileSync(join(addOns, "Other", "Other.toc"), "utf8"), "## Version: 9\n");
	assert.deepEqual(readdirSync(addOns).sort(), ["Guildie", "Other"], "no staging folders left");

	assert.equal(ensureAddon(source("0.3.1"), root, quiet)[0]?.action, "none");
	assert.equal(ensureAddon(source("0.3.1"), root, quiet, true)[0]?.action, "update", "Reinstall forces it");
	assert.equal(readFileSync(join(addOns, "Guildie", DATA_FILE), "utf8"), "GuildieData = { fresh = true }\n");
});

test("a crash between the folder swaps is recovered on the next run", () => {
	const addOns = join(temp(), "AddOns");
	// What a crash after moving the old copy aside leaves: no Guildie, the old copy, a staging folder.
	mkdirSync(join(addOns, ".Guildie-old"), { recursive: true });
	writeFileSync(join(addOns, ".Guildie-old", "Guildie.toc"), "## Version: 0.3.0\n");
	writeFileSync(join(addOns, ".Guildie-old", DATA_FILE), "GuildieData = { kept = true }\n");
	mkdirSync(join(addOns, ".Guildie-new"));
	writeFileSync(join(addOns, ".Guildie-new", "half.lua"), "");

	replaceAddon(source("0.3.1"), addOns, quiet);
	assert.deepEqual(readdirSync(addOns), ["Guildie"]);
	assert.equal(readAddonVersion(join(addOns, "Guildie")), "0.3.1");
	assert.equal(readFileSync(join(addOns, "Guildie", DATA_FILE), "utf8"), "GuildieData = { kept = true }\n");
	assert.ok(!existsSync(join(addOns, "Guildie", "half.lua")));
});

test("uninstall removes the addon (and, if asked, only its saved files)", () => {
	const root = wow("_forever_", "_classic_");
	ensureAddon(source("0.3.1"), root, quiet);
	const forever = join(root, "_forever_");
	const sv = (...parts: string[]) => join(forever, "WTF", "Account", "ACCT", ...parts);
	mkdirSync(sv("SavedVariables"), { recursive: true });
	mkdirSync(sv("Realm", "Todd", "SavedVariables"), { recursive: true });
	writeFileSync(sv("SavedVariables", "Guildie.lua"), "GuildieDB = {}");
	writeFileSync(sv("SavedVariables", "Guildie.lua.bak"), "GuildieDB = {}");
	writeFileSync(sv("SavedVariables", "Other.lua"), "Other = {}");
	writeFileSync(sv("Realm", "Todd", "SavedVariables", "Guildie.lua"), "x");
	mkdirSync(join(forever, "Interface", "AddOns", "OtherAddon"), { recursive: true });
	assert.equal(addonInstalls(root)[0]?.version, "0.3.1");

	// Without saved data: only the addon folder goes.
	uninstallAddon(root, { savedData: false }, quiet);
	assert.equal(addonInstalls(root)[0]?.version, undefined);
	assert.ok(existsSync(sv("SavedVariables", "Guildie.lua")));

	// With saved data: Guildie's saved files go too, nothing else.
	ensureAddon(source("0.3.1"), root, quiet);
	uninstallAddon(root, { savedData: true }, quiet);
	assert.ok(!existsSync(join(forever, "Interface", "AddOns", "Guildie")));
	assert.ok(!existsSync(sv("SavedVariables", "Guildie.lua")));
	assert.ok(!existsSync(sv("SavedVariables", "Guildie.lua.bak")));
	assert.ok(!existsSync(sv("Realm", "Todd", "SavedVariables", "Guildie.lua")));
	assert.ok(existsSync(sv("SavedVariables", "Other.lua")));
	assert.ok(existsSync(join(forever, "Interface", "AddOns", "OtherAddon")));
});

test("Linux: installs into the Interface/Addons that's there instead of making a second AddOns", () => {
	const root = wow("_forever_");
	const interfaceDir = join(root, "_forever_", "Interface");
	mkdirSync(join(interfaceDir, "Addons", "OtherAddon"), { recursive: true });
	const [result] = ensureAddon(source("0.3.1"), root, quiet);
	assert.equal(result?.version, "0.3.1");
	assert.deepEqual(readdirSync(interfaceDir), ["Addons"]);
	assert.deepEqual(readdirSync(join(interfaceDir, "Addons")).sort(), ["Guildie", "OtherAddon"]);
	assert.equal(addonInstalls(root)[0]?.version, "0.3.1");
});
