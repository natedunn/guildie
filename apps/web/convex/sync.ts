import { type Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalAction, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { appToken, blizzardGet } from "./blizzard";
import { guildOfProfile } from "./claimRegions";
import { setOwner } from "./guilds";
import { type ItemPreview, tooltipLines } from "./items";
import { isSampleGuild } from "./sample";
import { vEquippedItem, vTalentTree } from "./schema";
import { TALENT_TREE_BY_ID } from "./shared/foreverTalents";
import { FLAVORS, type Region } from "./shared/wow";

// Roster sync (hourly cron + on demand) and per-character profile sync.
// Blizzard allows 100 requests/s and 36,000/hour per client; a character
// costs 6 requests, so profile syncs are staggered.

const PROFILE_STAGGER_MS = 150;
/** Re-fetch a character's profile at most this often. */
const PROFILE_TTL_MS = 60 * 60_000;

type Roster = {
	guild: { name: string; faction?: { type?: string } };
	members: {
		rank: number;
		character: {
			id?: number;
			name: string;
			surname?: string;
			slug?: string;
			level: number;
			playable_class: { id: number };
			playable_race: { id: number };
			faction?: { type?: string };
		};
	}[];
};

type GuildInfo = { name: string; ruleset?: { name?: string }; faction?: { type?: string } };

export const getGuild = internalQuery({
	args: { guildId: v.id("guilds") },
	handler: async (ctx, { guildId }) => await ctx.db.get(guildId),
});

export const syncGuild = internalAction({
	/** `force`: refetch every member's profile now, not just stale ones (e.g. after adding a field). */
	args: { guildId: v.id("guilds"), force: v.optional(v.boolean()) },
	handler: async (ctx, { guildId, force }) => {
		const guild = await ctx.runQuery(internal.sync.getGuild, { guildId });
		// The sample guild's names are made up (convex/sample.ts): nothing to fetch.
		if (!guild || isSampleGuild(guild)) return;
		const flavor = FLAVORS[guild.flavor];
		try {
			const token = await appToken(ctx, guild.region);
			const common = { token, flavor: guild.flavor, region: guild.region, namespace: "profile" as const };
			const [info, roster] = await Promise.all([
				blizzardGet<GuildInfo>({ ...common, path: flavor.guildPath(guild.slug) }),
				blizzardGet<Roster>({ ...common, path: `${flavor.guildPath(guild.slug)}/roster` }),
			]);
			if (!roster.ok) {
				await ctx.runMutation(internal.sync.recordError, {
					guildId,
					error:
						"Blizzard doesn't know this guild yet. Check the name and region; new guilds can take a while to appear.",
				});
				return;
			}
			const members = roster.data.members.map(({ rank, character: c }) => ({
				slug: (c.slug ?? `${c.name}-${c.surname ?? ""}`).toLowerCase(),
				blizzardId: c.id,
				name: c.name,
				surname: c.surname,
				level: c.level,
				classId: c.playable_class.id,
				raceId: c.playable_race.id,
				faction: c.faction?.type,
				rank,
			}));
			const due = await ctx.runMutation(internal.sync.applyRoster, {
				guildId,
				force,
				name: info.ok ? info.data.name : roster.data.guild.name,
				ruleset: info.ok ? info.data.ruleset?.name : undefined,
				faction: info.ok ? info.data.faction?.type : roster.data.guild.faction?.type,
				members,
			});
			await Promise.all(
				due.map((characterId, i) =>
					ctx.scheduler.runAfter(i * PROFILE_STAGGER_MS, internal.sync.syncCharacter, { characterId }),
				),
			);
		} catch (error) {
			await ctx.runMutation(internal.sync.recordError, { guildId, error: String(error) });
			throw error;
		}
	},
});

export const recordError = internalMutation({
	args: { guildId: v.id("guilds"), error: v.string() },
	handler: async (ctx, { guildId, error }) => {
		await ctx.db.patch(guildId, { lastSyncError: error.slice(0, 500) });
	},
});

const vMember = v.object({
	slug: v.string(),
	blizzardId: v.optional(v.number()),
	name: v.string(),
	surname: v.optional(v.string()),
	level: v.number(),
	classId: v.number(),
	raceId: v.number(),
	faction: v.optional(v.string()),
	rank: v.number(),
});

/** Upsert the roster; returns the characters whose profile is due a refresh. */
export const applyRoster = internalMutation({
	args: {
		guildId: v.id("guilds"),
		force: v.optional(v.boolean()),
		name: v.string(),
		ruleset: v.optional(v.string()),
		faction: v.optional(v.string()),
		members: v.array(vMember),
	},
	handler: async (ctx, { guildId, members, force, ...info }) => {
		const guild = await ctx.db.get(guildId);
		if (!guild) return [];
		const minLevel = FLAVORS[guild.flavor].minProfileLevel;
		const existing = await ctx.db
			.query("characters")
			.withIndex("by_guild", (q) => q.eq("guildId", guildId))
			.collect();
		const bySlug = new Map(existing.map((c) => [c.slug, c]));
		const due: Id<"characters">[] = [];
		const now = Date.now();
		for (const member of members) {
			const row = bySlug.get(member.slug);
			bySlug.delete(member.slug);
			let id: Id<"characters">;
			if (row) {
				await ctx.db.patch(row._id, { ...member, inRoster: true });
				id = row._id;
			} else {
				id = await ctx.db.insert("characters", {
					...member,
					guildId,
					flavor: guild.flavor,
					region: guild.region,
					inRoster: true,
				});
			}
			const stale = force || !row?.profileSyncedAt || now - row.profileSyncedAt > PROFILE_TTL_MS;
			// A character that leveled since the last sync may have a profile now.
			const leveled = row?.profileMissing && row.level !== member.level;
			if (member.level >= minLevel && (stale || leveled)) due.push(id);
		}
		// Whoever is left has left the guild. Kept (not deleted) so claims and
		// history survive a gquit-and-return.
		for (const gone of bySlug.values()) {
			if (gone.inRoster) await ctx.db.patch(gone._id, { inRoster: false });
		}
		await ctx.db.patch(guildId, {
			...info,
			memberCount: members.length,
			rosterSyncedAt: now,
			lastSyncError: undefined,
		});
		// The guild master's player owns the guild, once they've claimed.
		const master = members.find((m) => m.rank === 0);
		if (master) {
			const claim = await ctx.db
				.query("ownedCharacters")
				.withIndex("by_slug", (q) => q.eq("flavor", guild.flavor).eq("region", guild.region).eq("slug", master.slug))
				.first();
			if (claim) await setOwner(ctx, guildId, claim.userId);
		}
		return due;
	},
});

type Profile = {
	last_login_timestamp?: number;
	average_item_level?: number;
	gender?: { type?: string };
	level?: number;
};
type Equipment = {
	equipped_items?: (ItemPreview & {
		slot: { type: string };
		item: { id: number };
		name: string;
		quality: { type: string };
		level?: { value: number };
	})[];
};
type ProfessionEntry = {
	profession: { id: number; name: string };
	skill_points?: number;
	max_skill_points?: number;
	known_recipes?: { id: number }[];
	tiers?: { skill_points?: number; max_skill_points?: number; known_recipes?: { id: number }[] }[];
};
type Professions = { primaries?: ProfessionEntry[]; secondaries?: ProfessionEntry[] };
type Media = { assets?: { key: string; value: string }[] };
type Quests = { in_progress?: { id: number; name?: string }[] };
type Specializations = {
	specialization_groups?: {
		is_active?: boolean;
		specializations?: {
			specialization?: { id: number };
			specialization_name?: string;
			spent_points?: number;
			talents?: { talent?: { id?: number; name?: string }; talent_rank?: number }[];
		}[];
	}[];
};

/** The active talent group's trees with points, most points first. */
function mapTalentTrees(data: Specializations | undefined) {
	if (!data) return undefined;
	const groups = data.specialization_groups ?? [];
	const active = groups.find((g) => g.is_active) ?? groups[0];
	return (active?.specializations ?? [])
		.filter((s) => s.specialization && (s.spent_points ?? 0) > 0)
		.map((s) => ({
			id: s.specialization!.id,
			name: s.specialization_name ?? `Tree ${s.specialization!.id}`,
			points: s.spent_points ?? 0,
			talents: (s.talents ?? [])
				.filter((t) => t.talent?.name)
				.map((t) => ({ id: t.talent!.id, name: t.talent!.name!, rank: t.talent_rank ?? 1 })),
		}))
		.sort((a, b) => b.points - a.points);
}

function mapProfessions(data: Professions | undefined) {
	if (!data) return undefined;
	const map = (entry: ProfessionEntry, secondary: boolean) => {
		// Classic-style responses put skill on the entry; Retail-style on tiers.
		const tier = entry.tiers?.[0];
		return {
			id: entry.profession.id,
			name: entry.profession.name,
			skill: entry.skill_points ?? tier?.skill_points,
			maxSkill: entry.max_skill_points ?? tier?.max_skill_points,
			secondary,
			knownRecipes: [...(entry.known_recipes ?? []), ...(entry.tiers ?? []).flatMap((t) => t.known_recipes ?? [])].map(
				(r) => r.id,
			),
		};
	};
	return [...(data.primaries ?? []).map((e) => map(e, false)), ...(data.secondaries ?? []).map((e) => map(e, true))];
}

export const getCharacter = internalQuery({
	args: { characterId: v.id("characters") },
	handler: async (ctx, { characterId }) => await ctx.db.get(characterId),
});

export const syncCharacter = internalAction({
	args: { characterId: v.id("characters") },
	handler: async (ctx, { characterId }) => {
		const character = await ctx.runQuery(internal.sync.getCharacter, { characterId });
		if (!character) return;
		const flavor = FLAVORS[character.flavor];
		const token = await appToken(ctx, character.region);
		const base = flavor.characterPath(character.slug);
		const common = {
			token,
			flavor: character.flavor,
			region: character.region,
			namespace: "profile" as const,
		};
		const profile = await blizzardGet<Profile>({ ...common, path: base });
		if (!profile.ok) {
			await ctx.runMutation(internal.sync.applyProfile, { characterId, missing: true });
			return;
		}
		const [equipment, professions, specializations, media, quests] = await Promise.all([
			blizzardGet<Equipment>({ ...common, path: `${base}/equipment` }),
			blizzardGet<Professions>({ ...common, path: `${base}/professions` }),
			blizzardGet<Specializations>({ ...common, path: `${base}/specializations` }),
			// Media can 404 for a day after a character first appears.
			blizzardGet<Media>({ ...common, path: `${base}/character-media` }),
			// Quests in progress (ids and names); `completed` is a separate list we don't need.
			blizzardGet<Quests>({ ...common, path: `${base}/quests` }),
		]);
		const inProgress = quests.ok ? (quests.data.in_progress ?? []) : undefined;
		await ctx.runMutation(internal.sync.applyProfile, {
			characterId,
			missing: false,
			lastLoginAt: profile.data.last_login_timestamp,
			averageItemLevel: profile.data.average_item_level,
			gender: profile.data.gender?.type,
			equipment: equipment.ok
				? (equipment.data.equipped_items ?? []).map((i) => ({
						slot: i.slot.type,
						itemId: i.item.id,
						name: i.name,
						quality: i.quality.type,
						itemLevel: i.level?.value,
						tooltip: tooltipLines(i),
					}))
				: undefined,
			professions: professions.ok ? mapProfessions(professions.data) : undefined,
			talentTrees: specializations.ok ? mapTalentTrees(specializations.data) : undefined,
			avatarUrl: media.ok ? media.data.assets?.find((a) => a.key === "avatar")?.value : undefined,
			renderUrl: media.ok ? media.data.assets?.find((a) => a.key === "main-raw")?.value : undefined,
			questIds: inProgress?.map((q) => q.id),
		});
		// Titles, types and areas for quests the catalog doesn't have yet.
		if (inProgress?.length && inProgress.map((q) => q.id).join() !== character.quests?.ids.join()) {
			await ctx.scheduler.runAfter(0, internal.quests.ensure, {
				questIds: inProgress.map((q) => q.id),
				hints: inProgress.map((q) => ({ questId: q.id, title: q.name })),
			});
		}
		// Icons and names for gear we haven't seen yet.
		if (equipment.ok) {
			const worn = equipment.data.equipped_items ?? [];
			if (worn.length) {
				await ctx.scheduler.runAfter(0, internal.items.ensure, {
					itemIds: worn.map((i) => i.item.id),
					hints: worn.map((i) => ({
						itemId: i.item.id,
						name: i.name,
						quality: i.quality.type,
						tooltip: tooltipLines(i),
					})),
				});
			}
		}
	},
});

export const applyProfile = internalMutation({
	args: {
		characterId: v.id("characters"),
		missing: v.boolean(),
		lastLoginAt: v.optional(v.number()),
		averageItemLevel: v.optional(v.number()),
		gender: v.optional(v.string()),
		equipment: v.optional(v.array(vEquippedItem)),
		professions: v.optional(
			v.array(
				v.object({
					id: v.number(),
					name: v.string(),
					skill: v.optional(v.number()),
					maxSkill: v.optional(v.number()),
					secondary: v.boolean(),
					knownRecipes: v.optional(v.array(v.number())),
				}),
			),
		),
		talentTrees: v.optional(v.array(vTalentTree)),
		avatarUrl: v.optional(v.string()),
		renderUrl: v.optional(v.string()),
		questIds: v.optional(v.array(v.number())),
	},
	handler: async (ctx, { characterId, missing, questIds, ...data }) => {
		const character = await ctx.db.get(characterId);
		if (!character) return;
		const now = Date.now();
		const patch: Partial<Doc<"characters">> = { profileSyncedAt: now, profileMissing: missing };
		// Remember when Blizzard's talents last changed, to compare with addon uploads.
		if (data.talentTrees && JSON.stringify(data.talentTrees) !== JSON.stringify(character.talentTrees)) {
			patch.talentsChangedAt = now;
		}
		// Only overwrite what this sync actually got.
		for (const [key, value] of Object.entries(data)) {
			if (value !== undefined) (patch as Record<string, unknown>)[key] = value;
		}
		if (questIds) patch.quests = { syncedAt: now, ids: questIds };
		await ctx.db.patch(characterId, patch);
		if (data.talentTrees) await learnTreeInfo(ctx, data.talentTrees);
	},
});

/** Record Blizzard's id and name for each tree seen, keyed by class and tree position. */
async function learnTreeInfo(ctx: MutationCtx, trees: Infer<typeof vTalentTree>[]) {
	for (const tree of trees) {
		const known = tree.talents.map((t) => t.id !== undefined && TALENT_TREE_BY_ID.get(t.id)).find(Boolean);
		if (!known) continue;
		const existing = await ctx.db
			.query("talentTreeInfo")
			.withIndex("by_class_tree", (q) => q.eq("classToken", known.classToken).eq("treeIndex", known.treeIndex))
			.unique();
		if (!existing) {
			await ctx.db.insert("talentTreeInfo", {
				classToken: known.classToken,
				treeIndex: known.treeIndex,
				blizzardId: tree.id,
				name: tree.name,
			});
		} else if (existing.name !== tree.name || existing.blizzardId !== tree.id) {
			await ctx.db.patch(existing._id, { name: tree.name, blizzardId: tree.id });
		}
	}
}

const DISCOVER_CONCURRENCY = 8;

/**
 * After a claim: read each claimed character's public profile (level 10+;
 * lower ones have none) for its guild, and make sure those guilds exist here.
 * Failures skip that character. Returns the guilds found.
 */
export type FoundGuild = { region: Region; slug: string; name: string };

export async function discoverGuilds(
	ctx: ActionCtx,
	characters: { region: Region; slug: string; level?: number }[],
): Promise<FoundGuild[]> {
	const flavor = FLAVORS.forever;
	const eligible = characters.filter((c) => (c.level ?? 0) >= flavor.minProfileLevel);
	const found = new Map<string, FoundGuild>();
	const tokens = new Map<Region, Promise<string>>();
	const tokenFor = (region: Region) => {
		if (!tokens.has(region)) tokens.set(region, appToken(ctx, region));
		return tokens.get(region)!;
	};
	for (let i = 0; i < eligible.length; i += DISCOVER_CONCURRENCY) {
		await Promise.all(
			eligible.slice(i, i + DISCOVER_CONCURRENCY).map(async (c) => {
				try {
					const token = await tokenFor(c.region);
					const profile = await blizzardGet<{ guild?: { name?: string; slug?: string } }>({
						token,
						flavor: "forever",
						region: c.region,
						namespace: "profile",
						path: flavor.characterPath(c.slug),
					});
					const guild = profile.ok ? guildOfProfile(profile.data) : null;
					if (guild) found.set(`${c.region}:${guild.slug}`, { region: c.region, ...guild });
				} catch (error) {
					console.warn(`discoverGuilds: ${c.region}/${c.slug}: ${String(error)}`);
				}
			}),
		);
	}
	if (found.size === 0) return [];
	return await ctx.runMutation(internal.guilds.ensureGuilds, { guilds: [...found.values()] });
}

/** Cron: refresh every guild's roster. `force` refetches every profile too. */
export const syncAll = internalAction({
	args: { force: v.optional(v.boolean()) },
	handler: async (ctx, { force }) => {
		const ids = await ctx.runQuery(internal.sync.allGuildIds, {});
		await Promise.all(
			ids.map((guildId, i) => ctx.scheduler.runAfter(i * 30_000, internal.sync.syncGuild, { guildId, force })),
		);
	},
});

export const allGuildIds = internalQuery({
	args: {},
	handler: async (ctx) => (await ctx.db.query("guilds").collect()).map((g) => g._id),
});
