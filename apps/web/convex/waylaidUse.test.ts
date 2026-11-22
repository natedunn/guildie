import assert from "node:assert/strict";
import { test } from "node:test";
import type { GeneratedWaylaid } from "./shared/waylaid.generated.ts";
import { type MakerRecipe, type WaylaidMember, waylaidItems, waylaidUse } from "./waylaidUse.ts";

const HERBS: GeneratedWaylaid = {
	id: 248686,
	name: "Waylaid Crate: Journeyman Herbs",
	kind: "crate",
	level: 10,
	takes: [
		{ itemId: 3820, name: "Stranglekelp", count: 10 }, // 85
		{ itemId: 2453, name: "Bruiseweed", count: 10 }, // 100
		{ itemId: 3355, name: "Wild Steelbloom", count: 10 }, // 115
		{ itemId: 3369, name: "Grave Moss", count: 10 }, // 120
		{ itemId: 3356, name: "Kingsblood", count: 10 }, // 125
	],
};
const BRONZE: GeneratedWaylaid = {
	id: 211819,
	name: "Waylaid Supplies: Bronze Bars",
	kind: "supplies",
	level: 1,
	takes: [{ itemId: 2841, name: "Bronze Bar", count: 12 }],
};
const LINEN: GeneratedWaylaid = {
	id: 1,
	name: "Waylaid Crate: Cloth only",
	kind: "crate",
	level: 10,
	takes: [{ itemId: 2589, name: "Linen Cloth", count: 40 }],
};

const member = (name: string, professions: WaylaidMember["professions"], classId = 2): WaylaidMember => ({
	name,
	classId,
	professions,
});

// Smelt Bronze (recipe 1600 in the game data) makes Bronze Bar.
const SMELT_BRONZE: MakerRecipe = { recipeId: 1600, profession: "Mining", craftedItemId: 2841 };

test("a herb crate: herbalists who can gather all of it first, then those who can gather some", () => {
	const use = new Map(
		waylaidUse(
			[
				member("Healing Optional", [{ name: "Herbalism", skill: 183, knownRecipes: [] }]),
				member("Todd", [{ name: "Herbalism", skill: 100, knownRecipes: [] }]),
				member("Brenna", [{ name: "Tailoring", skill: 150, knownRecipes: [] }]),
			],
			[],
			[HERBS],
		),
	);
	const [herbalism] = use.get(HERBS.id)?.professions ?? [];
	assert.equal(herbalism.name, "Herbalism");
	assert.equal(herbalism.how, "gathers");
	assert.equal(herbalism.of, 5);
	assert.equal(herbalism.count, 2);
	assert.deepEqual(
		herbalism.users.map((u) => [u.name, u.skill, u.covers]),
		[
			["Healing Optional", 183, 5],
			["Todd", 100, 2],
		],
	);
});

test("nobody skilled enough: the closest, and the lowest skill it asks for", () => {
	const use = new Map(
		waylaidUse([member("Miller", [{ name: "Herbalism", skill: 60, knownRecipes: [] }])], [], [HERBS]),
	);
	const [herbalism] = use.get(HERBS.id)?.professions ?? [];
	assert.equal(herbalism.users.length, 0);
	assert.deepEqual(herbalism.closest, { name: "Miller", classId: 2, skill: 60, need: 85 });
});

test("nobody has the profession: said so", () => {
	const use = new Map(waylaidUse([member("Brenna", [])], [], [HERBS]));
	assert.equal(use.get(HERBS.id)?.professions[0].nobody, true);
});

test("Supplies of a crafted item: who knows the recipe, with its color", () => {
	const use = new Map(
		waylaidUse(
			[
				member("Ivar", [{ name: "Mining", skill: 70, knownRecipes: [1600] }]),
				member("Lich", [{ name: "Mining", skill: 200, knownRecipes: [1600] }]),
				member("Sela", [{ name: "Mining", skill: 120, knownRecipes: [] }]),
			],
			[SMELT_BRONZE],
			[BRONZE],
		),
	);
	const [mining] = use.get(BRONZE.id)?.professions ?? [];
	assert.equal(mining.how, "makes");
	assert.equal(mining.count, 2, "only who knows Smelt Bronze");
	assert.equal(mining.users[0].name, "Ivar", "a skill-up color first");
	assert.ok(mining.users[0].color);
	assert.equal(mining.users[1].name, "Lich");
	assert.equal(mining.users[1].color, undefined, "grey");
});

test("cloth only: no one makes or gathers it, so nothing to say", () => {
	assert.deepEqual(
		waylaidUse([member("Brenna", [{ name: "Tailoring", skill: 150, knownRecipes: [] }])], [], [LINEN]),
		[],
	);
});

test("the real list: every crate's items, once", () => {
	const items = waylaidItems();
	assert.ok(items.includes(3356), "Kingsblood");
	assert.ok(items.includes(2841), "Bronze Bar");
	assert.equal(new Set(items).size, items.length);
});
