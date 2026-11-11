import assert from "node:assert/strict";
import { test } from "node:test";
import { ago, capped, fold, gearType, matches, quality, slotName, statKey } from "./shared/mcpText.ts";

test("ago: short relative times", () => {
	const now = 1_000_000_000_000;
	assert.equal(ago(undefined, now), "");
	assert.equal(ago(now - 10_000, now), "just now");
	assert.equal(ago(now - 5 * 60_000, now), "5m ago");
	assert.equal(ago(now - 3 * 86_400_000, now), "3d ago");
	assert.equal(ago(now + 60_000, now), "just now");
});

test("fold and matches: case, accents, punctuation, word order", () => {
	assert.equal(fold("Brísket-Smith"), "brisket smith");
	assert.ok(matches("smith brisket", "Brisket", "Smith"));
	assert.ok(matches("8 slot bag", "Linen Bag", "Bag", "8 Slot Bag"));
	assert.ok(!matches("silk bag", "Linen Bag"));
	assert.ok(matches("", "anything"));
});

test("capped: says how many were left out", () => {
	assert.deepEqual(capped(["a", "b"], 2, "Narrow it."), ["a", "b"]);
	assert.deepEqual(capped(["a", "b", "c"], 2, "Narrow it."), ["a", "b", "…and 1 more. Narrow it."]);
});

test("quality and slot names", () => {
	assert.equal(quality("RARE"), "Rare");
	assert.equal(quality(undefined), "");
	assert.equal(slotName("MAIN_HAND"), "Main hand");
});

test("statKey: labels, keys and the usual shorthand", () => {
	const labels = { AGILITY: "Agility", SPELL_DAMAGE_DONE: "Spell damage", MANA_REGENERATION: "Mana per 5" };
	assert.equal(statKey("agility", labels), "AGILITY");
	assert.equal(statKey("AGILITY", labels), "AGILITY");
	assert.equal(statKey("Spell power", labels), "SPELL_DAMAGE_DONE");
	assert.equal(statKey("spell damage", labels), "SPELL_DAMAGE_DONE");
	assert.equal(statKey("mp5", labels), "MANA_REGENERATION");
	assert.equal(statKey("Mana per 5", labels), "MANA_REGENERATION");
	assert.equal(statKey("luck", labels), undefined);
});

test("gearType: singular, plural, 2h and staff", () => {
	const types = [
		{ name: "Plate" },
		{ name: "Leather" },
		{ name: "Swords" },
		{ name: "Two-Handed Swords" },
		{ name: "Staves" },
		{ name: "Fist Weapons" },
		{ name: "Thrown" },
	];
	assert.equal(gearType("plate", types)?.name, "Plate");
	assert.equal(gearType("Leather", types)?.name, "Leather");
	assert.equal(gearType("sword", types)?.name, "Swords");
	assert.equal(gearType("2h sword", types)?.name, "Two-Handed Swords");
	assert.equal(gearType("two-handed swords", types)?.name, "Two-Handed Swords");
	assert.equal(gearType("staff", types)?.name, "Staves");
	assert.equal(gearType("fist weapon", types)?.name, "Fist Weapons");
	assert.equal(gearType("thrown", types)?.name, "Thrown");
	assert.equal(gearType("bow", types), undefined);
});
