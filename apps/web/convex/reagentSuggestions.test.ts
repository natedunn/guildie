import assert from "node:assert/strict";
import { test } from "node:test";
import { type ReagentRecipe, reagentSuggestions, reagentsNeedingQuality, reagentUse } from "./reagentSuggestions.ts";

// Real Forever recipes and qualities (from production's catalog and items).
const r = (name: string, profession: string, reagents: [number, string][]) => ({
	name,
	profession,
	reagents: reagents.map(([itemId, n]) => ({ itemId, name: n })),
});
const RECIPES = new Map<number, ReagentRecipe & { profession: string }>([
	[
		100,
		r("Elixir of Minor Fortitude", "Alchemy", [
			[2447, "Peacebloom"],
			[3371, "Empty Vial"],
		]),
	],
	[
		101,
		r("Minor Healing Potion", "Alchemy", [
			[2447, "Peacebloom"],
			[765, "Silverleaf"],
		]),
	],
	[
		52642,
		r("Incense Candle", "Herbalism", [
			[2447, "Peacebloom"],
			[765, "Silverleaf"],
		]),
	],
	[
		52644,
		r("Camp Chair", "Skinning", [
			[2318, "Light Leather"],
			[4470, "Simple Wood"],
		]),
	],
	[
		52643,
		r("Lodestone", "Mining", [
			[2835, "Rough Stone"],
			[2840, "Copper Bar"],
		]),
	],
	[
		57016,
		r("Rock Garden", "Mining", [
			[2838, "Heavy Stone"],
			[2772, "Iron Ore"],
			[2842, "Silver Bar"],
		]),
	],
	[3324, r("Smelt Copper", "Mining", [[2770, "Copper Ore"]])],
	[
		200,
		r("Runed Copper Rod", "Enchanting", [
			[6217, "Copper Rod"],
			[2840, "Copper Bar"],
		]),
	],
	[300, r("Herb Baked Egg", "Cooking", [[6889, "Small Egg"]])],
]);
// Every camping reagent is white except Silver Bar and Truesilver Bar.
const QUALITY = new Map([
	[2447, "COMMON"],
	[765, "COMMON"],
	[2318, "COMMON"],
	[4470, "COMMON"],
	[2835, "COMMON"],
	[2840, "COMMON"],
	[2838, "COMMON"],
	[2772, "COMMON"],
	[2842, "UNCOMMON"],
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
			["Mining", [52643, 57016, 3324]],
			["Cooking", [300]],
		]),
	],
};

test("camping recipes count only for green-or-better reagents; smelting counts in full", () => {
	assert.equal(reagentUse("Herbalism", "Incense Candle"), "camping");
	assert.equal(reagentUse("Skinning", "Camp Chair"), "camping");
	assert.equal(reagentUse("Mining", "Lodestone"), "camping");
	assert.equal(reagentUse("Mining", "Smelt Copper"), "all");
	assert.equal(reagentUse("Cooking", "Herb Baked Egg"), "none");
	assert.equal(reagentUse("Alchemy", "Minor Healing Potion"), "all");
});

test("only camping recipes' reagents need a quality lookup", () => {
	assert.deepEqual(
		reagentsNeedingQuality(RECIPES).sort((a, b) => a - b),
		[765, 2318, 2447, 2772, 2835, 2838, 2840, 2842, 4470],
	);
});

test("herbs list the alchemist, not every herbalist", () => {
	const out = reagentSuggestions([GUILD], RECIPES, QUALITY);
	assert.deepEqual(out[2447].users, [{ name: "Healing", classId: 5, profession: "Alchemy", recipes: 2 }]);
	assert.deepEqual(
		out[765].users.map((u) => `${u.name} (${u.profession})`),
		["Healing (Alchemy)"],
	);
	assert.equal(out[2318], undefined, "Light Leather: only a Camp Chair");
	assert.equal(out[2835], undefined, "Rough Stone: only a Lodestone");
	assert.equal(out[2838], undefined, "Heavy Stone: white");
	assert.equal(out[6889], undefined, "Cooking left out");
});

test("a camping recipe's green reagent lists the miner; unknown quality doesn't", () => {
	const out = reagentSuggestions([GUILD], RECIPES, QUALITY);
	assert.deepEqual(out[2842].users, [{ name: "Stinkycarp", classId: 9, profession: "Camping+Mining", recipes: 1 }]);
	assert.equal(reagentSuggestions([GUILD], RECIPES)[2842], undefined, "no quality known");
});

test("smelting and other crafts still count; vendor reagents never listed", () => {
	const out = reagentSuggestions([GUILD], RECIPES, QUALITY);
	assert.deepEqual(
		out[2770].users.map((u) => u.profession),
		["Mining"],
	);
	assert.deepEqual(
		out[2840].users.map((u) => u.profession),
		["Enchanting"],
		"Copper Bar: the rod, not the Lodestone",
	);
	assert.equal(out[3371], undefined, "Empty Vial");
	assert.equal(out[4470], undefined, "Simple Wood");
	assert.equal(out[6217], undefined, "Copper Rod");
});

test("at most 8 users, most recipes first", () => {
	const members = Array.from({ length: 10 }, (_, i) => member(`M${i}`, 1, [["Alchemy", i % 2 ? [100, 101] : [100]]]));
	const out = reagentSuggestions([{ region: "us", members }], RECIPES);
	assert.equal(out[2447].users.length, 8);
	assert.deepEqual(
		out[2447].users.slice(0, 5).map((u) => u.recipes),
		[2, 2, 2, 2, 2],
	);
});
