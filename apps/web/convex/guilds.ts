import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";
import { pickProfile } from "./helper";
import { vRegion, vVisibility } from "./schema";
import { TALENT_TREE_BY_ID } from "./shared/foreverTalents";
import { statPriority } from "./shared/statPriority";
import { guildSlug, MANUAL_SYNC_COOLDOWN_MS } from "./shared/wow";
import { requireUserId } from "./users";

/** Manual "sync now" is allowed once per this window. */

/** The guilds a user's claimed characters are in now (per the last roster syncs). */
export async function guildsOf(ctx: QueryCtx, userId: Id<"users">) {
	const owned = await ctx.db
		.query("ownedCharacters")
		.withIndex("by_user", (q) => q.eq("userId", userId))
		.collect();
	const ids = new Set<Id<"guilds">>();
	for (const c of owned) {
		const rows = await ctx.db
			.query("characters")
			.withIndex("by_slug", (q) => q.eq("flavor", c.flavor).eq("region", c.region).eq("slug", c.slug))
			.collect();
		for (const row of rows) if (row.inRoster) ids.add(row.guildId);
	}
	const guilds = await Promise.all([...ids].map((id) => ctx.db.get(id)));
	return guilds.filter((g) => g !== null);
}

/** True when the viewer owns a character that's in this guild's roster. */
async function isMember(ctx: QueryCtx, guild: Doc<"guilds">, userId: Id<"users"> | null) {
	if (!userId) return false;
	return (await guildsOf(ctx, userId)).some((g) => g._id === guild._id);
}

/** Make the guild master's player the owner (roster syncs and claims call this). */
export async function setOwner(ctx: MutationCtx, guildId: Id<"guilds">, userId: Id<"users">) {
	const guild = await ctx.db.get(guildId);
	if (guild && guild.ownerId !== userId) await ctx.db.patch(guildId, { ownerId: userId });
}

export async function access(ctx: QueryCtx, guild: Doc<"guilds">) {
	const userId = (await getAuthUserId(ctx)) as Id<"users"> | null;
	const isOwner = userId !== null && guild.ownerId === userId;
	const member = isOwner || (await isMember(ctx, guild, userId));
	return { canView: guild.visibility === "public" || member, isOwner, isMember: member };
}

/**
 * Find a guild by name (the home page's search). Public guilds only: there's
 * no list of every guild, and members-only guilds don't turn up for anyone.
 */
export const search = query({
	args: { q: v.string() },
	handler: async (ctx, { q }) => {
		const text = q.trim().slice(0, 64);
		if (text.length < 2) return [];
		const guilds = await ctx.db
			.query("guilds")
			.withSearchIndex("search_name", (s) => s.search("name", text).eq("visibility", "public"))
			.take(8);
		return guilds.map((g) => ({
			_id: g._id,
			name: g.name,
			slug: g.slug,
			region: g.region,
			memberCount: g.memberCount,
			faction: g.faction,
		}));
	},
});

export const get = query({
	args: { region: vRegion, slug: v.string() },
	handler: async (ctx, { region, slug }) => {
		const guild = await ctx.db
			.query("guilds")
			.withIndex("by_key", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
			.unique();
		if (!guild) return null;
		const { canView, isOwner, isMember } = await access(ctx, guild);
		if (!canView) {
			return {
				guild: { _id: guild._id, name: guild.name, region: guild.region, visibility: guild.visibility },
				hidden: true as const,
			};
		}
		const characters = await ctx.db
			.query("characters")
			.withIndex("by_guild", (q) => q.eq("guildId", guild._id).eq("inRoster", true))
			.collect();
		// Mark which characters someone has claimed. Members (never the public)
		// also see the claimant's BattleTag, unless that player hid it.
		// Each with the addon's newer data on top of Blizzard's (convex/profile.ts).
		const profiles = await Promise.all(characters.map((c) => pickProfile(ctx, c)));
		const claimed = await Promise.all(
			characters.map((c) =>
				ctx.db
					.query("ownedCharacters")
					.withIndex("by_slug", (q) => q.eq("flavor", c.flavor).eq("region", c.region).eq("slug", c.slug))
					.first(),
			),
		);
		const tags = new Map<Id<"users">, string | undefined>();
		if (isMember) {
			for (const claim of claimed) {
				if (!claim || tags.has(claim.userId)) continue;
				const user = await ctx.db.get(claim.userId);
				tags.set(claim.userId, user && !user.hideBattletag ? user.battletag : undefined);
			}
		}
		return {
			guild,
			hidden: false as const,
			isOwner,
			isMember,
			members: characters.map((c, i) => ({
				_id: c._id,
				slug: c.slug,
				name: c.name,
				surname: c.surname,
				level: profiles[i].level,
				classId: c.classId,
				raceId: c.raceId,
				rank: c.rank,
				lastLoginAt: c.lastLoginAt,
				averageItemLevel: profiles[i].averageItemLevel,
				professions: profiles[i].professions.map(({ id, name, skill, maxSkill, secondary }) => ({
					id,
					name,
					skill,
					maxSkill,
					secondary,
				})),
				talentTrees: profiles[i].talentTrees?.map(({ id, name, points }) => ({ id, name, points })),
				talentSource: profiles[i].sources.talents,
				// When this character's data was last current, and from where: an
				// in-game sync by the Guildie app when any of it is newer than
				// Blizzard's, else Blizzard (as of their last logout).
				synced: profiles[i].synced,
				avatarUrl: c.avatarUrl,
				profileMissing: c.profileMissing,
				claimed: claimed[i] !== null,
				battletag: claimed[i] ? tags.get(claimed[i].userId) : undefined,
				statPriority: statPriority(c.classId, profiles[i].talentTrees, claimed[i]?.statPriority),
				// The armor and weapon types the player chose, if any (the roster's Gear view).
				gearPreference: claimed[i]?.gearPreference,
			})),
		};
	},
});

export const character = query({
	args: { region: vRegion, slug: v.string() },
	handler: async (ctx, { region, slug }) => {
		const character = await ctx.db
			.query("characters")
			.withIndex("by_slug", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
			.first();
		if (!character) return null;
		const guild = await ctx.db.get(character.guildId);
		if (!guild || !(await access(ctx, guild)).canView) return null;
		const profile = await pickProfile(ctx, character);
		// The player who claimed it may have chosen its stat priority; only they can change it.
		const claims = await ctx.db
			.query("ownedCharacters")
			.withIndex("by_slug", (q) => q.eq("flavor", character.flavor).eq("region", character.region).eq("slug", slug))
			.collect();
		const userId = await getAuthUserId(ctx);
		const mine = userId ? claims.find((c) => c.userId === userId) : undefined;
		const equipment = await Promise.all(
			(profile.equipment ?? []).map(async (item) => {
				const known = await itemRow(ctx, item.itemId);
				return { ...item, icon: known?.icon };
			}),
		);
		// All of the class's trees, so empty ones show too, in the game's order.
		const layouts = await ctx.db
			.query("talentLayouts")
			.withIndex("by_classId", (q) => q.eq("classId", character.classId))
			.collect();
		return {
			character: {
				...character,
				level: profile.level,
				averageItemLevel: profile.averageItemLevel,
				equipment,
				professions: profile.professions,
				talentTrees: profile.talentTrees,
			},
			/** Where each part came from: the game (the Guildie addon) or Blizzard. */
			sources: profile.sources,
			talentSource: profile.sources.talents,
			synced: profile.synced,
			statPriority: statPriority(character.classId, profile.talentTrees, (mine ?? claims[0])?.statPriority),
			/** Preferred armor and weapon types for gear suggestions (shared/upgrades.ts gearPrefs), if chosen. */
			gearPreference: (mine ?? claims[0])?.gearPreference,
			/** The viewer claimed this character: they can choose its stat priority. */
			canEdit: mine !== undefined,
			talentLayouts: layouts
				.map(({ specId, name, nodes }) => ({
					specId,
					name,
					nodes,
					order: nodes.map((n) => TALENT_TREE_BY_ID.get(n.talentId)?.treeIndex).find((i) => i !== undefined) ?? specId,
				}))
				.sort((a, b) => a.order - b.order),
			guild: { name: guild.name, slug: guild.slug, region: guild.region },
		};
	},
});

export const add = mutation({
	args: { region: vRegion, name: v.string() },
	handler: async (ctx, { region, name }) => {
		await requireUserId(ctx);
		const slug = guildSlug(name);
		if (!slug) throw new ConvexError("Enter a guild name");
		const existing = await ctx.db
			.query("guilds")
			.withIndex("by_key", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
			.unique();
		if (existing) return { region, slug };
		await insertGuild(ctx, { region, slug, name: name.trim() });
		return { region, slug };
	},
});

/**
 * A new guild: public, no owner until a roster sync finds that its guild
 * master's character is claimed (sync.ts applyRoster).
 */
async function insertGuild(ctx: MutationCtx, g: { region: Doc<"guilds">["region"]; slug: string; name: string }) {
	const guildId = await ctx.db.insert("guilds", {
		flavor: "forever",
		...g,
		visibility: "public",
		memberCount: 0,
	});
	await ctx.scheduler.runAfter(0, internal.sync.syncGuild, { guildId });
	return guildId;
}

/** After a claim: make sure the guilds the player's characters are in exist here. */
export const ensureGuilds = internalMutation({
	args: { guilds: v.array(v.object({ region: vRegion, slug: v.string(), name: v.string() })) },
	handler: async (ctx, { guilds }) => {
		const out = [];
		for (const g of guilds) {
			const existing = await ctx.db
				.query("guilds")
				.withIndex("by_key", (q) => q.eq("flavor", "forever").eq("region", g.region).eq("slug", g.slug))
				.unique();
			if (!existing) await insertGuild(ctx, g);
			out.push({ region: g.region, slug: g.slug, name: existing?.name ?? g.name });
		}
		return out;
	},
});

export const requestSync = mutation({
	args: { guildId: v.id("guilds") },
	handler: async (ctx, { guildId }) => {
		await requireUserId(ctx);
		const guild = await ctx.db.get(guildId);
		if (!guild) throw new ConvexError("No such guild");
		const now = Date.now();
		if (guild.rosterSyncedAt && now - guild.rosterSyncedAt < MANUAL_SYNC_COOLDOWN_MS) {
			throw new ConvexError("Synced a few minutes ago. Try again later.");
		}
		// One at a time: a sync asked for in the last two minutes is still running.
		if (
			guild.syncRequestedAt &&
			guild.syncRequestedAt > (guild.rosterSyncedAt ?? 0) &&
			now - guild.syncRequestedAt < 2 * 60_000
		)
			return;
		await ctx.db.patch(guildId, { syncRequestedAt: now });
		await ctx.scheduler.runAfter(0, internal.sync.syncGuild, { guildId });
	},
});

/** The sidebar's sync row: when a guild last synced, a sync in flight, the last error. */
export const syncStatus = query({
	args: { region: vRegion, slug: v.string() },
	handler: async (ctx, { region, slug }) => {
		const guild = await ctx.db
			.query("guilds")
			.withIndex("by_key", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
			.unique();
		if (!guild || !(await access(ctx, guild)).canView) return null;
		return {
			_id: guild._id,
			name: guild.name,
			syncedAt: guild.rosterSyncedAt,
			requestedAt: guild.syncRequestedAt,
			lastSyncError: guild.lastSyncError,
		};
	},
});

export const setVisibility = mutation({
	args: { guildId: v.id("guilds"), visibility: vVisibility },
	handler: async (ctx, { guildId, visibility }) => {
		const userId = await requireUserId(ctx);
		const guild = await ctx.db.get(guildId);
		if (!guild || guild.ownerId !== userId) throw new ConvexError("Only the guild's owner can change this");
		await ctx.db.patch(guildId, { visibility });
	},
});

export async function itemRow(ctx: QueryCtx, itemId: number) {
	return await ctx.db
		.query("items")
		.withIndex("by_itemId", (q) => q.eq("itemId", itemId))
		.unique();
}
