import assert from "node:assert/strict";
import { test } from "node:test";
import { auditCharacter, averageItemLevel, decide, mergeProfile } from "./profile.ts";

const HOUR = 3600_000;
const LOGIN = 1_794_261_703_000;

const blizzard = {
	level: 22,
	lastLoginAt: LOGIN,
	profileSyncedAt: LOGIN + 2 * HOUR,
	talentsChangedAt: LOGIN + HOUR,
	averageItemLevel: 20,
	equipment: [{ slot: "HEAD", itemId: 1, name: "Old Hat", quality: "COMMON", itemLevel: 20 }],
	professions: [
		{ id: 197, name: "Tailoring", skill: 100, maxSkill: 150, secondary: false, knownRecipes: [10, 11] },
		{ id: 333, name: "Enchanting", skill: 90, maxSkill: 150, secondary: false, knownRecipes: [20] },
	],
	talentTrees: [{ id: 613, name: "Discipline", points: 13, talents: [] }],
};

const snapshot = (at: number) => ({
	capturedAt: at,
	level: 23,
	talentTrees: [{ id: 613, name: "Discipline", points: 14, talents: [] }],
	equipment: {
		capturedAt: at,
		averageItemLevel: 21.9,
		items: [{ slot: "HEAD", itemId: 2, name: "New Hat", quality: "UNCOMMON", itemLevel: 24, tooltip: [] }],
	},
	professions: {
		capturedAt: at,
		list: [
			{ id: 197, name: "Tailoring", skill: 120, maxSkill: 150, secondary: false },
			{ id: 185, name: "Cooking", skill: 60, maxSkill: 75, secondary: true },
		],
	},
	recipes: [
		{
			professionId: 197,
			profession: "Tailoring",
			capturedAt: at - 60_000,
			recipeIds: [11, 12],
			count: 2,
			unmatched: 0,
		},
		{ professionId: 333, profession: "Enchanting", capturedAt: at, recipeIds: [21], count: 1, unmatched: 0 },
	],
});

test("no addon: Blizzard's, synced as of the last logout", () => {
	const p = mergeProfile(blizzard, null);
	assert.equal(p.level, 22);
	assert.equal(p.equipment?.[0].name, "Old Hat");
	assert.equal(p.sources.gear.kind, "blizzard");
	assert.deepEqual(p.synced, { kind: "blizzard", at: LOGIN, checkedAt: LOGIN + 2 * HOUR });
});

test("a newer in-game read wins per field", () => {
	const at = LOGIN + 3 * HOUR;
	const p = mergeProfile(blizzard, snapshot(at));
	assert.equal(p.level, 23);
	assert.equal(p.sources.level.kind, "addon");
	assert.equal(p.equipment?.[0].name, "New Hat");
	assert.equal(p.averageItemLevel, 21);
	assert.deepEqual(
		p.professions.map((x) => [x.name, x.skill]),
		[
			["Tailoring", 120],
			["Cooking", 60],
		],
		"Enchanting unlearned since",
	);
	// Newer recipes add to Blizzard's; Enchanting's are gone with it.
	assert.deepEqual(p.professions[0].knownRecipes, [10, 11, 12]);
	assert.equal(p.professions[0].recipesSource?.kind, "addon");
	assert.equal(p.professions[1].knownRecipes, undefined);
	assert.equal(p.talentTrees?.[0].points, 14);
	assert.deepEqual(p.synced, { kind: "app", at });
});

test("Blizzard comes back when it's newer (played without the app since)", () => {
	const p = mergeProfile(blizzard, { ...snapshot(LOGIN - HOUR), level: 21 });
	assert.equal(p.level, 22);
	assert.equal(p.equipment?.[0].name, "Old Hat");
	assert.equal(p.averageItemLevel, 20);
	assert.equal(p.talentTrees?.[0].points, 13);
	// Blizzard's professions, with the game's recipes added (recipes only grow).
	assert.deepEqual(
		p.professions.map((x) => [x.name, x.knownRecipes]),
		[
			["Tailoring", [10, 11, 12]],
			["Enchanting", [20, 21]],
		],
	);
	assert.equal(p.sources.professions.kind, "blizzard");
	assert.equal(p.sources.gear.kind, "blizzard");
});

test("no professions from the game while Blizzard has some: Blizzard's", () => {
	const s = { ...snapshot(LOGIN + 3 * HOUR), professions: { capturedAt: LOGIN + 3 * HOUR, list: [] } };
	const p = mergeProfile(blizzard, s);
	assert.deepEqual(
		p.professions.map((x) => x.name),
		["Tailoring", "Enchanting"],
	);
	assert.equal(p.sources.professions.kind, "blizzard");
	// The game's recipes still add to Blizzard's.
	assert.deepEqual(p.professions[0].knownRecipes, [10, 11, 12]);
	assert.deepEqual(p.professions[1].knownRecipes, [20, 21]);
});

test("no talents from the game while Blizzard has some: Blizzard's", () => {
	const p = mergeProfile(blizzard, { ...snapshot(LOGIN + 3 * HOUR), talentTrees: [] });
	assert.equal(p.talentTrees?.[0].points, 13);
	assert.equal(p.sources.talents.kind, "blizzard");
	assert.equal(p.sources.gear.kind, "addon");
});

test("level: the higher one, whichever looks newer", () => {
	// Read in game early in the session; Blizzard has the level gained after it.
	const p = mergeProfile({ ...blizzard, level: 24 }, snapshot(LOGIN + HOUR));
	assert.equal(p.level, 24);
	assert.equal(p.sources.level.kind, "blizzard");
	assert.equal(p.equipment?.[0].name, "New Hat", "other fields still go by time");
});

test("a higher level from the game wins even without a Blizzard profile", () => {
	const p = mergeProfile({ level: 8 }, { capturedAt: 1, level: 9, talentTrees: [] });
	assert.equal(p.level, 9);
	assert.deepEqual(p.professions, []);
});

test("average item level, Blizzard's way", () => {
	const item = (slot: string, itemLevel: number, twoHand = false) => ({
		slot,
		itemId: 1,
		name: "x",
		quality: "COMMON",
		itemLevel,
		tooltip: twoHand ? [{ left: "Two-Hand", right: "Staff" }] : [],
	});
	const gear = [
		"HEAD",
		"NECK",
		"SHOULDER",
		"BACK",
		"CHEST",
		"WRIST",
		"HANDS",
		"WAIST",
		"LEGS",
		"FEET",
		"FINGER_1",
		"FINGER_2",
		"TRINKET_1",
		"TRINKET_2",
		"RANGED",
	].map((s) => item(s, 32));
	assert.equal(averageItemLevel([...gear, item("SHIRT", 1), item("MAIN_HAND", 33, true)]), 32);
	assert.equal(averageItemLevel([...gear, item("MAIN_HAND", 34)]), 30);
	assert.equal(averageItemLevel([]), undefined);
});

test("quests: Blizzard's ids until the game's quest log is newer", () => {
	const withQuests = { ...blizzard, quests: { syncedAt: LOGIN + 2 * HOUR, ids: [166, 214] } };
	const p = mergeProfile(withQuests, null);
	assert.deepEqual(p.quests, [{ id: 166 }, { id: 214 }]);
	assert.equal(p.sources.quests?.kind, "blizzard");

	const log = {
		capturedAt: LOGIN + 3 * HOUR,
		list: [{ id: 214, title: "Red Silk Bandanas", level: 17, complete: true }],
	};
	const newer = mergeProfile(withQuests, { ...snapshot(LOGIN + 3 * HOUR), quests: log });
	assert.deepEqual(newer.quests, log.list);
	assert.deepEqual(newer.sources.quests, { kind: "addon", at: LOGIN + 3 * HOUR });

	// Played without the app and logged out since: Blizzard's again.
	const older = mergeProfile(withQuests, {
		...snapshot(LOGIN + 3 * HOUR),
		quests: { ...log, capturedAt: LOGIN - HOUR },
	});
	assert.deepEqual(older.quests, [{ id: 166 }, { id: 214 }]);

	// An empty quest log from the game doesn't hide Blizzard's.
	const empty = mergeProfile(withQuests, { ...snapshot(LOGIN + 3 * HOUR), quests: { ...log, list: [] } });
	assert.deepEqual(empty.quests, [{ id: 166 }, { id: 214 }]);

	// Not synced since quests were added: nothing to show yet.
	assert.equal(mergeProfile(blizzard, null).quests, undefined);
});

// ---- The rule matrix -------------------------------------------------------
// Every section goes through `decide`; this covers each case of it, then runs
// each section through mergeProfile with each case, so no section can drift.

const T = 1_000;
const cases: {
	name: string;
	addon?: { at: number; count: number };
	blizzard?: { count: number };
	shown: "addon" | "blizzard" | "none";
	reason: string;
}[] = [
	{ name: "neither", shown: "none", reason: "none" },
	{ name: "addon only", addon: { at: T, count: 2 }, shown: "addon", reason: "only" },
	{ name: "addon only, empty (under 10)", addon: { at: T, count: 0 }, shown: "addon", reason: "only" },
	{ name: "blizzard only", blizzard: { count: 2 }, shown: "blizzard", reason: "only" },
	{ name: "blizzard only, empty", blizzard: { count: 0 }, shown: "blizzard", reason: "only" },
	{ name: "addon newer", addon: { at: T + 1, count: 2 }, blizzard: { count: 3 }, shown: "addon", reason: "newer" },
	{
		name: "blizzard newer",
		addon: { at: T - 1, count: 2 },
		blizzard: { count: 3 },
		shown: "blizzard",
		reason: "newer",
	},
	{
		name: "same time: blizzard",
		addon: { at: T, count: 2 },
		blizzard: { count: 3 },
		shown: "blizzard",
		reason: "newer",
	},
	{
		name: "addon newer but empty",
		addon: { at: T + 1, count: 0 },
		blizzard: { count: 3 },
		shown: "blizzard",
		reason: "other-empty",
	},
	{
		name: "blizzard newer but empty",
		addon: { at: T - 1, count: 2 },
		blizzard: { count: 0 },
		shown: "addon",
		reason: "other-empty",
	},
	{
		name: "both empty, addon newer",
		addon: { at: T + 1, count: 0 },
		blizzard: { count: 0 },
		shown: "addon",
		reason: "both-empty",
	},
	{
		name: "both empty, blizzard newer",
		addon: { at: T - 1, count: 0 },
		blizzard: { count: 0 },
		shown: "blizzard",
		reason: "both-empty",
	},
];

for (const c of cases) {
	test(`decide: ${c.name}`, () => {
		const d = decide(c.addon, c.blizzard && { at: T, count: c.blizzard.count }, T);
		assert.equal(d.shown, c.shown);
		assert.equal(d.reason, c.reason);
	});
}

// Each section built from a case: the addon's and Blizzard's versions with
// `count` entries, recognisable by their source ("addon"/"blizzard").
const gearItem = (src: string) => ({
	slot: "HEAD",
	itemId: 1,
	name: src,
	quality: "COMMON",
	itemLevel: 10,
	tooltip: [],
});
const profession = (src: string, i: number) => ({
	id: 100 + i,
	name: `${src}${i}`,
	skill: 1,
	maxSkill: 75,
	secondary: false,
});
const tree = (points: number) => ({ id: 1, name: "Tree", points, talents: [] });
const sections = {
	gear: {
		addon: (n: number, at: number) => ({
			equipment: { capturedAt: at, items: Array.from({ length: n }, () => gearItem("addon")) },
		}),
		blizzard: (n: number) => ({ equipment: Array.from({ length: n }, () => gearItem("blizzard")) }),
		shown: (p: ReturnType<typeof mergeProfile>) => p.equipment,
		empty: (v: unknown) => Array.isArray(v) && v.length === 0,
	},
	professions: {
		addon: (n: number, at: number) => ({
			professions: { capturedAt: at, list: Array.from({ length: n }, (_, i) => profession("addon", i)) },
		}),
		blizzard: (n: number) => ({ professions: Array.from({ length: n }, (_, i) => profession("blizzard", i)) }),
		shown: (p: ReturnType<typeof mergeProfile>) => p.professions,
		empty: (v: unknown) => Array.isArray(v) && v.length === 0,
	},
	talents: {
		addon: (n: number, at: number) => ({ capturedAt: at, talentTrees: n ? [tree(n)] : [] }),
		blizzard: (n: number) => ({ talentTrees: n ? [tree(n)] : [] }),
		shown: (p: ReturnType<typeof mergeProfile>) => p.talentTrees,
		empty: (v: unknown) => Array.isArray(v) && v.length === 0,
	},
	quests: {
		addon: (n: number, at: number) => ({
			quests: { capturedAt: at, list: Array.from({ length: n }, (_, i) => ({ id: i + 1, title: "addon" })) },
		}),
		blizzard: (n: number) => ({ quests: { syncedAt: T, ids: Array.from({ length: n }, (_, i) => i + 1) } }),
		shown: (p: ReturnType<typeof mergeProfile>) => p.quests,
		empty: (v: unknown) => Array.isArray(v) && v.length === 0,
	},
} as const;

for (const [section, build] of Object.entries(sections)) {
	for (const c of cases) {
		// Talents always come with a snapshot; "no addon" means no snapshot at all.
		test(`${section}: ${c.name}`, () => {
			const character = { level: 20, lastLoginAt: T, ...(c.blizzard ? build.blizzard(c.blizzard.count) : {}) };
			const snap = c.addon
				? {
						capturedAt: section === "talents" ? c.addon.at : 0,
						level: 20,
						talentTrees: [],
						...build.addon(c.addon.count, c.addon.at),
					}
				: null;
			const p = mergeProfile(character, snap);
			const d = p.decisions[section as keyof typeof p.decisions];
			if (section === "talents" && c.addon === undefined && c.blizzard === undefined) {
				assert.equal(d.shown, "none");
				return;
			}
			assert.equal(d.shown, c.shown, "decision");
			const shown = build.shown(p);
			if (c.shown === "none") return assert.ok(shown === undefined || build.empty(shown));
			// The shown value is the chosen source's.
			const expected = c.shown === "addon" ? c.addon!.count : c.blizzard!.count;
			if (expected === 0) return assert.ok(build.empty(shown) || shown === undefined);
			const text = JSON.stringify(shown);
			if (section === "quests" && c.shown === "blizzard") assert.ok(!text.includes("addon"));
			else if (section === "talents") assert.equal((shown as { points: number }[])[0].points, expected);
			else assert.ok(text.includes(c.shown) && !text.includes(c.shown === "addon" ? "blizzard" : "addon"));
			// Never empty while a source has data.
			const anyData = (c.addon?.count ?? 0) > 0 || (c.blizzard?.count ?? 0) > 0;
			if (anyData) assert.ok(!build.empty(shown), "an empty source never hides the other's data");
		});
	}
}

test("recipes: union of both sources, kept only for professions shown", () => {
	const p = mergeProfile(
		{ ...blizzard, lastLoginAt: LOGIN + 10 * HOUR },
		{
			...snapshot(LOGIN),
			recipes: [
				{
					professionId: 197,
					profession: "Tailoring",
					capturedAt: LOGIN,
					recipeIds: [11, 12, 13],
					count: 3,
					unmatched: 0,
				},
				{ professionId: 999, profession: "Gone", capturedAt: LOGIN, recipeIds: [1], count: 1, unmatched: 0 },
			],
		},
	);
	// Blizzard newer: Blizzard's list, with the game's recipes added.
	assert.deepEqual(p.professions.find((x) => x.id === 197)?.knownRecipes, [10, 11, 12, 13]);
	assert.equal(
		p.professions.some((x) => x.id === 999),
		false,
	);
});

test("audit: flags one source empty, and is quiet when the sources agree", () => {
	const clean = auditCharacter({ ...blizzard, slug: "a" }, snapshot(LOGIN + HOUR));
	assert.deepEqual(clean, []);
	const s = { ...snapshot(LOGIN + HOUR), professions: { capturedAt: LOGIN + HOUR, list: [] } };
	const findings = auditCharacter({ ...blizzard, slug: "b" }, s);
	assert.deepEqual(
		findings.map((f) => [f.section, f.problem]),
		[["professions", "addon empty, the other has 2"]],
	);
});
