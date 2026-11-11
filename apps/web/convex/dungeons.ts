import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, type QueryCtx, query } from "./_generated/server";
import { appToken, blizzardGet } from "./blizzard";
import { access } from "./guilds";
import { pickProfile } from "./helper";
import { vRegion } from "./schema";
import {
	DUNGEON_BY_KEY,
	DUNGEONS,
	type Dungeon,
	type MemberQuests,
	minLevelFor,
	questDetails,
	type Readiness,
	readiness,
	sideOf,
} from "./shared/dungeons";

// A guild's Dungeons page: each dungeon (shared/dungeons.ts) with who's ready
// for it, and its detail view. Readiness comes from each member's quests: in
// their log (Blizzard's profile or the addon's newer read) and turned in
// (Blizzard's completed list, sync.ts). Members only, like the rest of the
// guild's quest data.

// ---- Each dungeon's quests (weekly) ------------------------------------------------

type AreaQuests = { quests?: { id: number }[] };
type Quest = {
	title?: string;
	type?: { name?: string };
	area?: { name?: string };
	requirements?: { level?: number | { min?: number }; min_character_level?: number; classes?: { id: number }[] };
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

/** One dungeon: its areas' quests, each looked up; the "Dungeon" ones are its quests. */
export const syncDungeon = internalAction({
	args: { key: v.string() },
	handler: async (ctx, { key }) => {
		const dungeon = DUNGEON_BY_KEY.get(key);
		if (!dungeon) return;
		const token = await appToken(ctx, "us");
		const common = { token, flavor: "forever" as const, region: "us" as const, namespace: "static" as const };
		const ids = new Set<number>();
		for (const area of dungeon.areas) {
			const res = await blizzardGet<AreaQuests>({ ...common, path: `/data/wow/quest/area/${area}` });
			if (!res.ok) continue;
			for (const q of res.data.quests ?? []) ids.add(q.id);
		}
		const rows = [];
		for (const questId of ids) {
			try {
				const res = await blizzardGet<Quest>({ ...common, path: `/data/wow/quest/${questId}` });
				if (!res.ok || res.data.type?.name !== "Dungeon") continue;
				const r = res.data.requirements;
				const minLevel = typeof r?.level === "number" ? r.level : (r?.level?.min ?? r?.min_character_level);
				rows.push({
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
		}
		await ctx.runMutation(internal.quests.save, { quests: rows });
		await ctx.runMutation(internal.dungeons.saveQuests, { key, questIds: rows.map((r) => r.questId) });
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

type QuestRow = Doc<"quests">;

async function dungeonQuestRows(ctx: QueryCtx, key: string) {
	const row = await ctx.db
		.query("dungeonQuests")
		.withIndex("by_key", (q) => q.eq("key", key))
		.unique();
	const out: QuestRow[] = [];
	for (const id of row?.questIds ?? []) {
		const q = await ctx.db
			.query("quests")
			.withIndex("by_questId", (x) => x.eq("questId", id))
			.unique();
		if (q) out.push(q);
	}
	return out;
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
				side: sideOf(c.faction ?? guild.faction),
				inProgress: new Set((profile.quests ?? []).map((q) => q.id)),
				completed: completed ? new Set(completed.ids) : undefined,
			},
		});
	}
	return { hidden: false as const, guild, members };
}

const asQuests = (rows: QuestRow[]) => rows.map((q) => ({ id: q.questId, classes: q.classes, faction: q.faction }));

/** The cards: each dungeon with how many members are completed, ready and partly ready. */
export const guild = query({
	args: { region: vRegion, slug: v.string() },
	handler: async (ctx, { region, slug }) => {
		const data = await membersOf(ctx, region, slug);
		if (!data || data.hidden) return data;
		const side = sideOf(data.guild.faction);
		const dungeons = [];
		for (const d of DUNGEONS) {
			const rows = await dungeonQuestRows(ctx, d.key);
			const quests = asQuests(rows);
			const counts: Record<Readiness, number> = { completed: 0, ready: 0, partial: 0, under: 0 };
			const mine: { name: string; status: Readiness }[] = [];
			for (const m of data.members) {
				const r = readiness(d, quests, m.quests);
				counts[r.status]++;
				if (m.mine) mine.push({ name: m.character.name, status: r.status });
			}
			const sideQuests = rows.filter((q) => !q.faction || !side || q.faction === side);
			dungeons.push({
				key: d.key,
				name: d.name,
				level: d.level,
				minLevel: minLevelFor(d),
				bosses: d.bosses.length,
				quests: sideQuests.length,
				classQuests: sideQuests.filter((q) => q.classes?.length).length,
				counts,
				mine,
			});
		}
		return {
			hidden: false as const,
			dungeons,
			members: data.members.length,
			/** Members whose turned-in quests we have (the rest can only be "partly ready"). */
			withCompleted: data.members.filter((m) => m.quests.completed).length,
		};
	},
});

/** One dungeon in full: its bosses, quests and everyone's status. */
export const detail = query({
	args: { region: vRegion, slug: v.string(), key: v.string() },
	handler: async (ctx, { region, slug, key }) => {
		const dungeon: Dungeon | undefined = DUNGEON_BY_KEY.get(key);
		if (!dungeon) return null;
		const data = await membersOf(ctx, region, slug);
		if (!data || data.hidden) return data;
		const side = sideOf(data.guild.faction);
		const rows = (await dungeonQuestRows(ctx, key)).filter((q) => !q.faction || !side || q.faction === side);
		const quests = asQuests(rows);
		const people = data.members
			.map((m) => {
				const r = readiness(dungeon, quests, m.quests);
				return {
					key: m.character.slug,
					name: m.character.name,
					surname: m.character.surname,
					classId: m.character.classId,
					avatarUrl: m.character.avatarUrl,
					level: m.quests.level,
					mine: m.mine,
					known: m.quests.completed !== undefined,
					...r,
				};
			})
			.sort(
				(a, b) =>
					Number(b.mine) - Number(a.mine) ||
					b.done.length + b.inLog.length - (a.done.length + a.inLog.length) ||
					b.level - a.level ||
					a.name.localeCompare(b.name),
			);
		return {
			hidden: false as const,
			dungeon: {
				key: dungeon.key,
				name: dungeon.name,
				level: dungeon.level,
				minLevel: minLevelFor(dungeon),
				bosses: dungeon.bosses,
			},
			quests: rows
				.map((q) => ({
					id: q.questId,
					title: q.title,
					minLevel: q.minLevel,
					level: q.level,
					classes: q.classes,
					faction: q.faction,
					/** Members (in this guild) for whom it's done or in their log. */
					done: people.filter((p) => p.done.includes(q.questId)).length,
					inLog: people.filter((p) => p.inLog.includes(q.questId)).length,
				}))
				.sort((a, b) => Number(!!a.classes) - Number(!!b.classes) || a.title.localeCompare(b.title)),
			people,
		};
	},
});
