import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";
import { vBattlenetProfile } from "./authBattlenet";
import { guildsOf } from "./guilds";
import { pickProfile } from "./helper";
import { isLocalBackend } from "./origins";
import { preferencesOf, updatePreferences } from "./preferences";
import { claimSampleCharacter } from "./sample";
import { vRegion } from "./schema";
import { hiddenPatch, inSidebar } from "./shared/characters";

export async function requireUserId(ctx: QueryCtx | MutationCtx) {
	const userId = await getAuthUserId(ctx);
	if (userId === null) throw new ConvexError("Not signed in");
	return userId as Id<"users">;
}

const vBattlenetMethod = v.object({
	name: v.literal("battlenet"),
	profile: vBattlenetProfile,
});

export const createFromBattlenet = internalMutation({
	args: { method: vBattlenetMethod },
	returns: v.id("users"),
	handler: async (ctx, { method: { profile } }) => {
		// Convex Auth 2.0 moved the Battle.net accounts into the authBattlenet
		// component, so a player who signed in before the upgrade comes back as
		// "new". Their user row is still here: reuse it.
		const existing = await ctx.db
			.query("users")
			.withIndex("by_battlenetId", (q) => q.eq("battlenetId", profile.id))
			.first();
		if (existing) return existing._id;
		return await ctx.db.insert("users", {
			battlenetId: profile.id,
			battletag: profile.battletag,
			name: profile.battletag?.split("#")[0],
		});
	},
});

export const onBattlenetSignIn = internalMutation({
	args: { method: vBattlenetMethod, userId: v.id("users") },
	returns: v.null(),
	handler: async (ctx, { method: { profile }, userId }) => {
		const user = await ctx.db.get(userId);
		// BattleTags can change (paid name change); keep ours current.
		if (user && profile.battletag && user.battletag !== profile.battletag) {
			await ctx.db.patch(userId, { battletag: profile.battletag });
		}
		return null;
	},
});

/** The desktop app's sign-in (auth:signInWithDesktopCode): the account belongs to an existing user. */
export const createFromDesktop = internalMutation({
	args: {
		method: v.object({
			name: v.literal("desktop"),
			profile: v.object({ userId: v.id("users") }),
		}),
	},
	returns: v.id("users"),
	handler: async (ctx, { method: { profile } }) => {
		if (!(await ctx.db.get(profile.userId))) throw new ConvexError("No such user");
		return profile.userId;
	},
});

export const createFromGuest = internalMutation({
	args: {
		method: v.object({ name: v.literal("anonymous"), profile: v.object({}) }),
	},
	returns: v.id("users"),
	handler: async (ctx) => {
		if (!isLocalBackend()) throw new ConvexError("Guest sign-in is disabled");
		const userId = await ctx.db.insert("users", { name: "Guest" });
		// With the sample data (contributors), the guest plays one of its characters.
		await claimSampleCharacter(ctx, userId);
		return userId;
	},
});

export const guestEnabled = query({
	args: {},
	handler: async () => isLocalBackend(),
});

/**
 * What the sign-in page offers. Battle.net sign-in needs a client and a way
 * back from Battle.net (the dev gateway, or a callback URL of your own), which
 * a contributor's local backend doesn't have (docs/local-dev.md); guests are
 * local backends only.
 */
export const signInOptions = query({
	args: {},
	handler: async () => {
		const local = isLocalBackend();
		const clientId = process.env.AUTH_BATTLENET_CLIENT_ID;
		const callback = !!(process.env.AUTH_GATEWAY_SECRET || process.env.AUTH_BATTLENET_CALLBACK_URL);
		return { battlenet: !local || (!!clientId && clientId !== "unset" && callback), guest: local };
	},
});

export const viewer = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) return null;
		const user = await ctx.db.get(userId as Id<"users">);
		if (!user) return null;
		const owned = await ctx.db
			.query("ownedCharacters")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.collect();
		// The roster's copy has the face, the surname and a fresher level.
		const characters = await Promise.all(
			owned.map(async (c) => {
				const row = await ctx.db
					.query("characters")
					.withIndex("by_slug", (q) => q.eq("flavor", c.flavor).eq("region", c.region).eq("slug", c.slug))
					.first();
				// The level as the rest of the site shows it: the game's when newer.
				const level = row ? (await pickProfile(ctx, row)).level : c.level;
				const { sidebar } = await preferencesOf(ctx, c);
				const hidden = !!row?.hidden;
				return {
					...c,
					surname: row?.surname,
					avatarUrl: row?.avatarUrl,
					level,
					classId: row?.classId ?? c.classId,
					/** In the sidebar: the player's pin, else from level 5; never while hidden. */
					inSidebar: !hidden && inSidebar(level, sidebar),
					/** Taken off Guildie by the player (setHidden). */
					hidden,
					/** Hiding needs a roster row: characters in no guild aren't listed anywhere anyway. */
					canHide: !!row,
					isMain: user.mainCharacter?.region === c.region && user.mainCharacter.slug === c.slug,
				};
			}),
		);
		// The guilds their characters are in: header link, home page, where sign-in lands.
		const guilds = (await guildsOf(ctx, user._id)).map((g) => ({
			_id: g._id,
			name: g.name,
			region: g.region,
			slug: g.slug,
			memberCount: g.memberCount,
			faction: g.faction,
			// Settings → Guilds: owners (the guild master's player) can change who sees it.
			isOwner: g.ownerId === user._id,
			visibility: g.visibility,
		}));
		return { ...user, characters, guilds };
	},
});

/** One of the viewer's claimed characters, or a user-facing error. */
async function myClaim(ctx: MutationCtx, userId: Id<"users">, region: Doc<"ownedCharacters">["region"], slug: string) {
	const claim = (
		await ctx.db
			.query("ownedCharacters")
			.withIndex("by_slug", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
			.collect()
	).find((c) => c.userId === userId);
	if (!claim) throw new ConvexError("That isn't one of your characters.");
	return claim;
}

/** Account page: pin a character to my sidebar, or take it out. */
export const setInSidebar = mutation({
	args: { region: vRegion, slug: v.string(), shown: v.boolean() },
	handler: async (ctx, { region, slug, shown }) => {
		const userId = await requireUserId(ctx);
		await updatePreferences(ctx, await myClaim(ctx, userId, region, slug), { sidebar: shown });
	},
});

/** Account page: mark one of my characters as my main, or (null) none. */
export const setMain = mutation({
	args: { character: v.union(v.object({ region: vRegion, slug: v.string() }), v.null()) },
	handler: async (ctx, { character }) => {
		const userId = await requireUserId(ctx);
		if (character) await myClaim(ctx, userId, character.region, character.slug);
		await ctx.db.patch(userId, {
			mainCharacter: character ? { region: character.region, slug: character.slug } : undefined,
		});
	},
});

/** Account page: show or hide my BattleTag from guildmates on rosters. */
export const setHideBattletag = mutation({
	args: { hide: v.boolean() },
	handler: async (ctx, { hide }) => {
		const userId = await requireUserId(ctx);
		await ctx.db.patch(userId, { hideBattletag: hide || undefined });
	},
});

/**
 * Account page: take one of my characters off Guildie (a test or retired
 * character), or put it back. While hidden it's on no roster, feed, menu,
 * search or page, mine included; it keeps syncing for when it's back.
 */
export const setHidden = mutation({
	args: { region: vRegion, slug: v.string(), hidden: v.boolean() },
	handler: async (ctx, { region, slug, hidden }) => {
		const userId = await requireUserId(ctx);
		await myClaim(ctx, userId, region, slug);
		const rows = await ctx.db
			.query("characters")
			.withIndex("by_slug", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
			.collect();
		if (!rows.length) throw new ConvexError("That character isn't in a guild on Guildie yet.");
		const now = Date.now();
		for (const row of rows) {
			const change = hiddenPatch(row, hidden, now);
			if (change) await ctx.db.patch(row._id, change);
		}
	},
});
