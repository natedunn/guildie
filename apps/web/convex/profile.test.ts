import assert from "node:assert/strict";
import { test } from "node:test";
import { averageItemLevel, mergeProfile } from "./profile.ts";

const HOUR = 3600_000;
const LOGIN = 1_794_261_703_000;

const blizzard = {
	level: 22,
	lastLoginAt: LOGIN,
	profileSyncedAt: LOGIN + 2 * HOUR,
	talentsChangedAt: LOGIN + HOUR,
	averageItemLevel: 20,
	equipment: [{ slot: "HEAD", itemId: 1, name: "Old Hat", quality: "COMMON", itemLevel: 20 }],
	professions: [
		{ id: 197, name: "Tailoring", skill: 100, maxSkill: 150, secondary: false, knownRecipes: [10, 11] },
		{ id: 333, name: "Enchanting", skill: 90, maxSkill: 150, secondary: false, knownRecipes: [20] },
	],
	talentTrees: [{ id: 613, name: "Discipline", points: 13, talents: [] }],
};

const snapshot = (at: number) => ({
	capturedAt: at,
	level: 23,
	talentTrees: [{ id: 613, name: "Discipline", points: 14, talents: [] }],
	equipment: {
		capturedAt: at,
		averageItemLevel: 21.9,
		items: [{ slot: "HEAD", itemId: 2, name: "New Hat", quality: "UNCOMMON", itemLevel: 24, tooltip: [] }],
	},
	professions: {
		capturedAt: at,
		list: [
			{ id: 197, name: "Tailoring", skill: 120, maxSkill: 150, secondary: false },
			{ id: 185, name: "Cooking", skill: 60, maxSkill: 75, secondary: true },
		],
	},
	recipes: [
		{
			professionId: 197,
			profession: "Tailoring",
			capturedAt: at - 60_000,
			recipeIds: [11, 12],
			count: 2,
			unmatched: 0,
		},
		{ professionId: 333, profession: "Enchanting", capturedAt: at, recipeIds: [21], count: 1, unmatched: 0 },
	],
});

test("no addon: Blizzard's, synced as of the last logout", () => {
	const p = mergeProfile(blizzard, null);
	assert.equal(p.level, 22);
	assert.equal(p.equipment?.[0].name, "Old Hat");
	assert.equal(p.sources.gear.kind, "blizzard");
	assert.deepEqual(p.synced, { kind: "blizzard", at: LOGIN, checkedAt: LOGIN + 2 * HOUR });
});

test("a newer in-game read wins per field", () => {
	const at = LOGIN + 3 * HOUR;
	const p = mergeProfile(blizzard, snapshot(at));
	assert.equal(p.level, 23);
	assert.equal(p.sources.level.kind, "addon");
	assert.equal(p.equipment?.[0].name, "New Hat");
	assert.equal(p.averageItemLevel, 21);
	assert.deepEqual(
		p.professions.map((x) => [x.name, x.skill]),
		[
			["Tailoring", 120],
			["Cooking", 60],
		],
		"Enchanting unlearned since",
	);
	// Newer recipes add to Blizzard's; Enchanting's are gone with it.
	assert.deepEqual(p.professions[0].knownRecipes, [10, 11, 12]);
	assert.equal(p.professions[0].recipesSource?.kind, "addon");
	assert.equal(p.professions[1].knownRecipes, undefined);
	assert.equal(p.talentTrees?.[0].points, 14);
	assert.deepEqual(p.synced, { kind: "app", at });
});

test("Blizzard comes back when it's newer", () => {
	const at = LOGIN - HOUR;
	const p = mergeProfile(blizzard, { ...snapshot(at), level: 21 });
	assert.equal(p.level, 22);
	assert.equal(p.equipment?.[0].name, "Old Hat");
	assert.equal(p.averageItemLevel, 20);
	assert.deepEqual(
		p.professions.map((x) => [x.name, x.knownRecipes]),
		[
			["Tailoring", [10, 11]],
			["Enchanting", [20]],
		],
	);
	assert.equal(p.talentTrees?.[0].points, 13);
	assert.equal(p.synced?.kind, "blizzard");
});

test("mixed: old gear, newer recipes for one profession", () => {
	const s = snapshot(LOGIN - HOUR);
	s.recipes[0].capturedAt = LOGIN + HOUR;
	const p = mergeProfile(blizzard, s);
	assert.equal(p.equipment?.[0].name, "Old Hat");
	assert.equal(p.sources.professions.kind, "blizzard");
	assert.deepEqual(p.professions[0].knownRecipes, [10, 11, 12]);
	assert.deepEqual(p.professions[1].knownRecipes, [20]);
	assert.deepEqual(p.synced, { kind: "app", at: LOGIN + HOUR });
});

test("no talents from the game while Blizzard has some: Blizzard's", () => {
	const p = mergeProfile(blizzard, { ...snapshot(LOGIN + 3 * HOUR), talentTrees: [] });
	assert.equal(p.talentTrees?.[0].points, 13);
	assert.equal(p.sources.talents.kind, "blizzard");
	assert.equal(p.sources.gear.kind, "addon");
});

test("level: the higher one, whichever looks newer", () => {
	// Read in game early in the session; Blizzard has the level gained after it.
	const p = mergeProfile({ ...blizzard, level: 24 }, snapshot(LOGIN + HOUR));
	assert.equal(p.level, 24);
	assert.equal(p.sources.level.kind, "blizzard");
	assert.equal(p.equipment?.[0].name, "New Hat", "other fields still go by time");
});

test("a higher level from the game wins even without a Blizzard profile", () => {
	const p = mergeProfile({ level: 8 }, { capturedAt: 1, level: 9, talentTrees: [] });
	assert.equal(p.level, 9);
	assert.deepEqual(p.professions, []);
});

test("average item level, Blizzard's way", () => {
	const item = (slot: string, itemLevel: number, twoHand = false) => ({
		slot,
		itemId: 1,
		name: "x",
		quality: "COMMON",
		itemLevel,
		tooltip: twoHand ? [{ left: "Two-Hand", right: "Staff" }] : [],
	});
	const gear = [
		"HEAD",
		"NECK",
		"SHOULDER",
		"BACK",
		"CHEST",
		"WRIST",
		"HANDS",
		"WAIST",
		"LEGS",
		"FEET",
		"FINGER_1",
		"FINGER_2",
		"TRINKET_1",
		"TRINKET_2",
		"RANGED",
	].map((s) => item(s, 32));
	assert.equal(averageItemLevel([...gear, item("SHIRT", 1), item("MAIN_HAND", 33, true)]), 32);
	assert.equal(averageItemLevel([...gear, item("MAIN_HAND", 34)]), 30);
	assert.equal(averageItemLevel([]), undefined);
});

test("quests: Blizzard's ids until the game's quest log is newer", () => {
	const withQuests = { ...blizzard, quests: { syncedAt: LOGIN + 2 * HOUR, ids: [166, 214] } };
	const p = mergeProfile(withQuests, null);
	assert.deepEqual(p.quests, [{ id: 166 }, { id: 214 }]);
	assert.equal(p.sources.quests?.kind, "blizzard");

	const log = {
		capturedAt: LOGIN + 3 * HOUR,
		list: [{ id: 214, title: "Red Silk Bandanas", level: 17, complete: true }],
	};
	const newer = mergeProfile(withQuests, { ...snapshot(LOGIN + 3 * HOUR), quests: log });
	assert.deepEqual(newer.quests, log.list);
	assert.deepEqual(newer.sources.quests, { kind: "addon", at: LOGIN + 3 * HOUR });

	// Played elsewhere without the app and logged out since: Blizzard's again.
	const older = mergeProfile(withQuests, {
		...snapshot(LOGIN + 3 * HOUR),
		quests: { ...log, capturedAt: LOGIN - HOUR },
	});
	assert.deepEqual(older.quests, [{ id: 166 }, { id: 214 }]);

	// Not synced since quests were added: nothing to show yet.
	assert.equal(mergeProfile(blizzard, null).quests, undefined);
});
