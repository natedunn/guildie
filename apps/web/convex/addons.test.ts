import assert from "node:assert/strict";
import { test } from "node:test";
import { canSeeAddons, catalogEntry, folderProjects, summarizeAddons, tidyNotes } from "./shared/addons.ts";

test("who sees a player's addons", () => {
	const owner = { isOwner: true, isMember: false };
	const member = { isOwner: false, isMember: true };
	const stranger = { isOwner: false, isMember: false };
	assert.equal(canSeeAddons("none", owner), true, "the player always sees their own");
	assert.equal(canSeeAddons(undefined, owner), true);
	assert.equal(canSeeAddons("none", member), false);
	assert.equal(canSeeAddons(undefined, member), false, "never chosen: nobody else");
	assert.equal(canSeeAddons("guild", member), true);
	assert.equal(canSeeAddons("guild", stranger), false);
	assert.equal(canSeeAddons("public", stranger), true);
});

test("a guild's addons: most used first, one count per person, versions per person", () => {
	const rows = summarizeAddons([
		{ list: [{ name: "Questie", version: "9.1" }, { name: "Bagnon" }] },
		{
			list: [
				{ name: "questie", title: "Questie", version: "9.2" },
				{ name: "Questie", version: "9.2" },
			],
		},
		{
			list: [
				{ name: "Details", title: "Details! Damage Meter", notes: "Damage meter" },
				{ name: "Questie", version: "9.1" },
			],
		},
	]);
	assert.deepEqual(
		rows.map((r) => [r.title, r.summary, r.users]),
		[
			[
				"Questie",
				undefined,
				[
					{ person: 0, version: "9.1" },
					{ person: 1, version: "9.2" },
					{ person: 2, version: "9.1" },
				],
			],
			["Bagnon", undefined, [{ person: 0 }]],
			["Details! Damage Meter", "Damage meter", [{ person: 2 }]],
		],
	);
	assert.deepEqual(summarizeAddons([]), []);
});

test("an addon's folders are one addon per CurseForge project, named by the catalog", () => {
	const rows = summarizeAddons(
		[
			{
				list: [
					{ name: "DBM-Core", title: "Deadly Boss Mods", version: "12.1", curseId: 3358 },
					{ name: "DBM-Raids-Vanilla", version: "12.1", curseId: 3358 },
					{ name: "DBM-StatusBarTimers", version: "12.1", curseId: 3358 },
				],
			},
			// An older Guildie addon: no project IDs, borrowed from others' lists.
			{ list: [{ name: "DBM-Core", title: "Deadly Boss Mods", version: "12.0" }] },
		],
		new Map([[3358, { name: "DBM - Deadly Boss Mods", summary: "Boss timers", categories: ["Boss Encounters"] }]]),
	);
	assert.equal(rows.length, 1);
	assert.equal(rows[0].title, "Deadly Boss Mods", "the .toc title over CurseForge's longer name");
	assert.equal(rows[0].summary, "Boss timers");
	assert.deepEqual(rows[0].categories, ["Boss Encounters"]);
	assert.deepEqual(rows[0].folders, ["DBM-Core", "DBM-Raids-Vanilla", "DBM-StatusBarTimers"]);
	assert.deepEqual(rows[0].users, [
		{ person: 0, version: "12.1" },
		{ person: 1, version: "12.0" },
	]);
});

test("CurseForge projects: WoW only, links and logos only from CurseForge", () => {
	assert.deepEqual(
		catalogEntry({
			id: 3358,
			gameId: 1,
			name: " DBM ",
			summary: "Timers",
			links: { websiteUrl: "https://www.curseforge.com/wow/addons/deadly-boss-mods" },
			logo: { thumbnailUrl: "https://media.forgecdn.net/avatars/thumbnails/1.png" },
			categories: [{ name: "Combat" }, { name: "Combat" }, { name: "Boss Encounters" }],
		}),
		{
			curseId: 3358,
			name: "DBM",
			summary: "Timers",
			url: "https://www.curseforge.com/wow/addons/deadly-boss-mods",
			logo: "https://media.forgecdn.net/avatars/thumbnails/1.png",
			categories: ["Combat", "Boss Encounters"],
		},
	);
	const bad = catalogEntry({
		id: 1,
		gameId: 1,
		links: { websiteUrl: "javascript:alert(1)" },
		logo: { thumbnailUrl: "http://evil.example/x.png" },
	});
	assert.equal(bad.url, undefined);
	assert.equal(bad.logo, undefined);
	assert.deepEqual(catalogEntry({ id: 2, gameId: 432 }), { curseId: 2, missing: true }, "not a WoW project");
});

test("folders → projects from CurseForge's popular list: the project named like the folder, else the most downloaded", () => {
	const map = folderProjects([
		{
			id: 914482,
			gameId: 1,
			name: "Baganator (Bags)",
			slug: "baganator",
			downloadCount: 40,
			latestFiles: [{ modules: [{ name: "Baganator" }] }, { modules: [{ name: "Baganator" }] }],
		},
		{
			id: 326516,
			gameId: 1,
			name: "AtlasLootClassic",
			downloadCount: 38,
			latestFiles: [{ modules: [{ name: "AtlasLootClassic" }, { name: "AtlasLootClassic_Data" }] }],
		},
		{
			id: 1422985,
			gameId: 1,
			name: "AtlasLoot Classic Forever",
			downloadCount: 90,
			latestFiles: [{ modules: [{ name: "AtlasLootClassic" }, { name: "AtlasLootClassic_Data" }] }],
		},
		{ id: 9, gameId: 432, name: "Minecraft", latestFiles: [{ modules: [{ name: "Questie" }] }] },
	]);
	assert.equal(map.get("baganator"), 914482, "slug matches the folder");
	assert.equal(map.get("atlaslootclassic"), 326516, "named like the folder beats more downloads");
	assert.equal(map.get("atlaslootclassic_data"), 1422985, "otherwise the most downloaded");
	assert.equal(map.has("questie"), false, "WoW projects only");
});

test("addons without a .toc ID get their project from the folder map; a .toc ID wins", () => {
	const rows = summarizeAddons(
		[
			{
				list: [{ name: "Baganator" }, { name: "SpeedyAutoLoot", version: "1.4" }, { name: "Questie", curseId: 334372 }],
			},
		],
		new Map([
			[914482, { name: "Baganator (Bags)", summary: "Bags" }],
			[295182, { name: "Speedy AutoLoot", summary: "Loot faster" }],
			[334372, { name: "Questie" }],
		]),
		new Map([
			["baganator", 914482],
			["speedyautoloot", 295182],
			["questie", 1],
		]),
	);
	const byTitle = new Map(rows.map((r) => [r.title, r]));
	assert.equal(byTitle.get("Baganator")?.summary, "Bags", "CurseForge's name without its (tail)");
	assert.equal(byTitle.get("Speedy AutoLoot")?.users[0].version, "1.4");
	assert.equal(byTitle.get("Questie")?.key, "curse:334372");
});

test("notes cut short in game end at a word", () => {
	const cut =
		"Sends your character (level, gear, weapon and armor skills, professions, recipes, talents, bags and bank, and your quest";
	assert.equal(cut.length, 120);
	assert.equal(
		tidyNotes(cut),
		"Sends your character (level, gear, weapon and armor skills, professions, recipes, talents, bags and bank, and your…",
	);
	assert.equal(tidyNotes("Short."), "Short.");
});

test("Guildie itself isn't on CurseForge: its own icon, description and a link to its page here", () => {
	const [row] = summarizeAddons([{ list: [{ name: "Guildie", version: "0.20.0", notes: "Old notes" }] }]);
	assert.equal(row.logo, "/icons/icon-192.png");
	assert.equal(row.url, "/settings/addon");
	assert.equal(row.site, "Guildie");
	assert.deepEqual(row.categories, ["Guild"]);
	const [curse] = summarizeAddons(
		[{ list: [{ name: "Questie", curseId: 1 }] }],
		new Map([[1, { url: "https://www.curseforge.com/wow/addons/questie" }]]),
	);
	assert.equal(curse.site, "CurseForge");
});
