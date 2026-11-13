import assert from "node:assert/strict";
import { test } from "node:test";
import { addonRecipes, recipeCandidates, recipeState, taughtName, unlearnedHeld } from "./shared/recipeStatus.ts";

// Pattern: Red Linen Robe (item 2598) teaches a Tailoring recipe at 25.
const ROBE = { recipeId: 2389, professionId: 197, skill: 25 };
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
		[2881, { recipeId: 2660, professionId: 164, skill: 1 }],
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
		crafters: [
			{ name: "Ada", classId: 8, skills: { Tailoring: 80 }, known: [2389], has: [] },
			{ name: "Cy", classId: 4, skills: { Tailoring: -1 }, known: [], has: [2598] },
		],
	});
});
