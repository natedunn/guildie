import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { vRegion } from "./schema";
import { CLASS_RULES } from "./shared/proficiencies";
import { validStats } from "./shared/statPriority";
import { canPrefer } from "./shared/upgrades";
import { CLASS_TOKENS, SPECS } from "./shared/weights";
import { requireUserId } from "./users";

/**
 * The player who claimed a character chooses what its stat priority shows:
 * another talent tree's, their own three stats, or (null) back to their
 * talents. Shown on the roster and the character page.
 */
export const set = mutation({
	args: {
		region: vRegion,
		slug: v.string(),
		choice: v.union(v.null(), v.object({ tree: v.number() }), v.object({ stats: v.array(v.string()) })),
	},
	handler: async (ctx, { region, slug, choice }) => {
		const userId = await requireUserId(ctx);
		const claim = (
			await ctx.db
				.query("ownedCharacters")
				.withIndex("by_slug", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
				.collect()
		).find((c) => c.userId === userId);
		if (!claim) throw new ConvexError("Only the player who claimed this character can change it.");
		if (choice && "stats" in choice && !validStats(choice.stats)) throw new ConvexError("Pick three different stats.");
		if (choice && "tree" in choice) {
			const character = await ctx.db
				.query("characters")
				.withIndex("by_slug", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
				.first();
			const classId = character?.classId ?? claim.classId;
			const token = classId !== undefined ? CLASS_TOKENS[classId] : undefined;
			if (!token || !SPECS[token]?.[choice.tree]) throw new ConvexError("No such talent tree.");
		}
		await ctx.db.patch(claim._id, { statPriority: choice ?? undefined });
	},
});

const vTypeChoice = v.union(v.null(), v.object({ type: v.number(), strict: v.boolean() }));

/**
 * The player who claimed a character chooses the armor and weapon types it
 * prefers (null: none, as before): others count less in gear suggestions,
 * or with `strict`, aren't suggested at all. Only types the class can use.
 */
export const setGear = mutation({
	args: { region: vRegion, slug: v.string(), armor: vTypeChoice, weapon: vTypeChoice },
	handler: async (ctx, { region, slug, armor, weapon }) => {
		const userId = await requireUserId(ctx);
		const claim = (
			await ctx.db
				.query("ownedCharacters")
				.withIndex("by_slug", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
				.collect()
		).find((c) => c.userId === userId);
		if (!claim) throw new ConvexError("Only the player who claimed this character can change it.");
		const character = await ctx.db
			.query("characters")
			.withIndex("by_slug", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
			.first();
		const cls = CLASS_RULES[character?.classId ?? claim.classId ?? 0];
		if (armor && !canPrefer(cls, "armor", armor.type)) throw new ConvexError("This class can't wear that armor.");
		if (weapon && !canPrefer(cls, "weapon", weapon.type)) throw new ConvexError("This class can't use that weapon.");
		const gearPreference = { ...(armor ? { armor } : {}), ...(weapon ? { weapon } : {}) };
		await ctx.db.patch(claim._id, {
			gearPreference: Object.keys(gearPreference).length ? gearPreference : undefined,
		});
	},
});
