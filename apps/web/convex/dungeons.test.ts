import assert from "node:assert/strict";
import { test } from "node:test";
import { DUNGEON_QUEST_FACTS } from "./shared/dungeonQuests.ts";
import {
	DUNGEONS,
	dungeonOfKillStatistic,
	forSide,
	memberStatus,
	milestoneLevel,
	questChains,
	questDetails,
	questGroups,
	withFacts,
} from "./shared/dungeons.ts";

const deadmines = { level: 16 };
const quests = [
	{ id: 1, title: "Kill the boss" },
	{ id: 2, title: "Collect things" },
	{ id: 3, title: "Warlock thing", classes: [9] },
	{ id: 4, title: "Horde thing", faction: "horde" as const },
	// A chain: 5 is picked up outside, 6 inside after 5, 7 after 6.
	{ id: 5, title: "Chain start", after: 100 },
	{ id: 6, title: "Chain middle", after: 5 },
	{ id: 7, title: "Chain end", after: 6 },
	// Listed twice by Blizzard.
	{ id: 8, title: "Collect things" },
];
const member = (over: Partial<Parameters<typeof memberStatus>[2]> = {}) => ({
	level: 16,
	classId: 1,
	inProgress: new Set<number>(),
	completed: new Set<number>(),
	...over,
});
const groups = questGroups(forSide(quests, "alliance"));

test("every dungeon has quest areas and a level", () => {
	for (const d of DUNGEONS) {
		assert.ok(d.areas.length > 0, `${d.key}: quest areas`);
		assert.ok(d.level > 0, `${d.key}: level`);
	}
});

test("quest groups: side, duplicates, chains", () => {
	assert.deepEqual(
		groups.map((g) => [g.title, g.depth]),
		[
			["Chain start", 0],
			["Chain middle", 1],
			["Chain end", 2],
			["Collect things", 0],
			["Kill the boss", 0],
			["Warlock thing", 0],
		],
	);
	assert.deepEqual(groups.find((g) => g.title === "Collect things")?.ids, [2, 8]);
	assert.equal(groups[0].after, 100);
	assert.equal(groups[1].after, undefined);
	// A class chain's later steps are that class's.
	const classChain = questGroups([
		{ id: 1, title: "Compendium", classes: [1] },
		{ id: 2, title: "Forging", after: 1 },
	]);
	assert.deepEqual(classChain[1].classes, [1]);
	// A loop doesn't hang or nest forever.
	const loop = questGroups([
		{ id: 1, title: "A", after: 2 },
		{ id: 2, title: "B", after: 1 },
	]);
	assert.equal(loop.length, 2);
});

test("member status", () => {
	// Level: strict.
	assert.equal(memberStatus(deadmines, groups, member({ level: 15 })).levelReady, false);
	assert.equal(memberStatus(deadmines, groups, member()).levelReady, true);
	// To pick up: 1, 2 (or 8), 5; not the chain's later steps, not the Warlock's quest.
	const none = memberStatus(deadmines, groups, member());
	assert.deepEqual([none.toPickUp, none.pickedUp, none.questReady], [3, 0, false]);
	const ready = memberStatus(deadmines, groups, member({ inProgress: new Set([1, 8]), completed: new Set([5]) }));
	assert.deepEqual([ready.pickedUp, ready.questReady, ready.questsCompleted], [3, true, false]);
	// Completed: every quest of theirs, chain steps included.
	const all = new Set([1, 2, 5, 6, 7]);
	assert.equal(memberStatus(deadmines, groups, member({ completed: all })).questsCompleted, true);
	assert.equal(memberStatus(deadmines, groups, member({ classId: 9, completed: all })).questsCompleted, false);
	// Turned-in quests unknown.
	assert.equal(memberStatus(deadmines, groups, member({ completed: undefined })).questsCompleted, undefined);
	// No quests for them: never ready or completed.
	const empty = memberStatus(deadmines, [], member());
	assert.deepEqual([empty.questReady, empty.questsCompleted], [false, false]);
});

test("whole chains", () => {
	// Ragefire Chasm, Horde (rows in title order): Hidden Enemies is step 3 of 5; the Satchel pair a chain of 2.
	const rfc = questGroups(
		[
			{ id: 5722, title: "Searching for the Lost Satchel" },
			{ id: 5724, title: "Returning the Lost Satchel", after: 5722 },
			{ id: 5728, title: "Hidden Enemies", after: 5727 },
			{ id: 5761, title: "Slaying the Beast" },
		].map((q) => withFacts(q) ?? q),
	);
	const chains = questChains(rfc, "horde", () => undefined);
	assert.deepEqual(
		chains.map((c) => c.map((s) => [s.id, s.depth, !!s.group])),
		[
			[
				[5726, 0, false],
				[5727, 1, false],
				[5728, 2, true],
				[5729, 3, false],
				[5730, 4, false],
			],
			[
				[5722, 0, true],
				[5724, 1, true],
			],
		],
	);
	// Another side's steps aren't in it.
	assert.deepEqual(questChains(rfc, "alliance", (id) => (id > 5725 ? "horde" : undefined))[1]?.length, undefined);
});

test("quests that start inside don't count toward picked up", () => {
	// Ruins of Lordaeron, Horde: the Crest drops inside; Light's Justice is picked up in town.
	const ruins = questGroups([
		{ id: 92421, title: "Light's Justice" },
		{ id: 95204, title: "Crest of Lordaeron" },
	]);
	assert.equal(ruins.find((g) => g.title === "Crest of Lordaeron")?.startsInside, true);
	const s = memberStatus({ level: 15 }, ruins, member({ level: 20, inProgress: new Set([92421]) }));
	assert.deepEqual([s.toPickUp, s.pickedUp, s.questReady, s.total], [1, 1, true, 2]);
});

test("hand-kept quest facts", () => {
	for (const [id, f] of Object.entries(DUNGEON_QUEST_FACTS)) {
		assert.ok(![f.after].flat().includes(Number(id)), `${id}: after itself`);
	}
	assert.equal(withFacts({ id: 2868, title: "<TXT> The Shriveled Heart" }), undefined);
	assert.deepEqual(withFacts({ id: 166, title: "The Defias Brotherhood" }), {
		id: 166,
		title: "The Defias Brotherhood",
		faction: "alliance",
		after: 155,
	});
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
	// Blizzard's stated side wins over reputations.
	assert.deepEqual(
		questDetails({ requirements: { faction: { type: "HORDE" } }, rewards: { reputations: [{ reward: { id: 72 } }] } }),
		{ faction: "horde" },
	);
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
