import assert from "node:assert/strict";
import { test } from "node:test";
import { type ProgressMember, type ProgressRecipe, reagentProgress } from "./reagentProgress.ts";

// Levels as the game files give them (yellow, grey); green is halfway.
const LEVELS: Record<number, [number, number]> = {
	1: [110, 120], // Bolt of Silk Cloth: 4 Silk Cloth
	2: [140, 160], // Silk gloves: 2 Silk Cloth
	3: [150, 210], // Silk bandage (First Aid): 1 Silk Cloth
	4: [45, 85], // Linen-only recipe
	5: [215, 235], // Mithril smelting
};
const levels = (id: number) => {
	const l = LEVELS[id];
	return l && { yellow: l[0], green: Math.floor((l[0] + l[1]) / 2), grey: l[1] };
};
const SILK = 4306;
const recipe = (recipeId: number, profession: string, itemId: number, quantity: number): ProgressRecipe => ({
	recipeId,
	profession,
	reagents: [{ itemId, name: `Item ${itemId}`, quantity }],
});
const RECIPES = [
	recipe(1, "Tailoring", SILK, 4),
	recipe(2, "Tailoring", SILK, 2),
	recipe(3, "First Aid", SILK, 1),
	recipe(4, "Tailoring", 2589, 1),
	recipe(5, "Mining", 3858, 1),
	recipe(99, "Tailoring", SILK, 1), // no levels: never counts
	{ ...recipe(6, "Tailoring", 2320, 1) }, // Coarse Thread: sold by vendors
];
const member = (name: string, profession: string, skill: number | undefined, knownRecipes: number[] = []) => ({
	name,
	classId: 8,
	professions: [{ name: profession, skill, knownRecipes }],
});
const run = (members: ProgressMember[], learn: [number, number][] = [], pattern: [number, number][] = []) =>
	Object.fromEntries(reagentProgress(members, RECIPES, new Map(learn), new Map(pattern), levels));

test("known recipes: the color at their skill, orange below yellow", () => {
	const out = run([member("Todd", "Tailoring", 100, [1]), member("Brenna", "Tailoring", 116, [1])]);
	const tailoring = out[SILK].professions.find((p) => p.name === "Tailoring");
	assert.deepEqual(
		tailoring?.users.map((u) => [u.name, u.skill, u.color]),
		[
			["Todd", 100, "orange"],
			["Brenna", 116, "green"],
		],
	);
	assert.equal(tailoring?.count, 2);
});

test("grey for everything: not listed", () => {
	const out = run([member("Sela", "Tailoring", 178, [1, 2]), member("Todd", "Tailoring", 100, [1])]);
	const tailoring = out[SILK].professions.find((p) => p.name === "Tailoring");
	assert.deepEqual(
		tailoring?.users.map((u) => u.name),
		["Todd"],
	);
});

test("their best recipe for it decides: the better color wins", () => {
	// At 145: Bolt grey (120), gloves yellow (140-150).
	const out = run([member("Wren", "Tailoring", 145, [1, 2])]);
	assert.deepEqual(out[SILK].professions[0].users[0], { name: "Wren", classId: 8, skill: 145, color: "yellow" });
});

test("same color: fewer of the reagent per craft, then further from grey, then lower skill", () => {
	const fewer = run([member("A", "Tailoring", 90, [1]), member("B", "Tailoring", 130, [2])]);
	// Both orange; B's gloves take 2 silk, A's bolts 4.
	assert.deepEqual(
		fewer[SILK].professions[0].users.map((u) => u.name),
		["B", "A"],
	);
	const into = run([member("Early", "Tailoring", 141, [2]), member("Late", "Tailoring", 149, [2])]);
	assert.deepEqual(
		into[SILK].professions[0].users.map((u) => u.name),
		["Early", "Late"],
	);
	const lower = run([member("Hi", "Tailoring", 105, [1]), member("Lo", "Tailoring", 60, [1])]);
	assert.deepEqual(
		lower[SILK].professions[0].users.map((u) => u.name),
		["Lo", "Hi"],
	);
});

test("unlearned recipes count only from a trainer's requirement, never from a pattern's", () => {
	const members = [member("Todd", "Tailoring", 100)];
	assert.equal(run(members)[SILK].professions.find((p) => p.name === "Tailoring")?.users.length, 0);
	// The trainer asks for 105: Todd at 100 can't learn it yet.
	assert.equal(run(members, [[1, 105]])[SILK].professions.find((p) => p.name === "Tailoring")?.users.length, 0);
	// It asks for 100: orange for Todd.
	const ok = run(members, [[1, 100]])[SILK].professions.find((p) => p.name === "Tailoring");
	assert.deepEqual(ok?.users[0], { name: "Todd", classId: 8, skill: 100, color: "orange" });
	// A pattern's level only moves "from": Todd is in range but hasn't learned it.
	const pattern = run(members, [], [[1, 95]])[SILK].professions.find((p) => p.name === "Tailoring");
	assert.equal(pattern?.users.length, 0);
	assert.equal(pattern?.from, 95);
	assert.equal(pattern?.unlearned, true);
	assert.equal(pattern?.closest, undefined);
});

test("from: the lowest learn level, else yellow, of its recipes", () => {
	const out = run([member("Todd", "Tailoring", 10)]);
	assert.equal(out[SILK].professions.find((p) => p.name === "Tailoring")?.from, 110);
	const learned = run([member("Todd", "Tailoring", 10)], [[1, 100]]);
	assert.equal(learned[SILK].professions.find((p) => p.name === "Tailoring")?.from, 100);
});

test("nobody yet: the closest below, and professions nobody has", () => {
	const out = run([member("Brenna", "Tailoring", 52), member("Todd", "Tailoring", 98), member("Ivar", "Mining", 300)]);
	const silk = out[SILK].professions;
	assert.deepEqual(silk.find((p) => p.name === "Tailoring")?.closest, { name: "Todd", classId: 8, skill: 98 });
	assert.equal(silk.find((p) => p.name === "First Aid")?.nobody, true);
	// Ivar is past Mithril's smelting: nothing to say about it.
	assert.equal(out[3858], undefined);
});

test("unknown skill: not ranked, still counts as having it", () => {
	const out = run([member("Lich", "Tailoring", undefined, [1])]);
	const tailoring = out[SILK].professions.find((p) => p.name === "Tailoring");
	assert.equal(tailoring, undefined);
});

test("professions with people first, best person first; vendor reagents and unknown recipes left out", () => {
	const out = run([member("Miller", "First Aid", 150, [3]), member("Todd", "Tailoring", 145, [2])]);
	assert.deepEqual(
		out[SILK].professions.map((p) => p.name),
		["First Aid", "Tailoring"],
	);
	assert.equal(out[2320], undefined);
});

test("caps at three, counting the rest", () => {
	const members = ["A", "B", "C", "D", "E"].map((n, i) => member(n, "Tailoring", 100 + i, [1]));
	const tailoring = run(members)[SILK].professions.find((p) => p.name === "Tailoring");
	assert.equal(tailoring?.users.length, 3);
	assert.equal(tailoring?.count, 5);
});
