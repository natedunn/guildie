import assert from "node:assert/strict";
import { test } from "node:test";
import { craftedName, guildieRecipeId, rankFrom } from "./shared/recipeResearch.ts";
import { addonRecipes, recipeCandidates, recipeState, taughtName, unlearnedHeld } from "./shared/recipeStatus.ts";

// Pattern: Red Linen Robe (item 2598) teaches a Tailoring recipe at 25.
const ROBE = { recipeIds: [2389], professionId: 197, skill: 25 };
const tailor = (skill?: number, known: number[] = []) => [{ id: 197, skill, knownRecipes: known }];

test("knows it, whatever else", () => {
	assert.equal(recipeState(ROBE, tailor(10, [2389]), new Set([2598]), 2598), "knows");
});

test("has one and hasn't learned it", () => {
	assert.equal(recipeState(ROBE, tailor(10), new Set([2598]), 2598), "has");
});

test("skill decides now or later; unknown skill counts as now", () => {
	assert.equal(recipeState(ROBE, tailor(25)), "now");
	assert.equal(recipeState(ROBE, tailor(24)), "later");
	assert.equal(recipeState(ROBE, tailor(undefined)), "now");
	assert.equal(recipeState({ ...ROBE, skill: undefined }, tailor(1)), "now");
});

test("no profession, no state", () => {
	assert.equal(recipeState(ROBE, [{ id: 164, skill: 300 }]), null);
});

test("candidates: now, later, has, knows; then closest to learning it", () => {
	const out = recipeCandidates(2598, ROBE, [
		{ name: "Ada", professions: tailor(200, [2389]) },
		{ name: "Bo", professions: tailor(5) },
		{ name: "Cy", professions: tailor(20) },
		{ name: "Di", professions: tailor(80) },
		{ name: "Ed", professions: tailor(1), holding: new Set([2598]) },
		{ name: "Fa", professions: [{ id: 164, skill: 300 }] },
	]);
	assert.deepEqual(
		out.map((c) => `${c.name}:${c.state}:${c.skill}`),
		["Di:now:80", "Cy:later:20", "Bo:later:5", "Ed:has:1", "Ada:knows:200"],
	);
});

test("only unlearned recipe items for their own professions are shared", () => {
	const items = new Map([
		[2598, ROBE],
		[2881, { recipeIds: [2660], professionId: 164, skill: 1 }],
	]);
	// 2589 (Linen Cloth) isn't a recipe item; 2881 is Blacksmithing, which they don't have.
	assert.deepEqual(unlearnedHeld([2589, 2598, 2881], items, tailor(10)), [2598]);
	assert.deepEqual(unlearnedHeld([2598], items, tailor(10, [2389])), []);
});

test("taught name", () => {
	assert.equal(taughtName("Pattern: Red Linen Robe"), "Red Linen Robe");
	assert.equal(taughtName("Formula: Enchant 2H Weapon - Lesser Spirit"), "Enchant 2H Weapon - Lesser Spirit");
	assert.equal(taughtName("Sam's Tome"), "Sam's Tome");
});

test("addon data: taught recipes only, crafters with a recipe profession only", () => {
	const out = addonRecipes(
		[{ itemId: 2598, profession: "Tailoring", ...ROBE }],
		[
			{ name: "Ada", classId: 8, professions: [{ name: "Tailoring", id: 197, skill: 80, knownRecipes: [2389, 9999] }] },
			{ name: "Bo", classId: 1, professions: [{ name: "Mining", id: 186, skill: 50 }] },
			{ name: "Cy", classId: 4, professions: [{ name: "Tailoring", id: 197 }], holding: [2598] },
		],
	);
	assert.deepEqual(out, {
		items: { 2598: ["Tailoring", 25, 2389] },
		ranks: {},
		crafters: [
			{ name: "Ada", classId: 8, skills: { Tailoring: 80 }, max: { Tailoring: -1 }, known: [2389], has: [] },
			{ name: "Cy", classId: 4, skills: { Tailoring: -1 }, max: { Tailoring: -1 }, known: [], has: [2598] },
		],
	});
});

// Expert Cookbook (16072): Cooking 125, unlocks 225.
const EXPERT = { recipeIds: [], rank: 225, professionId: 185, skill: 125 };
const cook = (skill?: number, maxSkill?: number) => [{ id: 185, skill, maxSkill }];

test("rank books: knows it once their max skill is there", () => {
	assert.equal(recipeState(EXPERT, cook(140, 225)), "knows");
	assert.equal(recipeState(EXPERT, cook(140, 150)), "now");
	assert.equal(recipeState(EXPERT, cook(90, 150)), "later");
	assert.equal(recipeState(EXPERT, cook(140, undefined)), "now", "unknown max: the game will say");
});

// Carrie's Cookbook (239021): two feasts at once.
test("several recipes: knows it only with all of them", () => {
	const book = { recipeIds: [52014, 52015], professionId: 185, skill: 280 };
	assert.equal(recipeState(book, [{ id: 185, skill: 300, knownRecipes: [52014] }]), "now");
	assert.equal(recipeState(book, [{ id: 185, skill: 300, knownRecipes: [52015, 52014] }]), "knows");
});

test("addon data: rank books apart, several recipes in a row", () => {
	const out = addonRecipes(
		[
			{ itemId: 16072, profession: "Cooking", ...EXPERT },
			{ itemId: 239021, profession: "Cooking", recipeIds: [52014, 52015], professionId: 185, skill: 280 },
		],
		[
			{
				name: "Ada",
				classId: 8,
				professions: [{ name: "Cooking", id: 185, skill: 150, maxSkill: 225, knownRecipes: [52015, 1] }],
			},
		],
	);
	assert.deepEqual(out.items, { 239021: ["Cooking", 280, 52014, 52015] });
	assert.deepEqual(out.ranks, { 16072: ["Cooking", 125, 225] });
	assert.deepEqual(out.crafters[0].max, { Cooking: 225 });
	assert.deepEqual(out.crafters[0].known, [52015]);
});

test("research: rank and crafted name from the item's own text", () => {
	assert.equal(
		rankFrom(["Use: Teaches you how to be an Expert Fisherman, allowing a maximum of 225 fishing skill."]),
		225,
	);
	assert.equal(rankFrom(["Teaches you how to craft Centaur Hoofwarmers."]), undefined);
	assert.equal(craftedName(["Teaches you how to craft Earthweaver's Adaptive Plate."]), "Earthweaver's Adaptive Plate");
	assert.equal(craftedName(["Teaches you how to sew a Red Linen Robe."]), "Red Linen Robe");
	assert.ok(guildieRecipeId(251759) < 0);
});
