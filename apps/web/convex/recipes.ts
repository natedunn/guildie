import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { appToken, blizzardGet } from "./blizzard";

// Forever's recipe catalog: every profession's recipes and their reagents,
// from Blizzard's static data (the same in every region, so read from US).
// Synced weekly (crons.ts); about one request per recipe, in staggered
// batches. Characters' known recipes come with their profiles (sync.ts).
// The items that teach them (patterns, plans...): recipeItems.ts.

const REFRESH_MS = 7 * 24 * 3600_000;
const BATCH = 25;
const BATCH_STAGGER_MS = 3_000;

type Index = { professions?: { id: number; name: string }[] };
type Profession = { skill_tiers?: { id: number }[] };
type Tier = { categories?: { recipes?: { id: number; name: string }[] }[] };
type Recipe = {
	name?: string;
	crafted_item?: { id: number };
	alliance_crafted_item?: { id: number };
	horde_crafted_item?: { id: number };
	reagents?: { reagent?: { id?: number; name?: string }; quantity?: number }[];
};

const common = { flavor: "forever" as const, region: "us" as const, namespace: "static" as const };

export const syncedAt = internalQuery({
	args: {},
	handler: async (ctx) => {
		const all = await ctx.db.query("recipes").collect();
		// Pairs, not an object: Convex objects are capped at 1,024 fields.
		return all.map((r) => [r.recipeId, r.syncedAt] as [number, number]);
	},
});

/** Find every recipe and queue the ones due a refresh. `force` refetches all. */
export const syncCatalog = internalAction({
	args: { force: v.optional(v.boolean()) },
	handler: async (ctx, { force }) => {
		const token = await appToken(ctx, "us");
		const index = await blizzardGet<Index>({ ...common, token, path: "/data/wow/profession/index" });
		if (!index.ok) throw new Error("Profession index unavailable");
		const known = new Map<number, number>(await ctx.runQuery(internal.recipes.syncedAt, {}));
		const due: { professionId: number; profession: string; id: number }[] = [];
		for (const p of index.data.professions ?? []) {
			// Blizzard lists a test profession; skip anything marked do-not-translate.
			if (p.name.includes("[DNT]")) continue;
			const detail = await blizzardGet<Profession>({ ...common, token, path: `/data/wow/profession/${p.id}` });
			if (!detail.ok) continue;
			for (const tier of detail.data.skill_tiers ?? []) {
				const t = await blizzardGet<Tier>({
					...common,
					token,
					path: `/data/wow/profession/${p.id}/skill-tier/${tier.id}`,
				});
				if (!t.ok) continue;
				for (const r of (t.data.categories ?? []).flatMap((c) => c.recipes ?? [])) {
					const last = known.get(r.id);
					if (force || !last || Date.now() - last > REFRESH_MS)
						due.push({ professionId: p.id, profession: p.name, id: r.id });
				}
			}
		}
		for (let i = 0; i < due.length; i += BATCH) {
			await ctx.scheduler.runAfter((i / BATCH) * BATCH_STAGGER_MS, internal.recipes.syncBatch, {
				recipes: due.slice(i, i + BATCH),
			});
		}
		// Once the batches are in: icons and tooltips for crafted items and
		// reagents, and the talent tree layouts (the other weekly static data).
		const afterBatches = Math.ceil(due.length / BATCH) * BATCH_STAGGER_MS + 60_000;
		await ctx.scheduler.runAfter(afterBatches, internal.items.syncRecipeItems, {});
		// Patterns, plans and formulas, matched to the recipes just saved.
		await ctx.scheduler.runAfter(afterBatches, internal.recipeItems.syncCatalog, {});
		await ctx.scheduler.runAfter(0, internal.talents.syncLayouts, {});
		return { queued: due.length };
	},
});

const vDue = v.object({ professionId: v.number(), profession: v.string(), id: v.number() });

export const syncBatch = internalAction({
	args: { recipes: v.array(vDue) },
	handler: async (ctx, { recipes }) => {
		const token = await appToken(ctx, "us");
		const fetched = await Promise.all(
			recipes.map(async (r) => {
				const res = await blizzardGet<Recipe>({ ...common, token, path: `/data/wow/recipe/${r.id}` });
				if (!res.ok) return null;
				const d = res.data;
				return {
					recipeId: r.id,
					professionId: r.professionId,
					profession: r.profession,
					name: d.name ?? `Recipe ${r.id}`,
					craftedItemId: (d.crafted_item ?? d.alliance_crafted_item ?? d.horde_crafted_item)?.id,
					reagents: (d.reagents ?? [])
						.filter((x) => x.reagent?.id)
						.map((x) => ({
							itemId: x.reagent!.id!,
							name: x.reagent!.name ?? `Item ${x.reagent!.id}`,
							quantity: x.quantity ?? 1,
						})),
				};
			}),
		);
		await ctx.runMutation(internal.recipes.save, { recipes: fetched.filter((r) => r !== null) });
	},
});

export const save = internalMutation({
	args: {
		recipes: v.array(
			v.object({
				recipeId: v.number(),
				professionId: v.number(),
				profession: v.string(),
				name: v.string(),
				craftedItemId: v.optional(v.number()),
				reagents: v.array(v.object({ itemId: v.number(), name: v.string(), quantity: v.number() })),
			}),
		),
	},
	handler: async (ctx, { recipes }) => {
		const now = Date.now();
		// Guildie's own entries (negative ids, recipeItems.ts): a few dozen.
		const own = await ctx.db
			.query("recipes")
			.withIndex("by_recipeId", (q) => q.lt("recipeId", 0))
			.collect();
		for (const r of recipes) {
			const existing = await ctx.db
				.query("recipes")
				.withIndex("by_recipeId", (q) => q.eq("recipeId", r.recipeId))
				.unique();
			if (existing) await ctx.db.replace(existing._id, { ...r, syncedAt: now });
			else await ctx.db.insert("recipes", { ...r, syncedAt: now });
			// Blizzard has it now: drop Guildie's own entry for it (recipeItems.ts
			// matches the real one on its next sync).
			for (const o of own) {
				if (o.professionId === r.professionId && o.name.toLowerCase() === r.name.toLowerCase()) {
					await ctx.db.delete(o._id);
				}
			}
		}
	},
});

/** Recipes by id (for building the reagent index). */
export const byIds = internalQuery({
	args: { ids: v.array(v.number()) },
	handler: async (ctx, { ids }) => {
		const rows = await Promise.all(
			ids.map((id) =>
				ctx.db
					.query("recipes")
					.withIndex("by_recipeId", (q) => q.eq("recipeId", id))
					.unique(),
			),
		);
		return rows
			.filter((r) => r !== null)
			.map(({ recipeId, profession, name, reagents }) => ({ recipeId, profession, name, reagents }));
	},
});
