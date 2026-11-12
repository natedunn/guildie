import assert from "node:assert/strict";
import { test } from "node:test";
import { bestLine, bestScore, fold, hasAllWords, itemDescription, matchScore } from "./shared/search.ts";

test("fold drops case, accents and apostrophes", () => {
	assert.equal(fold("Zul'Farrak"), "zulfarrak");
	assert.equal(fold("Kröldok"), "kroldok");
});

test("exact beats prefix beats word start beats anywhere", () => {
	const exact = matchScore("brisket", "Brisket");
	const prefix = matchScore("bris", "Brisket");
	const word = matchScore("mines", "The Deadmines Mines");
	const inside = matchScore("mines", "Deadmines");
	assert.ok(exact > prefix && prefix > word && word > inside && inside > 0);
});

test("every word anywhere, in any order", () => {
	assert.ok(matchScore("keep shadow", "Shadowfang Keep") > 0);
	assert.equal(matchScore("keep ogre", "Shadowfang Keep"), 0);
});

test("initials and letters in order", () => {
	assert.ok(matchScore("bd", "Blackfathom Deeps") > 0);
	assert.ok(matchScore("rfc", "Ragefire Chasm") > 0);
	assert.ok(matchScore("brsk", "Brisket") > 0);
	assert.equal(matchScore("zq", "Shadowfang Keep"), 0);
	assert.equal(matchScore("restores", "Soren Stormcrest"), 0);
});

test("a single letter only matches starts", () => {
	assert.ok(matchScore("s", "Settings") > 0);
	assert.equal(matchScore("x", "Settings"), 0);
});

test("shorter names win ties", () => {
	assert.ok(matchScore("gear", "Gear") > matchScore("gear", "Gear preferences"));
	assert.ok(matchScore("ge", "Gear") > matchScore("ge", "Gear preferences"));
});

test("bestScore takes the best of several names", () => {
	assert.ok(bestScore("bank", ["Inventory", "bags bank"]) > 0);
	assert.equal(bestScore("", ["Inventory"]), 0);
});

test("an item's description is its effects, set and flavor text", () => {
	const description = itemDescription([
		{ left: "Binds when picked up" },
		{ left: "+5 Stamina" },
		{ left: "+2 Spirit", color: "#00ff00" },
		{ left: "Flametongue 1", color: "#00ff00" },
		{ left: "Durability 20 / 20" },
		{ left: "Use: Restores 294 health over 21 sec.", color: "#00ff00" },
		{ left: '"Smells of the sea."', color: "#ffd100" },
	]);
	assert.equal(description, "Use: Restores 294 health over 21 sec.\nSmells of the sea.");
	assert.equal(itemDescription([{ left: "Soulbound" }]), undefined);
	assert.equal(itemDescription([{ left: "Binds when equipped" }, { left: "10 Slot Bag" }]), "10 Slot Bag");
	assert.ok(hasAllWords("10 slot bag", "10 Slot Bag"));
	assert.ok(!hasAllWords("10 slot bag", "Use: Increases ranged attack speed by 10%."));
	assert.equal(bestLine("health", description ?? ""), "Use: Restores 294 health over 21 sec.");
	assert.equal(bestLine("sea", description ?? ""), "Smells of the sea.");
});
