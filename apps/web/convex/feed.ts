import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, query } from "./_generated/server";
import { access } from "./guilds";
import { vRegion } from "./schema";

// A guild's feed: what its members did, written as it's noticed.
// - level: the roster sync or an addon upload shows a higher level than the
//   feed has seen (characters.feedLevel). The first sighting only sets the
//   baseline, so nothing old is replayed.
// - dungeon: a dungeon's boss-kill statistic appears (characters.clearedDungeons,
//   from the profile sync); same baseline rule.
// - quests: dungeon quests newly in Blizzard's completed list (profile sync).
// - request, claim, fulfilled: requests.ts.
// Members only, like the guild's other quest and request data.
//
// When: Blizzard's data only says what was true at a character's last logout
// (and we read it minutes to hours later), so events from it are dated at
// that logout (`lastLoginAt`) when we have it. The addon saves the time of
// the level-up itself. Either way the page shows only the day, never a time.

type Character = Pick<Doc<"characters">, "_id" | "guildId" | "slug" | "name" | "classId" | "inRoster" | "feedLevel">;

const who = (c: Pick<Doc<"characters">, "slug" | "name" | "classId">) => ({
	slug: c.slug,
	name: c.name,
	classId: c.classId,
});

/** When an event happened, as well as we know it; `exact`: the game saw it happen (the addon). */
export type When = { at: number; exact: boolean };

/** Blizzard's view: as of the character's last logout, if we have it (never in the future). */
export const blizzardWhen = (lastLoginAt: number | undefined): When => ({
	at: Math.min(Date.now(), lastLoginAt ?? Date.now()),
	exact: false,
});

/**
 * A level the feed hasn't seen: a "level" event (after the baseline). An
 * exact time for a level the roster already reported (the addon's upload
 * comes after Blizzard's) fixes that event's time.
 */
export async function noteLevel(ctx: MutationCtx, c: Character, level: number, when: When) {
	if (c.feedLevel === undefined) {
		await ctx.db.patch(c._id, { feedLevel: level });
		return;
	}
	if (level <= c.feedLevel) {
		if (when.exact && level === c.feedLevel) await fixLevelTime(ctx, c, level, when.at);
		return;
	}
	await ctx.db.patch(c._id, { feedLevel: level });
	if (!c.inRoster) return;
	await ctx.db.insert("feedEvents", {
		guildId: c.guildId,
		at: when.at,
		kind: "level",
		character: who(c),
		level,
		fromLevel: c.feedLevel,
	});
}

async function fixLevelTime(ctx: MutationCtx, c: Character, level: number, at: number) {
	const recent = await ctx.db
		.query("feedEvents")
		.withIndex("by_guild", (q) => q.eq("guildId", c.guildId).gte("at", at - 2 * 86_400_000))
		.order("desc")
		.take(200);
	const event = recent.find((e) => e.kind === "level" && e.level === level && e.character.slug === c.slug);
	if (event && event.at !== at) await ctx.db.patch(event._id, { at });
}

/** Dungeons cleared for the first time (after the baseline read). */
export async function noteClears(
	ctx: MutationCtx,
	c: Character & Pick<Doc<"characters">, "clearedDungeons">,
	cleared: string[],
	when: When,
) {
	const before = c.clearedDungeons;
	const all = [...new Set([...(before ?? []), ...cleared])].sort();
	if (before && all.length === before.length) return;
	await ctx.db.patch(c._id, { clearedDungeons: all });
	if (!before || !c.inRoster) return;
	for (const dungeon of all.filter((k) => !before.includes(k))) {
		await ctx.db.insert("feedEvents", { guildId: c.guildId, at: when.at, kind: "dungeon", character: who(c), dungeon });
	}
}

/** Dungeon quests newly turned in: one event per dungeon. */
export async function noteQuests(ctx: MutationCtx, c: Character, newlyCompleted: number[], when: When) {
	if (!newlyCompleted.length || !c.inRoster) return;
	const fresh = new Set(newlyCompleted);
	for (const row of await ctx.db.query("dungeonQuests").collect()) {
		const questIds = row.questIds.filter((id) => fresh.has(id));
		if (!questIds.length) continue;
		await ctx.db.insert("feedEvents", {
			guildId: c.guildId,
			at: when.at,
			kind: "quests",
			character: who(c),
			dungeon: row.key,
			questIds,
		});
	}
}

/** A request made, claimed or fulfilled. */
export async function noteRequest(
	ctx: MutationCtx,
	kind: "request" | "claim" | "fulfilled",
	r: Pick<Doc<"requests">, "guildId" | "character" | "kind" | "itemId" | "quantity"> & { _id: Id<"requests"> },
	other?: Doc<"requests">["character"],
) {
	await ctx.db.insert("feedEvents", {
		guildId: r.guildId,
		at: Date.now(),
		kind,
		character: r.character,
		requestId: r._id,
		requestKind: r.kind,
		itemId: r.itemId,
		quantity: r.quantity,
		...(other ? { other } : {}),
	});
}

// ---- Reading ---------------------------------------------------------------------

/** The newest events, with what the page shows: avatars, item names and icons, quest titles. */
export const list = query({
	args: { region: vRegion, slug: v.string(), limit: v.optional(v.number()) },
	handler: async (ctx, { region, slug, limit }) => {
		const guild = await ctx.db
			.query("guilds")
			.withIndex("by_key", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
			.unique();
		if (!guild) return null;
		if (!(await access(ctx, guild)).isMember) return { hidden: true as const };
		const take = Math.min(Math.max(limit ?? 100, 1), 300);
		const events = await ctx.db
			.query("feedEvents")
			.withIndex("by_guild", (q) => q.eq("guildId", guild._id))
			.order("desc")
			.take(take + 1);
		const more = events.length > take;
		const shown = events.slice(0, take);

		const avatars = new Map<string, string | undefined>();
		const items = new Map<number, Doc<"items"> | null>();
		const quests = new Map<number, string | undefined>();
		for (const e of shown) {
			for (const c of [e.character, e.other]) {
				if (!c || avatars.has(c.slug)) continue;
				const row = await ctx.db
					.query("characters")
					.withIndex("by_slug", (q) => q.eq("flavor", guild.flavor).eq("region", guild.region).eq("slug", c.slug))
					.first();
				avatars.set(c.slug, row?.avatarUrl);
			}
			if (e.itemId !== undefined && !items.has(e.itemId)) {
				const id = e.itemId;
				items.set(
					id,
					await ctx.db
						.query("items")
						.withIndex("by_itemId", (q) => q.eq("itemId", id))
						.unique(),
				);
			}
			for (const id of e.questIds ?? []) {
				if (quests.has(id)) continue;
				const row = await ctx.db
					.query("quests")
					.withIndex("by_questId", (q) => q.eq("questId", id))
					.unique();
				quests.set(id, row?.title);
			}
		}
		return {
			hidden: false as const,
			more,
			events: shown.map((e) => {
				const item = e.itemId !== undefined ? items.get(e.itemId) : undefined;
				return {
					id: e._id,
					at: e.at,
					kind: e.kind,
					character: { ...e.character, avatarUrl: avatars.get(e.character.slug) },
					other: e.other && { ...e.other, avatarUrl: avatars.get(e.other.slug) },
					level: e.level,
					fromLevel: e.fromLevel,
					dungeon: e.dungeon,
					quests: e.questIds?.map((id) => quests.get(id) ?? `Quest ${id}`),
					requestKind: e.requestKind,
					quantity: e.quantity,
					item:
						e.itemId !== undefined
							? {
									itemId: e.itemId,
									name: item?.name ?? `Item ${e.itemId}`,
									quality: item?.quality,
									icon: item?.icon,
									tooltip: item?.tooltip,
								}
							: undefined,
				};
			}),
		};
	},
});
