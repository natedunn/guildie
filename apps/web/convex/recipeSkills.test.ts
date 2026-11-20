import assert from "node:assert/strict";
import { test } from "node:test";
import { GENERATED_RECIPE_SKILLS, RECIPE_SKILLS_BUILD } from "./shared/recipeSkills.generated.ts";
import { recipeColor, recipeSkill } from "./shared/recipeSkills.ts";

test("generated data: stamped, every profession, sane levels", () => {
	assert.equal(RECIPE_SKILLS_BUILD.product, "wowf");
	assert.match(RECIPE_SKILLS_BUILD.version, /^\d+\.\d+\.\d+\.\d+$/);
	for (const name of ["Alchemy", "Blacksmithing", "Cooking", "Enchanting", "Engineering", "First Aid"]) {
		assert.ok(GENERATED_RECIPE_SKILLS[name]?.length, name);
	}
	for (const name of ["Leatherworking", "Mining", "Tailoring"]) assert.ok(GENERATED_RECIPE_SKILLS[name]?.length, name);
	const ids = new Set<number>();
	for (const recipes of Object.values(GENERATED_RECIPE_SKILLS)) {
		for (const r of recipes) {
			assert.ok(!ids.has(r.id), `recipe ${r.id} listed twice`);
			ids.add(r.id);
			assert.ok(r.yellow >= 0 && r.yellow <= r.grey && r.grey <= 400, `${r.name}: ${r.yellow}/${r.grey}`);
		}
	}
});

test("recipeSkill: by Blizzard's recipe id, with green halfway", () => {
	// Bolt of Silk Cloth: Forever moved it down from Classic's 135/145.
	const silk = recipeSkill(2376);
	assert.equal(silk?.name, "Bolt of Silk Cloth");
	assert.equal(silk?.profession, "Tailoring");
	assert.deepEqual([silk?.yellow, silk?.green, silk?.grey], [110, 115, 120]);
	assert.equal(recipeSkill(-1), undefined);
});

test("recipeColor: the profession window's colors", () => {
	const levels = { yellow: 110, green: 115, grey: 120 };
	assert.equal(recipeColor(levels, 1), "orange");
	assert.equal(recipeColor(levels, 109), "orange");
	assert.equal(recipeColor(levels, 110), "yellow");
	assert.equal(recipeColor(levels, 115), "green");
	assert.equal(recipeColor(levels, 120), "grey");
	assert.equal(recipeColor(levels, 300), "grey");
});
