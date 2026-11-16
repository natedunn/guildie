import assert from "node:assert/strict";
import { test } from "node:test";
import { isWowTitle } from "./wow-running.ts";

test("WoW's window, not a browser tab about WoW", () => {
	assert.ok(isWowTitle("World of Warcraft"));
	assert.ok(isWowTitle("World of Warcraft: Forever"));
	assert.ok(!isWowTitle("World of Warcraft - Google Chrome"));
	assert.ok(!isWowTitle("World of Warcraft: Forever — Mozilla Firefox"));
	assert.ok(!isWowTitle("Guildie"));
});
