import assert from "node:assert/strict";
import { test } from "node:test";
import { canSeeAddons, summarizeAddons } from "./shared/addons.ts";

test("who sees a player's addons", () => {
	const owner = { isOwner: true, isMember: false };
	const member = { isOwner: false, isMember: true };
	const stranger = { isOwner: false, isMember: false };
	assert.equal(canSeeAddons("none", owner), true, "the player always sees their own");
	assert.equal(canSeeAddons(undefined, owner), true);
	assert.equal(canSeeAddons("none", member), false);
	assert.equal(canSeeAddons(undefined, member), false, "never chosen: nobody else");
	assert.equal(canSeeAddons("guild", member), true);
	assert.equal(canSeeAddons("guild", stranger), false);
	assert.equal(canSeeAddons("public", stranger), true);
});

test("a guild's addons: most used first, one count per person, versions and titles merged", () => {
	const rows = summarizeAddons([
		{ list: [{ name: "Questie", version: "9.1" }, { name: "Bagnon" }] },
		{
			list: [
				{ name: "questie", title: "Questie", version: "9.2" },
				{ name: "Questie", version: "9.2" },
			],
		},
		{
			list: [
				{ name: "Details", title: "Details! Damage Meter" },
				{ name: "Questie", version: "9.1" },
			],
		},
	]);
	assert.deepEqual(
		rows.map((r) => [r.name, r.title, r.people, r.versions]),
		[
			["Questie", "Questie", [0, 1, 2], ["9.1", "9.2"]],
			["Bagnon", undefined, [0], []],
			["Details", "Details! Damage Meter", [2], []],
		],
	);
	assert.deepEqual(summarizeAddons([]), []);
});
