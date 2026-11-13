import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import { type QueryCtx, query } from "./_generated/server";
import { itemRow } from "./guilds";
import { pickProfile } from "./helper";
import { type Learner, learners, type RecipeItemRow, recipeItem } from "./recipeItems";
import { QUALITY_ORDER } from "./shared/wow";

// Personal → Inventory: the bags and banks of all the viewer's claimed
// characters, as the addon last read them in game (bags at the last /reload
// or logout, the bank as of the last time it was open). Only for the player
// who claimed them. Elsewhere only two things come from them: the owner's own
// "has the mats" check on requests, and, for guildmates, recipe items they
// hold unlearned for a profession they have ("has one", recipeItems.ts).
// Recipe items here also say who in the player's guilds could use them.

type Part = "bags" | "bank";

export const all = query({
	args: {},
	handler: async (ctx) => {
		const userId = (await getAuthUserId(ctx)) as Id<"users"> | null;
		if (!userId) return null;
		const owned = await ctx.db
			.query("ownedCharacters")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		const characters = [];
		const items = new Map<
			number,
			{
				itemId: number;
				name?: string;
				quality: string;
				icon?: string;
				kind?: string;
				total: number;
				where: { key: string; part: Part; count: number }[];
			}
		>();
		const seen = new Set<string>();
		const guildIds = new Set<Id<"guilds">>();
		for (const c of owned) {
			const key = `${c.region}/${c.slug}`;
			if (seen.has(key)) continue;
			seen.add(key);
			const row = await ctx.db
				.query("inventories")
				.withIndex("by_slug", (q) => q.eq("flavor", c.flavor).eq("region", c.region).eq("slug", c.slug))
				.unique();
			// An inventory uploaded under someone else's claim stays theirs.
			const inv = row?.userId === userId ? row : null;
			const roster = await ctx.db
				.query("characters")
				.withIndex("by_slug", (q) => q.eq("flavor", c.flavor).eq("region", c.region).eq("slug", c.slug))
				.first();
			if (roster?.inRoster) guildIds.add(roster.guildId);
			const summary = (part: Doc<"inventories">["bags"]) =>
				part ? { capturedAt: part.capturedAt, items: part.items.length } : null;
			characters.push({
				key,
				region: c.region,
				slug: c.slug,
				name: c.name,
				surname: roster?.surname,
				classId: roster?.classId ?? c.classId ?? 0,
				level: roster?.level ?? c.level ?? 0,
				avatarUrl: roster?.avatarUrl,
				bags: summary(inv?.bags),
				bank: summary(inv?.bank),
			});
			for (const part of ["bags", "bank"] as const) {
				for (const { id, count } of inv?.[part]?.items ?? []) {
					let item = items.get(id);
					if (!item) {
						const known = await itemRow(ctx, id);
						item = {
							itemId: id,
							name: known?.name,
							quality: known?.quality ?? "COMMON",
							icon: known?.icon,
							kind: known?.kind,
							total: 0,
							where: [],
						};
						items.set(id, item);
					}
					item.total += count;
					item.where.push({ key, part, count });
				}
			}
		}
		const recipes = await recipeLearners(ctx, [...items.keys()], guildIds);
		const order = (q: string) => {
			const i = QUALITY_ORDER.indexOf(q);
			return i < 0 ? -1 : i;
		};
		return {
			characters: characters.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name)),
			items: [...items.values()]
				.map((i) => ({ ...i, where: i.where.sort((a, b) => b.count - a.count), recipe: recipes.get(i.itemId) }))
				.sort((a, b) => order(b.quality) - order(a.quality) || (a.name ?? "~").localeCompare(b.name ?? "~")),
		};
	},
});

/**
 * Recipe items among these: for each, who in the player's guilds has its
 * profession and where they stand (knows it, has one, can learn it now or
 * later), their own characters included.
 */
async function recipeLearners(ctx: QueryCtx, itemIds: number[], guildIds: Set<Id<"guilds">>) {
	const out = new Map<number, { profession: string; skill?: number; who: Learner[] }>();
	const taught: RecipeItemRow[] = [];
	for (const id of itemIds) {
		const r = await recipeItem(ctx, id);
		if (r) taught.push(r);
	}
	if (!taught.length || !guildIds.size) return out;
	const members: Doc<"characters">[] = [];
	for (const guildId of guildIds) {
		members.push(
			...(await ctx.db
				.query("characters")
				.withIndex("by_guild", (q) => q.eq("guildId", guildId).eq("inRoster", true))
				.collect()),
		);
	}
	const professions = (await Promise.all(members.map((m) => pickProfile(ctx, m)))).map((p) => p.professions);
	const who = await learners(ctx, members, professions, taught, true);
	for (const r of taught) out.set(r.itemId, { profession: r.profession, skill: r.skill, who: who.get(r.itemId) ?? [] });
	return out;
}
