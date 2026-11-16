import assert from "node:assert/strict";
import { test } from "node:test";
import { hiddenPatch, inSidebar, rosterPatch } from "./shared/characters.ts";

test("sidebar: from level 5 unless the player chose", () => {
	assert.equal(inSidebar(4, undefined), false);
	assert.equal(inSidebar(5, undefined), true);
	assert.equal(inSidebar(undefined, undefined), true);
	assert.equal(inSidebar(1, true), true);
	assert.equal(inSidebar(60, false), false);
});

test("hiding a character keeps whether it's in the guild, and showing it puts that back", () => {
	const listed = { inRoster: true };
	const hidden = hiddenPatch(listed, true, 100);
	assert.deepEqual(hidden, { inRoster: false, hidden: { at: 100, inGuild: true } });
	assert.equal(hiddenPatch({ inRoster: false, hidden: { at: 100, inGuild: true } }, true, 200), null);
	assert.deepEqual(hiddenPatch({ inRoster: false, hidden: { at: 100, inGuild: true } }, false, 200), {
		inRoster: true,
		hidden: undefined,
	});
	// Left the guild while hidden: back, but not on the roster.
	assert.deepEqual(hiddenPatch({ inRoster: false, hidden: { at: 100, inGuild: false } }, false, 200), {
		inRoster: false,
		hidden: undefined,
	});
	assert.equal(hiddenPatch(listed, false, 200), null);
});

test("roster syncs keep a hidden character off the roster", () => {
	assert.deepEqual(rosterPatch(undefined, true), { inRoster: true });
	assert.deepEqual(rosterPatch({ inRoster: true }, false), { inRoster: false });
	assert.deepEqual(rosterPatch({ inRoster: false, hidden: { at: 1, inGuild: true } }, false), {
		inRoster: false,
		hidden: { at: 1, inGuild: false },
	});
	assert.deepEqual(rosterPatch({ inRoster: false, hidden: { at: 1, inGuild: false } }, true), {
		inRoster: false,
		hidden: { at: 1, inGuild: true },
	});
});
