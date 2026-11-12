import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";

/**
 * What a player chose for one of their characters: stat priority, preferred
 * gear types, items removed from its suggestions. Kept in its own table
 * (characterPreferences), apart from the claim: a claim is what Battle.net
 * says the player owns and gets rewritten on every sign-in, preferences are
 * the player's and only they change them. Nothing else may delete or
 * overwrite them (preferences.test.ts checks the code for it).
 */
export type Preferences = Pick<Doc<"characterPreferences">, "statPriority" | "gearPreference" | "dismissedItems">;

type Key = Pick<Doc<"ownedCharacters">, "userId" | "flavor" | "region" | "slug">;

async function rowOf(ctx: QueryCtx, key: Key) {
	return await ctx.db
		.query("characterPreferences")
		.withIndex("by_user_slug", (q) =>
			q.eq("userId", key.userId).eq("flavor", key.flavor).eq("region", key.region).eq("slug", key.slug),
		)
		.unique();
}

/**
 * The preferences of the player who claimed a character (none without a
 * claim). Before the backfill (`backfill` below) they may still be on the
 * claim itself: those count until the player's row exists.
 */
export async function preferencesOf(
	ctx: QueryCtx,
	claim: Doc<"ownedCharacters"> | null | undefined,
): Promise<Preferences> {
	if (!claim) return {};
	const row = await rowOf(ctx, claim);
	const from = row ?? claim;
	return { statPriority: from.statPriority, gearPreference: from.gearPreference, dismissedItems: from.dismissedItems };
}

/**
 * The player changes some of a character's preferences (the fields given;
 * undefined clears one). The only writer of characterPreferences.
 */
export async function updatePreferences(ctx: MutationCtx, claim: Doc<"ownedCharacters">, change: Partial<Preferences>) {
	// Anything still on the claim (from before this table) comes along first.
	await moveLegacy(ctx, claim);
	const row = await rowOf(ctx, claim);
	if (row) {
		await ctx.db.patch(row._id, { ...change, updatedAt: Date.now() });
		return;
	}
	await ctx.db.insert("characterPreferences", {
		userId: claim.userId,
		flavor: claim.flavor,
		region: claim.region,
		slug: claim.slug,
		...strip(change),
		updatedAt: Date.now(),
	});
}

/** Leaves out undefined fields (insert doesn't take them). */
function strip(p: Partial<Preferences>): Preferences {
	return Object.fromEntries(Object.entries(p).filter(([, value]) => value !== undefined)) as Preferences;
}

/**
 * Moves preferences still stored on a claim (from before characterPreferences)
 * into the player's row, without overwriting a row they already have, and
 * clears them from the claim. Call it before deleting a claim. True if
 * there was anything to move.
 */
export async function moveLegacy(ctx: MutationCtx, claim: Doc<"ownedCharacters">) {
	const { statPriority, gearPreference, dismissedItems } = claim;
	if (statPriority === undefined && gearPreference === undefined && dismissedItems === undefined) return false;
	if (!(await rowOf(ctx, claim))) {
		await ctx.db.insert("characterPreferences", {
			userId: claim.userId,
			flavor: claim.flavor,
			region: claim.region,
			slug: claim.slug,
			...strip({ statPriority, gearPreference, dismissedItems }),
			updatedAt: Date.now(),
		});
	}
	await ctx.db.patch(claim._id, { statPriority: undefined, gearPreference: undefined, dismissedItems: undefined });
	return true;
}

/**
 * Migration (widen step): copies preferences still stored on claims into
 * characterPreferences, without overwriting a row the player already has,
 * and clears them from the claim. Run once on each deployment after this
 * deploys: `npx convex run preferences:backfill --deployment <name>`.
 * Reschedules itself until done.
 */
export const backfill = internalMutation({
	args: { cursor: v.optional(v.union(v.string(), v.null())) },
	handler: async (ctx, { cursor }): Promise<{ moved: number; done: boolean }> => {
		const page = await ctx.db.query("ownedCharacters").paginate({ cursor: cursor ?? null, numItems: 100 });
		let moved = 0;
		for (const claim of page.page) if (await moveLegacy(ctx, claim)) moved++;
		if (!page.isDone) await ctx.scheduler.runAfter(0, internal.preferences.backfill, { cursor: page.continueCursor });
		return { moved, done: page.isDone };
	},
});
