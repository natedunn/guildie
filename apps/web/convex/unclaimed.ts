import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, query } from "./_generated/server";
import { type AddonCharacter, blizzardIdFromGuid, lastClaimAt, noticeUnclaimed } from "./addonPayload";
import { CLASSES } from "./shared/wow";
import { requireUserId } from "./users";

// Characters the addon uploads that aren't among the player's claimed ones.
// The addon keeps every character it ever saw, deleted ones included, so the
// desktop app would say "not claimed yet" about a deleted character forever.
// noticeUnclaimed (addonPayload.ts) already skips most of them; the rest show
// on Settings → Account, where the player refreshes their characters (a new
// one) or forgets it (a deleted one).

/** "MAGE" -> 8. */
const classIdOf = (token: string | undefined) =>
	token ? Number(Object.entries(CLASSES).find(([, c]) => c.name.toUpperCase() === token)?.[0]) || undefined : undefined;

/**
 * During an upload, for a character the player hasn't claimed: keep its row
 * current and say whether to tell the player about it.
 */
export async function noteUnclaimed(
	ctx: MutationCtx,
	userId: Id<"users">,
	c: AddonCharacter,
	claimedAt: number | undefined,
	now: number,
) {
	const blizzardId = blizzardIdFromGuid(c.guid);
	const notice = noticeUnclaimed(c.capturedAt, claimedAt, now);
	if (blizzardId === undefined) return notice;
	const row = await ctx.db
		.query("unclaimedCharacters")
		.withIndex("by_user", (q) => q.eq("userId", userId).eq("blizzardId", blizzardId))
		.unique();
	if (row?.forgotten) return false;
	if (!notice) {
		if (row) await ctx.db.delete(row._id);
		return false;
	}
	const fields = { name: c.name, classId: classIdOf(c.classToken), level: c.level, lastPlayedAt: c.capturedAt };
	if (!row) await ctx.db.insert("unclaimedCharacters", { userId, blizzardId, ...fields });
	else if (row.lastPlayedAt < c.capturedAt) await ctx.db.patch(row._id, fields);
	return true;
}

/** Settings → Account: unclaimed characters still worth asking about. */
export const mine = query({
	args: {},
	handler: async (ctx) => {
		const userId = await requireUserId(ctx);
		const owned = await ctx.db
			.query("ownedCharacters")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		const claimedIds = new Set(owned.map((o) => o.blizzardId));
		const claimedAt = lastClaimAt(owned);
		const now = Date.now();
		const rows = await ctx.db
			.query("unclaimedCharacters")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		return rows
			.filter((r) => !r.forgotten && !claimedIds.has(r.blizzardId) && noticeUnclaimed(r.lastPlayedAt, claimedAt, now))
			.sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
			.map(({ blizzardId, name, classId, level, lastPlayedAt }) => ({
				blizzardId,
				name,
				classId,
				level,
				lastPlayedAt,
			}));
	},
});

/** "Forget": a deleted character (or someone else's); uploads skip it quietly from now on. */
export const forget = mutation({
	args: { blizzardId: v.number() },
	handler: async (ctx, { blizzardId }) => {
		const userId = await requireUserId(ctx);
		const row = await ctx.db
			.query("unclaimedCharacters")
			.withIndex("by_user", (q) => q.eq("userId", userId).eq("blizzardId", blizzardId))
			.unique();
		if (row) await ctx.db.patch(row._id, { forgotten: true });
	},
});
