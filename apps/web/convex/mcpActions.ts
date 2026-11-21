import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { actorOf, fullName, pickGuild, requestLine, roster, vConnection } from "./mcp";
import { resolveItem, resolveRecipe } from "./mcpGuild";
import { markRead } from "./notifications";
import {
	actOnRequest,
	charactersIn,
	craftersOf,
	createRequest,
	type RequestAction,
	setMatsDeclared,
	updateOngoing,
} from "./requests";
import { fold, matches } from "./shared/mcpText";
import { ONGOING_DAYS } from "./shared/requests";
import { trackCraft, trackedOf, untrackCraft } from "./tracking";

// MCP tools that act for the player in their guilds (docs/mcp.md): requests
// (make, answer, close), tracked crafts and notifications. Only for
// connections the player allowed to (aiConnections.canAct, actorOf), and
// through the same functions and checks as the site: requests.ts,
// tracking.ts, notifications.ts. Whatever the site lets the player do here,
// the app can; nothing more.

/** A roster character in `guild` by name: the slug the request functions take. */
async function memberSlug(ctx: MutationCtx, guild: Doc<"guilds">, name: string, among?: Doc<"characters">[]) {
	const list = among ?? (await roster(ctx, guild));
	const slug = name.trim().toLowerCase();
	const hits = list.filter((c) => c.slug === slug || matches(name, c.name, c.surname));
	const exact = hits.find((c) => c.slug === slug) ?? (hits.length === 1 ? hits[0] : undefined);
	const firstName = hits.filter((c) => fold(c.name) === fold(name));
	const pick = exact ?? (firstName.length === 1 ? firstName[0] : undefined);
	if (!pick) {
		throw new ConvexError(
			hits.length
				? `Several in ${guild.name} match "${name}": ${hits.map(fullName).join(", ")}. Use the full name.`
				: `Nobody called "${name}" in ${guild.name}${among ? " among your characters there" : ""}.`,
		);
	}
	return pick.slug;
}

/** A request by the id the read tools print. */
async function requestById(ctx: MutationCtx, id: string) {
	const requestId = ctx.db.normalizeId(
		"requests",
		id
			.trim()
			.replace(/^\[?id\s*/i, "")
			.replace(/\]$/, ""),
	);
	const r = requestId && (await ctx.db.get(requestId));
	if (!r) throw new ConvexError(`No request with id "${id}". guild_requests and my_requests list them with their ids.`);
	return r;
}

export const createRequestTool = internalMutation({
	args: {
		...vConnection,
		guild: v.optional(v.string()),
		item: v.optional(v.string()),
		recipe: v.optional(v.string()),
		quantity: v.optional(v.number()),
		ongoing: v.optional(v.boolean()),
		days: v.optional(v.number()),
		note: v.optional(v.string()),
		character: v.optional(v.string()),
		crafter: v.optional(v.string()),
		hasMats: v.optional(v.boolean()),
	},
	handler: async (ctx, args): Promise<string> => {
		const userId = await actorOf(ctx, args.connectionId);
		const guild = await pickGuild(ctx, userId, args.guild);
		if (!args.item === !args.recipe)
			throw new ConvexError("Give an item (to be sent one) or a recipe (to have it crafted), not both.");
		const own = await charactersIn(ctx, userId, guild._id);
		const character = args.character ? await memberSlug(ctx, guild, args.character, own) : undefined;
		let id: Id<"requests">;
		if (args.recipe) {
			const recipe = await resolveRecipe(ctx, args.recipe);
			if (!args.crafter) {
				const who = (await craftersOf(ctx, guild._id, recipe.recipeId, userId)).filter((c) => c.onGuildie);
				throw new ConvexError(
					who.length
						? `Who should craft ${recipe.name}? Guildmates on Guildie who know it: ${who.map((c) => c.name).join(", ")}.`
						: `Nobody else in ${guild.name} on Guildie knows ${recipe.name}, so there's nobody to ask.`,
				);
			}
			id = await createRequest(ctx, userId, guild, {
				kind: "craft",
				recipeId: recipe.recipeId,
				quantity: args.quantity ?? 1,
				note: args.note,
				character,
				crafter: await memberSlug(ctx, guild, args.crafter),
				declared: args.hasMats,
			});
		} else {
			const item = await resolveItem(ctx, args.item as string);
			const days = args.ongoing ? (args.days ?? 30) : undefined;
			if (days !== undefined && !(ONGOING_DAYS as readonly number[]).includes(days))
				throw new ConvexError("An ongoing request lasts 14, 30 or 90 days.");
			id = await createRequest(ctx, userId, guild, {
				kind: "item",
				itemId: item.itemId,
				quantity: args.ongoing ? 0 : (args.quantity ?? 1),
				note: args.note,
				character,
				...(args.ongoing ? { ongoing: true, days } : {}),
			});
		}
		const made = await ctx.db.get(id);
		return `Request made in ${guild.name}; guildmates see it on Guildie${args.recipe ? " and the crafter was notified" : ""}.\n${
			made ? await requestLine(ctx, made, userId, Date.now()) : ""
		}`;
	},
});

const ACTIONS: Record<string, RequestAction> = {
	cancel: "cancel",
	done: "complete",
	still_needed: "keep",
	accept: "accept",
	decline: "decline",
	back_out: "unclaim",
	ask: "ask",
};

export const updateRequestTool = internalMutation({
	args: {
		...vConnection,
		request: v.string(),
		action: v.string(),
		crafter: v.optional(v.string()),
		days: v.optional(v.number()),
		note: v.optional(v.string()),
	},
	handler: async (ctx, { connectionId, request, action, crafter, days, note }): Promise<string> => {
		const userId = await actorOf(ctx, connectionId);
		const r = await requestById(ctx, request);
		const now = Date.now();
		if (action === "has_mats" || action === "no_mats") {
			await setMatsDeclared(ctx, userId, r._id, action === "has_mats");
		} else if (action === "change") {
			if (days === undefined && note === undefined) throw new ConvexError("Give new days (14, 30 or 90) or a note.");
			await updateOngoing(ctx, userId, r._id, { days, note: note ?? r.note });
		} else {
			const mapped = ACTIONS[action];
			if (!mapped) throw new ConvexError(`Unknown action "${action}".`);
			let slug: string | undefined;
			if (mapped === "ask") {
				const guild = await ctx.db.get(r.guildId);
				if (!guild) throw new ConvexError("That request is gone.");
				if (!crafter) {
					const who =
						r.recipeId !== undefined
							? (await craftersOf(ctx, r.guildId, r.recipeId, userId)).filter((c) => c.onGuildie)
							: [];
					throw new ConvexError(
						`Who should craft it? ${who.length ? `Guildmates on Guildie who know it: ${who.map((c) => c.name).join(", ")}.` : "Nobody else on Guildie knows it."}`,
					);
				}
				slug = await memberSlug(ctx, guild, crafter);
			}
			await actOnRequest(ctx, userId, r._id, mapped, slug);
		}
		const after = await ctx.db.get(r._id);
		return after ? `Done.\n${await requestLine(ctx, after, userId, now)}` : "Done.";
	},
});

export const trackCraftTool = internalMutation({
	args: { ...vConnection, recipe: v.string(), quantity: v.optional(v.number()) },
	handler: async (ctx, { connectionId, recipe: text, quantity }): Promise<string> => {
		const userId = await actorOf(ctx, connectionId);
		const recipe = await resolveRecipe(ctx, text);
		const n = await trackCraft(ctx, userId, recipe.recipeId, quantity);
		return `Tracking ${recipe.name} ×${n} (${recipe.profession}). Its reagents show in tracked_crafts, on Guildie's Inventory, and on their tooltips in game after the next upload. Needs per craft: ${recipe.reagents.map((r) => `${r.quantity}× ${r.name}`).join(", ") || "nothing"}.`;
	},
});

export const untrackCraftTool = internalMutation({
	args: { ...vConnection, recipe: v.string() },
	handler: async (ctx, { connectionId, recipe: text }): Promise<string> => {
		const userId = await actorOf(ctx, connectionId);
		// One of the tracked ones by name first, so "Bag" finds the tracked bag.
		const tracked = await trackedOf(ctx, userId);
		let recipeId: number | undefined;
		let name = text;
		for (const t of tracked) {
			const r = await ctx.db
				.query("recipes")
				.withIndex("by_recipeId", (q) => q.eq("recipeId", t.recipeId))
				.unique();
			if (r && (String(r.recipeId) === text.trim() || fold(r.name) === fold(text))) {
				recipeId = r.recipeId;
				name = r.name;
			}
		}
		if (recipeId === undefined) {
			const recipe = await resolveRecipe(ctx, text);
			recipeId = recipe.recipeId;
			name = recipe.name;
		}
		return (await untrackCraft(ctx, userId, recipeId)) ? `Stopped tracking ${name}.` : `${name} wasn't tracked.`;
	},
});

export const markNotificationsReadTool = internalMutation({
	args: vConnection,
	handler: async (ctx, { connectionId }): Promise<string> => {
		const userId = await actorOf(ctx, connectionId);
		const n = await markRead(ctx, userId);
		return n ? `Marked ${n} notifications read.` : "Nothing was unread.";
	},
});
