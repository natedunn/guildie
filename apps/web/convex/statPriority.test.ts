import assert from "node:assert/strict";
import { test } from "node:test";
import { PRIORITY_STATS, statPriority, validStats } from "./shared/statPriority.ts";
import { SPECS } from "./shared/weights.ts";

test("every tree's priority: three known stats, each weighted in that tree", () => {
	for (const [token, trees] of Object.entries(SPECS)) {
		for (const t of trees) {
			assert.equal(new Set(t.stats).size, 3, `${token} ${t.name}`);
			for (const s of t.stats) {
				assert.ok(s in PRIORITY_STATS, `${token} ${t.name}: ${s} has no label`);
				assert.ok((t.w[s] ?? 0) > 0, `${token} ${t.name}: ${s} has no weight`);
			}
		}
	}
});

const tree = (name: string, points: number) => ({ name, points, talents: [] });

test("from the main talent tree, else the class's default", () => {
	// Paladin (2): 31 in Protection.
	assert.deepEqual(statPriority(2, [tree("Protection", 31), tree("Holy", 5)]), {
		tree: "Protection",
		stats: ["STAMINA", "STRENGTH", "INTELLECT"],
		chosen: false,
	});
	// No talents yet: Retribution.
	assert.equal(statPriority(2, [])?.tree, "Retribution");
	assert.equal(statPriority(6, []), undefined);
});

test("the player's choice wins: their own three, else another tree", () => {
	const talents = [tree("Protection", 31)];
	assert.deepEqual(statPriority(2, talents, { stats: ["INTELLECT", "SPIRIT", "STAMINA"] }), {
		stats: ["INTELLECT", "SPIRIT", "STAMINA"],
		chosen: true,
	});
	assert.equal(statPriority(2, talents, { tree: 0 })?.tree, "Holy");
	// Bad choices fall back to the talents.
	assert.equal(statPriority(2, talents, { tree: 7 })?.chosen, false);
	assert.equal(statPriority(2, talents, { stats: ["INTELLECT", "INTELLECT", "STAMINA"] })?.chosen, false);
	assert.equal(validStats(["NOPE", "SPIRIT", "STAMINA"]), undefined);
});
