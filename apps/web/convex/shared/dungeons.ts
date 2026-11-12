import { DUNGEON_QUEST_FACTS, STARTS_INSIDE } from "./dungeonQuests.ts";
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

/**
 * Class limits, side and reward items from a quest in Blizzard's data. The
 * side is Blizzard's `requirements.faction` (Forever's own quests have it),
 * else the side whose reputations it rewards.
 */
export function questDetails(q: {
	requirements?: { classes?: { id: number }[]; faction?: { type?: string } };
	rewards?: BlizzardQuestRewards;
}) {
	const classes = q.requirements?.classes?.map((c) => c.id).filter((id) => typeof id === "number");
	const reps = (q.rewards?.reputations ?? []).map((r) => r.reward?.id).filter((id) => typeof id === "number");
	const alliance = reps.some((id) => ALLIANCE_REPUTATIONS.has(id));
	const horde = reps.some((id) => HORDE_REPUTATIONS.has(id));
	const stated = sideOf(q.requirements?.faction?.type);
	const items = rewardItemIds(q.rewards?.items);
	return {
		...(classes?.length ? { classes } : {}),
		...(stated
			? { faction: stated }
			: alliance !== horde
				? { faction: alliance ? ("alliance" as const) : ("horde" as const) }
				: {}),
		...(items.length ? { rewardItems: items } : {}),
	};
}

export type Side = "alliance" | "horde";

/** "ALLIANCE" (Blizzard's faction type) to ours. */
export const sideOf = (faction: string | undefined): Side | undefined =>
	faction?.toUpperCase() === "HORDE" ? "horde" : faction ? "alliance" : undefined;

/** A dungeon quest as the page knows it: Blizzard's data with DUNGEON_QUEST_FACTS on top. */
export type DungeonQuest = {
	id: number;
	title: string;
	classes?: number[];
	faction?: Side;
	/** The quest before it in its chain. */
	after?: number;
};

/** The quests that may come right before one in its chain (any one will do). */
export function afterOf(id: number): number[] {
	const after = DUNGEON_QUEST_FACTS[id]?.after;
	return after === undefined ? [] : Array.isArray(after) ? after : [after];
}

/** Blizzard's quest row with the hand-kept facts applied; undefined if it isn't in the game. */
export function withFacts<Q extends DungeonQuest>(q: Q): Q | undefined {
	const facts = DUNGEON_QUEST_FACTS[q.id];
	if (facts?.hidden) return undefined;
	return { ...q, faction: facts?.side ?? q.faction, after: afterOf(q.id)[0] ?? q.after };
}

/** The quests a side can take. */
export const forSide = <Q extends DungeonQuest>(quests: Q[], side: Side | undefined) =>
	quests.filter((q) => !q.faction || !side || q.faction === side);

/**
 * One row on the page: quests with the same title, classes and side are one
 * (Blizzard lists some twice, and some chains repeat a title); any of its ids
 * counts.
 */
export type QuestGroup = {
	key: string;
	ids: number[];
	title: string;
	classes?: number[];
	faction?: Side;
	/** The group in this dungeon it comes after (nested under it). */
	parent?: string;
	/** The quest outside the dungeon it comes after. */
	after?: number;
	/** How deep it's nested (0: not after another of the dungeon's). */
	depth: number;
	/** Picked up inside the dungeon (STARTS_INSIDE), so not before going in. */
	startsInside?: true;
};

/** The dungeon's quests as rows, each chain's later steps under the one before, in display order. */
export function questGroups(quests: DungeonQuest[]): QuestGroup[] {
	const groups = new Map<string, QuestGroup>();
	const groupOf = new Map<number, QuestGroup>();
	for (const q of [...quests].sort((a, b) => a.id - b.id)) {
		const key = `${q.title}|${q.classes?.join(",") ?? ""}|${q.faction ?? ""}`;
		let g = groups.get(key);
		if (!g) {
			g = { key: String(q.id), ids: [], title: q.title, classes: q.classes, faction: q.faction, depth: 0 };
			groups.set(key, g);
		}
		g.ids.push(q.id);
		if (STARTS_INSIDE.has(q.id)) g.startsInside = true;
		groupOf.set(q.id, g);
	}
	for (const q of quests) {
		if (q.after === undefined) continue;
		const g = groupOf.get(q.id);
		const before = groupOf.get(q.after);
		if (!g || before === g) continue;
		if (before) g.parent ??= before.key;
		else if (!g.parent) g.after ??= q.after;
	}
	const all = [...groups.values()];
	const byKey = new Map(all.map((g) => [g.key, g]));
	// A chain that loops back on itself (bad data) is cut where it loops.
	for (const g of all) {
		const seen = new Set([g.key]);
		for (let p = g.parent; p; p = byKey.get(p)?.parent) {
			if (seen.has(p)) {
				g.parent = undefined;
				break;
			}
			seen.add(p);
		}
		if (g.parent) g.after = undefined;
	}
	// A later step of a class's chain is that class's too (Blizzard often only limits the first).
	const classesOf = (g: QuestGroup): number[] | undefined =>
		g.classes ?? (g.parent ? classesOf(byKey.get(g.parent) as QuestGroup) : undefined);
	for (const g of all) g.classes = classesOf(g);
	// Roots: everyone's quests first, then class quests; by title. Each followed by its chain.
	const order = (a: QuestGroup, b: QuestGroup) =>
		Number(!!a.classes) - Number(!!b.classes) || a.title.localeCompare(b.title);
	const out: QuestGroup[] = [];
	const visit = (g: QuestGroup, depth: number) => {
		out.push({ ...g, depth });
		for (const c of all.filter((x) => x.parent === g.key).sort(order)) visit(c, depth + 1);
	};
	for (const g of all.filter((x) => !x.parent).sort(order)) visit(g, 0);
	return out;
}

// ---- Whole chains ---------------------------------------------------------------

/** Quest id -> the quests that come right after it (DUNGEON_QUEST_FACTS). */
const NEXT = new Map<number, number[]>();
for (const id of Object.keys(DUNGEON_QUEST_FACTS).map(Number)) {
	for (const before of afterOf(id)) NEXT.set(before, [...(NEXT.get(before) ?? []), id]);
}

/**
 * Every quest in the chains these quests are part of, any side: what the
 * page needs looked up (titles, sides). The dungeon's own ids included.
 */
export function chainIds(ids: number[]): number[] {
	const out = new Set<number>(ids);
	const walk = (id: number, step: (id: number) => number[]) => {
		for (const next of step(id)) {
			if (out.has(next) || DUNGEON_QUEST_FACTS[next]?.hidden) continue;
			out.add(next);
			walk(next, step);
		}
	};
	for (const id of ids) {
		walk(id, afterOf);
		walk(id, (x) => NEXT.get(x) ?? []);
	}
	return [...out];
}

/** One step of a chain: a quest outside the dungeon, or one of the dungeon's rows (`group`). */
export type ChainStep = { id: number; depth: number; group?: string };

/**
 * The whole chains the dungeon's quests (`groups`, already the guild's
 * side) are part of, from the first step to the last, for `side`. A chain
 * that branches lists each branch after its step. Quests in no chain aren't
 * in any. `sideOfQuest`: a quest's side as the backend knows it (facts, else
 * Blizzard's).
 */
export function questChains(
	groups: QuestGroup[],
	side: Side | undefined,
	sideOfQuest: (id: number) => Side | undefined,
): ChainStep[][] {
	const groupOf = new Map<number, QuestGroup>();
	for (const g of groups) for (const id of g.ids) groupOf.set(id, g);
	const ok = (id: number) => {
		if (groupOf.has(id)) return true;
		if (DUNGEON_QUEST_FACTS[id]?.hidden) return false;
		const s = sideOfQuest(id);
		return !s || !side || s === side;
	};
	// A node is a group's key or an outside quest's id.
	const nodeOf = (id: number) => (groupOf.has(id) ? `g${groupOf.get(id)?.key}` : `q${id}`);
	const idsOf = (node: string) =>
		node[0] === "g" ? (groups.find((g) => `g${g.key}` === node)?.ids ?? []) : [Number(node.slice(1))];
	const before = (node: string) => {
		for (const id of idsOf(node)) {
			const prev = afterOf(id).find((p) => ok(p) && nodeOf(p) !== node);
			if (prev !== undefined) return nodeOf(prev);
		}
		return undefined;
	};
	const after = (node: string) => {
		const out: string[] = [];
		for (const id of idsOf(node)) {
			for (const next of NEXT.get(id) ?? []) {
				const n = nodeOf(next);
				if (ok(next) && n !== node && !out.includes(n) && before(n) === node) out.push(n);
			}
		}
		return out;
	};
	const chains: ChainStep[][] = [];
	const placed = new Set<string>();
	for (const g of groups) {
		let root = `g${g.key}`;
		if (placed.has(root)) continue;
		const seen = new Set([root]);
		for (let p = before(root); p && !seen.has(p); p = before(p)) {
			seen.add(p);
			root = p;
		}
		const steps: ChainStep[] = [];
		const visit = (node: string, depth: number) => {
			if (placed.has(node)) return;
			placed.add(node);
			const id = idsOf(node)[0];
			steps.push({ id, depth, ...(node[0] === "g" ? { group: node.slice(1) } : {}) });
			for (const next of after(node)) visit(next, depth + 1);
		};
		visit(root, 0);
		if (steps.length > 1) chains.push(steps);
	}
	return chains;
}

export type MemberQuests = {
	level: number;
	classId: number;
	/** In their quest log now. */
	inProgress: Set<number>;
	/** Turned in; undefined: not known yet (no profile read). */
	completed?: Set<number>;
};

/**
 * Where someone stands on a dungeon:
 * - levelReady: at least the dungeon's level;
 * - questReady: every quest of theirs they can pick up before going in (not
 *   the later steps of a chain inside it, nor quests that start inside) is
 *   in their log or done;
 * - questsCompleted: every quest of theirs is turned in (undefined when their
 *   turned-in quests aren't known).
 * A dungeon with no quests for them is never quest ready or completed.
 */
export function memberStatus(d: Pick<Dungeon, "level">, groups: QuestGroup[], m: MemberQuests) {
	const theirs = groups.filter((g) => !g.classes || g.classes.includes(m.classId));
	const keys = new Set(theirs.map((g) => g.key));
	// What they can have before going in: not a chain's later steps, not quests that start inside.
	const toPickUp = theirs.filter((g) => (!g.parent || !keys.has(g.parent)) && !g.startsInside);
	const isDone = (g: QuestGroup) => g.ids.some((id) => m.completed?.has(id));
	const inLog = (g: QuestGroup) => !isDone(g) && g.ids.some((id) => m.inProgress.has(id));
	const missing = toPickUp.filter((g) => !isDone(g) && !inLog(g));
	const done = theirs.filter(isDone);
	return {
		levelReady: m.level >= d.level,
		questReady: toPickUp.length > 0 && missing.length === 0,
		questsCompleted: m.completed ? theirs.length > 0 && done.length === theirs.length : undefined,
		/** Quests to pick up before going in, and how many they have. */
		toPickUp: toPickUp.length,
		pickedUp: toPickUp.length - missing.length,
		/** All their quests here, and how many are turned in. */
		total: theirs.length,
		done: done.length,
		/** Titles, for hover text. */
		missing: missing.map((g) => g.title),
		/** Group keys, for the quest list's counts. */
		doneKeys: done.map((g) => g.key),
		inLogKeys: theirs.filter(inLog).map((g) => g.key),
	};
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
