import assert from "node:assert/strict";
import { test } from "node:test";
import { dungeonGroups, greyLevel, isGroupQuest, questDifficulty } from "./shared/quests.ts";

test("quest level colors, like the game's quest log", () => {
	assert.equal(questDifficulty(40, 34), "impossible");
	assert.equal(questDifficulty(37, 34), "hard");
	assert.equal(questDifficulty(36, 34), "normal");
	assert.equal(questDifficulty(32, 34), "normal");
	assert.equal(questDifficulty(28, 34), "easy");
	// Grey at 34: 34 - 3 - 5 = 26.
	assert.equal(greyLevel(34), 26);
	assert.equal(questDifficulty(26, 34), "trivial");
	assert.equal(greyLevel(5), 0);
	assert.equal(greyLevel(50), 39);
	assert.equal(greyLevel(60), 51);
});

test("only dungeon and raid quests are for grouping", () => {
	assert.ok(isGroupQuest("Dungeon"));
	assert.ok(isGroupQuest("Raid"));
	assert.ok(!isGroupQuest("Elite"));
	assert.ok(!isGroupQuest(undefined));
});

test("dungeon quests across the guild, by dungeon", () => {
	const dm = (id: number, title: string) => ({ id, title, type: "Dungeon", area: "The Deadmines", level: 22 });
	const groups = dungeonGroups([
		{
			key: "brisket",
			name: "Brisket",
			classId: 11,
			level: 20,
			mine: false,
			quests: [dm(166, "The Defias Brotherhood")],
		},
		{
			key: "lich",
			name: "Lich",
			classId: 5,
			level: 21,
			mine: true,
			quests: [
				dm(166, "The Defias Brotherhood"),
				dm(214, "Red Silk Bandanas"),
				{ id: 1, title: "Hungry!", area: "Dustwallow Marsh" },
				{ id: 2, title: "An elite", type: "Elite", area: "Westfall" },
			],
		},
		{ key: "miller", name: "Miller", classId: 1, level: 24, mine: false, quests: [dm(214, "Red Silk Bandanas")] },
		{
			key: "todd",
			name: "Todd",
			classId: 8,
			level: 40,
			mine: false,
			quests: [{ id: 1053, title: "In the Name of the Light", type: "Dungeon", area: "Scarlet Monastery" }],
		},
		{ key: "nobody", name: "Nobody", classId: 1, level: 10, mine: false, quests: [] },
	]);
	assert.deepEqual(
		groups.map((g) => g.area),
		["The Deadmines", "Scarlet Monastery"],
	);
	const deadmines = groups[0];
	// You first, then who has the most of its quests.
	assert.deepEqual(
		deadmines.people.map((p) => [p.name, p.questIds.length]),
		[
			["Lich", 2],
			["Miller", 1],
			["Brisket", 1],
		],
	);
	assert.deepEqual(
		deadmines.quests.map((q) => [q.title, q.holders]),
		[
			["Red Silk Bandanas", 2],
			["The Defias Brotherhood", 2],
		],
	);
});

test("a raid quest makes the place a raid; quests without an area are left out", () => {
	const groups = dungeonGroups([
		{
			key: "a",
			name: "A",
			classId: 1,
			level: 60,
			mine: false,
			quests: [
				{ id: 1, title: "Attunement", type: "Dungeon", area: "Molten Core" },
				{ id: 2, title: "Core", type: "Raid", area: "Molten Core" },
				{ id: 3, title: "Nowhere", type: "Dungeon" },
			],
		},
	]);
	assert.equal(groups.length, 1);
	assert.equal(groups[0].type, "Raid");
});
