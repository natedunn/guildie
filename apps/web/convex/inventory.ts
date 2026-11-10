import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { itemRow } from "./guilds";
import { vRegion } from "./schema";

// A character's bags and bank, as the addon last read them in game (bags at
// the last /reload or logout, the bank as of the last time it was open). Only
// for the player who claimed the character: anyone else gets null, and
// nothing about it is in any other query (requests only use it for the
// owner's own "has the mats" check).

const QUALITY_ORDER = ["LEGENDARY", "EPIC", "RARE", "UNCOMMON", "COMMON", "POOR"];

export const mine = query({
	args: { region: vRegion, slug: v.string() },
	handler: async (ctx, { region, slug }) => {
		const userId = (await getAuthUserId(ctx)) as Id<"users"> | null;
		if (!userId) return null;
		const claim = await ctx.db
			.query("ownedCharacters")
			.withIndex("by_slug", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
			.collect();
		if (!claim.some((c) => c.userId === userId)) return null;
		const row = await ctx.db
			.query("inventories")
			.withIndex("by_slug", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
			.unique();
		// An inventory uploaded under someone else's claim stays theirs.
		if (row && row.userId !== userId) return { bags: null, bank: null };
		const items = new Map<number, Doc<"items"> | null>();
		const list = async (part: Doc<"inventories">["bags"]) => {
			if (!part) return null;
			const out = [];
			for (const { id, count } of part.items) {
				if (!items.has(id)) items.set(id, await itemRow(ctx, id));
				const item = items.get(id);
				out.push({
					itemId: id,
					count,
					name: item?.name,
					quality: item?.quality ?? "COMMON",
					icon: item?.icon,
					kind: item?.kind,
				});
			}
			out.sort(
				(a, b) =>
					QUALITY_ORDER.indexOf(a.quality) - QUALITY_ORDER.indexOf(b.quality) ||
					(a.name ?? "~").localeCompare(b.name ?? "~"),
			);
			return { capturedAt: part.capturedAt, items: out };
		};
		return { bags: await list(row?.bags), bank: await list(row?.bank) };
	},
});
