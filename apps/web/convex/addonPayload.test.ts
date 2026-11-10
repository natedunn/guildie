import assert from "node:assert/strict";
import { test } from "node:test";
import { matchRecipes, parseCharacter } from "./addonPayload.ts";

const NOW = 1_794_300_000_000;
const T = NOW / 1000 - 60;

const v1 = {
	guid: "Player-4904-004E2B22",
	name: "Lich",
	level: 22,
	classToken: "PRIEST",
	capturedAt: T,
	talents: [{ id: 134214, rank: 5, name: "Wand Specialization" }],
};

const v2 = {
	...v1,
	level: 23,
	xp: 1200,
	xpMax: 15000,
	raceToken: "NightElf",
	guild: { name: "Unbound", rank: "Member", rankIndex: 5 },
	equipment: {
		capturedAt: T,
		averageItemLevel: 21.47,
		items: [
			{
				slot: 16,
				id: 2520,
				name: "Broadsword of the Eagle",
				quality: 2,
				enchant: 241,
				suffix: 852,
				tooltip: [
					{ left: "Two-Hand", right: "Sword" },
					{ left: "Crusader", color: "#00FF00" },
					{ left: "Item Level 24", color: "#ffd100" },
					{ left: "Sell Price: 1 2 3" },
				],
			},
		],
	},
	professions: {
		capturedAt: T,
		skills: [
			{ name: "Tailoring", rank: 120, max: 150 },
			{ name: "Riding", rank: 75, max: 75 },
			{ name: "Kochkunst", id: 185, rank: 60, max: 75 },
		],
	},
	recipes: [
		{
			profession: "Tailoring",
			capturedAt: T - 30,
			known: [{ name: "Bolt of Linen Cloth", item: 2996 }, { name: "Odd" }],
		},
		{ profession: "Basket Weaving", capturedAt: T, known: [] },
	],
};

test("version 1 still parses", () => {
	const r = parseCharacter(v1, NOW);
	assert.ok(r.ok);
	assert.equal(r.character.capturedAt, T * 1000);
	assert.equal(r.character.level, 22);
	assert.equal(r.character.equipment, undefined);
	assert.deepEqual(r.character.recipes, []);
});

test("version 2: gear, professions, recipes", () => {
	const r = parseCharacter(v2, NOW);
	assert.ok(r.ok, !r.ok ? r.error : "");
	const c = r.character;
	assert.deepEqual(c.guild, { name: "Unbound", rank: "Member", rankIndex: 5 });
	assert.equal(c.equipment?.averageItemLevel, 21.47);
	assert.deepEqual(c.equipment?.items[0], {
		slot: "MAIN_HAND",
		itemId: 2520,
		name: "Broadsword of the Eagle",
		quality: "UNCOMMON",
		// From the tooltip's line, which is then dropped (the site shows it itself).
		itemLevel: 24,
		tooltip: [
			{ left: "Two-Hand", right: "Sword" },
			{ left: "Crusader", color: "#00ff00" },
		],
		enchantId: 241,
		suffixId: 852,
	});
	// Riding isn't a profession; a skill line id names Cooking in any language.
	assert.deepEqual(c.professions?.list, [
		{ id: 197, name: "Tailoring", skill: 120, maxSkill: 150, secondary: false },
		{ id: 185, name: "Cooking", skill: 60, maxSkill: 75, secondary: true },
	]);
	assert.equal(c.professions?.dropped, 1);
	assert.deepEqual(c.recipes, [
		{
			professionId: 197,
			profession: "Tailoring",
			capturedAt: (T - 30) * 1000,
			known: [{ name: "Bolt of Linen Cloth", itemId: 2996 }, { name: "Odd" }],
		},
	]);
});

test("professions in a language we can't read fall back to Blizzard's", () => {
	const r = parseCharacter(
		{ ...v2, professions: { capturedAt: T, skills: [{ name: "Schneiderei", rank: 1, max: 75 }] } },
		NOW,
	);
	assert.ok(r.ok);
	assert.equal(r.character.professions, undefined);
	const none = parseCharacter({ ...v2, professions: { capturedAt: T, skills: [] } }, NOW);
	assert.ok(none.ok);
	assert.deepEqual(none.character.professions?.list, [], "no professions at all is a real answer");
});

test("weapon and armor skills (addon 0.7.0)", () => {
	const r = parseCharacter(
		{
			...v2,
			proficiencies: { capturedAt: T, level: 23, skills: ["Staves", "Cloth", "Daggers", "Cloth"], dualWield: false },
		},
		NOW,
	);
	assert.ok(r.ok);
	assert.deepEqual(r.character.proficiencies, {
		capturedAt: T * 1000,
		level: 23,
		skills: ["Cloth", "Daggers", "Staves"],
		dualWield: false,
	});
	const older = parseCharacter(v2, NOW);
	assert.ok(older.ok);
	assert.equal(older.character.proficiencies, undefined, "older addons don't send them");
	const bad = parseCharacter({ ...v2, proficiencies: { capturedAt: T, skills: ["Axes"], dualWield: "yes" } }, NOW);
	assert.ok(!bad.ok);
	assert.match(bad.error, /proficiencies.dualWield/);
});

test("rejects bad shapes, sizes and clocks, naming the field", () => {
	const bad: [unknown, RegExp][] = [
		[{ ...v1, capturedAt: NOW / 1000 + 3600 }, /capturedAt: in the future/],
		[{ ...v1, level: 1.5 }, /level: expected a whole number/],
		[{ ...v1, name: "" }, /name: empty/],
		[{ ...v1, talents: Array.from({ length: 121 }, () => ({ id: 1, rank: 1 })) }, /talents: more than 120/],
		[{ ...v2, equipment: { ...v2.equipment, items: [{ ...v2.equipment.items[0], slot: 20 }] } }, /slot: out of range/],
		[{ ...v2, equipment: { ...v2.equipment, items: [v2.equipment.items[0], v2.equipment.items[0]] } }, /slot: twice/],
		[
			{
				...v2,
				equipment: { ...v2.equipment, items: [{ ...v2.equipment.items[0], tooltip: [{ left: "x".repeat(401) }] }] },
			},
			/left: longer than 400/,
		],
		[
			{
				...v2,
				equipment: { ...v2.equipment, items: [{ ...v2.equipment.items[0], tooltip: [{ left: "a", color: "red" }] }] },
			},
			/color: expected #rrggbb/,
		],
		[
			{
				...v2,
				recipes: [
					{ profession: "Tailoring", capturedAt: T, known: Array.from({ length: 1501 }, () => ({ name: "a" })) },
				],
			},
			/known: more than 1500/,
		],
		[{ ...v2, guild: "Unbound" }, /guild: expected an object/],
		["nope", /character: expected an object/],
	];
	for (const [raw, error] of bad) {
		const r = parseCharacter(raw, NOW);
		assert.equal(r.ok, false, `accepted ${JSON.stringify(raw).slice(0, 80)}`);
		if (!r.ok) assert.match(r.error, error);
	}
});

test("version 3: bags and the last bank read (addon 0.8.0)", () => {
	const r = parseCharacter(
		{
			...v2,
			inventory: {
				bags: {
					capturedAt: T,
					items: [
						{ id: 2589, count: 20 },
						{ id: 2589, count: 5 },
						{ id: 2320, count: 1 },
					],
				},
				bank: { capturedAt: T - 86_400, items: [] },
			},
		},
		NOW,
	);
	assert.ok(r.ok);
	assert.deepEqual(r.character.inventory, {
		bags: {
			capturedAt: T * 1000,
			items: [
				{ id: 2589, count: 25 },
				{ id: 2320, count: 1 },
			],
		},
		bank: { capturedAt: (T - 86_400) * 1000, items: [] },
	});
	const none = parseCharacter({ ...v2, inventory: {} }, NOW);
	assert.ok(none.ok);
	assert.equal(none.character.inventory, undefined, "nothing read: not sent");
	const bags = parseCharacter({ ...v2, inventory: { bags: { capturedAt: T, items: [] } } }, NOW);
	assert.ok(bags.ok);
	assert.equal(bags.character.inventory?.bank, undefined, "bank never opened");
	const bad: [unknown, RegExp][] = [
		[
			{ ...v2, inventory: { bags: { capturedAt: T, items: [{ id: 1, count: 0 }] } } },
			/bags.items\[0\].count: out of range/,
		],
		[{ ...v2, inventory: { bank: { capturedAt: T, items: [{ id: "x", count: 1 }] } } }, /bank.items\[0\].id/],
		[
			{
				...v2,
				inventory: { bags: { capturedAt: T, items: Array.from({ length: 601 }, (_, i) => ({ id: i + 1, count: 1 })) } },
			},
			/bags.items: more than 600/,
		],
		[{ ...v2, inventory: { bags: { capturedAt: NOW / 1000 + 3600, items: [] } } }, /bags.capturedAt: in the future/],
	];
	for (const [raw, error] of bad) {
		const p = parseCharacter(raw, NOW);
		assert.equal(p.ok, false);
		if (!p.ok) assert.match(p.error, error);
	}
});

test("null means not sent", () => {
	const r = parseCharacter({ ...v2, xp: null, guild: null, equipment: null }, NOW);
	assert.ok(r.ok);
	assert.equal(r.character.guild, undefined);
	assert.equal(r.character.equipment, undefined);
});

test("recipes match by crafted item, then name; the Blizzard-known duplicate wins", () => {
	const catalog = [
		{ recipeId: 1, name: "Bolt of Linen Cloth", craftedItemId: 2996 },
		{ recipeId: 2, name: "Brown Linen Vest", craftedItemId: 2568 },
		{ recipeId: 3, name: "Enchant Bracer - Minor Health" },
		{ recipeId: 4, name: "Icebane Bracers", craftedItemId: 22671 },
		{ recipeId: 5, name: "Icebane Bracers", craftedItemId: 22671 },
	];
	const known = [
		{ name: "Bolt of Linen Cloth (renamed)", itemId: 2996 },
		{ name: "brown linen vest", itemId: 999 },
		{ name: "Enchant Bracer - Minor Health" },
		{ name: "Icebane Bracers", itemId: 22671 },
		{ name: "Not in the catalog" },
	];
	assert.deepEqual(matchRecipes(known, catalog), { recipeIds: [1, 2, 3, 4], unmatched: 1 });
	assert.deepEqual(matchRecipes(known, catalog, new Set([5])).recipeIds, [1, 2, 3, 5]);
});
