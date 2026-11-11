import assert from "node:assert/strict";
import { test } from "node:test";
import { countsAsReagentUse, type ReagentRecipe, reagentSuggestions } from "./reagentSuggestions.ts";

// Real Forever recipes (from production's recipe catalog).
const RECIPES = new Map<number, ReagentRecipe>([
	[
		100,
		{
			name: "Elixir of Minor Fortitude",
			reagents: [
				{ itemId: 2447, name: "Peacebloom" },
				{ itemId: 3371, name: "Empty Vial" },
			],
		},
	],
	[
		101,
		{
			name: "Minor Healing Potion",
			reagents: [
				{ itemId: 2447, name: "Peacebloom" },
				{ itemId: 765, name: "Silverleaf" },
			],
		},
	],
	[
		52642,
		{
			name: "Incense Candle",
			reagents: [
				{ itemId: 2447, name: "Peacebloom" },
				{ itemId: 765, name: "Silverleaf" },
			],
		},
	],
	[
		52644,
		{
			name: "Camp Chair",
			reagents: [
				{ itemId: 2318, name: "Light Leather" },
				{ itemId: 4470, name: "Simple Wood" },
			],
		},
	],
	[
		52643,
		{
			name: "Lodestone",
			reagents: [
				{ itemId: 2835, name: "Rough Stone" },
				{ itemId: 2840, name: "Copper Bar" },
			],
		},
	],
	[3324, { name: "Smelt Copper", reagents: [{ itemId: 2770, name: "Copper Ore" }] }],
	[
		200,
		{
			name: "Runed Copper Rod",
			reagents: [
				{ itemId: 6217, name: "Copper Rod" },
				{ itemId: 2840, name: "Copper Bar" },
			],
		},
	],
	[300, { name: "Herb Baked Egg", reagents: [{ itemId: 6889, name: "Small Egg" }] }],
]);

const member = (name: string, classId: number, professions: [string, number[]][]) => ({
	name,
	slug: name.toLowerCase(),
	classId,
	professions: professions.map(([p, knownRecipes]) => ({ name: p, knownRecipes })),
});

const GUILD = {
	region: "us",
	members: [
		member("Healing", 5, [
			["Alchemy", [100, 101]],
			["Herbalism", [52642]],
		]),
		member("Hoofing", 11, [
			["Herbalism", [52642]],
			["Skinning", [52644]],
		]),
		member("Stinkycarp", 9, [
			["Enchanting", [200]],
			["Mining", [52643, 3324]],
			["Cooking", [300]],
		]),
	],
};

test("camping recipes don't count; Mining's smelting does", () => {
	assert.equal(countsAsReagentUse("Herbalism", "Incense Candle"), false);
	assert.equal(countsAsReagentUse("Skinning", "Camp Chair"), false);
	assert.equal(countsAsReagentUse("Mining", "Lodestone"), false);
	assert.equal(countsAsReagentUse("Mining", "Smelt Copper"), true);
	assert.equal(countsAsReagentUse("Cooking", "Herb Baked Egg"), false);
	assert.equal(countsAsReagentUse("Alchemy", "Minor Healing Potion"), true);
});

test("herbs list the alchemist, not every herbalist", () => {
	const r = reagentSuggestions([GUILD], RECIPES);
	assert.deepEqual(r[2447].users, [{ name: "Healing", classId: 5, profession: "Alchemy", recipes: 2 }]);
	assert.deepEqual(
		r[765].users.map((u) => `${u.name} (${u.profession})`),
		["Healing (Alchemy)"],
	);
	assert.equal(r[2318], undefined, "Light Leather: only a Camp Chair");
	assert.equal(r[2835], undefined, "Rough Stone: only a Lodestone");
	assert.equal(r[6889], undefined, "Cooking left out");
});

test("smelting and other crafts still count; vendor reagents never listed", () => {
	const r = reagentSuggestions([GUILD], RECIPES);
	assert.deepEqual(
		r[2770].users.map((u) => u.profession),
		["Mining"],
	);
	assert.deepEqual(
		r[2840].users.map((u) => u.profession),
		["Enchanting"],
		"Copper Bar: the rod, not the Lodestone",
	);
	assert.equal(r[3371], undefined, "Empty Vial");
	assert.equal(r[4470], undefined, "Simple Wood");
	assert.equal(r[6217], undefined, "Copper Rod");
});

test("at most 8 users, most recipes first", () => {
	const members = Array.from({ length: 10 }, (_, i) => member(`M${i}`, 1, [["Alchemy", i % 2 ? [100, 101] : [100]]]));
	const r = reagentSuggestions([{ region: "us", members }], RECIPES);
	assert.equal(r[2447].users.length, 8);
	assert.deepEqual(
		r[2447].users.slice(0, 5).map((u) => u.recipes),
		[2, 2, 2, 2, 2],
	);
});
