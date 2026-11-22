import assert from "node:assert/strict";
import { test } from "node:test";
import { GENERATED_WAYLAID, WAYLAID_BUILD } from "./shared/waylaid.generated.ts";

test("generated Waylaid data: stamped, crates and Supplies, sane contents", () => {
	assert.equal(WAYLAID_BUILD.product, "wowf");
	assert.match(WAYLAID_BUILD.version, /^\d+\.\d+\.\d+\.\d+$/);
	const ids = new Set<number>();
	for (const w of GENERATED_WAYLAID) {
		assert.ok(!ids.has(w.id), `${w.name} listed twice`);
		ids.add(w.id);
		assert.ok(w.takes.length >= 1, w.name);
		if (w.kind === "supplies") assert.equal(w.takes.length, 1, w.name);
		for (const t of w.takes) assert.ok(t.itemId > 0 && t.count > 0 && t.name, `${w.name}: ${JSON.stringify(t)}`);
	}
	assert.ok(GENERATED_WAYLAID.filter((w) => w.kind === "crate").length >= 20);
	assert.ok(GENERATED_WAYLAID.filter((w) => w.kind === "supplies").length >= 80);
});

test("the crate from the screenshot and a Supplies item read right", () => {
	const herbs = GENERATED_WAYLAID.find((w) => w.id === 248686);
	assert.equal(herbs?.name, "Waylaid Crate: Journeyman Herbs");
	assert.deepEqual(
		herbs?.takes.map((t) => [t.itemId, t.count]),
		[
			[3820, 10], // Stranglekelp
			[2453, 10], // Bruiseweed
			[3355, 10], // Wild Steelbloom
			[3369, 10], // Grave Moss
			[3356, 10], // Kingsblood
		],
	);
	const bronze = GENERATED_WAYLAID.find((w) => w.id === 211819);
	assert.deepEqual(bronze?.takes, [{ itemId: 2841, name: "Bronze Bar", count: 12 }]);
});
