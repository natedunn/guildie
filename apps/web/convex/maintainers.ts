import { getAuthUserId } from "@convex-dev/auth/server";
import { type QueryCtx, query } from "./_generated/server";
import { isLocalBackend } from "./origins";

// Maintainers: the Battle.net account ids in MAINTAINER_BATTLENET_IDS
// (comma-separated, set per deployment), and anyone on a local backend.
// They see the Admin page (src/routes/admin.tsx) and the character page's
// "Data sources" panel. Their queries return null for everyone else.

export async function isMaintainer(ctx: QueryCtx) {
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

/** Is the viewer a maintainer? (The sidebar's Admin link.) */
export const me = query({
	args: {},
	handler: (ctx) => isMaintainer(ctx),
});
