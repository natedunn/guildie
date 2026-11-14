import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";
import {
	CHANNELS,
	GAME_WINDOW_MS,
	KEEP_MS,
	type NotificationKind,
	notificationText,
	TOAST_WINDOW_MS,
} from "./shared/notifications";

// Notifications: things that happened to a player's requests, for the site's
// inbox, the Windows app (a system notification, helper.takeToasts) and the
// addon (a chat line at login, GuildieData.notifications). Each is written
// once, with its text, when it happens.

type Actor = { name: string; slug: string; classId: number };

/** "Silk Bandage ×2", "20 Silk Cloth": what a request is for, in a sentence. */
async function requestName(ctx: QueryCtx, r: Doc<"requests">) {
	const item =
		r.itemId === undefined
			? null
			: await ctx.db
					.query("items")
					.withIndex("by_itemId", (q) => q.eq("itemId", r.itemId as number))
					.first();
	const recipe =
		item || r.recipeId === undefined
			? null
			: await ctx.db
					.query("recipes")
					.withIndex("by_recipeId", (q) => q.eq("recipeId", r.recipeId as number))
					.first();
	const name = item?.name ?? recipe?.name ?? (r.itemId ? `item ${r.itemId}` : "a craft");
	return { name, quantity: r.ongoing || r.quantity <= 1 ? undefined : r.quantity };
}

/** Tell a request's requester something happened to it. */
export async function notifyRequester(ctx: MutationCtx, r: Doc<"requests">, kind: NotificationKind, actor?: Actor) {
	const guild = await ctx.db.get(r.guildId);
	if (!guild) return;
	await ctx.db.insert("notifications", {
		userId: r.userId,
		guildId: r.guildId,
		kind,
		requestId: r._id,
		...(actor ? { actor: { name: actor.name, slug: actor.slug, classId: actor.classId } } : {}),
		text: notificationText(kind, await requestName(ctx, r), actor),
		link: `/g/${guild.region}/${guild.slug}/requests?view=mine`,
		at: Date.now(),
	});
}

const recent = (ctx: QueryCtx, userId: Id<"users">) =>
	ctx.db
		.query("notifications")
		.withIndex("by_user", (q) => q.eq("userId", userId))
		.order("desc");

/** The inbox: the latest 50, newest first, with the guild's name. */
export const list = query({
	args: {},
	handler: async (ctx) => {
		const userId = (await getAuthUserId(ctx)) as Id<"users"> | null;
		if (!userId) return null;
		const rows = await recent(ctx, userId).take(50);
		const guilds = new Map<Id<"guilds">, Doc<"guilds"> | null>();
		for (const n of rows) if (!guilds.has(n.guildId)) guilds.set(n.guildId, await ctx.db.get(n.guildId));
		return rows.flatMap((n) => {
			const guild = guilds.get(n.guildId);
			if (!guild) return [];
			return [
				{
					_id: n._id,
					kind: n.kind,
					text: n.text,
					actor: n.actor,
					guild: { name: guild.name, region: guild.region, slug: guild.slug },
					at: n.at,
					read: n.readAt !== undefined,
				},
			];
		});
	},
});

/** The sidebar's count. */
export const unread = query({
	args: {},
	handler: async (ctx) => {
		const userId = (await getAuthUserId(ctx)) as Id<"users"> | null;
		if (!userId) return 0;
		const rows = await ctx.db
			.query("notifications")
			.withIndex("by_user_read", (q) => q.eq("userId", userId).eq("readAt", undefined))
			.take(100);
		return rows.length;
	},
});

/** Opening the inbox reads everything in it. */
export const markAllRead = mutation({
	args: {},
	handler: async (ctx) => {
		const userId = (await getAuthUserId(ctx)) as Id<"users"> | null;
		if (!userId) return;
		const now = Date.now();
		const rows = await ctx.db
			.query("notifications")
			.withIndex("by_user_read", (q) => q.eq("userId", userId).eq("readAt", undefined))
			.take(500);
		for (const n of rows) await ctx.db.patch(n._id, { readAt: now });
	},
});

/**
 * For the Windows app (helper.takeToasts): recent ones meant for the
 * desktop that no app has shown yet, marked shown. With the app on two
 * computers, whichever asks first shows it.
 */
export async function takeToasts(ctx: MutationCtx, userId: Id<"users">) {
	const now = Date.now();
	const rows = await ctx.db
		.query("notifications")
		.withIndex("by_user_toast", (q) =>
			q
				.eq("userId", userId)
				.eq("toastedAt", undefined)
				.gt("at", now - TOAST_WINDOW_MS),
		)
		.take(20);
	const toasts: { id: string; text: string; link: string }[] = [];
	for (const n of rows) {
		await ctx.db.patch(n._id, { toastedAt: now });
		if (n.readAt === undefined && CHANNELS[n.kind].desktop) toasts.push({ id: n._id, text: n.text, link: n.link });
	}
	return toasts;
}

/** For GuildieData: recent unread ones meant for the game (the addon prints each once). */
export async function forGame(ctx: QueryCtx, userId: Id<"users">) {
	const now = Date.now();
	const rows = await ctx.db
		.query("notifications")
		.withIndex("by_user_read", (q) =>
			q
				.eq("userId", userId)
				.eq("readAt", undefined)
				.gt("at", now - GAME_WINDOW_MS),
		)
		.take(50);
	return rows.filter((n) => CHANNELS[n.kind].game).map((n) => ({ id: n._id as string, text: n.text }));
}

/** Daily: notifications older than 60 days go. */
export const prune = internalMutation({
	args: {},
	handler: async (ctx) => {
		const old = await ctx.db
			.query("notifications")
			.withIndex("by_at", (q) => q.lt("at", Date.now() - KEEP_MS))
			.take(500);
		for (const n of old) await ctx.db.delete(n._id);
	},
});
