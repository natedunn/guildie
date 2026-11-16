import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import { itemRow } from "./guilds";
import { pickProfile } from "./helper";
import { VENDOR_REAGENTS } from "./shared/wow";
import { requireUserId } from "./users";

// Tracked crafts: what a player wants to make and how many ("Greater Healing
// Potion ×5"), and so which reagents they're gathering. Inventory lists them
// with what they have (all their characters' bags and banks, as the addon
// last read them) against what they need, where to get the rest (a vendor,
// a guildmate who makes it) and who makes the craft itself. In game, each
// reagent's tooltip says how many more you need (GuildieData.tracked).

/** More than this many tracked crafts is a shopping list nobody reads. */
const MAX_TRACKED = 40;
const MAX_QUANTITY = 999;

async function trackedOf(ctx: QueryCtx, userId: Id<"users">) {
	return await ctx.db
		.query("trackedCrafts")
		.withIndex("by_user", (q) => q.eq("userId", userId))
		.collect();
}

/** The viewer's tracked crafts as recipe id -> how many, for Track buttons. Empty when signed out. */
export const ids = query({
	args: {},
	handler: async (ctx) => {
		const userId = (await getAuthUserId(ctx)) as Id<"users"> | null;
		if (!userId) return [];
		return (await trackedOf(ctx, userId)).map((t) => ({ recipeId: t.recipeId, quantity: t.quantity }));
	},
});

/** Track a craft, or change how many (whole numbers, 1 to 999). */
export const track = mutation({
	args: { recipeId: v.number(), quantity: v.optional(v.number()) },
	handler: async (ctx, { recipeId, quantity }) => {
		const userId = await requireUserId(ctx);
		const recipe = await ctx.db
			.query("recipes")
			.withIndex("by_recipeId", (q) => q.eq("recipeId", recipeId))
			.unique();
		if (!recipe) throw new ConvexError("That recipe isn't in Guildie's catalog.");
		const n = Math.min(MAX_QUANTITY, Math.max(1, Math.round(quantity ?? 1)));
		const existing = await ctx.db
			.query("trackedCrafts")
			.withIndex("by_user", (q) => q.eq("userId", userId).eq("recipeId", recipeId))
			.unique();
		if (existing) {
			await ctx.db.patch(existing._id, { quantity: n });
			return;
		}
		if ((await trackedOf(ctx, userId)).length >= MAX_TRACKED) {
			throw new ConvexError(`You're tracking ${MAX_TRACKED} crafts already. Untrack one first.`);
		}
		await ctx.db.insert("trackedCrafts", { userId, recipeId, quantity: n, addedAt: Date.now() });
	},
});

export const untrack = mutation({
	args: { recipeId: v.number() },
	handler: async (ctx, { recipeId }) => {
		const userId = await requireUserId(ctx);
		const existing = await ctx.db
			.query("trackedCrafts")
			.withIndex("by_user", (q) => q.eq("userId", userId).eq("recipeId", recipeId))
			.unique();
		if (existing) await ctx.db.delete(existing._id);
	},
});

type Owned = { name: string; region: Doc<"characters">["region"]; slug: string; classId: number };

/** One of the player's characters holding a reagent: how many, in bags or the bank. */
export type Holding = { name: string; classId: number; part: "bags" | "bank"; count: number };

/**
 * A tracked craft's reagents together: for each, how many all the tracked
 * crafts need, how many the player has and where (by character), and which
 * crafts use it ("Greater Healing Potion ×5").
 */
export async function trackedReagents(ctx: QueryCtx, userId: Id<"users">) {
	const tracked = await trackedOf(ctx, userId);
	const crafts = [];
	const reagents = new Map<
		number,
		{ itemId: number; name: string; need: number; have: number; where: Holding[]; for: string[] }
	>();
	for (const t of tracked) {
		const recipe = await ctx.db
			.query("recipes")
			.withIndex("by_recipeId", (q) => q.eq("recipeId", t.recipeId))
			.unique();
		if (!recipe) continue;
		const made = recipe.craftedItemId ? await itemRow(ctx, recipe.craftedItemId) : null;
		const label = `${made?.name ?? recipe.name}${t.quantity > 1 ? ` ×${t.quantity}` : ""}`;
		crafts.push({ tracked: t, recipe, made, label });
		for (const r of recipe.reagents) {
			const entry = reagents.get(r.itemId) ?? { itemId: r.itemId, name: r.name, need: 0, have: 0, where: [], for: [] };
			entry.need += r.quantity * t.quantity;
			entry.for.push(label);
			reagents.set(r.itemId, entry);
		}
	}
	if (reagents.size) {
		for (const c of await ownedCharacters(ctx, userId)) {
			const inv = await ctx.db
				.query("inventories")
				.withIndex("by_slug", (q) => q.eq("flavor", "forever").eq("region", c.region).eq("slug", c.slug))
				.unique();
			// An inventory uploaded under someone else's claim stays theirs.
			if (!inv || inv.userId !== userId) continue;
			for (const part of ["bags", "bank"] as const) {
				for (const { id, count } of inv[part]?.items ?? []) {
					const entry = reagents.get(id);
					if (!entry) continue;
					entry.have += count;
					entry.where.push({ name: c.name, classId: c.classId, part, count });
				}
			}
		}
	}
	return { crafts, reagents: [...reagents.values()] };
}

/** The player's claimed characters, once each. */
async function ownedCharacters(ctx: QueryCtx, userId: Id<"users">): Promise<Owned[]> {
	const owned = await ctx.db
		.query("ownedCharacters")
		.withIndex("by_user", (q) => q.eq("userId", userId))
		.collect();
	const seen = new Set<string>();
	const out: Owned[] = [];
	for (const c of owned) {
		const key = `${c.region}/${c.slug}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ name: c.name, region: c.region, slug: c.slug, classId: c.classId ?? 0 });
	}
	return out;
}

/**
 * Inventory's Tracked crafts: each craft (what it makes, how many, whether
 * the reagents are all there, who in the player's guilds makes it) and the
 * reagents together (have against need, where they are, where to get more:
 * a vendor, or who in the player's guilds makes it). Null when signed out.
 */
export const list = query({
	args: {},
	handler: async (ctx) => {
		const userId = (await getAuthUserId(ctx)) as Id<"users"> | null;
		if (!userId) return null;
		const { crafts, reagents } = await trackedReagents(ctx, userId);
		if (crafts.length === 0) return { crafts: [], reagents: [] };

		// Who in the player's guilds knows what: for the crafts and for reagents someone can make.
		const owned = await ownedCharacters(ctx, userId);
		const mine = new Set(owned.map((c) => `${c.region}/${c.slug}`));
		const guildIds = new Set<Id<"guilds">>();
		for (const c of owned) {
			const roster = await ctx.db
				.query("characters")
				.withIndex("by_slug", (q) => q.eq("flavor", "forever").eq("region", c.region).eq("slug", c.slug))
				.first();
			if (roster?.inRoster) guildIds.add(roster.guildId);
		}
		const members: Doc<"characters">[] = [];
		for (const guildId of guildIds) {
			members.push(
				...(await ctx.db
					.query("characters")
					.withIndex("by_guild", (q) => q.eq("guildId", guildId).eq("inRoster", true))
					.collect()),
			);
		}
		const known = await Promise.all(
			members.map(async (m) => new Set((await pickProfile(ctx, m)).professions.flatMap((p) => p.knownRecipes ?? []))),
		);
		const crafters = (recipeId: number) =>
			members
				.filter((_, i) => known[i].has(recipeId))
				.map((m) => ({
					name: m.name,
					slug: m.slug,
					region: m.region,
					classId: m.classId,
					mine: mine.has(`${m.region}/${m.slug}`),
				}))
				.sort((a, b) => Number(b.mine) - Number(a.mine) || a.name.localeCompare(b.name));

		const byId = new Map(reagents.map((r) => [r.itemId, r]));
		return {
			crafts: crafts
				.sort((a, b) => b.tracked.addedAt - a.tracked.addedAt)
				.map(({ tracked, recipe, made }) => {
					const short = recipe.reagents.filter((r) => {
						const pool = byId.get(r.itemId);
						return !pool || pool.have < r.quantity * tracked.quantity;
					}).length;
					return {
						recipeId: recipe.recipeId,
						quantity: tracked.quantity,
						name: recipe.name,
						profession: recipe.profession,
						item: made ? { itemId: made.itemId, name: made.name, quality: made.quality, icon: made.icon } : null,
						/** Reagents with fewer than it needs (counting all tracked crafts' share as available to it). */
						short,
						crafters: crafters(recipe.recipeId),
					};
				}),
			reagents: await Promise.all(
				reagents.map(async (r) => {
					const item = await itemRow(ctx, r.itemId);
					// Someone in the guild makes it (Bolt of Silk Cloth, Iron Bar): one level, the first recipe anyone knows.
					const makers = await ctx.db
						.query("recipes")
						.withIndex("by_craftedItemId", (q) => q.eq("craftedItemId", r.itemId))
						.collect();
					let madeBy: { recipe: string; profession: string; crafters: ReturnType<typeof crafters> } | null = null;
					for (const m of makers) {
						const who = crafters(m.recipeId);
						if (who.length) {
							madeBy = { recipe: m.name, profession: m.profession, crafters: who };
							break;
						}
					}
					return {
						itemId: r.itemId,
						name: item?.name ?? r.name,
						quality: item?.quality ?? "COMMON",
						icon: item?.icon,
						need: r.need,
						have: r.have,
						where: r.where.sort((a, b) => b.count - a.count),
						for: r.for,
						vendor: r.itemId in VENDOR_REAGENTS,
						madeBy,
					};
				}),
			).then((list) =>
				// Still needed first, most missing first; then the ones you have enough of.
				list.sort((a, b) => {
					const missA = Math.max(0, a.need - a.have);
					const missB = Math.max(0, b.need - b.have);
					return Number(missB > 0) - Number(missA > 0) || missB - missA || a.name.localeCompare(b.name);
				}),
			),
		};
	},
});
