import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import { catalogFor, foldersFor } from "./addonCatalog";
import { access } from "./guilds";
import { vAddonShare, vRegion } from "./schema";
import { type AddonEntry, canSeeAddons, summarizeAddons } from "./shared/addons";
import { requireUserId } from "./users";

// The addons players run in game (playerAddons in schema.ts). Opt in: the
// addon reads the list every time, but uploads keep it only while the player
// shares it (helper.ts storeAddons). Shown on each of the player's characters
// (Addons tab, guilds.character) and summed up per guild (the guild's Addons
// page). "Guild" means members of the guild being looked at.

/** Addons summed up, with what CurseForge says about them. */
async function summarize(ctx: QueryCtx, people: { list: AddonEntry[] }[]) {
	const folders = await foldersFor(
		ctx,
		people.flatMap((p) => p.list.filter((a) => !a.curseId).map((a) => a.name)),
	);
	const ids = [...people.flatMap((p) => p.list.flatMap((a) => (a.curseId ? [a.curseId] : []))), ...folders.values()];
	return summarizeAddons(people, await catalogFor(ctx, ids), folders);
}

export async function addonRow(ctx: QueryCtx, userId: Id<"users">) {
	return await ctx.db
		.query("playerAddons")
		.withIndex("by_user", (q) => q.eq("userId", userId))
		.unique();
}

/**
 * A character's Addons tab: its player's list if the viewer may see it, null
 * otherwise. The player always gets an answer, with their choice, so the tab
 * can ask them to share.
 */
export async function characterAddons(
	ctx: QueryCtx,
	ownerId: Id<"users"> | undefined,
	viewer: { isOwner: boolean; isMember: boolean },
) {
	if (!ownerId) return null;
	const row = await addonRow(ctx, ownerId);
	const share = row?.share ?? "none";
	if (!canSeeAddons(share, viewer)) return null;
	if (!viewer.isOwner && !row?.list) return null;
	const list = row?.list ?? [];
	return {
		share,
		mine: viewer.isOwner,
		capturedAt: row?.capturedAt,
		addons: await summarize(ctx, [{ list }]),
	};
}

/** Settings → Account: my choice, and what's kept. */
export const mine = query({
	args: {},
	handler: async (ctx) => {
		const userId = (await getAuthUserId(ctx)) as Id<"users"> | null;
		if (!userId) return null;
		const row = await addonRow(ctx, userId);
		return { share: row?.share ?? "none", count: row?.list?.length, capturedAt: row?.capturedAt };
	},
});

/** Choose who sees my addons. "none" deletes the list we kept. */
export const setShare = mutation({
	args: { share: vAddonShare },
	handler: async (ctx, { share }) => {
		const userId = await requireUserId(ctx);
		const row = await addonRow(ctx, userId);
		if (!row) {
			if (share !== "none") await ctx.db.insert("playerAddons", { userId, share });
			return;
		}
		if (share === "none") {
			await ctx.db.patch(row._id, { share, list: undefined, capturedAt: undefined, receivedAt: undefined });
		} else {
			await ctx.db.patch(row._id, { share });
		}
	},
});

/**
 * A guild's Addons page: what its members who share run, most used first.
 * Members see lists shared with the guild or publicly; anyone else who can
 * see the guild, public ones only. Each player shows as their highest-level
 * character in this guild.
 */
export const guild = query({
	args: { region: vRegion, slug: v.string() },
	handler: async (ctx, { region, slug }) => {
		const guild = await ctx.db
			.query("guilds")
			.withIndex("by_key", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
			.unique();
		if (!guild) return null;
		const { canView, isMember } = await access(ctx, guild);
		if (!canView) return null;
		const viewerId = (await getAuthUserId(ctx)) as Id<"users"> | null;
		const characters = await ctx.db
			.query("characters")
			.withIndex("by_guild", (q) => q.eq("guildId", guild._id).eq("inRoster", true))
			.collect();
		// Each player's characters in this guild.
		const byUser = new Map<Id<"users">, Doc<"characters">[]>();
		for (const c of characters) {
			const claim = await ctx.db
				.query("ownedCharacters")
				.withIndex("by_slug", (q) => q.eq("flavor", c.flavor).eq("region", c.region).eq("slug", c.slug))
				.first();
			if (!claim) continue;
			byUser.set(claim.userId, [...(byUser.get(claim.userId) ?? []), c]);
		}
		const people = [];
		for (const [userId, theirs] of byUser) {
			const row = await addonRow(ctx, userId);
			if (!row?.list) continue;
			if (!canSeeAddons(row.share, { isOwner: userId === viewerId, isMember })) continue;
			const main = [...theirs].sort((a, b) => b.level - a.level || a.name.localeCompare(b.name))[0];
			people.push({
				character: { slug: main.slug, name: main.name, classId: main.classId, level: main.level },
				alts: theirs.length - 1,
				capturedAt: row.capturedAt,
				count: row.list.length,
				list: row.list,
			});
		}
		people.sort((a, b) => a.character.name.localeCompare(b.character.name));
		const addons = await summarize(ctx, people);
		return {
			isMember,
			/** Whether the viewer shares theirs (to point them at the setting). */
			viewerShares: viewerId ? ((await addonRow(ctx, viewerId))?.share ?? "none") : null,
			people: people.map(({ list: _list, ...p }) => p),
			addons,
		};
	},
});
