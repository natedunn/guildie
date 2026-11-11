import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { type MutationCtx, mutation } from "./_generated/server";
import { vRegion } from "./schema";
import { CLASS_RULES } from "./shared/proficiencies";
import { steepnessOf, validStats, validTiers } from "./shared/statPriority";
import { canPrefer } from "./shared/upgrades";
import { CLASS_TOKENS, SPECS } from "./shared/weights";
import { requireUserId } from "./users";

/**
 * The player who claimed a character chooses what its stat priority shows:
 * another talent tree's, their own three to five stats with how much each
 * counts next to the first (`tiers`; left out: Balanced), or (null) back to
 * their talents. Shown on the roster and the character page; gear
 * suggestions follow it.
 */
export const set = mutation({
	args: {
		region: vRegion,
		slug: v.string(),
		choice: v.union(
			v.null(),
			v.object({ tree: v.number() }),
			v.object({ stats: v.array(v.string()), tiers: v.optional(v.array(v.number())) }),
		),
	},
	handler: async (ctx, { region, slug, choice }) => {
		await setStatPriority(ctx, await requireUserId(ctx), region, slug, choice);
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
		await setGearPreference(ctx, await requireUserId(ctx), region, slug, armor, weapon);
	},
});

type Region = "us" | "eu" | "kr" | "tw";
export type Choice = null | { tree: number } | { stats: string[]; tiers?: number[] };
export type TypeChoice = null | { type: number; strict: boolean };

/** `set`, for a given player (the site, or an AI app acting for them: convex/mcp.ts). */
export async function setStatPriority(
	ctx: MutationCtx,
	userId: Id<"users">,
	region: Region,
	slug: string,
	choice: Choice,
) {
	const claim = (
		await ctx.db
			.query("ownedCharacters")
			.withIndex("by_slug", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
			.collect()
	).find((c) => c.userId === userId);
	if (!claim) throw new ConvexError("Only the player who claimed this character can change it.");
	if (choice && "stats" in choice) {
		if (!validStats(choice.stats)) throw new ConvexError("Pick three to five different stats.");
		if (choice.tiers) {
			const tiers = validTiers(choice.tiers, choice.stats.length);
			if (tiers !== choice.tiers) throw new ConvexError("Each stat can count at most as much as the one before.");
			// Balanced is the default: not stored.
			if (steepnessOf(tiers) === "balanced") choice = { stats: choice.stats };
		}
	}
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
}

/** `setGear`, for a given player (the site, or an AI app acting for them: convex/mcp.ts). */
export async function setGearPreference(
	ctx: MutationCtx,
	userId: Id<"users">,
	region: Region,
	slug: string,
	armor: TypeChoice,
	weapon: TypeChoice,
) {
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
}
