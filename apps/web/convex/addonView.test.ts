import assert from "node:assert/strict";
import { test } from "node:test";
import { addonView } from "./addonView.ts";

const HOUR = 3600_000;
const LOGIN = 1_794_261_703_000;

const character = {
	slug: "lich-braz",
	blizzardId: 5_123_874,
	level: 22,
	lastLoginAt: LOGIN,
	profileSyncedAt: LOGIN + 2 * HOUR,
	talentsChangedAt: LOGIN + HOUR,
	averageItemLevel: 20,
	equipment: [
		{ slot: "HEAD", itemId: 1, name: "Old Hat", quality: "COMMON", itemLevel: 20 },
		{ slot: "FINGER_2", itemId: 7, name: "Ring", quality: "COMMON", itemLevel: 20 },
	],
	professions: [
		{ id: 197, name: "Tailoring", skill: 100, maxSkill: 150, secondary: false, knownRecipes: [10, 11] },
		{ id: 333, name: "Enchanting", skill: 90, maxSkill: 150, secondary: false, knownRecipes: [20] },
	],
	talentTrees: [
		{
			id: 613,
			name: "Discipline",
			points: 8,
			talents: [
				{ id: 300, name: "B", rank: 3 },
				{ id: 200, name: "A", rank: 5 },
			],
		},
		{ id: 614, name: "Holy", points: 2, talents: [{ id: 250, name: "C", rank: 2 }] },
	],
};

test("Blizzard's profile only: slots by number, ranks sorted, synced from Blizzard", () => {
	const view = addonView(character, null);
	assert.equal(view.slug, "lich-braz");
	assert.equal(view.id, 5_123_874);
	assert.equal(view.level, 22);
	assert.deepEqual(view.gear, { 1: 1, 12: 7 });
	assert.deepEqual(view.talents, {
		total: 10,
		trees: [
			{ name: "Discipline", points: 8 },
			{ name: "Holy", points: 2 },
		],
		ranks: "200:5,250:2,300:3",
	});
	assert.deepEqual(view.professions, { Tailoring: { skill: 100, recipes: 2 }, Enchanting: { skill: 90, recipes: 1 } });
	assert.deepEqual(view.synced, { at: LOGIN, from: "blizzard" });
});

test("a newer upload from the game wins, and the game's recipe count counts", () => {
	const at = LOGIN + 3 * HOUR;
	const view = addonView(character, {
		capturedAt: at,
		level: 23,
		talentTrees: [{ id: 613, name: "Discipline", points: 9, talents: [{ id: 200, name: "A", rank: 9 }] }],
		equipment: { capturedAt: at, items: [{ slot: "MAIN_HAND", itemId: 2520, name: "Sword", quality: "UNCOMMON" }] },
		professions: {
			capturedAt: at,
			list: [{ id: 197, name: "Tailoring", skill: 120, maxSkill: 150, secondary: false }],
		},
		// The game listed 5; the catalog matched 3 of them.
		recipes: [
			{ professionId: 197, profession: "Tailoring", capturedAt: at, recipeIds: [10, 11, 12], count: 5, unmatched: 2 },
		],
	});
	assert.equal(view.level, 23);
	assert.deepEqual(view.gear, { 16: 2520 });
	assert.deepEqual(view.talents, { total: 9, trees: [{ name: "Discipline", points: 9 }], ranks: "200:9" });
	assert.deepEqual(view.professions, { Tailoring: { skill: 120, recipes: 5 } });
	assert.deepEqual(view.synced, { at, from: "game" });
});

test("talents without ids: no ranks string; nothing known: empty", () => {
	const view = addonView(
		{
			...character,
			talentTrees: [{ id: 1, name: "X", points: 1, talents: [{ name: "Y", rank: 1 }] }],
			equipment: undefined,
			professions: undefined,
		},
		null,
	);
	assert.equal(view.talents.ranks, undefined);
	assert.deepEqual(view.gear, {});
	assert.deepEqual(view.professions, {});
	assert.ok(JSON.stringify(view).length < 200, "small");
});

test("server comparison includes actual inventory, quest and accepted delivery data", () => {
	const snapshot = {
		capturedAt: LOGIN,
		talentTrees: [],
		quests: { capturedAt: LOGIN, list: [{ id: 1, complete: true }] },
		completedQuestIds: [2],
		deliveryIds: ["event1"],
	};
	const inventory = {
		bags: { capturedAt: LOGIN, items: [{ id: 4306, count: 7, name: "Silk Cloth" }] },
		bank: { capturedAt: LOGIN, items: [] },
	};
	const view = addonView(character, snapshot, inventory);
	assert.deepEqual(view.details, {
		bags: [{ id: 4306, count: 7 }],
		bank: [],
		quests: [{ id: 1, complete: true }],
		completedQuestIds: [2],
		deliveryIds: ["event1"],
	});
	assert.equal(
		addonView(character, null).details?.bags,
		undefined,
		"missing evidence must not become an empty confirmed inventory",
	);
});
