import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { vViewPrefPages } from "./schema";
import { requireUserId } from "./users";

// How a player likes to look at pages (sort, filters, list or grid), kept on
// the server so the first render already shows it, in the browser and the
// Windows app alike. The URL wins over these: a shared link opens as sent
// (src/lib/view-prefs.ts).

/** Their saved settings by page, or null when signed out. */
export const mine = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) return null;
		const row = await ctx.db
			.query("viewPrefs")
			.withIndex("by_user", (q) => q.eq("userId", userId as Id<"users">))
			.unique();
		if (!row) return {};
		const { _id, _creationTime, userId: _user, ...pages } = row;
		return pages;
	},
});

/** Replace the settings of the pages given; other pages keep theirs. */
export const set = mutation({
	args: vViewPrefPages,
	handler: async (ctx, pages) => {
		const userId = await requireUserId(ctx);
		// Short values only: these are option names, not text.
		for (const page of Object.values(pages)) {
			for (const value of Object.values(page ?? {})) {
				if (typeof value === "string" && value.length > 32) throw new ConvexError("Setting too long");
			}
		}
		const row = await ctx.db
			.query("viewPrefs")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.unique();
		if (row) await ctx.db.patch(row._id, pages);
		else await ctx.db.insert("viewPrefs", { userId, ...pages });
	},
});
