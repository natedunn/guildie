import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, query } from "./_generated/server";
import type { Delivery } from "./addonPayload";
import { access } from "./guilds";
import { vRegion } from "./schema";
import { REACTIONS, type Reaction } from "./shared/reactions";

// A guild's feed: what its members did, written as it's noticed.
// - level: the roster sync or an addon upload shows a higher level than the
//   feed has seen (characters.feedLevel). The first sighting only sets the
//   baseline, so nothing old is replayed.
// - dungeon: a dungeon's boss-kill statistic appears (characters.clearedDungeons,
//   from the profile sync); same baseline rule.
// - quests: dungeon quests newly in Blizzard's completed list (profile sync).
//   Every newly completed quest also counts toward the day (questTurnIns).
// - joined: a roster sync finds a new member, or one who left coming back.
//   Not on a guild's first sync (everyone would be "new").
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

/** A member arrived (sync.applyRoster): a "joined" event, at their level then. */
export async function noteJoined(
	ctx: MutationCtx,
	guildId: Id<"guilds">,
	c: Pick<Doc<"characters">, "slug" | "name" | "classId" | "level">,
	at: number,
) {
	await ctx.db.insert("feedEvents", { guildId, at, kind: "joined", character: who(c), level: c.level });
}

/**
 * Migration: "joined" events for members who arrived before the feed had
 * them (the roster's old "New" tag, from when we first saw the character),
 * skipping each guild's first day (its first roster sync) and anyone who
 * already has one. Safe to run again. Run once per deployment after this
 * deploys: `npx convex run feed:backfillJoined --deployment <name>`.
 */
export const backfillJoined = internalMutation({
	args: {},
	handler: async (ctx): Promise<{ added: number }> => {
		let added = 0;
		for (const guild of await ctx.db.query("guilds").collect()) {
			const members = await ctx.db
				.query("characters")
				.withIndex("by_guild", (q) => q.eq("guildId", guild._id).eq("inRoster", true))
				.collect();
			const joined = members.filter((c) => c._creationTime > guild._creationTime + FIRST_SYNC_MS);
			if (!joined.length) continue;
			const since = Math.min(...joined.map((c) => c._creationTime));
			const existing = new Set(
				(
					await ctx.db
						.query("feedEvents")
						.withIndex("by_guild", (q) => q.eq("guildId", guild._id).gte("at", since))
						.collect()
				)
					.filter((e) => e.kind === "joined")
					.map((e) => e.character.slug),
			);
			for (const c of joined) {
				if (existing.has(c.slug)) continue;
				// Their level then isn't known; the first one the feed saw is closest.
				await noteJoined(ctx, guild._id, { ...c, level: c.feedLevel ?? c.level }, Math.floor(c._creationTime));
				added++;
			}
		}
		return { added };
	},
});

/** A guild's first roster sync happens within this long of adding it: those members aren't "joined". */
const FIRST_SYNC_MS = 86_400_000;

async function fixLevelTime(ctx: MutationCtx, c: Character, level: number, at: number) {
	const recent = await ctx.db
		.query("feedEvents")
		.withIndex("by_guild", (q) => q.eq("guildId", c.guildId).gte("at", at - 2 * 86_400_000))
		.order("desc")
		.take(200);
	const event = recent.find((e) => e.kind === "level" && e.level === level && e.character.slug === c.slug);
	if (!event || event.at === at) return;
	await ctx.db.patch(event._id, { at });
	// Reactions copy the event's time (feed.list reads them by it).
	const reactions = await ctx.db
		.query("feedReactions")
		.withIndex("by_guild", (q) => q.eq("guildId", c.guildId).eq("eventAt", event.at))
		.collect();
	for (const r of reactions) if (r.eventId === event._id) await ctx.db.patch(r._id, { eventAt: at });
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

/**
 * More newly completed quests than this in one sync is Blizzard's list
 * filling in (an earlier partial read), not a day's play: not counted.
 */
const MAX_TURN_INS = 300;

/** Quests newly turned in: the daily count (any quest), and one event per dungeon for dungeon quests. */
export async function noteQuests(ctx: MutationCtx, c: Character, newlyCompleted: number[], when: When) {
	if (!newlyCompleted.length || !c.inRoster) return;
	if (newlyCompleted.length <= MAX_TURN_INS) {
		await ctx.db.insert("questTurnIns", {
			guildId: c.guildId,
			characterId: c._id,
			at: when.at,
			count: newlyCompleted.length,
		});
	}
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
	r: Pick<Doc<"requests">, "guildId" | "character" | "kind" | "itemId" | "quantity" | "ongoing"> & {
		_id: Id<"requests">;
	},
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
		...(r.ongoing ? { ongoing: true } : { quantity: r.quantity }),
		...(other ? { other } : {}),
	});
}

/** One recipient-confirmed contribution; called atomically with the deduplication ledger. */
export async function noteDelivery(
	ctx: MutationCtx,
	request: Doc<"requests">,
	event: Delivery,
	recipient: Doc<"requests">["character"],
	sender: { name: string; slug?: string; classId?: number },
	completed: boolean,
) {
	await ctx.db.insert("feedEvents", {
		guildId: request.guildId,
		at: Math.min(event.at, Date.now()),
		kind: "delivery",
		character: recipient,
		otherName: sender.name,
		...(sender.slug !== undefined && sender.classId !== undefined
			? { other: { name: sender.name, slug: sender.slug, classId: sender.classId } }
			: {}),
		requestId: request._id,
		requestKind: request.kind,
		itemId: event.itemId,
		quantity: event.quantity,
		deliveryMethod: event.kind === "mailReceived" ? "mail" : "trade",
		requestCompleted: completed,
	});
}

// ---- Reading ---------------------------------------------------------------------

/**
 * The sidebar's count next to Feed: events since `since` (the start of the
 * viewer's feed day, 4am their time). Members only; null for anyone else.
 */
export const today = query({
	args: { region: vRegion, slug: v.string(), since: v.number() },
	handler: async (ctx, { region, slug, since }) => {
		const guild = await ctx.db
			.query("guilds")
			.withIndex("by_key", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
			.unique();
		if (!guild || !(await access(ctx, guild)).isMember) return null;
		const events = await ctx.db
			.query("feedEvents")
			.withIndex("by_guild", (q) => q.eq("guildId", guild._id).gte("at", since))
			.take(100);
		return events.length;
	},
});

/** Leaders each stat card's hover lists (it says how many more there are). */
const LEADERS = 4;
/** Days one `days` call sums up at most. */
const MAX_DAYS = 31;

type Who = { slug?: string; name: string; classId?: number; avatarUrl?: string };

/**
 * The feed's daily stat cards: for each day asked (`since` to `until`, the
 * viewer's feed days, 4am to 4am), items members sent each other, levels
 * gained and quests completed, each with its leaders (who sent, leveled or
 * quested most) and how many players there were.
 */
export const days = query({
	args: {
		region: vRegion,
		slug: v.string(),
		days: v.array(v.object({ since: v.number(), until: v.number() })),
	},
	handler: async (ctx, args) => {
		const guild = await ctx.db
			.query("guilds")
			.withIndex("by_key", (q) => q.eq("flavor", "forever").eq("region", args.region).eq("slug", args.slug))
			.unique();
		if (!guild || !(await access(ctx, guild)).isMember) return null;
		const ranges = args.days.slice(0, MAX_DAYS);
		if (!ranges.length) return [];
		const from = Math.min(...ranges.map((d) => d.since));
		const to = Math.max(...ranges.map((d) => d.until));
		const events = await ctx.db
			.query("feedEvents")
			.withIndex("by_guild", (q) => q.eq("guildId", guild._id).gte("at", from).lt("at", to))
			.take(5000);
		const turnIns = await ctx.db
			.query("questTurnIns")
			.withIndex("by_guild", (q) => q.eq("guildId", guild._id).gte("at", from).lt("at", to))
			.take(5000);

		// Portraits, read once per character.
		const avatars = new Map<string, string | undefined>();
		const person = async (c: { slug: string; name: string; classId: number }): Promise<Who> => {
			if (!avatars.has(c.slug)) {
				const row = await ctx.db
					.query("characters")
					.withIndex("by_slug", (q) => q.eq("flavor", guild.flavor).eq("region", guild.region).eq("slug", c.slug))
					.first();
				avatars.set(c.slug, row?.avatarUrl);
			}
			return { slug: c.slug, name: c.name, classId: c.classId, avatarUrl: avatars.get(c.slug) };
		};
		const characters = new Map<Id<"characters">, Doc<"characters"> | null>();

		const out = [];
		for (const range of ranges) {
			const inDay = (at: number) => at >= range.since && at < range.until;
			const dayEvents = events.filter((e) => inDay(e.at));

			// Items sent: confirmed deliveries, plus requests marked fulfilled by
			// hand that had no confirmed delivery that day.
			const delivered = new Set<Id<"requests">>();
			for (const e of dayEvents) if (e.kind === "delivery" && e.requestId) delivered.add(e.requestId);
			let items = 0;
			const senders = new Map<string, { who: Who; quantity: number }>();
			for (const e of dayEvents) {
				const sent =
					e.kind === "delivery" ||
					(e.kind === "fulfilled" && !e.ongoing && !(e.requestId && delivered.has(e.requestId)));
				if (!sent) continue;
				const quantity = e.quantity ?? 1;
				items += quantity;
				const who = e.other ? await person(e.other) : e.otherName ? { name: e.otherName } : undefined;
				if (!who) continue;
				const key = who.slug ?? `name:${who.name}`;
				const sender = senders.get(key) ?? { who, quantity: 0 };
				sender.quantity += quantity;
				senders.set(key, sender);
			}

			// Levels: each character's lowest "from" to highest level that day.
			let levels = 0;
			const leveled = new Map<string, { who: Who; from: number; to: number }>();
			for (const e of dayEvents) {
				if (e.kind !== "level" || e.level === undefined) continue;
				const fromLevel = e.fromLevel ?? e.level - 1;
				levels += Math.max(e.level - fromLevel, 0);
				const seen = leveled.get(e.character.slug);
				if (seen) {
					seen.from = Math.min(seen.from, fromLevel);
					seen.to = Math.max(seen.to, e.level);
				} else leveled.set(e.character.slug, { who: await person(e.character), from: fromLevel, to: e.level });
			}

			// Quests: every newly completed quest (questTurnIns), by character.
			let quests = 0;
			const byCharacter = new Map<Id<"characters">, number>();
			for (const t of turnIns) {
				if (!inDay(t.at)) continue;
				quests += t.count;
				byCharacter.set(t.characterId, (byCharacter.get(t.characterId) ?? 0) + t.count);
			}
			const questers: { who: Who; count: number }[] = [];
			for (const [id, count] of [...byCharacter].sort((a, b) => b[1] - a[1]).slice(0, LEADERS)) {
				if (!characters.has(id)) characters.set(id, await ctx.db.get(id));
				const c = characters.get(id);
				if (c) questers.push({ who: await person(c), count });
			}

			out.push({
				since: range.since,
				items: {
					total: items,
					players: senders.size,
					leaders: [...senders.values()].sort((a, b) => b.quantity - a.quantity).slice(0, LEADERS),
				},
				levels: {
					total: levels,
					players: leveled.size,
					leaders: [...leveled.values()]
						.sort((a, b) => b.to - b.from - (a.to - a.from) || b.to - a.to)
						.slice(0, LEADERS),
				},
				quests: { total: quests, players: byCharacter.size, leaders: questers },
			});
		}
		return out;
	},
});

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

		// Reactions to what's shown, by event; the viewer's own marked.
		const viewer = await getAuthUserId(ctx);
		const oldest = shown.at(-1)?.at ?? 0;
		const reactionRows = await ctx.db
			.query("feedReactions")
			.withIndex("by_guild", (q) => q.eq("guildId", guild._id).gte("eventAt", oldest))
			.take(5000);
		const reactions = new Map<
			Id<"feedEvents">,
			{ reaction: Reaction; character: Doc<"feedReactions">["character"]; mine: boolean }[]
		>();
		for (const r of reactionRows) {
			if (!REACTIONS.includes(r.reaction)) continue;
			const list = reactions.get(r.eventId) ?? [];
			list.push({ reaction: r.reaction, character: r.character, mine: r.userId === viewer });
			reactions.set(r.eventId, list);
		}

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
					reactions: reactions.get(e._id) ?? [],
					kind: e.kind,
					character: { ...e.character, avatarUrl: avatars.get(e.character.slug) },
					other: e.other && { ...e.other, avatarUrl: avatars.get(e.other.slug) },
					level: e.level,
					fromLevel: e.fromLevel,
					dungeon: e.dungeon,
					quests: e.questIds?.map((id) => quests.get(id) ?? `Quest ${id}`),
					requestKind: e.requestKind,
					quantity: e.quantity,
					ongoing: e.ongoing,
					otherName: e.otherName,
					deliveryMethod: e.deliveryMethod,
					requestCompleted: e.requestCompleted,
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
