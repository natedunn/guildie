import { GENERATED_DUNGEONS, type GeneratedDungeon } from "./dungeons.generated.ts";

// Dungeons: the list (dungeons.generated.ts, from the game's data), which of
// Blizzard's quest areas hold each one's quests, and who in a guild is ready
// for it. No Convex imports, so `node --test` can run it (dungeons.test.ts).

export type Dungeon = GeneratedDungeon & {
	/** Blizzard's quest areas (`/data/wow/quest/area/{id}`) whose "Dungeon" quests are this dungeon's. */
	areas: number[];
};

/**
 * Quest areas per dungeon, by hand: Blizzard names them its own way ("The
 * Stockade"), some places have two (Zul'Farrak, Sunken Temple), and some
 * names are also zones (Dalaran in Alterac, Blackmaw Hold in Felwood).
 */
const AREAS: Record<string, number[]> = {
	"ragefire-chasm": [2437],
	deadmines: [1581],
	"wailing-caverns": [718],
	"shadowfang-keep": [209, 236],
	"blackfathom-deeps": [719],
	stockade: [717],
	gnomeregan: [133, 721],
	"razorfen-kraul": [1717],
	"scarlet-monastery": [796],
	"razorfen-downs": [722],
	uldaman: [1517],
	zulfarrak: [978, 1176],
	maraudon: [2100],
	"sunken-temple": [1417, 1477],
	"blackrock-depths": [1584],
	"blackrock-spire": [1583],
	"dire-maul": [2557],
	stratholme: [2017],
	scholomance: [2057],
	"hall-of-thanes": [16919],
	"ruins-of-lordaeron": [16611],
	"excavation-site-wetlands": [16732],
	"city-of-dalaran": [16544, 16560],
	"drowned-city": [16550],
	"kroldok-stronghold": [16842],
	"alcaz-prison": [16620],
	"blackmaw-hold": [16554],
	"shapers-terrace": [16985],
};

/** Every dungeon, lowest level first. */
export const DUNGEONS: Dungeon[] = GENERATED_DUNGEONS.map((d) => ({ ...d, areas: AREAS[d.key] ?? [] })).sort(
	(a, b) => a.level - b.level || a.name.localeCompare(b.name),
);

export const DUNGEON_BY_KEY = new Map(DUNGEONS.map((d) => [d.key, d]));

/** The card art (scripts/dungeon-art.py puts it there). */
export const dungeonArtUrl = (key: string) => `https://assets.guildie.club/dungeons/${key}.jpg`;

/** Levels below a dungeon's own level that still count as meeting it (Deadmines, 16: from 14). */
export const LEVEL_SLACK = 2;
export const minLevelFor = (d: Pick<Dungeon, "level">) => Math.max(1, d.level - LEVEL_SLACK);

// ---- Quests -----------------------------------------------------------------------

/** Reputations only one side can earn: a quest rewarding one is that side's. */
const ALLIANCE_REPUTATIONS = new Set([72, 47, 69, 54, 730, 890, 509, 930]);
const HORDE_REPUTATIONS = new Set([76, 81, 68, 530, 729, 889, 510, 911]);

export type BlizzardQuestRewards = {
	items?: unknown;
	reputations?: { reward?: { id?: number } }[];
};

/** Every `item.id` in Blizzard's quest rewards, whatever the shape (`choice_of`, `items`). */
function rewardItemIds(value: unknown, out: number[] = []): number[] {
	if (Array.isArray(value)) {
		for (const v of value) rewardItemIds(v, out);
	} else if (value && typeof value === "object") {
		const item = (value as { item?: { id?: unknown } }).item;
		if (item && typeof item.id === "number") {
			if (!out.includes(item.id)) out.push(item.id);
		} else {
			for (const v of Object.values(value)) rewardItemIds(v, out);
		}
	}
	return out;
}

/** Class limits, side and reward items from a quest in Blizzard's data. */
export function questDetails(q: { requirements?: { classes?: { id: number }[] }; rewards?: BlizzardQuestRewards }) {
	const classes = q.requirements?.classes?.map((c) => c.id).filter((id) => typeof id === "number");
	const reps = (q.rewards?.reputations ?? []).map((r) => r.reward?.id).filter((id) => typeof id === "number");
	const alliance = reps.some((id) => ALLIANCE_REPUTATIONS.has(id));
	const horde = reps.some((id) => HORDE_REPUTATIONS.has(id));
	const items = rewardItemIds(q.rewards?.items);
	return {
		...(classes?.length ? { classes } : {}),
		...(alliance !== horde ? { faction: alliance ? ("alliance" as const) : ("horde" as const) } : {}),
		...(items.length ? { rewardItems: items } : {}),
	};
}

export type DungeonQuest = {
	id: number;
	classes?: number[];
	faction?: "alliance" | "horde";
};

/** "ALLIANCE" (Blizzard's faction type) to ours. */
export const sideOf = (faction: string | undefined) =>
	faction?.toUpperCase() === "HORDE" ? ("horde" as const) : faction ? ("alliance" as const) : undefined;

/** The quests a character can do: their class, their side. */
export const questsFor = <Q extends DungeonQuest>(quests: Q[], who: { classId: number; side?: "alliance" | "horde" }) =>
	quests.filter(
		(q) => (!q.classes || q.classes.includes(who.classId)) && (!q.faction || !who.side || q.faction === who.side),
	);

// ---- Who's ready ------------------------------------------------------------------

/**
 * - completed: every quest for them here is turned in (and there's at least one);
 * - ready: meets the level, and every quest for them here is in their log or
 *   turned in (there's no chain data: a quest in the log means its chain is done);
 * - partial: meets the level only;
 * - under: below it.
 */
export type Readiness = "completed" | "ready" | "partial" | "under";

export type MemberQuests = {
	level: number;
	classId: number;
	side?: "alliance" | "horde";
	/** In their quest log now. */
	inProgress: Set<number>;
	/** Turned in; undefined: not known yet (no profile read). */
	completed?: Set<number>;
};

export function readiness(d: Pick<Dungeon, "level">, quests: DungeonQuest[], m: MemberQuests) {
	const theirs = questsFor(quests, m);
	const done = theirs.filter((q) => m.completed?.has(q.id)).map((q) => q.id);
	const inLog = theirs.filter((q) => !m.completed?.has(q.id) && m.inProgress.has(q.id)).map((q) => q.id);
	const missing = theirs.filter((q) => !m.completed?.has(q.id) && !m.inProgress.has(q.id)).map((q) => q.id);
	const levelOk = m.level >= minLevelFor(d);
	let status: Readiness;
	if (theirs.length > 0 && missing.length === 0 && inLog.length === 0) status = "completed";
	else if (levelOk && missing.length === 0) status = "ready";
	else if (levelOk) status = "partial";
	else status = "under";
	return { status, done, inLog, missing, total: theirs.length };
}

// ---- First clears (the feed) -------------------------------------------------------

/** "The Hall of Thanes" and "Hall of Thanes" alike. */
const normal = (name: string) =>
	name
		.toLowerCase()
		.replace(/^the /, "")
		.replace(/[^a-z]/g, "");

const BY_NORMAL_NAME = new Map(DUNGEONS.map((d) => [normal(d.name), d.key]));

/**
 * The dungeon a boss-kill statistic is about ("Edwin VanCleef Kills
 * (Deadmines)", from Blizzard's achievement statistics), or undefined (a
 * raid, or not a kill count).
 */
export function dungeonOfKillStatistic(name: string): string | undefined {
	const match = /kills \(([^)]+)\)\s*$/i.exec(name);
	if (!match) return undefined;
	const place = normal(match[1]);
	const exact = BY_NORMAL_NAME.get(place);
	if (exact) return exact;
	// "Lower Blackrock Spire", "Dire Maul - East"...
	for (const [n, key] of BY_NORMAL_NAME) if (place.includes(n)) return key;
	return undefined;
}

/** The levels a jump crosses that the feed's "every 5 levels" view keeps (25, 30... and 60). */
export const milestoneLevel = (from: number | undefined, to: number) =>
	to >= 60 || Math.floor(to / 5) > Math.floor((from ?? to - 1) / 5);
