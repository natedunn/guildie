import assert from "node:assert/strict";
import { test } from "node:test";
import { ago, capped, fold, matches, quality, slotName } from "./shared/mcpText.ts";

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
