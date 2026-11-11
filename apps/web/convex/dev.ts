import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { appToken, blizzardGet } from "./blizzard";
import { sha256 } from "./claims";
import { isLocalBackend } from "./origins";
import { vRegion } from "./schema";
import { CLASSES, FLAVORS, guildSlug, SLOT_ORDER } from "./shared/wow";

// Dev helpers.
//
// `pnpm seed`: a fake guild so the directory can be built and reviewed before
// Blizzard keys exist. Local backends only.

const FIRST = [
	"Aldric",
	"Brenna",
	"Corwin",
	"Dagny",
	"Edris",
	"Fenna",
	"Garrick",
	"Hesper",
	"Ivo",
	"Jorun",
	"Kael",
	"Liesel",
	"Maren",
	"Nils",
	"Orla",
	"Pell",
	"Quill",
	"Rowan",
	"Sable",
	"Tamsin",
	"Ulric",
	"Vesna",
	"Wren",
	"Yarrow",
];
const LAST = [
	"Ashdown",
	"Brightwater",
	"Coldbrook",
	"Duskmantle",
	"Emberfall",
	"Fairwind",
	"Greyhollow",
	"Hearthstone",
	"Ironvale",
	"Larkspur",
	"Moonbrook",
	"Oakheart",
];
const PROFESSIONS = [
	"Alchemy",
	"Blacksmithing",
	"Enchanting",
	"Engineering",
	"Herbalism",
	"Leatherworking",
	"Mining",
	"Skinning",
	"Tailoring",
];
const QUALITIES = ["COMMON", "UNCOMMON", "UNCOMMON", "RARE", "RARE", "EPIC"];
const ALLIANCE_RACES = [1, 3, 4, 7];
const TREES: Record<number, string[]> = {
	1: ["Arms", "Fury", "Protection"],
	2: ["Holy", "Protection", "Retribution"],
	3: ["Beast Mastery", "Marksmanship", "Survival"],
	4: ["Assassination", "Combat", "Subtlety"],
	5: ["Discipline", "Holy", "Shadow Magic"],
	8: ["Arcane", "Fire", "Frost"],
	9: ["Affliction", "Demonology", "Destruction"],
	11: ["Balance", "Feral Combat", "Restoration"],
};

export const seed = internalMutation({
	args: {},
	handler: async (ctx) => {
		if (!isLocalBackend()) throw new ConvexError("Local backends only");
		const slug = "the-long-watch";
		const existing = await ctx.db
			.query("guilds")
			.withIndex("by_key", (q) => q.eq("flavor", "forever").eq("region", "us").eq("slug", slug))
			.unique();
		if (existing) return "already seeded";
		const guildId = await ctx.db.insert("guilds", {
			flavor: "forever",
			region: "us",
			slug,
			name: "The Long Watch",
			faction: "ALLIANCE",
			ruleset: "Normal",
			visibility: "public",
			memberCount: FIRST.length,
			rosterSyncedAt: Date.now(),
		});
		const classIds = Object.keys(CLASSES)
			.map(Number)
			.filter((id) => id !== 7);
		let seedValue = 7;
		const rand = () => (seedValue = (seedValue * 16807) % 2147483647) / 2147483647;
		const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];
		for (const [i, first] of FIRST.entries()) {
			const surname = LAST[i % LAST.length];
			const level = i < 6 ? 60 : Math.max(4, Math.floor(rand() * 60));
			const hasProfile = level >= 10;
			const professions = [pick(PROFESSIONS), pick(PROFESSIONS)]
				.filter((p, j, all) => all.indexOf(p) === j)
				.map((name, j) => ({ id: j + 1, name, skill: Math.min(300, level * 5), maxSkill: 300, secondary: false }));
			const classId = pick(classIds);
			const points = Math.max(0, level - 9);
			const main = Math.min(points, 31);
			const talentTrees = [
				{ tree: 0, points: main },
				{ tree: 1, points: points - main },
			]
				.filter((t) => t.points > 0)
				.map((t) => ({
					id: classId * 10 + t.tree,
					name: TREES[classId][t.tree],
					points: t.points,
					talents: [{ name: `${TREES[classId][t.tree]} talent`, rank: Math.min(5, t.points) }],
				}));
			await ctx.db.insert("characters", {
				guildId,
				flavor: "forever",
				region: "us",
				slug: `${first}-${surname}`.toLowerCase(),
				name: first,
				surname,
				level,
				classId,
				raceId: pick(ALLIANCE_RACES),
				faction: "ALLIANCE",
				rank: i === 0 ? 0 : i < 4 ? 1 : i < 12 ? 3 : 5,
				inRoster: true,
				profileMissing: !hasProfile,
				...(hasProfile && {
					lastLoginAt: Date.now() - Math.floor(rand() * 9 * 24 * 3600_000),
					averageItemLevel: Math.round(level * 0.9 + rand() * 10),
					professions,
					talentTrees,
					equipment: SLOT_ORDER.filter((s) => s !== "SHIRT" && s !== "TABARD").map((slot, j) => ({
						slot,
						itemId: 10000 + i * 100 + j,
						name: `${pick(["Worn", "Stalwart", "Gleaming", "Runed", "Dreadful"])} ${slot.toLowerCase().replace(/_\d/, "").replace("_", " ")}`,
						quality: pick(QUALITIES),
						itemLevel: Math.round(level * 0.9 + rand() * 10),
					})),
					profileSyncedAt: Date.now(),
				}),
			});
		}
		return "seeded";
	},
});

/**
 * `npx convex run dev:probe '{"guild": "Your Guild", "region": "us"}'`
 * Checks the Battle.net keys work and shows which fields Blizzard actually
 * returns for a guild and one of its members. Read-only.
 */
export const probe = internalAction({
	args: { guild: v.string(), region: v.optional(vRegion) },
	handler: async (ctx, args) => {
		const region = args.region ?? "us";
		const token = await appToken(ctx, region);
		const common = { token, flavor: "forever" as const, region, namespace: "profile" as const };
		const slug = guildSlug(args.guild);
		const roster = await blizzardGet<{ members: { character: { slug: string; level: number }; rank: number }[] }>({
			...common,
			path: `${FLAVORS.forever.guildPath(slug)}/roster`,
		});
		if (!roster.ok) return { token: "ok", guild: `404 for slug "${slug}"` };
		const sample = roster.data.members
			.filter((m) => m.character.level >= 10)
			.sort((a, b) => b.character.level - a.character.level)[0];
		const result: Record<string, unknown> = {
			token: "ok",
			guildSlug: slug,
			members: roster.data.members.length,
			rosterFields: Object.keys(roster.data.members[0]?.character ?? {}),
		};
		if (!sample) return result;
		const base = FLAVORS.forever.characterPath(sample.character.slug);
		for (const [key, path] of [
			["profile", base],
			["equipment", `${base}/equipment`],
			["professions", `${base}/professions`],
			["media", `${base}/character-media`],
		] as const) {
			const res = await blizzardGet<Record<string, unknown>>({ ...common, path });
			result[key] = res.ok ? Object.keys(res.data) : `HTTP ${res.status}`;
		}
		result.sampleCharacter = sample.character.slug;
		return result;
	},
});

/**
 * `npx convex run dev:get '{"path": "/data/wow/quest/176", "namespace": "static"}'`
 * One raw Blizzard API response, for checking what a path returns. Read-only.
 */
export const get = internalAction({
	args: {
		path: v.string(),
		namespace: v.optional(v.union(v.literal("profile"), v.literal("static"), v.literal("dynamic"))),
		region: v.optional(vRegion),
	},
	handler: async (ctx, { path, namespace, region }): Promise<unknown> => {
		if (!path.startsWith("/")) throw new ConvexError("A path like /data/wow/quest/176");
		const token: string = await appToken(ctx, region ?? "us");
		const res = await blizzardGet<unknown>({
			token,
			flavor: "forever",
			region: region ?? "us",
			namespace: namespace ?? "profile",
			path,
		});
		return res.ok ? res.data : { status: res.status };
	},
});

/**
 * `npx convex run --deployment <name> dev:addGuild '{"name": "Your Guild", "region": "us"}'`
 * Adds a guild without a signed-in user (no owner) and syncs it. For seeding
 * cloud dev, which local worktrees import guilds from.
 */
export const addGuild = internalMutation({
	args: { name: v.string(), region: v.optional(vRegion) },
	handler: async (ctx, args) => {
		const region = args.region ?? "us";
		const slug = guildSlug(args.name);
		const existing = await ctx.db
			.query("guilds")
			.withIndex("by_key", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
			.unique();
		const guildId =
			existing?._id ??
			(await ctx.db.insert("guilds", {
				flavor: "forever",
				region,
				slug,
				name: args.name.trim(),
				visibility: "public",
				memberCount: 0,
			}));
		await ctx.scheduler.runAfter(0, internal.sync.syncGuild, { guildId });
		return `/g/${region}/${slug}`;
	},
});

/**
 * Local backends only: a test user who has claimed `slug` (already synced),
 * with a helper token, for exercising the helper end to end.
 *   npx convex run dev:helperTest '{"slug": "lich-braz", "region": "eu"}'
 */
export const helperTest = internalMutation({
	args: { slug: v.string(), region: vRegion },
	handler: async (ctx, { slug, region }) => {
		if (!isLocalBackend()) throw new ConvexError("Local backends only");
		const character = await ctx.db
			.query("characters")
			.withIndex("by_slug", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
			.first();
		if (!character) throw new ConvexError(`Sync ${slug} first (dev:addGuild)`);
		const userId = await ctx.db.insert("users", { name: "Helper test" });
		await ctx.db.insert("ownedCharacters", {
			userId,
			flavor: "forever",
			region,
			slug,
			blizzardId: character.blizzardId,
			name: character.name,
			level: character.level,
			classId: character.classId,
			claimedAt: Date.now(),
		});
		const bytes = crypto.getRandomValues(new Uint8Array(24));
		const token = `gld_${btoa(String.fromCharCode(...bytes))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "")}`;
		await ctx.db.insert("helperTokens", {
			userId,
			tokenHash: await sha256(token),
			label: "dev test",
			createdAt: Date.now(),
		});
		return { token, blizzardId: character.blizzardId, talentTrees: character.talentTrees };
	},
});
