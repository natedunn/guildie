import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { type MutationCtx, mutation } from "./_generated/server";
import { vRegion, vTypeChoice } from "./schema";
import { CLASS_RULES } from "./shared/proficiencies";
import { steepnessOf, validStats, validTiers } from "./shared/statPriority";
import { canPrefer, type TypeChoice as GearTypeChoice, typesOf } from "./shared/upgrades";
import { CLASS_TOKENS, SPECS } from "./shared/weights";
import { requireUserId } from "./users";

/**
 * The player who claimed a character chooses what its stat priority shows:
 * another talent tree's, their own three to ten stats with how much each
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

/** Types first to last (or one `type`, from older clients), or null for none. */
const vTypeArg = v.union(v.null(), vTypeChoice);
/** Most types a preference can list. */
const MAX_TYPES = 8;

/**
 * The player who claimed a character chooses the armor and weapon types it
 * prefers (null: none, as before): others count less in gear suggestions,
 * or with `strict`, aren't suggested at all. Only types the class can use.
 */
export const setGear = mutation({
	args: { region: vRegion, slug: v.string(), armor: vTypeArg, weapon: vTypeArg },
	handler: async (ctx, { region, slug, armor, weapon }) => {
		await setGearPreference(ctx, await requireUserId(ctx), region, slug, armor, weapon);
	},
});

/** Most items a character can have removed from its suggestions. */
const MAX_DISMISSED = 500;

/**
 * The player who claimed a character removes an item from its gear
 * suggestions (`removed`), or puts it back: the rules leave removed items out
 * for it everywhere (Upgrades for me, the item panel, the addon's tooltips
 * after the app's next refresh).
 */
export const dismissItem = mutation({
	args: { region: vRegion, slug: v.string(), itemId: v.number(), removed: v.boolean() },
	handler: async (ctx, { region, slug, itemId, removed }) => {
		const userId = await requireUserId(ctx);
		const claim = (
			await ctx.db
				.query("ownedCharacters")
				.withIndex("by_slug", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
				.collect()
		).find((c) => c.userId === userId);
		if (!claim) throw new ConvexError("Only the player who claimed this character can change it.");
		const list = (claim.dismissedItems ?? []).filter((id) => id !== itemId);
		if (removed) list.push(itemId);
		await ctx.db.patch(claim._id, { dismissedItems: list.slice(-MAX_DISMISSED) });
	},
});

type Region = "us" | "eu" | "kr" | "tw";
export type Choice = null | { tree: number } | { stats: string[]; tiers?: number[] };
export type TypeChoice = null | GearTypeChoice;

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
		if (!validStats(choice.stats)) throw new ConvexError("Pick three to ten different stats.");
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
	const clean = (kind: "armor" | "weapon", choice: TypeChoice) => {
		const types = typesOf(choice ?? undefined);
		if (!choice || !types.length) return undefined;
		if (types.length > MAX_TYPES) throw new ConvexError(`Pick at most ${MAX_TYPES} types.`);
		if (new Set(types).size < types.length) throw new ConvexError("Each type once.");
		if (types.some((t) => !canPrefer(cls, kind, t))) {
			throw new ConvexError(
				kind === "armor" ? "This class can't wear that armor." : "This class can't use that weapon.",
			);
		}
		return { types, strict: choice.strict };
	};
	const a = clean("armor", armor);
	const w = clean("weapon", weapon);
	const gearPreference = { ...(a ? { armor: a } : {}), ...(w ? { weapon: w } : {}) };
	await ctx.db.patch(claim._id, {
		gearPreference: Object.keys(gearPreference).length ? gearPreference : undefined,
	});
}
