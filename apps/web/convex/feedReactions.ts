import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { membership } from "./requests";
import { REACTIONS } from "./shared/reactions";

// Reactions to the feed (schema: feedReactions). Members only, like the
// feed. The page reads them with feed.list.

/**
 * React to a feed row, or take the reaction back. `eventIds`: the row's
 * events (a grouped row has several). If the viewer already has this
 * reaction on any of them, it comes off all of them; otherwise it goes on
 * the first.
 */
export const toggle = mutation({
	args: {
		eventIds: v.array(v.id("feedEvents")),
		reaction: v.union(...REACTIONS.map((r) => v.literal(r))),
	},
	handler: async (ctx, { eventIds, reaction }) => {
		const ids = [...new Set(eventIds)];
		if (!ids.length || ids.length > 300) throw new ConvexError("Nothing to react to.");
		const events = await Promise.all(ids.map((id) => ctx.db.get(id)));
		const first = events[0];
		if (!first || events.some((e) => !e || e.guildId !== first.guildId)) throw new ConvexError("That's gone.");
		const guild = await ctx.db.get(first.guildId);
		if (!guild) throw new ConvexError("That's gone.");
		const member = await membership(ctx, guild);
		if (!member) throw new ConvexError("Only this guild's members can react. Claim your character first.");

		const mine = (
			await Promise.all(
				ids.map((eventId) =>
					ctx.db
						.query("feedReactions")
						.withIndex("by_user_event", (q) => q.eq("userId", member.userId).eq("eventId", eventId))
						.collect(),
				),
			)
		)
			.flat()
			.filter((r) => r.reaction === reaction);
		if (mine.length) {
			for (const r of mine) await ctx.db.delete(r._id);
			return;
		}
		const c = member.characters[0];
		await ctx.db.insert("feedReactions", {
			guildId: guild._id,
			eventId: first._id,
			eventAt: first.at,
			userId: member.userId,
			character: { slug: c.slug, name: c.name, classId: c.classId },
			reaction,
			at: Date.now(),
		});
	},
});
