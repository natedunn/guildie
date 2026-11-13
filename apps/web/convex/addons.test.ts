import assert from "node:assert/strict";
import { test } from "node:test";
import { canSeeAddons, catalogEntry, summarizeAddons } from "./shared/addons.ts";

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
