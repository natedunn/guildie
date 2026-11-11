// Quests: rules the site and the backend share. No Convex imports, so
// `node --test` can run it (quests.test.ts).

/** Quest types worth grouping up for (Blizzard's quest `type`, or the game's tag). */
export const GROUP_TYPES = new Set(["Dungeon", "Raid"]);

export const isGroupQuest = (type: string | undefined) => type !== undefined && GROUP_TYPES.has(type);

export const wowheadQuestUrl = (questId: number) => `https://www.wowhead.com/forever/quest=${questId}`;

/**
 * How the game colors a quest's level for a character (the quest log's
 * colors): red 5+ levels above, orange 3-4 above, yellow within 2, green
 * below that until it's grey (no experience; the classic formula).
 */
export type Difficulty = "impossible" | "hard" | "normal" | "easy" | "trivial";

export function greyLevel(level: number) {
	if (level <= 5) return 0;
	if (level <= 39) return level - Math.floor(level / 10) - 5;
	if (level <= 59) return level - Math.floor(level / 5) - 1;
	return level - 9;
}

export function questDifficulty(questLevel: number, playerLevel: number): Difficulty {
	const diff = questLevel - playerLevel;
	if (diff >= 5) return "impossible";
	if (diff >= 3) return "hard";
	if (diff >= -2) return "normal";
	if (questLevel > greyLevel(playerLevel)) return "easy";
	return "trivial";
}

/** A quest in someone's log, with what's known about it (catalog first, then the game). */
export type KnownQuest = {
	id: number;
	title: string;
	type?: string;
	area?: string;
	level?: number;
};

export type QuestHolder = {
	key: string;
	name: string;
	classId: number;
	level: number;
	mine: boolean;
	quests: KnownQuest[];
};

export type DungeonGroup = {
	area: string;
	type: string;
	quests: { id: number; title: string; level?: number; holders: number }[];
	people: { key: string; name: string; classId: number; level: number; mine: boolean; questIds: number[] }[];
};

/**
 * Dungeon and raid quests across a guild, by dungeon: who has which, so people
 * can see who to group with. Most people first, then by name; in each, your
 * own characters first, then who has the most of its quests.
 */
export function dungeonGroups(holders: QuestHolder[]): DungeonGroup[] {
	const groups = new Map<string, DungeonGroup>();
	for (const h of holders) {
		for (const q of h.quests) {
			if (!isGroupQuest(q.type) || !q.area) continue;
			let g = groups.get(q.area);
			if (!g) groups.set(q.area, (g = { area: q.area, type: q.type ?? "Dungeon", quests: [], people: [] }));
			// A raid quest makes the place a raid.
			if (q.type === "Raid") g.type = "Raid";
			let quest = g.quests.find((x) => x.id === q.id);
			if (!quest) g.quests.push((quest = { id: q.id, title: q.title, level: q.level, holders: 0 }));
			quest.holders++;
			let person = g.people.find((p) => p.key === h.key);
			if (!person) {
				g.people.push(
					(person = { key: h.key, name: h.name, classId: h.classId, level: h.level, mine: h.mine, questIds: [] }),
				);
			}
			if (!person.questIds.includes(q.id)) person.questIds.push(q.id);
		}
	}
	const out = [...groups.values()];
	for (const g of out) {
		g.quests.sort((a, b) => b.holders - a.holders || a.title.localeCompare(b.title));
		g.people.sort(
			(a, b) =>
				Number(b.mine) - Number(a.mine) ||
				b.questIds.length - a.questIds.length ||
				b.level - a.level ||
				a.name.localeCompare(b.name),
		);
	}
	return out.sort((a, b) => b.people.length - a.people.length || a.area.localeCompare(b.area));
}
