import assert from "node:assert/strict";
import { test } from "node:test";
import { fishing, keepBuild } from "./shared/fishing.ts";

const sword = { slot: "MAIN_HAND", itemId: 1, tooltip: [{ left: "Two-Hand", right: "Sword" }] };
const gloves = { slot: "HANDS", itemId: 2, tooltip: [{ left: "Hands", right: "Leather" }] };
// The game's tooltip and Blizzard's item data name the type differently; an unknown id by its type.
const pole = { slot: "MAIN_HAND", itemId: 90001, tooltip: [{ left: "Two-Hand", right: "Fishing Pole" }] };
const blizzardPole = { slot: "MAIN_HAND", itemId: 90002, tooltip: [{ left: "Two-Hand", right: "Fishing Poles" }] };
// A tooltip we can't read (not English): by its id.
const knownPole = { slot: "MAIN_HAND", itemId: 6365, tooltip: [{ left: "Zweihändig", right: "Angelrute" }] };

test("fishing: a fishing pole in the main hand", () => {
	assert.equal(fishing([gloves, sword]), false);
	assert.equal(fishing([gloves, pole]), true);
	assert.equal(fishing([blizzardPole]), true);
	assert.equal(fishing([knownPole]), true);
	assert.equal(fishing([{ ...pole, slot: "OFF_HAND" }]), false);
	assert.equal(fishing([gloves]), false, "no weapon isn't fishing");
	assert.equal(fishing(undefined), false);
});

test("keepBuild: fishing gear doesn't replace the build from before", () => {
	// A fishing addon took the gloves off and swapped in the pole.
	assert.equal(keepBuild([pole], [gloves, sword]), true);
	assert.equal(keepBuild([gloves, sword], [pole]), false, "back from fishing");
	assert.equal(keepBuild([pole], [pole]), false, "only fishing gear known: keep reading it");
	assert.equal(keepBuild([pole], undefined), false, "nothing to keep");
	assert.equal(keepBuild([pole], []), false);
	assert.equal(keepBuild([gloves], [sword]), false, "ordinary changes go through");
});
