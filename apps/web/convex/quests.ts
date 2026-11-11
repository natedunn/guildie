import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type QueryCtx, query } from "./_generated/server";
import { appToken, blizzardGet } from "./blizzard";
import { access, guildsOf } from "./guilds";
import { pickProfile } from "./helper";
import type { QuestProgress } from "./profile";
import { vRegion } from "./schema";
import { dungeonGroups, type KnownQuest } from "./shared/quests";

// Quests in progress: the catalog (title, type, area from Blizzard's static
// data, filled like items.ts), your characters' quest logs (Personal →
// Quests) and dungeon quests across a guild (a guild's Dungeons page).
//
// Who has which quest in progress is public on Blizzard's profiles, so
// guildmates may see it; still, only the guild's own signed-in members get
// these views. Objectives and progress are only shown to the character's own
// player.

// ---- The catalog -----------------------------------------------------------

/** What we know about a quest from elsewhere: the game's quest log, or Blizzard's in-progress list. */
const vHint = v.object({
	questId: v.number(),
	title: v.optional(v.string()),
	type: v.optional(v.string()),
	area: v.optional(v.string()),
	level: v.optional(v.number()),
});

/** A row filled from a hint (Blizzard 404'd) is retried after this long. */
const PARTIAL_RETRY_MS = 7 * 24 * 3600_000;

/** Which of these quests we have no row for (or only a stale partial one). */
export const missing = internalQuery({
	args: { questIds: v.array(v.number()) },
	handler: async (ctx, { questIds }) => {
		const out: number[] = [];
		const now = Date.now();
		for (const questId of new Set(questIds)) {
			const row = await ctx.db
				.query("quests")
				.withIndex("by_questId", (q) => q.eq("questId", questId))
				.unique();
			if (!row || (row.partial && now - row.syncedAt > PARTIAL_RETRY_MS)) out.push(questId);
		}
		return out;
	},
});

/** The game's quest levels for rows that have none (Blizzard's API doesn't say). */
export const learnLevels = internalMutation({
	args: { levels: v.array(v.object({ questId: v.number(), level: v.number() })) },
	handler: async (ctx, { levels }) => {
		for (const { questId, level } of levels) {
			const row = await ctx.db
				.query("quests")
				.withIndex("by_questId", (q) => q.eq("questId", questId))
				.unique();
			if (row && row.level === undefined) await ctx.db.patch(row._id, { level });
		}
	},
});

const BATCH = 20;
const BATCH_STAGGER_MS = 2_000;

/** Look up the given quests we don't have yet, in staggered batches. */
export const ensure = internalAction({
	args: { questIds: v.array(v.number()), hints: v.optional(v.array(vHint)) },
	handler: async (ctx, { questIds, hints }): Promise<{ queued: number }> => {
		const levels = (hints ?? []).flatMap((h) => (h.level ? [{ questId: h.questId, level: h.level }] : []));
		if (levels.length) await ctx.runMutation(internal.quests.learnLevels, { levels });
		const due: number[] = await ctx.runQuery(internal.quests.missing, { questIds });
		const hintOf = new Map((hints ?? []).map((h) => [h.questId, h]));
		for (let i = 0; i < due.length; i += BATCH) {
			const ids = due.slice(i, i + BATCH);
			await ctx.scheduler.runAfter((i / BATCH) * BATCH_STAGGER_MS, internal.quests.syncBatch, {
				questIds: ids,
				hints: ids.map((id) => hintOf.get(id)).filter((h) => h !== undefined),
			});
		}
		return { queued: due.length };
	},
});

type Quest = {
	title?: string;
	type?: { name?: string };
	area?: { name?: string };
	requirements?: { level?: number | { min?: number }; min_character_level?: number };
};

const vQuestRow = v.object({
	questId: v.number(),
	title: v.string(),
	type: v.optional(v.string()),
	area: v.optional(v.string()),
	level: v.optional(v.number()),
	minLevel: v.optional(v.number()),
	partial: v.optional(v.boolean()),
});

export const syncBatch = internalAction({
	args: { questIds: v.array(v.number()), hints: v.optional(v.array(vHint)) },
	handler: async (ctx, { questIds, hints }) => {
		const hintOf = new Map((hints ?? []).map((h) => [h.questId, h]));
		const token = await appToken(ctx, "us");
		const fetched = await Promise.all(
			questIds.map(async (questId) => {
				const hint = hintOf.get(questId);
				try {
					const res = await blizzardGet<Quest>({
						token,
						flavor: "forever",
						region: "us",
						namespace: "static",
						path: `/data/wow/quest/${questId}`,
					});
					if (res.ok) {
						const r = res.data.requirements;
						const minLevel = typeof r?.level === "number" ? r.level : (r?.level?.min ?? r?.min_character_level);
						return {
							questId,
							title: res.data.title ?? hint?.title ?? `Quest ${questId}`,
							type: res.data.type?.name,
							area: res.data.area?.name,
							level: hint?.level,
							minLevel: minLevel || undefined,
						};
					}
				} catch (e) {
					// One failed lookup (a Blizzard hiccup) shouldn't drop the rest of the batch.
					console.warn(`quests: ${questId}: ${(e as Error).message}`);
				}
				// Not in Blizzard's data (or it failed): what the game called it, if we know.
				if (!hint?.title) return null;
				return {
					questId,
					title: hint.title,
					type: hint.type,
					area: hint.area,
					level: hint.level,
					partial: true,
				};
			}),
		);
		await ctx.runMutation(internal.quests.save, { quests: fetched.filter((x) => x !== null) });
	},
});

export const save = internalMutation({
	args: { quests: v.array(vQuestRow) },
	handler: async (ctx, { quests }) => {
		const now = Date.now();
		for (const quest of quests) {
			const existing = await ctx.db
				.query("quests")
				.withIndex("by_questId", (q) => q.eq("questId", quest.questId))
				.unique();
			// Blizzard's data replaces a partial row; a partial row never replaces Blizzard's.
			if (existing && !existing.partial && quest.partial) continue;
			const row = { ...quest, level: quest.level ?? existing?.level, syncedAt: now };
			if (existing) await ctx.db.replace(existing._id, row);
			else await ctx.db.insert("quests", row);
		}
	},
});

/** Every quest in progress on a character or in an uploaded quest log (for the daily backfill). */
export const referencedQuestIds = internalQuery({
	args: {},
	handler: async (ctx) => {
		const ids = new Set<number>();
		for await (const c of ctx.db.query("characters")) {
			for (const id of c.quests?.ids ?? []) ids.add(id);
		}
		for await (const s of ctx.db.query("addonSnapshots")) {
			for (const q of s.quests?.list ?? []) ids.add(q.id);
		}
		return [...ids];
	},
});

/** Daily: look up any quest in progress we still have no row for (or only the game's name). */
export const backfill = internalAction({
	args: {},
	handler: async (ctx): Promise<{ queued: number }> => {
		const questIds: number[] = await ctx.runQuery(internal.quests.referencedQuestIds, {});
		return await ctx.runAction(internal.quests.ensure, { questIds });
	},
});

// ---- What pages read ---------------------------------------------------------

async function catalogOf(ctx: QueryCtx, ids: Iterable<number>) {
	const rows = new Map<number, Doc<"quests">>();
	for (const id of new Set(ids)) {
		const row = await ctx.db
			.query("quests")
			.withIndex("by_questId", (q) => q.eq("questId", id))
			.unique();
		if (row) rows.set(id, row);
	}
	return rows;
}

/** A quest as shown: Blizzard's catalog first, then what the game's quest log said. */
function known(q: QuestProgress, row: Doc<"quests"> | undefined): KnownQuest {
	return {
		id: q.id,
		title: row?.title ?? q.title ?? `Quest ${q.id}`,
		type: row?.type ?? q.tag,
		area: row?.area ?? q.zone,
		level: q.level ?? row?.level,
	};
}

/** Quests on Personal → Quests (ordered by area, then level, then title). */
const byArea = (a: KnownQuest, b: KnownQuest) =>
	(a.area ?? "~").localeCompare(b.area ?? "~") || (a.level ?? 0) - (b.level ?? 0) || a.title.localeCompare(b.title);

/**
 * Personal → Quests: the viewer's characters' quest logs, each quest with
 * the guildmates (in any of the viewer's guilds) who have it in progress too.
 * Null when signed out.
 */
export const mine = query({
	args: {},
	handler: async (ctx) => {
		const userId = (await getAuthUserId(ctx)) as Id<"users"> | null;
		if (!userId) return null;
		const owned = await ctx.db
			.query("ownedCharacters")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		const ownKeys = new Set(owned.map((c) => `${c.region}/${c.slug}`));
		const characters = [];
		const seen = new Set<string>();
		for (const c of owned) {
			const key = `${c.region}/${c.slug}`;
			if (seen.has(key)) continue;
			seen.add(key);
			const row = await ctx.db
				.query("characters")
				.withIndex("by_slug", (q) => q.eq("flavor", c.flavor).eq("region", c.region).eq("slug", c.slug))
				.first();
			const profile = row ? await pickProfile(ctx, row) : null;
			characters.push({
				key,
				region: c.region,
				slug: c.slug,
				name: c.name,
				surname: row?.surname,
				classId: row?.classId ?? c.classId ?? 0,
				level: profile?.level ?? c.level ?? 0,
				avatarUrl: row?.avatarUrl,
				source: profile?.sources.quests,
				/** When Blizzard's list was last fetched (it changes when the character logs out). */
				checkedAt: row?.quests?.syncedAt,
				progress: profile?.quests,
			});
		}

		// Guildmates' quests in progress: questId → who.
		const guilds = await guildsOf(ctx, userId);
		const others = new Map<
			number,
			{ key: string; region: string; slug: string; name: string; classId: number; level: number }[]
		>();
		for (const guild of guilds) {
			const members = await ctx.db
				.query("characters")
				.withIndex("by_guild", (q) => q.eq("guildId", guild._id).eq("inRoster", true))
				.collect();
			for (const m of members) {
				const key = `${m.region}/${m.slug}`;
				if (ownKeys.has(key)) continue;
				const p = await pickProfile(ctx, m);
				for (const q of p.quests ?? []) {
					const list = others.get(q.id) ?? [];
					if (list.some((o) => o.key === key)) continue;
					list.push({ key, region: m.region, slug: m.slug, name: m.name, classId: m.classId, level: p.level });
					others.set(q.id, list);
				}
			}
		}

		const catalog = await catalogOf(
			ctx,
			characters.flatMap((c) => (c.progress ?? []).map((q) => q.id)),
		);
		return {
			characters: characters
				.map(({ progress, ...c }) => ({
					...c,
					quests: progress
						? progress
								.map((q) => ({
									...known(q, catalog.get(q.id)),
									complete: q.complete,
									failed: q.failed,
									objectives: q.objectives,
									others: (others.get(q.id) ?? []).sort((a, b) => b.level - a.level || a.name.localeCompare(b.name)),
								}))
								.sort(byArea)
						: null,
				}))
				.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name)),
			guilds: guilds.map((g) => ({ name: g.name, region: g.region, slug: g.slug })),
		};
	},
});

/**
 * A guild's Dungeons page: dungeon and raid quests its members have in
 * progress, by dungeon, so people can see who to group with. Members only
 * (`{ hidden: true }` for anyone else, even in a public guild).
 */
export const guild = query({
	args: { region: vRegion, slug: v.string() },
	handler: async (ctx, { region, slug }) => {
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
		const members = await ctx.db
			.query("characters")
			.withIndex("by_guild", (q) => q.eq("guildId", guild._id).eq("inRoster", true))
			.collect();
		const logs = [];
		for (const m of members) {
			const p = await pickProfile(ctx, m);
			if (p.quests) logs.push({ member: m, level: p.level, quests: p.quests });
		}
		const catalog = await catalogOf(
			ctx,
			logs.flatMap((l) => l.quests.map((q) => q.id)),
		);
		const dungeons = dungeonGroups(
			logs.map((l) => ({
				key: l.member.slug,
				name: l.member.name,
				classId: l.member.classId,
				level: l.level,
				mine: ownSlugs.has(l.member.slug),
				quests: l.quests.map((q) => known(q, catalog.get(q.id))),
			})),
		);
		return {
			hidden: false as const,
			dungeons,
			/** How many members' quest logs we have (Blizzard's or the game's). */
			withLogs: logs.length,
			members: members.length,
		};
	},
});
