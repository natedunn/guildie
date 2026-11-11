import assert from "node:assert/strict";
import { test } from "node:test";
import {
	DUNGEONS,
	dungeonOfKillStatistic,
	milestoneLevel,
	minLevelFor,
	questDetails,
	questsFor,
	readiness,
} from "./shared/dungeons.ts";

const deadmines = { level: 16 };
const quests = [
	{ id: 1 },
	{ id: 2 },
	{ id: 3, classes: [9] }, // Warlock only
	{ id: 4, faction: "horde" as const },
];
const member = (over: Partial<Parameters<typeof readiness>[2]> = {}) => ({
	level: 16,
	classId: 1,
	side: "alliance" as const,
	inProgress: new Set<number>(),
	completed: new Set<number>(),
	...over,
});

test("every dungeon has quest areas and a level", () => {
	for (const d of DUNGEONS) {
		assert.ok(d.areas.length > 0, `${d.key}: quest areas`);
		assert.ok(d.level > 0, `${d.key}: level`);
	}
	assert.equal(minLevelFor(deadmines), 14);
});

test("their quests: class and side", () => {
	assert.deepEqual(
		questsFor(quests, { classId: 1, side: "alliance" }).map((q) => q.id),
		[1, 2],
	);
	assert.deepEqual(
		questsFor(quests, { classId: 9, side: "horde" }).map((q) => q.id),
		[1, 2, 3, 4],
	);
});

test("readiness", () => {
	assert.equal(readiness(deadmines, quests, member({ level: 13 })).status, "under");
	assert.equal(readiness(deadmines, quests, member({ level: 14 })).status, "partial");
	assert.equal(readiness(deadmines, quests, member({ inProgress: new Set([1]) })).status, "partial");
	const ready = readiness(deadmines, quests, member({ inProgress: new Set([1]), completed: new Set([2]) }));
	assert.equal(ready.status, "ready");
	assert.deepEqual([ready.done, ready.inLog, ready.missing], [[2], [1], []]);
	assert.equal(readiness(deadmines, quests, member({ level: 10, completed: new Set([1, 2]) })).status, "completed");
	// A Warlock's class quest counts for them.
	assert.equal(readiness(deadmines, quests, member({ classId: 9, completed: new Set([1, 2]) })).status, "partial");
	// No quests for them: ready at the level, never "completed".
	assert.equal(readiness(deadmines, [], member()).status, "ready");
	// Turned-in quests unknown: only the level and the log count.
	assert.equal(readiness(deadmines, quests, member({ completed: undefined })).status, "partial");
});

test("quest details from Blizzard's data", () => {
	assert.deepEqual(
		questDetails({
			requirements: { classes: [{ id: 9 }] },
			rewards: {
				items: { choice_of: [{ item: { id: 6898 } }, { item: { id: 15109 } }] },
				reputations: [{ reward: { id: 72 } }],
			},
		}),
		{ classes: [9], faction: "alliance", rewardItems: [6898, 15109] },
	);
	assert.deepEqual(questDetails({ rewards: { reputations: [{ reward: { id: 72 } }, { reward: { id: 76 } }] } }), {});
});

test("first clears from Blizzard's boss-kill statistics", () => {
	assert.equal(dungeonOfKillStatistic("Edwin VanCleef Kills (Deadmines)"), "deadmines");
	assert.equal(dungeonOfKillStatistic("Durgen Dirgehammer Kills (Hall of Thanes)"), "hall-of-thanes");
	assert.equal(dungeonOfKillStatistic("Bazil Thredd kills (Stormwind Stockade)"), "stockade");
	assert.equal(dungeonOfKillStatistic("Shade of the Archmage Kills (City of Dalaran)"), "city-of-dalaran");
	assert.equal(dungeonOfKillStatistic("Ragnaros kills (Molten Core)"), undefined);
	assert.equal(dungeonOfKillStatistic("Total kills"), undefined);
});

test("level milestones for the feed's every-5 view", () => {
	assert.equal(milestoneLevel(24, 25), true);
	assert.equal(milestoneLevel(23, 24), false);
	assert.equal(milestoneLevel(23, 26), true);
	assert.equal(milestoneLevel(59, 60), true);
	assert.equal(milestoneLevel(undefined, 30), true);
});
