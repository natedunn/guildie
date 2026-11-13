import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { appToken, blizzardGet } from "./blizzard";
import { craftedName, guildieRecipeId, RESEARCHED, rankFrom } from "./shared/recipeResearch";
import {
	type CrafterProfession,
	type RecipeItemInfo,
	type RecipeState,
	recipeCandidates,
	taughtName,
	unlearnedHeld,
} from "./shared/recipeStatus";

// Recipe items: the patterns, plans, formulas and recipes that teach a
// recipe, with the profession skill each needs. From Blizzard's item search
// (item class 9) and each item's preview, matched to the recipe catalog
// (recipes.ts) by what it crafts, or by name for enchants. What that leaves
// out is filled in by shared/recipeResearch.ts: rank books (Expert
// Cookbook), cookbooks we looked up, and Guildie's own recipe entries for
// what Blizzard's catalog lacks. Synced weekly after the recipe catalog. Guild members' standing with each (knows it,
// has one, can learn it now or later) is shared/recipeStatus.ts.

const REFRESH_MS = 7 * 24 * 3600_000;
const BATCH = 25;
const BATCH_STAGGER_MS = 3_000;
const PAGE = 1000;

const common = { flavor: "forever" as const, region: "us" as const, namespace: "static" as const };

type Search = {
	results?: { data: { id: number; item_subclass?: { name?: Record<string, string> } } }[];
};
type Item = {
	name?: string;
	quality?: { type?: string };
	preview_item?: {
		description?: string;
		recipe?: {
			item?: { item?: { id?: number } };
			reagents?: { reagent?: { id?: number; name?: string }; quantity?: number }[];
		};
		spells?: { spell?: { name?: string }; description?: string }[];
		requirements?: { skill?: { level?: number; profession?: { id?: number; name?: string } } };
	};
};

export const syncedAt = internalQuery({
	args: {},
	handler: async (ctx) => {
		const all = await ctx.db.query("recipeItems").collect();
		return all.map((r) => [r.itemId, r.syncedAt] as [number, number]);
	},
});

/** Find every recipe item and queue the ones due a refresh. `force` refetches all. */
export const syncCatalog = internalAction({
	args: { force: v.optional(v.boolean()) },
	handler: async (ctx, { force }): Promise<{ queued: number }> => {
		const token: string = await appToken(ctx, "us");
		const known = new Map<number, number>(await ctx.runQuery(internal.recipeItems.syncedAt, {}));
		const due: number[] = [];
		// The search caps each query at 1,000 results: page by id instead.
		let from = 0;
		for (;;) {
			const res = await blizzardGet<Search>({
				...common,
				token,
				path: `/data/wow/search/item?item_class.id=9&orderby=id&_pageSize=${PAGE}&id=[${from},]`,
			});
			if (!res.ok) throw new Error("Item search unavailable");
			const results = res.data.results ?? [];
			for (const { data } of results) {
				// "Book": class tomes, not professions.
				if (data.item_subclass?.name?.en_US === "Book") continue;
				const last = known.get(data.id);
				if (force || !last || Date.now() - last > REFRESH_MS) due.push(data.id);
			}
			if (results.length < PAGE) break;
			from = results[results.length - 1].data.id + 1;
		}
		for (let i = 0; i < due.length; i += BATCH) {
			await ctx.scheduler.runAfter((i / BATCH) * BATCH_STAGGER_MS, internal.recipeItems.syncBatch, {
				itemIds: due.slice(i, i + BATCH),
			});
		}
		// Icons and tooltips for the recipe items themselves, once they're in.
		await ctx.scheduler.runAfter(
			Math.ceil(due.length / BATCH) * BATCH_STAGGER_MS + 60_000,
			internal.recipeItems.syncIcons,
			{},
		);
		return { queued: due.length };
	},
});

type Media = { assets?: { key: string; value: string }[] };

const vFetched = v.object({
	itemId: v.number(),
	name: v.string(),
	quality: v.string(),
	icon: v.optional(v.string()),
	professionId: v.number(),
	profession: v.string(),
	skill: v.optional(v.number()),
	craftedItemId: v.optional(v.number()),
	spellName: v.optional(v.string()),
	/** The item's own text and its spells': what it teaches, when nothing else says. */
	texts: v.optional(v.array(v.string())),
	reagents: v.optional(v.array(v.object({ itemId: v.number(), name: v.string(), quantity: v.number() }))),
});

export const syncBatch = internalAction({
	args: { itemIds: v.array(v.number()) },
	handler: async (ctx, { itemIds }) => {
		const token = await appToken(ctx, "us");
		const fetched = await Promise.all(
			itemIds.map(async (itemId) => {
				try {
					const res = await blizzardGet<Item>({ ...common, token, path: `/data/wow/item/${itemId}` });
					if (!res.ok) return null;
					const p = res.data.preview_item;
					const req = p?.requirements?.skill;
					// No profession requirement: not something a profession learns.
					if (!req?.profession?.id || !req.profession.name) return null;
					const media = await blizzardGet<Media>({ ...common, token, path: `/data/wow/media/item/${itemId}` });
					return {
						itemId,
						name: res.data.name ?? `Item ${itemId}`,
						quality: res.data.quality?.type ?? "COMMON",
						icon: media.ok ? media.data.assets?.find((a) => a.key === "icon")?.value : undefined,
						professionId: req.profession.id,
						profession: req.profession.name,
						skill: req.level,
						craftedItemId: p?.recipe?.item?.item?.id,
						spellName: p?.spells?.[0]?.spell?.name,
						texts: [p?.description, ...(p?.spells ?? []).map((x) => x.description)].filter((t): t is string => !!t),
						reagents: (p?.recipe?.reagents ?? [])
							.filter((x) => x.reagent?.id)
							.map((x) => ({
								itemId: x.reagent!.id!,
								name: x.reagent!.name ?? `Item ${x.reagent!.id}`,
								quantity: x.quantity ?? 1,
							})),
					};
				} catch (e) {
					console.warn(`recipeItems: ${itemId}: ${(e as Error).message}`);
					return null;
				}
			}),
		);
		await ctx.runMutation(internal.recipeItems.save, { items: fetched.filter((x) => x !== null) });
	},
});

/** Saves recipe items, matched to the recipe each teaches. */
export const save = internalMutation({
	args: { items: v.array(vFetched) },
	handler: async (ctx, { items }) => {
		const now = Date.now();
		const byProfession = new Map<number, Doc<"recipes">[]>();
		const professionRecipes = async (professionId: number) => {
			let list = byProfession.get(professionId);
			if (!list) {
				list = await ctx.db
					.query("recipes")
					.withIndex("by_professionId", (q) => q.eq("professionId", professionId))
					.collect();
				byProfession.set(professionId, list);
			}
			return list;
		};
		// The catalog's id for a profession, by name: some items give another
		// (Forever's First Aid manuals: 2942, the catalog and profiles: 129).
		const catalogIds = new Map<string, number | null>();
		const catalogId = async (profession: string, id: number) => {
			if ((await professionRecipes(id)).length) return id;
			if (!catalogIds.has(profession)) {
				// Rare (First Aid manuals): a scan that stops at the first one.
				const one = await ctx.db
					.query("recipes")
					.filter((q) => q.and(q.eq(q.field("profession"), profession), q.gte(q.field("recipeId"), 0)))
					.first();
				catalogIds.set(profession, one?.professionId ?? null);
			}
			return catalogIds.get(profession) ?? id;
		};
		for (const { craftedItemId, spellName, texts, reagents, ...fetched } of items) {
			const item = { ...fetched, professionId: await catalogId(fetched.profession, fetched.professionId) };
			const byName = async (name: string) =>
				(await professionRecipes(item.professionId)).find(
					(r) => r.recipeId >= 0 && r.name.toLowerCase() === name.toLowerCase(),
				);
			let recipes: Pick<Doc<"recipes">, "recipeId" | "profession">[] = [];
			const rank = rankFrom(texts ?? []);
			const researched = RESEARCHED[item.itemId];
			if (researched) {
				for (const name of researched.recipes) {
					const r = await byName(name);
					if (r) recipes.push(r);
				}
			} else if (rank === undefined) {
				let recipe: Pick<Doc<"recipes">, "recipeId" | "profession"> | undefined;
				if (craftedItemId) {
					const makers = (
						await ctx.db
							.query("recipes")
							.withIndex("by_craftedItemId", (q) => q.eq("craftedItemId", craftedItemId))
							.collect()
					).filter((r) => r.recipeId >= 0 && r.professionId === item.professionId);
					recipe = makers.length === 1 ? makers[0] : makers.find((r) => r.name === taughtName(item.name));
				}
				// Enchants make nothing: match the name it teaches.
				for (const name of [spellName, taughtName(item.name)]) if (!recipe && name) recipe = await byName(name);
				// Not in Blizzard's catalog: Guildie's own entry, from what the item says it teaches.
				const named = craftedName(texts ?? []);
				if (!recipe && named) recipe = await ownRecipe(ctx, item, named, craftedItemId, reagents ?? [], now);
				if (recipe) recipes = [recipe];
			}
			const row = {
				...item,
				profession: recipes[0]?.profession ?? item.profession,
				recipeId: recipes[0]?.recipeId,
				recipeIds: recipes.length > 1 ? recipes.map((r) => r.recipeId) : undefined,
				rank,
				syncedAt: now,
			};
			const existing = await ctx.db
				.query("recipeItems")
				.withIndex("by_itemId", (q) => q.eq("itemId", item.itemId))
				.unique();
			if (existing) await ctx.db.replace(existing._id, row);
			else await ctx.db.insert("recipeItems", row);
		}
	},
});

/** Guildie's own recipe entry for one Blizzard's catalog lacks (recipeResearch.ts). */
async function ownRecipe(
	ctx: MutationCtx,
	item: { itemId: number; professionId: number; profession: string },
	name: string,
	craftedItemId: number | undefined,
	reagents: { itemId: number; name: string; quantity: number }[],
	now: number,
) {
	const recipeId = guildieRecipeId(item.itemId);
	const row = {
		recipeId,
		fromItem: item.itemId,
		professionId: item.professionId,
		profession: item.profession,
		name,
		craftedItemId,
		reagents,
		syncedAt: now,
	};
	const existing = await ctx.db
		.query("recipes")
		.withIndex("by_recipeId", (q) => q.eq("recipeId", recipeId))
		.unique();
	if (existing) await ctx.db.replace(existing._id, row);
	else await ctx.db.insert("recipes", row);
	return { recipeId, profession: item.profession };
}

/** Guildie's own recipe entries (negative ids), for profile syncs to match by name. */
export const ownRecipes = internalQuery({
	args: {},
	handler: async (ctx) =>
		(
			await ctx.db
				.query("recipes")
				.withIndex("by_recipeId", (q) => q.lt("recipeId", 0))
				.collect()
		).map((r) => ({ recipeId: r.recipeId, professionId: r.professionId, name: r.name })),
});

export const allItemIds = internalQuery({
	args: {},
	handler: async (ctx) => (await ctx.db.query("recipeItems").collect()).map((r) => r.itemId),
});

/** Names, icons and tooltips for recipe items we don't have yet. */
export const syncIcons = internalAction({
	args: {},
	handler: async (ctx): Promise<{ queued: number }> => {
		const itemIds: number[] = await ctx.runQuery(internal.recipeItems.allItemIds, {});
		return await ctx.runAction(internal.items.ensure, { itemIds });
	},
});

export type RecipeItemRow = RecipeItemInfo & {
	itemId: number;
	name: string;
	quality: string;
	icon?: string;
	profession: string;
};

function toRow(r: Doc<"recipeItems">): RecipeItemRow | null {
	const recipeIds = r.recipeIds ?? (r.recipeId !== undefined ? [r.recipeId] : []);
	if (!recipeIds.length && r.rank === undefined) return null;
	return {
		itemId: r.itemId,
		name: r.name,
		quality: r.quality,
		icon: r.icon,
		profession: r.profession,
		professionId: r.professionId,
		recipeIds,
		rank: r.rank,
		skill: r.skill,
	};
}

/** Matched recipe items for these professions (all when omitted). */
export async function recipeItemsFor(ctx: QueryCtx, professionIds?: Iterable<number>): Promise<RecipeItemRow[]> {
	const rows = professionIds
		? (
				await Promise.all(
					[...new Set(professionIds)].map((id) =>
						ctx.db
							.query("recipeItems")
							.withIndex("by_professionId", (q) => q.eq("professionId", id))
							.collect(),
					),
				)
			).flat()
		: await ctx.db.query("recipeItems").collect();
	return rows.map(toRow).filter((r) => r !== null);
}

/** One matched recipe item, or null. */
export async function recipeItem(ctx: QueryCtx, itemId: number): Promise<RecipeItemRow | null> {
	const r = await ctx.db
		.query("recipeItems")
		.withIndex("by_itemId", (q) => q.eq("itemId", itemId))
		.unique();
	return r ? toRow(r) : null;
}

/**
 * Recipe item ids each character holds (bags or bank) and hasn't learned, for
 * a profession they have: the only part of anyone's inventory guildmates see.
 * `characters`: roster rows with their merged professions.
 */
export async function heldUnlearned(
	ctx: QueryCtx,
	characters: { flavor: Doc<"characters">["flavor"]; region: Doc<"characters">["region"]; slug: string }[],
	recipeItems: ReadonlyMap<number, RecipeItemInfo>,
	professionsOf: (i: number) => CrafterProfession[],
): Promise<Set<number>[]> {
	const taught = new Set([...recipeItems.values()].map((r) => r.professionId));
	return await Promise.all(
		characters.map(async (c, i) => {
			const professions = professionsOf(i);
			if (!professions.some((p) => taught.has(p.id))) return new Set<number>();
			const inv = await ctx.db
				.query("inventories")
				.withIndex("by_slug", (q) => q.eq("flavor", c.flavor).eq("region", c.region).eq("slug", c.slug))
				.unique();
			if (!inv) return new Set<number>();
			const ids = [...(inv.bags?.items ?? []), ...(inv.bank?.items ?? [])].map((x) => x.id);
			return new Set(unlearnedHeld(ids, recipeItems, professions));
		}),
	);
}

export type Learner = {
	name: string;
	slug: string;
	region: Doc<"characters">["region"];
	classId: number;
	state: RecipeState;
	skill?: number;
};

/**
 * For each recipe item: the characters with its profession and where they
 * stand (shared/recipeStatus.ts). `showHeld`: whether "has one" may show,
 * which reads their bags (members of the guild only).
 */
export async function learners(
	ctx: QueryCtx,
	members: Doc<"characters">[],
	professions: CrafterProfession[][],
	items: RecipeItemRow[],
	showHeld: boolean,
): Promise<Map<number, Learner[]>> {
	const byId = new Map(items.map((i) => [i.itemId, i]));
	const held = showHeld ? await heldUnlearned(ctx, members, byId, (i) => professions[i]) : [];
	const characters = members.map((m, i) => ({
		name: m.name,
		slug: m.slug,
		region: m.region,
		classId: m.classId,
		professions: professions[i],
		holding: held[i],
	}));
	return new Map(items.map((item) => [item.itemId, recipeCandidates(item.itemId, item, characters)]));
}
