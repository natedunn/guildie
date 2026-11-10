import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";
import { itemRow } from "./guilds";
import { pickProfile } from "./helper";
import { vRegion } from "./schema";
import {
	ACTIVE,
	type Action,
	check,
	EXPIRE_MS,
	isStale,
	matsCheck,
	matsState,
	nextStatus,
	rosterCharacters,
	shouldExpire,
	validateNew,
} from "./shared/requests";

// Guild requests (rules: shared/requests.ts). Only signed-in members of the
// guild (a claimed character in its roster) see or act on them, whatever the
// guild's visibility. The inventory scan behind the mats check is private:
// only the requester ever sees counts, and only for their own requests.

/** The requester's closed requests stay in "Mine" this long. */
const RECENT_CLOSED_MS = 14 * 86_400_000;

type Ctx = QueryCtx | MutationCtx;

async function guildByKey(ctx: Ctx, region: Doc<"guilds">["region"], slug: string) {
	return await ctx.db
		.query("guilds")
		.withIndex("by_key", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
		.unique();
}

async function recipeRow(ctx: Ctx, recipeId: number) {
	return await ctx.db
		.query("recipes")
		.withIndex("by_recipeId", (q) => q.eq("recipeId", recipeId))
		.unique();
}

/** The user's claimed characters that are in this guild's roster now. */
async function charactersIn(ctx: Ctx, userId: Id<"users">, guildId: Id<"guilds">) {
	const owned = await ctx.db
		.query("ownedCharacters")
		.withIndex("by_user", (q) => q.eq("userId", userId))
		.collect();
	const rows = await Promise.all(
		owned.map((c) =>
			ctx.db
				.query("characters")
				.withIndex("by_slug", (q) => q.eq("flavor", c.flavor).eq("region", c.region).eq("slug", c.slug))
				.first(),
		),
	);
	return rosterCharacters(rows, guildId).sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
}

/** The signed-in viewer as a member of this guild, or null (signed out, or no character in it). */
async function membership(ctx: Ctx, guild: Doc<"guilds">) {
	const userId = (await getAuthUserId(ctx)) as Id<"users"> | null;
	if (!userId) return null;
	const characters = await charactersIn(ctx, userId, guild._id);
	return characters.length ? { userId, characters } : null;
}

async function requireMember(ctx: Ctx, guild: Doc<"guilds">) {
	const member = await membership(ctx, guild);
	if (!member) throw new ConvexError("Only this guild's members can do that. Claim your character first.");
	return member;
}

/** Recipe ids each of these characters knows (with the addon's newer reads). */
async function knownRecipes(ctx: Ctx, characters: Doc<"characters">[]) {
	const out = new Map<Id<"characters">, Set<number>>();
	for (const c of characters) {
		const profile = await pickProfile(ctx, c);
		out.set(c._id, new Set(profile.professions.flatMap((p) => p.knownRecipes ?? [])));
	}
	return out;
}

const brief = (c: Pick<Doc<"characters">, "slug" | "name" | "classId">) => ({
	slug: c.slug,
	name: c.name,
	classId: c.classId,
});

/** The player's inventory scans, every claimed character. Private. */
async function scansOf(ctx: Ctx, userId: Id<"users">) {
	return await ctx.db
		.query("inventories")
		.withIndex("by_user", (q) => q.eq("userId", userId))
		.collect();
}

async function activeIn(ctx: Ctx, guildId: Id<"guilds">) {
	const lists = await Promise.all(
		ACTIVE.map((status) =>
			ctx.db
				.query("requests")
				.withIndex("by_guild_status", (q) => q.eq("guildId", guildId).eq("status", status))
				.collect(),
		),
	);
	return lists.flat();
}

async function activeOf(ctx: Ctx, userId: Id<"users">) {
	const lists = await Promise.all(
		ACTIVE.map((status) =>
			ctx.db
				.query("requests")
				.withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", status))
				.collect(),
		),
	);
	return lists.flat();
}

type ItemCache = Map<number, Doc<"items"> | null>;
async function cachedItem(ctx: Ctx, items: ItemCache, itemId: number) {
	if (!items.has(itemId)) items.set(itemId, await itemRow(ctx, itemId));
	return items.get(itemId) ?? null;
}

/** A request as the page shows it to `viewer`. */
async function view(
	ctx: QueryCtx,
	r: Doc<"requests">,
	viewer: { userId: Id<"users">; known: Set<number> },
	items: ItemCache,
	scans: () => Promise<Doc<"inventories">[]>,
	now: number,
) {
	const item = r.itemId !== undefined ? await cachedItem(ctx, items, r.itemId) : null;
	const recipe = r.recipeId !== undefined ? await recipeRow(ctx, r.recipeId) : null;
	const mine = r.userId === viewer.userId;
	const reagents = recipe
		? await Promise.all(
				recipe.reagents.map(async (x) => {
					const known = await cachedItem(ctx, items, x.itemId);
					return { ...x, icon: known?.icon, quality: known?.quality };
				}),
			)
		: [];
	const active = r.status === "open" || r.status === "claimed";
	// Have/need per reagent: the requester only, while it's open.
	const check =
		mine && r.kind === "craft" && recipe && r.status === "open"
			? matsCheck(recipe.reagents, r.quantity, await scans())
			: undefined;
	return {
		_id: r._id,
		kind: r.kind,
		status: r.status,
		quantity: r.quantity,
		note: r.note,
		item: item
			? { itemId: item.itemId, name: item.name, quality: item.quality, icon: item.icon, tooltip: item.tooltip }
			: r.itemId !== undefined
				? { itemId: r.itemId, name: `Item ${r.itemId}`, quality: "COMMON", icon: undefined, tooltip: [] }
				: null,
		recipe: recipe ? { recipeId: recipe.recipeId, name: recipe.name, profession: recipe.profession, reagents } : null,
		requester: r.character,
		mine,
		claim: r.claim
			? {
					character: r.claim.character,
					claimedAt: r.claim.claimedAt,
					sentAt: r.claim.sentAt,
					mine: r.claim.userId === viewer.userId,
				}
			: null,
		mats: r.mats ? { state: r.mats.state, declared: r.mats.declared } : null,
		matsCheck: check && {
			reagents: check.reagents,
			scanned: check.scanned,
			bagsAt: check.bagsAt,
			bankAt: check.bankAt,
			covered: check.covered,
		},
		createdAt: r.createdAt,
		lastActivityAt: r.lastActivityAt,
		closedAt: r.closedAt,
		stale: isStale(r, now),
		canClaim:
			active &&
			r.status === "open" &&
			!mine &&
			(r.kind === "item" || (r.recipeId !== undefined && viewer.known.has(r.recipeId))),
	};
}

/**
 * The Requests page: the guild's open and claimed requests, plus the
 * viewer's own recently closed ones. Null for anyone who isn't a member.
 */
export const list = query({
	args: { region: vRegion, slug: v.string() },
	handler: async (ctx, { region, slug }) => {
		const guild = await guildByKey(ctx, region, slug);
		if (!guild) return null;
		const member = await membership(ctx, guild);
		if (!member) return { member: false as const };
		const now = Date.now();
		const known = new Set([...(await knownRecipes(ctx, member.characters)).values()].flatMap((s) => [...s]));
		const rows = await activeIn(ctx, guild._id);
		for (const status of ["done", "cancelled", "expired"] as const) {
			const closed = await ctx.db
				.query("requests")
				.withIndex("by_user_status", (q) => q.eq("userId", member.userId).eq("status", status))
				.order("desc")
				.take(50);
			rows.push(...closed.filter((r) => r.guildId === guild._id && now - (r.closedAt ?? 0) < RECENT_CLOSED_MS));
		}
		const items: ItemCache = new Map();
		let scans: Doc<"inventories">[] | undefined;
		const lazyScans = async () => (scans ??= await scansOf(ctx, member.userId));
		const out = [];
		for (const r of rows) out.push(await view(ctx, r, { userId: member.userId, known }, items, lazyScans, now));
		out.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
		return {
			member: true as const,
			characters: member.characters.map(brief),
			requests: out,
		};
	},
});

/** The viewer's characters in this guild, to request as; null for non-members. */
export const me = query({
	args: { region: vRegion, slug: v.string() },
	handler: async (ctx, { region, slug }) => {
		const guild = await guildByKey(ctx, region, slug);
		const member = guild && (await membership(ctx, guild));
		return member ? { characters: member.characters.map(brief) } : null;
	},
});

/** The item panel: this guild's open requests for an item, and whether the viewer may add one. */
export const forItem = query({
	args: { region: vRegion, slug: v.string(), itemId: v.number() },
	handler: async (ctx, { region, slug, itemId }) => {
		const guild = await guildByKey(ctx, region, slug);
		if (!guild) return null;
		const member = await membership(ctx, guild);
		if (!member) return null;
		const known = new Set([...(await knownRecipes(ctx, member.characters)).values()].flatMap((s) => [...s]));
		const now = Date.now();
		const items: ItemCache = new Map();
		const rows = (await activeIn(ctx, guild._id)).filter((r) => r.itemId === itemId);
		const requests = [];
		for (const r of rows)
			requests.push(
				await view(ctx, r, { userId: member.userId, known }, items, () => scansOf(ctx, member.userId), now),
			);
		return { guild: { name: guild.name }, characters: member.characters.map(brief), requests };
	},
});

/**
 * The sidebar: per guild of the viewer's, how many open requests they could
 * fill, and their own requests that have gone quiet ("Still need this?").
 */
export const sidebar = query({
	args: {},
	handler: async (ctx) => {
		const userId = (await getAuthUserId(ctx)) as Id<"users"> | null;
		if (!userId) return null;
		const now = Date.now();
		const mine = await activeOf(ctx, userId);
		const owned = await ctx.db
			.query("ownedCharacters")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		const byGuild = new Map<Id<"guilds">, Doc<"characters">[]>();
		for (const c of owned) {
			const row = await ctx.db
				.query("characters")
				.withIndex("by_slug", (q) => q.eq("flavor", c.flavor).eq("region", c.region).eq("slug", c.slug))
				.first();
			if (row?.inRoster) byGuild.set(row.guildId, [...(byGuild.get(row.guildId) ?? []), row]);
		}
		const guilds = [];
		for (const [guildId, characters] of byGuild) {
			const guild = await ctx.db.get(guildId);
			if (!guild) continue;
			const known = new Set([...(await knownRecipes(ctx, characters)).values()].flatMap((s) => [...s]));
			const canHelp = (await activeIn(ctx, guildId)).filter(
				(r) =>
					r.status === "open" &&
					r.userId !== userId &&
					(r.kind === "item" || (r.recipeId !== undefined && known.has(r.recipeId))),
			).length;
			const stale = mine.filter((r) => r.guildId === guildId && isStale(r, now)).length;
			guilds.push({ region: guild.region, slug: guild.slug, name: guild.name, canHelp, stale });
		}
		return { guilds };
	},
});

/**
 * The craft request form: do my bags and bank (as of my last /reload or
 * logout with the Guildie app running) cover the reagents for `quantity`?
 * Only the signed-in player's own scans.
 */
export const matsPreview = query({
	args: { recipeId: v.number(), quantity: v.number() },
	handler: async (ctx, { recipeId, quantity }) => {
		const userId = (await getAuthUserId(ctx)) as Id<"users"> | null;
		if (!userId) return null;
		const recipe = await recipeRow(ctx, recipeId);
		if (!recipe) return null;
		const q = Math.min(Math.max(1, Math.floor(quantity) || 1), 1000);
		return matsCheck(recipe.reagents, q, await scansOf(ctx, userId));
	},
});

/** The character to act as: the one asked for (if it's theirs), else the first that fits. */
function pickCharacter(
	characters: Doc<"characters">[],
	slug: string | undefined,
	fits = (_: Doc<"characters">) => true,
) {
	const chosen = slug ? characters.find((c) => c.slug === slug) : undefined;
	if (slug && !chosen) throw new ConvexError("That isn't one of your characters in this guild.");
	if (chosen) return fits(chosen) ? chosen : undefined;
	return characters.find(fits);
}

export const create = mutation({
	args: {
		region: vRegion,
		slug: v.string(),
		kind: v.union(v.literal("item"), v.literal("craft")),
		itemId: v.optional(v.number()),
		recipeId: v.optional(v.number()),
		quantity: v.number(),
		note: v.optional(v.string()),
		/** The character asking (one of theirs in the guild); default: their highest level. */
		character: v.optional(v.string()),
		/** Crafts: "I have the mats". */
		declared: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const guild = await guildByKey(ctx, args.region, args.slug);
		if (!guild) throw new ConvexError("No such guild");
		const member = await requireMember(ctx, guild);
		const character = pickCharacter(member.characters, args.character)!;
		const active = (await activeOf(ctx, member.userId)).filter((r) => r.guildId === guild._id);
		let fields: { quantity: number; note?: string };
		try {
			fields = validateNew({ quantity: args.quantity, note: args.note, openCount: active.length });
		} catch (error) {
			throw new ConvexError((error as Error).message);
		}

		let itemId = args.itemId;
		let recipeId: number | undefined;
		let mats: Doc<"requests">["mats"];
		if (args.kind === "item") {
			if (itemId === undefined || !Number.isInteger(itemId) || itemId < 1) throw new ConvexError("Which item?");
		} else {
			if (args.recipeId === undefined) throw new ConvexError("Which recipe?");
			const recipe = await recipeRow(ctx, args.recipeId);
			if (!recipe) throw new ConvexError("Guildie doesn't know that recipe.");
			recipeId = recipe.recipeId;
			itemId = recipe.craftedItemId;
			// Someone else in the guild has to know it, or nobody could claim it.
			const members = await ctx.db
				.query("characters")
				.withIndex("by_guild", (q) => q.eq("guildId", guild._id).eq("inRoster", true))
				.collect();
			const mineIds = new Set(member.characters.map((c) => c._id));
			let knower = false;
			for (const m of members) {
				if (mineIds.has(m._id)) continue;
				const profile = await pickProfile(ctx, m);
				if (profile.professions.some((p) => p.knownRecipes?.includes(recipe.recipeId))) {
					knower = true;
					break;
				}
			}
			if (!knower) throw new ConvexError("Nobody else in the guild knows this recipe yet.");
			const checked = matsCheck(recipe.reagents, fields.quantity, await scansOf(ctx, member.userId));
			const declared = !!args.declared;
			mats = { state: matsState(checked.covered, declared), declared, checkedAt: checked.checkedAt };
		}
		if (active.some((r) => r.kind === args.kind && r.itemId === itemId && r.recipeId === recipeId))
			throw new ConvexError("You already have an open request for this.");

		const now = Date.now();
		return await ctx.db.insert("requests", {
			guildId: guild._id,
			userId: member.userId,
			character: brief(character),
			kind: args.kind,
			itemId,
			recipeId,
			...fields,
			status: "open",
			mats,
			createdAt: now,
			lastActivityAt: now,
		});
	},
});

/**
 * Everything else that happens to a request: claim, unclaim (release), mark
 * sent, mark done, cancel, keep ("still need this"). Each counts as activity.
 */
export const act = mutation({
	args: {
		requestId: v.id("requests"),
		action: v.union(
			v.literal("claim"),
			v.literal("unclaim"),
			v.literal("markSent"),
			v.literal("complete"),
			v.literal("cancel"),
			v.literal("keep"),
		),
		/** Claims: the character to claim as. */
		character: v.optional(v.string()),
	},
	handler: async (ctx, { requestId, action, character: characterSlug }) => {
		const userId = (await getAuthUserId(ctx)) as Id<"users"> | null;
		if (!userId) throw new ConvexError("Not signed in");
		const r = await ctx.db.get(requestId);
		if (!r) throw new ConvexError("That request is gone.");
		const guild = await ctx.db.get(r.guildId);
		if (!guild) throw new ConvexError("That request is gone.");
		// The requester can always close their own; everyone else must be in the guild now.
		const characters = await charactersIn(ctx, userId, guild._id);
		if (r.userId !== userId && characters.length === 0) throw new ConvexError("Only this guild's members can do that.");

		let claimer: Doc<"characters"> | undefined;
		if (action === "claim") {
			const known = await knownRecipes(ctx, characters);
			const knows = (c: Doc<"characters">) =>
				r.kind === "item" || (r.recipeId !== undefined && !!known.get(c._id)?.has(r.recipeId));
			claimer = pickCharacter(characters, characterSlug, knows);
		}
		const verdict = check(action as Action, ruleView(r), { userId, knowsRecipe: !!claimer });
		if (!verdict.ok) throw new ConvexError(verdict.error);

		const now = Date.now();
		const status = nextStatus(action as Action, r.status);
		const patch: Partial<Doc<"requests">> = { status, lastActivityAt: now };
		if (action === "claim" && claimer) patch.claim = { userId, character: brief(claimer), claimedAt: now };
		if (action === "unclaim") patch.claim = undefined;
		if (action === "markSent" && r.claim) patch.claim = { ...r.claim, sentAt: now };
		if (status === "done" || status === "cancelled") patch.closedAt = now;
		await ctx.db.patch(requestId, patch);
	},
});

/** Crafts, while open: tick or untick "I have the mats". */
export const setDeclared = mutation({
	args: { requestId: v.id("requests"), declared: v.boolean() },
	handler: async (ctx, { requestId, declared }) => {
		const userId = (await getAuthUserId(ctx)) as Id<"users"> | null;
		if (!userId) throw new ConvexError("Not signed in");
		const r = await ctx.db.get(requestId);
		if (!r) throw new ConvexError("That request is gone.");
		const verdict = check("setMats", ruleView(r), { userId });
		if (!verdict.ok) throw new ConvexError(verdict.error);
		const covered = r.mats?.state === "inventory";
		await ctx.db.patch(requestId, {
			mats: { state: matsState(covered, declared), declared, checkedAt: r.mats?.checkedAt },
			lastActivityAt: Date.now(),
		});
	},
});

const ruleView = (r: Doc<"requests">) => ({
	kind: r.kind,
	status: r.status,
	requester: r.userId as string,
	claim: r.claim && { userId: r.claim.userId as string, sentAt: r.claim.sentAt },
	lastActivityAt: r.lastActivityAt,
});

/**
 * After an upload brings a newer bag or bank read: re-check the player's
 * open craft requests. Claimed ones keep their state (the mats may well be
 * in the mail to the crafter by now).
 */
export async function refreshMats(ctx: MutationCtx, userId: Id<"users">) {
	const open = await ctx.db
		.query("requests")
		.withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "open"))
		.collect();
	const crafts = open.filter((r) => r.kind === "craft" && r.recipeId !== undefined);
	if (!crafts.length) return;
	const scans = await scansOf(ctx, userId);
	for (const r of crafts) {
		const recipe = await recipeRow(ctx, r.recipeId!);
		if (!recipe) continue;
		const checked = matsCheck(recipe.reagents, r.quantity, scans);
		const declared = r.mats?.declared ?? false;
		const state = matsState(checked.covered, declared);
		// Not activity: the requester didn't do anything.
		if (state !== r.mats?.state || checked.checkedAt !== r.mats?.checkedAt)
			await ctx.db.patch(r._id, { mats: { state, declared, checkedAt: checked.checkedAt } });
	}
}

/** Daily: requests with no activity for 30 days close as expired. */
export const expireStale = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		const BATCH = 200;
		let closed = 0;
		for (const status of ACTIVE) {
			const rows = await ctx.db
				.query("requests")
				.withIndex("by_status_activity", (q) => q.eq("status", status).lt("lastActivityAt", now - EXPIRE_MS))
				.take(BATCH);
			for (const r of rows) {
				if (!shouldExpire(r, now)) continue;
				await ctx.db.patch(r._id, { status: "expired", closedAt: now });
				closed++;
			}
		}
		if (closed >= BATCH) await ctx.scheduler.runAfter(1000, internal.requests.expireStale, {});
		return { closed };
	},
});

// ---- For the addon (GuildieData.lua) ------------------------------------------

export type AddonRequest = {
	kind: "item" | "craft";
	quantity: number;
	name: string;
	classId: number;
	claimedBy?: { name: string; classId: number };
};

/** Requests per item shown on a tooltip, at most. */
const ADDON_PER_ITEM = 5;
/** Items with requests in the file, at most (newest activity first). */
const ADDON_ITEMS = 300;

/**
 * Compact requests for the addon's tooltips: by item id, each guild's active
 * requests (enchants, with no item, are left out), and the player's own
 * counts for its window.
 */
export async function addonRequests(ctx: QueryCtx, guildIds: Id<"guilds">[], userId: Id<"users">) {
	const now = Date.now();
	const rows = (await Promise.all(guildIds.map((id) => activeIn(ctx, id)))).flat();
	rows.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
	const byItem: Record<string, AddonRequest[]> = {};
	let items = 0;
	for (const r of rows) {
		if (r.itemId === undefined) continue;
		const key = String(r.itemId);
		if (!byItem[key]) {
			if (items >= ADDON_ITEMS) continue;
			byItem[key] = [];
			items++;
		}
		if (byItem[key].length >= ADDON_PER_ITEM) continue;
		byItem[key].push({
			kind: r.kind,
			quantity: r.quantity,
			name: r.character.name,
			classId: r.character.classId,
			...(r.claim ? { claimedBy: { name: r.claim.character.name, classId: r.claim.character.classId } } : {}),
		});
	}
	const mine = await activeOf(ctx, userId);
	return {
		byItem,
		mine: { open: mine.length, stale: mine.filter((r) => isStale(r, now)).length },
	};
}
