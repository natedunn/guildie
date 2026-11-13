import assert from "node:assert/strict";
import { test } from "node:test";
import { LIMITS, PAYLOAD_VERSIONS, parseCharacter } from "./addonPayload.ts";
import { mergeProfile } from "./profile.ts";
import { mergeCompletedQuestIds } from "./shared/quests.ts";

const now = 1_794_300_000_000;
const character = { guid: "Player-1", name: "Test", capturedAt: now / 1000, talents: [] };

test("completion IDs validate, sort and deduplicate; old payloads remain compatible", () => {
	assert.deepEqual(PAYLOAD_VERSIONS, [1, 2, 3, 4, 5, 6, 7]);
	const parsed = parseCharacter({ ...character, completedQuestIds: [6981, 3369, 6981] }, now);
	assert(parsed.ok);
	assert.deepEqual(parsed.character.completedQuestIds, [3369, 6981]);
	const old = parseCharacter(character, now);
	assert(old.ok);
	assert.equal(old.character.completedQuestIds, undefined);
	for (const ids of [[0], [-1], [1.5], ["6981"], [10_000_001], {}, Array(LIMITS.completedQuests + 1).fill(1)]) {
		assert.equal(parseCharacter({ ...character, completedQuestIds: ids }, now).ok, false);
	}
});

test("backlogged, repeated, older and absent uploads cannot lose a completion", () => {
	assert.equal(mergeCompletedQuestIds(undefined, undefined), undefined);
	let saved = mergeCompletedQuestIds(undefined, [6981]);
	assert.deepEqual(saved, [6981]);
	saved = mergeCompletedQuestIds(saved, [3369, 6981, 3369]);
	assert.deepEqual(saved, [3369, 6981]);
	assert.deepEqual(mergeCompletedQuestIds(saved, [6981]), saved);
	assert.deepEqual(mergeCompletedQuestIds(saved, undefined), saved);
	assert.deepEqual(mergeCompletedQuestIds(saved, []), saved);
	assert.deepEqual(
		mergeCompletedQuestIds([], saved),
		saved,
		"stale empty Blizzard history does not erase addon confirmations",
	);
});

test("newer Blizzard profile does not hide older addon completion confirmations", () => {
	const profile = mergeProfile(
		{ level: 20, lastLoginAt: now },
		{
			capturedAt: now - 10000,
			talentTrees: [],
			completedQuestIds: [6981],
		},
	);
	assert.deepEqual(profile.completedQuestIds, [6981]);
	assert.deepEqual(mergeCompletedQuestIds([3369], profile.completedQuestIds), [3369, 6981]);
});
