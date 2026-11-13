import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalQuery, type QueryCtx, query } from "./_generated/server";
import { snapshotOf } from "./helper";
import { isLocalBackend } from "./origins";
import { auditCharacter, type Finding, mergeProfile } from "./profile.ts";
import { vRegion } from "./schema";

// Which source each part of a character comes from (the game or Blizzard),
// and why: the rules are in profile.ts. For maintainers only: a panel on the
// character page, and an audit to run after deploys:
//
//   npx convex run sources:audit --deployment <name>
//
// Maintainers are the Battle.net account ids in MAINTAINER_BATTLENET_IDS
// (comma-separated, set per deployment), and anyone on a local backend.

async function isMaintainer(ctx: QueryCtx) {
	if (isLocalBackend()) return true;
	const userId = await getAuthUserId(ctx);
	if (!userId) return false;
	const user = await ctx.db.get(userId);
	const ids = (process.env.MAINTAINER_BATTLENET_IDS ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	return Boolean(user?.battlenetId && ids.includes(user.battlenetId));
}

/** Per section: what each source has, which one is shown, and why. Null unless a maintainer asks. */
export const character = query({
	args: { region: vRegion, slug: v.string() },
	handler: async (ctx, { region, slug }) => {
		if (!(await isMaintainer(ctx))) return null;
		const character = await ctx.db
			.query("characters")
			.withIndex("by_slug", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
			.first();
		if (!character) return null;
		const snapshot = await snapshotOf(ctx, character);
		const profile = mergeProfile(character, snapshot);
		return {
			decisions: profile.decisions,
			blizzard: {
				lastLoginAt: character.lastLoginAt,
				profileSyncedAt: character.profileSyncedAt,
				profileMissing: character.profileMissing ?? false,
			},
			addon: snapshot
				? {
						capturedAt: snapshot.capturedAt,
						receivedAt: snapshot.receivedAt,
						version: snapshot.version,
						recipes: (snapshot.recipes ?? []).map((r) => ({
							profession: r.profession,
							capturedAt: r.capturedAt,
							count: r.recipeIds.length,
						})),
					}
				: null,
		};
	},
});

/**
 * Characters whose shown data breaks the rules or whose sources disagree on
 * being empty, a page at a time (pass `continueCursor` back as the cursor).
 */
export const audit = internalQuery({
	args: { paginationOpts: v.optional(paginationOptsValidator) },
	handler: async (ctx, { paginationOpts }) => {
		const page = await ctx.db.query("characters").paginate(paginationOpts ?? { numItems: 200, cursor: null });
		const findings: Finding[] = [];
		for (const character of page.page) {
			const snapshot = await snapshotOf(ctx, character);
			if (!snapshot && character.lastLoginAt === undefined) continue;
			findings.push(...auditCharacter(character, snapshot));
		}
		return { checked: page.page.length, findings, isDone: page.isDone, continueCursor: page.continueCursor };
	},
});
