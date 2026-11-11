import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { itemRow } from "./guilds";
import { QUALITY_ORDER } from "./shared/wow";

// Personal → Inventory: the bags and banks of all the viewer's claimed
// characters, as the addon last read them in game (bags at the last /reload
// or logout, the bank as of the last time it was open). Only for the player
// who claimed them: nothing about them is in any other query (requests only
// use them for the owner's own "has the mats" check).

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
		const order = (q: string) => {
			const i = QUALITY_ORDER.indexOf(q);
			return i < 0 ? -1 : i;
		};
		return {
			characters: characters.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name)),
			items: [...items.values()]
				.map((i) => ({ ...i, where: i.where.sort((a, b) => b.count - a.count) }))
				.sort((a, b) => order(b.quality) - order(a.quality) || (a.name ?? "~").localeCompare(b.name ?? "~")),
		};
	},
});
