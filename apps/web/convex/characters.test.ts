import assert from "node:assert/strict";
import { test } from "node:test";
import { inSidebar } from "./shared/characters.ts";

test("sidebar: from level 5 unless the player chose", () => {
	assert.equal(inSidebar(4, undefined), false);
	assert.equal(inSidebar(5, undefined), true);
	assert.equal(inSidebar(undefined, undefined), true);
	assert.equal(inSidebar(1, true), true);
	assert.equal(inSidebar(60, false), false);
});
