import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, type QueryCtx, query } from "./_generated/server";
import { appToken, blizzardGet } from "./blizzard";
import { access } from "./guilds";
import { pickProfile } from "./helper";
import { vRegion } from "./schema";
import { DUNGEON_QUEST_FACTS } from "./shared/dungeonQuests";
import {
	chainIds,
	DUNGEON_BY_KEY,
	DUNGEONS,
	type Dungeon,
	type DungeonQuest,
	forSide,
	type MemberQuests,
	memberStatus,
	questChains,
	questDetails,
	questGroups,
	sideOf,
	withFacts,
} from "./shared/dungeons";
import { QUEST_LEVELS } from "./shared/questLevels";

// A guild's Dungeons page: each dungeon (shared/dungeons.ts) with how many
// members are level ready, quest ready and done with its quests, and its
// detail view (the roster and the quests). It comes from each member's level
// and quests: in their log (Blizzard's profile or the addon's newer read) and
// turned in (Blizzard's completed list, sync.ts). Only the guild's side's
// quests count. Members only, like the rest of the guild's quest data.

// ---- Each dungeon's quests (weekly) ------------------------------------------------

type AreaQuests = { quests?: { id: number }[] };
type QuestRowInput = (typeof internal.quests.save)["_args"]["quests"][number];
type Quest = {
	title?: string;
	type?: { name?: string };
	area?: { name?: string };
	requirements?: {
		level?: number | { min?: number };
		min_character_level?: number;
		classes?: { id: number }[];
		faction?: { type?: string };
	};
	rewards?: Parameters<typeof questDetails>[0]["rewards"];
};

/** Queue every dungeon's quest lookup, a few seconds apart (Blizzard's rate limit). */
export const syncQuests = internalAction({
	args: {},
	handler: async (ctx): Promise<{ queued: number }> => {
		for (const [i, d] of DUNGEONS.entries()) {
			await ctx.scheduler.runAfter(i * 5_000, internal.dungeons.syncDungeon, { key: d.key });
		}
		return { queued: DUNGEONS.length };
	},
});

/**
 * One dungeon: its areas' quests, each looked up; the "Dungeon" ones are its
 * quests. The other steps of their chains (DUNGEON_QUEST_FACTS) are looked
 * up too, for their titles and sides.
 */
export const syncDungeon = internalAction({
	args: { key: v.string() },
	handler: async (ctx, { key }) => {
		const dungeon = DUNGEON_BY_KEY.get(key);
		if (!dungeon) return;
		const token = await appToken(ctx, "us");
		const common = { token, flavor: "forever" as const, region: "us" as const, namespace: "static" as const };
		const areaIds = new Set<number>();
		for (const area of dungeon.areas) {
			const res = await blizzardGet<AreaQuests>({ ...common, path: `/data/wow/quest/area/${area}` });
			if (!res.ok) continue;
			for (const q of res.data.quests ?? []) areaIds.add(q.id);
		}
		const fetched = new Map<number, QuestRowInput>();
		const lookUp = async (questId: number) => {
			try {
				const res = await blizzardGet<Quest>({ ...common, path: `/data/wow/quest/${questId}` });
				if (!res.ok) return;
				const r = res.data.requirements;
				const minLevel = typeof r?.level === "number" ? r.level : (r?.level?.min ?? r?.min_character_level);
				fetched.set(questId, {
					questId,
					title: res.data.title ?? `Quest ${questId}`,
					type: res.data.type?.name,
					area: res.data.area?.name,
					minLevel: minLevel || undefined,
					...questDetails(res.data),
				});
			} catch (e) {
				console.warn(`dungeons: ${key}: quest ${questId}: ${(e as Error).message}`);
			}
		};
		// The area's quests; the ones Blizzard types "Dungeon" are the dungeon's.
		for (const questId of areaIds) await lookUp(questId);
		const dungeonIds = [...fetched.values()].filter((q) => q.type === "Dungeon").map((q) => q.questId);
		// The rest of their chains, for titles and sides: some steps are in the
		// area without being typed "Dungeon" (Unending Torment's later steps).
		const steps = chainIds(dungeonIds).filter((id) => !dungeonIds.includes(id));
		for (const questId of steps) if (!fetched.has(questId)) await lookUp(questId);
		const keep = new Set([...dungeonIds, ...steps]);
		await ctx.runMutation(internal.quests.save, {
			quests: [...fetched.values()].filter((q) => keep.has(q.questId)),
		});
		await ctx.runMutation(internal.dungeons.saveQuests, { key, questIds: dungeonIds });
	},
});

export const saveQuests = internalMutation({
	args: { key: v.string(), questIds: v.array(v.number()) },
	handler: async (ctx, { key, questIds }) => {
		const row = await ctx.db
			.query("dungeonQuests")
			.withIndex("by_key", (q) => q.eq("key", key))
			.unique();
		const value = { key, questIds: [...questIds].sort((a, b) => a - b), syncedAt: Date.now() };
		if (row) await ctx.db.replace(row._id, value);
		else await ctx.db.insert("dungeonQuests", value);
	},
});

// ---- Reading -------------------------------------------------------------------------

const questRow = (ctx: QueryCtx, questId: number) =>
	ctx.db
		.query("quests")
		.withIndex("by_questId", (q) => q.eq("questId", questId))
		.unique();

/** A dungeon's quests the guild's side can take, with the hand-kept facts applied. */
async function dungeonQuests(ctx: QueryCtx, key: string, side: ReturnType<typeof sideOf>) {
	const row = await ctx.db
		.query("dungeonQuests")
		.withIndex("by_key", (q) => q.eq("key", key))
		.unique();
	const out: (DungeonQuest & { minLevel?: number; level?: number })[] = [];
	for (const id of row?.questIds ?? []) {
		const q = await questRow(ctx, id);
		const quest =
			q &&
			withFacts({
				id,
				title: q.title,
				classes: q.classes,
				faction: q.faction,
				minLevel: q.minLevel,
				level: q.level ?? QUEST_LEVELS[id],
			});
		if (quest) out.push(quest);
	}
	return forSide(out, side);
}

type Member = {
	character: Doc<"characters">;
	mine: boolean;
	quests: MemberQuests;
};

/** The guild (if the viewer may see its quests) and each member's level and quests. */
async function membersOf(ctx: QueryCtx, region: Doc<"guilds">["region"], slug: string) {
	const guild = await ctx.db
		.query("guilds")
		.withIndex("by_key", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
		.unique();
	if (!guild) return null;
	if (!(await access(ctx, guild)).isMember) return { hidden: true as const };
	const userId = (await getAuthUserId(ctx)) as Id<"users"> | null;
	const owned = userId
		? await ctx.db
				.query("ownedCharacters")
				.withIndex("by_user", (q) => q.eq("userId", userId))
				.collect()
		: [];
	const ownSlugs = new Set(owned.filter((c) => c.region === region).map((c) => c.slug));
	const characters = await ctx.db
		.query("characters")
		.withIndex("by_guild", (q) => q.eq("guildId", guild._id).eq("inRoster", true))
		.collect();
	const members: Member[] = [];
	for (const c of characters) {
		const profile = await pickProfile(ctx, c);
		const completed = await ctx.db
			.query("completedQuests")
			.withIndex("by_character", (q) => q.eq("characterId", c._id))
			.unique();
		members.push({
			character: c,
			mine: ownSlugs.has(c.slug),
			quests: {
				level: profile.level,
				classId: c.classId,
				inProgress: new Set((profile.quests ?? []).map((q) => q.id)),
				completed: completed ? new Set(completed.ids) : undefined,
			},
		});
	}
	return { hidden: false as const, guild, members, side: sideOf(guild.faction) };
}

/**
 * The Dungeons page: each dungeon with how many members are level ready and
 * quest ready, and each member with the dungeons they have quests in and
 * the ones they've turned all of them in for ("View as").
 */
export const guild = query({
	args: { region: vRegion, slug: v.string() },
	handler: async (ctx, { region, slug }) => {
		const data = await membersOf(ctx, region, slug);
		if (!data || data.hidden) return data;
		const people = data.members.map((m) => ({
			key: m.character.slug,
			name: m.character.name,
			classId: m.character.classId,
			avatarUrl: m.character.avatarUrl,
			level: m.quests.level,
			mine: m.mine,
			/** Their turned-in quests are known (else nothing counts as complete yet). */
			known: m.quests.completed !== undefined,
			/** Dungeons with quests for them, and the ones they've turned them all in for. */
			available: [] as string[],
			complete: [] as string[],
		}));
		const dungeons = [];
		for (const d of DUNGEONS) {
			const quests = await dungeonQuests(ctx, d.key, data.side);
			const groups = questGroups(quests);
			const counts = { levelReady: 0, questReady: 0 };
			for (const [i, m] of data.members.entries()) {
				const s = memberStatus(d, groups, m.quests);
				if (s.levelReady) counts.levelReady++;
				if (s.questReady) counts.questReady++;
				if (s.total > 0) people[i].available.push(d.key);
				if (s.questsCompleted) people[i].complete.push(d.key);
			}
			// The game gives a dungeon one level; its quests for the guild's side say how high it goes.
			const levelMax = Math.max(d.level, ...quests.map((q) => q.level ?? 0));
			dungeons.push({ key: d.key, name: d.name, level: d.level, levelMax, counts });
		}
		return { hidden: false as const, dungeons, people };
	},
});

/** One dungeon: the roster with each member's status, and its quests. */
export const detail = query({
	args: { region: vRegion, slug: v.string(), key: v.string() },
	handler: async (ctx, { region, slug, key }) => {
		const dungeon: Dungeon | undefined = DUNGEON_BY_KEY.get(key);
		if (!dungeon) return null;
		const data = await membersOf(ctx, region, slug);
		if (!data || data.hidden) return data;
		const quests = await dungeonQuests(ctx, key, data.side);
		const groups = questGroups(quests);
		/** Every quest on the page: the dungeon's and the rest of their chains. */
		const pageIds = chainIds(quests.map((q) => q.id));
		const people = data.members
			.map((m) => ({
				key: m.character.slug,
				name: m.character.name,
				classId: m.character.classId,
				avatarUrl: m.character.avatarUrl,
				level: m.quests.level,
				mine: m.mine,
				known: m.quests.completed !== undefined,
				...memberStatus(dungeon, groups, m.quests),
				/** Of the page's quests: turned in, and in their log (for "View as"). */
				questsDone: m.quests.completed ? pageIds.filter((id) => m.quests.completed?.has(id)) : undefined,
				questsInLog: pageIds.filter((id) => m.quests.inProgress.has(id) && !m.quests.completed?.has(id)),
			}))
			.sort(
				(a, b) =>
					Number(b.questsCompleted ?? false) - Number(a.questsCompleted ?? false) ||
					Number(b.questReady) - Number(a.questReady) ||
					Number(b.levelReady) - Number(a.levelReady) ||
					b.level - a.level ||
					a.name.localeCompare(b.name),
			);
		const byId = new Map(quests.map((q) => [q.id, q]));
		const row = (g: (typeof groups)[number]) => ({
			key: g.key,
			id: g.ids[0],
			/** Any of them counts (the same quest listed twice). */
			ids: g.ids,
			title: g.title,
			classes: g.classes,
			level: g.ids.map((id) => byId.get(id)?.level).find((l) => l),
		});
		// Whole chains: the steps outside the dungeon by title and side as Blizzard has them.
		const outside = new Map<number, { title: string; faction?: "alliance" | "horde"; level?: number }>();
		for (const id of pageIds) {
			if (byId.has(id)) continue;
			const q = await questRow(ctx, id);
			if (q) outside.set(id, { title: q.title, faction: q.faction, level: q.level });
		}
		const chains = questChains(groups, data.side, (id) => DUNGEON_QUEST_FACTS[id]?.side ?? outside.get(id)?.faction);
		const inChain = new Set(chains.flatMap((c) => c.flatMap((s) => (s.group ? [s.group] : []))));
		const byKey = new Map(groups.map((g) => [g.key, g]));
		const items = [
			...chains.map((steps) => ({
				kind: "chain" as const,
				steps: steps.map((s) => {
					const g = s.group ? byKey.get(s.group) : undefined;
					return {
						step: s.depth + 1,
						id: s.id,
						ids: g?.ids ?? [s.id],
						title: g?.title ?? outside.get(s.id)?.title ?? `Quest ${s.id}`,
						level: g ? row(g).level : (outside.get(s.id)?.level ?? QUEST_LEVELS[s.id]),
						here: g ? row(g) : undefined,
					};
				}),
			})),
			...groups.filter((g) => !inChain.has(g.key)).map((g) => ({ kind: "quest" as const, ...row(g) })),
		];
		const titleOf = (i: (typeof items)[number]) =>
			i.kind === "quest" ? i.title : (i.steps.find((s) => s.here)?.title ?? "");
		const classOf = (i: (typeof items)[number]) =>
			i.kind === "quest" ? !!i.classes : i.steps.some((s) => s.here?.classes);
		items.sort((a, b) => Number(classOf(a)) - Number(classOf(b)) || titleOf(a).localeCompare(titleOf(b)));
		return {
			hidden: false as const,
			dungeon: { key: dungeon.key, name: dungeon.name, level: dungeon.level },
			quests: groups.length,
			items,
			people: people.map(({ doneKeys, inLogKeys, ...p }) => p),
			/** The guild's side, for the header. */
			side: data.side,
		};
	},
});
