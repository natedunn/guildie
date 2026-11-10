import { ConvexError, type Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalQuery, type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";
import { type AddonCharacter, LIMITS, matchRecipes, parseCharacter } from "./addonPayload";
import { type AddonView, addonView } from "./addonView";
import { sha256 } from "./claims";
import { mergeProfile } from "./profile";
import { type AddonRequest, addonRequests, refreshMats } from "./requests";
import type { vTalentTree } from "./schema";
import { TALENT_TREE_BY_ID } from "./shared/foreverTalents";
import type { ItemInfo } from "./shared/itemInfo";
import { type Rules, type UpgradeMember, upgradeRules } from "./shared/upgrades";
import { memberForUpgrades } from "./upgradeProfiles";
import { requireUserId } from "./users";

// The desktop helper (apps/helper) uploads what the Guildie addon
// (apps/addon) saved in game. It authenticates with a token the player makes
// on their account page; only the token's hash is stored. Uploads are only
// accepted for characters the token's owner has claimed.
//
// Blizzard's data stays the fallback: each part of an addon snapshot is shown
// only while it's newer than Blizzard's (see pickProfile, convex/profile.ts).

/** One upload per token per this long. */
const MIN_UPLOAD_INTERVAL_MS = 5_000;

function newToken() {
	const bytes = crypto.getRandomValues(new Uint8Array(24));
	const b64 = btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
	return `gld_${b64}`;
}

export const listTokens = query({
	args: {},
	handler: async (ctx) => {
		const userId = await requireUserId(ctx);
		const tokens = await ctx.db
			.query("helperTokens")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		return tokens.map(({ _id, label, createdAt, lastUsedAt }) => ({ _id, label, createdAt, lastUsedAt }));
	},
});

export const revokeToken = mutation({
	args: { tokenId: v.id("helperTokens") },
	handler: async (ctx, { tokenId }) => {
		const userId = await requireUserId(ctx);
		const token = await ctx.db.get(tokenId);
		if (token?.userId === userId) await ctx.db.delete(tokenId);
	},
});

async function tokenOwner(ctx: QueryCtx, token: string) {
	if (!token.startsWith("gld_")) return null;
	const tokenHash = await sha256(token);
	return await ctx.db
		.query("helperTokens")
		.withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
		.unique();
}

/** For the helper to check its token: who it belongs to and which characters it can upload. */
export const whoami = query({
	args: { token: v.string() },
	handler: async (ctx, { token }) => {
		const row = await tokenOwner(ctx, token);
		if (!row) return null;
		const user = await ctx.db.get(row.userId);
		const owned = await ctx.db
			.query("ownedCharacters")
			.withIndex("by_user", (q) => q.eq("userId", row.userId))
			.collect();
		return {
			battletag: user?.battletag ?? user?.name ?? null,
			characters: owned.map((c) => `${c.name} (${c.region.toUpperCase()})`),
		};
	},
});

/** The number in Player-<server>-<hex>: Blizzard's character id. */
function blizzardIdFromGuid(guid: string) {
	const hex = guid.match(/^Player-\d+-([0-9A-Fa-f]+)$/)?.[1];
	return hex ? Number.parseInt(hex, 16) : undefined;
}

async function treesFromRanks(ctx: MutationCtx, talents: AddonCharacter["talents"]) {
	const trees = new Map<string, Infer<typeof vTalentTree>>();
	for (const t of talents) {
		const where = TALENT_TREE_BY_ID.get(t.id);
		if (!where || t.rank <= 0) continue;
		const key = `${where.classToken}:${where.treeIndex}`;
		let tree = trees.get(key);
		if (!tree) {
			// Prefer Blizzard's id and name for the tree, learned from synced characters.
			const info = await ctx.db
				.query("talentTreeInfo")
				.withIndex("by_class_tree", (q) => q.eq("classToken", where.classToken).eq("treeIndex", where.treeIndex))
				.unique();
			tree = { id: info?.blizzardId ?? -(where.treeIndex + 1), name: info?.name ?? where.tree, points: 0, talents: [] };
			trees.set(key, tree);
		}
		tree.points += t.rank;
		tree.talents.push({ id: t.id, name: t.name ?? `Talent ${t.id}`, rank: t.rank });
	}
	return [...trees.values()].sort((a, b) => b.points - a.points);
}

type SnapshotFields = Omit<Doc<"addonSnapshots">, "_id" | "_creationTime">;

/** The newer of two sections (by capturedAt); the existing one on a tie only if the new one is missing. */
const newer = <T extends { capturedAt: number }>(incoming: T | undefined, existing: T | undefined) =>
	incoming && (!existing || incoming.capturedAt >= existing.capturedAt) ? incoming : existing;

/** "Broadsword of the Eagle" (a random suffix) -> "Broadsword", the item's own name. */
const baseName = (item: { name: string; suffixId?: number }) =>
	item.suffixId && item.name.lastIndexOf(" of ") > 0 ? item.name.slice(0, item.name.lastIndexOf(" of ")) : item.name;

/**
 * Called by the /api/helper/snapshot route with the helper's token and the
 * addon's characters (payload version 1 or 2). Each character is checked
 * (addonPayload.ts) and kept only if the token's owner claimed it. Each part
 * of the stored snapshot keeps whichever copy is newer, so an older upload
 * (another computer, say) never replaces newer data.
 */
export const ingest = mutation({
	args: { token: v.string(), version: v.optional(v.number()), characters: v.array(v.any()) },
	handler: async (ctx, { token, version, characters }) => {
		const row = await tokenOwner(ctx, token);
		if (!row) throw new ConvexError("Unknown or revoked token");
		const now = Date.now();
		if (row.lastUsedAt && now - row.lastUsedAt < MIN_UPLOAD_INTERVAL_MS)
			throw new ConvexError("Too many uploads; slow down");
		if (characters.length > LIMITS.characters) throw new ConvexError("Too many characters in one upload");
		await ctx.db.patch(row._id, { lastUsedAt: now });

		const owned = await ctx.db
			.query("ownedCharacters")
			.withIndex("by_user", (q) => q.eq("userId", row.userId))
			.collect();
		const accepted: string[] = [];
		let inventoryChanged = false;
		const unmatched: string[] = [];
		const rejected: string[] = [];
		// Each profession's catalog, read once per upload.
		const catalogs = new Map<number, Doc<"recipes">[]>();
		const catalog = async (professionId: number) => {
			if (!catalogs.has(professionId)) {
				catalogs.set(
					professionId,
					await ctx.db
						.query("recipes")
						.withIndex("by_professionId", (q) => q.eq("professionId", professionId))
						.collect(),
				);
			}
			return catalogs.get(professionId)!;
		};

		for (const raw of characters) {
			const parsed = parseCharacter(raw, now);
			if (!parsed.ok) {
				console.warn(`helper.ingest: rejected ${parsed.name}: ${parsed.error}`);
				rejected.push(parsed.name);
				continue;
			}
			const c = parsed.character;
			const match = matchOwned(owned, c);
			if (!match) {
				unmatched.push(c.name);
				continue;
			}
			const key = { flavor: match.flavor, region: match.region, slug: match.slug };
			const existing = await ctx.db
				.query("addonSnapshots")
				.withIndex("by_slug", (q) => q.eq("flavor", key.flavor).eq("region", key.region).eq("slug", key.slug))
				.unique();
			const character = await ctx.db
				.query("characters")
				.withIndex("by_slug", (q) => q.eq("flavor", key.flavor).eq("region", key.region).eq("slug", key.slug))
				.first();

			// Level, XP, guild and talents: read together, every time.
			const top =
				!existing || existing.capturedAt <= c.capturedAt
					? {
							capturedAt: c.capturedAt,
							version: version ?? 1,
							level: c.level,
							xp: c.xp,
							xpMax: c.xpMax,
							classToken: c.classToken,
							raceToken: c.raceToken,
							guild: c.guild,
							talentTrees: await treesFromRanks(ctx, c.talents),
						}
					: {
							capturedAt: existing.capturedAt,
							version: existing.version,
							level: existing.level,
							xp: existing.xp,
							xpMax: existing.xpMax,
							classToken: existing.classToken,
							raceToken: existing.raceToken,
							guild: existing.guild,
							talentTrees: existing.talentTrees,
						};

			const incomingGear: SnapshotFields["equipment"] = c.equipment && {
				capturedAt: c.equipment.capturedAt,
				averageItemLevel: c.equipment.averageItemLevel,
				items: c.equipment.items,
			};
			const equipment = newer(incomingGear, existing?.equipment);
			const incomingProfessions: SnapshotFields["professions"] = c.professions && {
				capturedAt: c.professions.capturedAt,
				list: c.professions.list,
			};
			const professions = newer(incomingProfessions, existing?.professions);
			const proficiencies = newer(c.proficiencies, existing?.proficiencies);

			// Known recipes, per profession: the newer read, matched to the catalog
			// (an unchanged read keeps its earlier match).
			const recipes = new Map((existing?.recipes ?? []).map((r) => [r.professionId, r]));
			for (const r of c.recipes) {
				const before = recipes.get(r.professionId);
				if (before && before.capturedAt > r.capturedAt) continue;
				if (before && before.capturedAt === r.capturedAt && before.count === r.known.length) continue;
				const blizzardKnown = new Set(character?.professions?.find((p) => p.id === r.professionId)?.knownRecipes ?? []);
				const { recipeIds, unmatched: missing } = matchRecipes(r.known, await catalog(r.professionId), blizzardKnown);
				recipes.set(r.professionId, {
					professionId: r.professionId,
					profession: r.profession,
					capturedAt: r.capturedAt,
					recipeIds,
					count: r.known.length,
					unmatched: missing,
				});
			}
			// Professions the character no longer has take their recipes with them.
			const keptRecipes = [...recipes.values()].filter(
				(r) => !professions || professions.list.some((p) => p.id === r.professionId),
			);

			const snapshot: SnapshotFields = {
				userId: row.userId,
				...key,
				...top,
				receivedAt: now,
				equipment,
				professions,
				recipes: keptRecipes.length ? keptRecipes : undefined,
				proficiencies,
			};
			if (!existing) await ctx.db.insert("addonSnapshots", snapshot);
			else await ctx.db.replace(existing._id, snapshot);
			accepted.push(match.slug);
			if (c.inventory && (await storeInventory(ctx, row.userId, key, c.inventory, now))) inventoryChanged = true;

			// Icons (and names, where Blizzard's item API has none) for gear we
			// haven't seen yet, with the game's tooltip as the fallback.
			const gearChanged =
				equipment === incomingGear &&
				incomingGear &&
				incomingGear.items.map((i) => i.itemId).join() !==
					(existing?.equipment?.items ?? []).map((i) => i.itemId).join();
			if (gearChanged && incomingGear.items.length) {
				await ctx.scheduler.runAfter(0, internal.items.ensure, {
					itemIds: incomingGear.items.map((i) => i.itemId),
					hints: incomingGear.items.map((i) => ({
						itemId: i.itemId,
						name: baseName(i),
						quality: i.quality,
						tooltip: i.tooltip,
					})),
				});
			}
		}
		// A newer bag or bank read: re-check the player's open craft requests.
		if (inventoryChanged) await refreshMats(ctx, row.userId);
		return { accepted, unmatched, rejected };
	},
});

/**
 * Bags and the last bank read (payload 3), each kept only when newer. Private
 * (schema.ts, inventories). Returns whether anything changed.
 */
async function storeInventory(
	ctx: MutationCtx,
	userId: Id<"users">,
	key: Pick<Doc<"characters">, "flavor" | "region" | "slug">,
	inventory: NonNullable<AddonCharacter["inventory"]>,
	now: number,
) {
	const existing = await ctx.db
		.query("inventories")
		.withIndex("by_slug", (q) => q.eq("flavor", key.flavor).eq("region", key.region).eq("slug", key.slug))
		.unique();
	const bags = newer(inventory.bags, existing?.bags);
	const bank = newer(inventory.bank, existing?.bank);
	if (existing && bags === existing.bags && bank === existing.bank && existing.userId === userId) return false;
	const row = { userId, ...key, bags, bank, receivedAt: now };
	if (existing) await ctx.db.replace(existing._id, row);
	else await ctx.db.insert("inventories", row);
	return true;
}

function matchOwned(owned: Doc<"ownedCharacters">[], c: AddonCharacter) {
	const id = blizzardIdFromGuid(c.guid);
	const byId = id !== undefined ? owned.find((o) => o.blizzardId === id) : undefined;
	if (byId) return byId;
	// Fallback: the first name, if exactly one claimed character has it.
	const byName = owned.filter((o) => o.name.toLowerCase() === c.name.toLowerCase());
	return byName.length === 1 ? byName[0] : undefined;
}

/** A character's latest addon snapshot, if any. */
export async function snapshotOf(ctx: QueryCtx, character: Pick<Doc<"characters">, "flavor" | "region" | "slug">) {
	return await ctx.db
		.query("addonSnapshots")
		.withIndex("by_slug", (q) =>
			q.eq("flavor", character.flavor).eq("region", character.region).eq("slug", character.slug),
		)
		.unique();
}

/**
 * The character as shown: Blizzard's profile with the addon's newer parts
 * (level, gear, professions, recipes, talents) on top. Rules: convex/profile.ts.
 */
export async function pickProfile(ctx: QueryCtx, character: Doc<"characters">) {
	return mergeProfile(character, await snapshotOf(ctx, character));
}

// ---- Connecting the helper from the browser ---------------------------------

const PAIRING_TTL_MS = 10 * 60_000;
// No look-alike characters (0/O, 1/I/L), since people may type it.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function pairingCode() {
	const bytes = crypto.getRandomValues(new Uint8Array(8));
	const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
	return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

async function insertToken(ctx: MutationCtx, userId: Doc<"users">["_id"], label: string) {
	const existing = await ctx.db
		.query("helperTokens")
		.withIndex("by_user", (q) => q.eq("userId", userId))
		.collect();
	// Keep at most 10: connecting an 11th device retires the least recently used.
	if (existing.length >= 10) {
		const oldest = existing.sort((a, b) => (a.lastUsedAt ?? a.createdAt) - (b.lastUsedAt ?? b.createdAt))[0];
		await ctx.db.delete(oldest._id);
	}
	const token = newToken();
	await ctx.db.insert("helperTokens", {
		userId,
		tokenHash: await sha256(token),
		label: label.trim().slice(0, 40) || "Guildie app",
		createdAt: Date.now(),
	});
	return token;
}

/**
 * The Guildie desktop app shows our site in its window and asks for a token
 * through its bridge (src/lib/desktop.ts) once the player is signed in. Same
 * tokens as the helper's.
 */
export const issueDesktopToken = mutation({
	args: { label: v.string() },
	returns: v.string(),
	handler: async (ctx, { label }) => {
		const userId = await requireUserId(ctx);
		return await insertToken(ctx, userId, label || "Desktop app");
	},
});

/** The helper starts connecting: returns the code to show and the secret to poll with. */
export const startPairing = mutation({
	/** `session`: the desktop app, which also wants its window signed in. */
	args: { label: v.string(), session: v.optional(v.boolean()) },
	handler: async (ctx, { label, session }) => {
		// Tidy up pairings that have expired (a handful at most).
		for (const old of await ctx.db.query("helperPairings").take(50)) {
			if (old.expiresAt < Date.now()) await ctx.db.delete(old._id);
		}
		const pollSecret = newToken();
		const code = pairingCode();
		await ctx.db.insert("helperPairings", {
			code,
			pollSecretHash: await sha256(pollSecret),
			label: label.trim().slice(0, 40) || "Guildie app",
			expiresAt: Date.now() + PAIRING_TTL_MS,
			wantsSession: session || undefined,
		});
		return { code, pollSecret, expiresInSeconds: PAIRING_TTL_MS / 1000 };
	},
});

/** The connect page: what's asking to connect. */
export const pairing = query({
	args: { code: v.string() },
	handler: async (ctx, { code }) => {
		const row = await ctx.db
			.query("helperPairings")
			.withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
			.unique();
		if (!row) return { state: "unknown" as const };
		if (row.token || row.collectedAt) return { state: "approved" as const, label: row.label };
		if (row.expiresAt < Date.now()) return { state: "unknown" as const };
		return { state: "pending" as const, label: row.label };
	},
});

/** The signed-in player approves the code on /helper/connect. */
export const approvePairing = mutation({
	args: { code: v.string() },
	handler: async (ctx, { code }) => {
		const userId = await requireUserId(ctx);
		const row = await ctx.db
			.query("helperPairings")
			.withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
			.unique();
		if (row?.token || row?.collectedAt) return;
		if (!row || row.expiresAt < Date.now())
			throw new ConvexError("That code expired. Sign in from the Guildie app again.");
		let sessionCode: string | undefined;
		if (row.wantsSession) {
			sessionCode = newToken();
			await ctx.db.insert("desktopSessionCodes", {
				codeHash: await sha256(sessionCode),
				userId,
				expiresAt: Date.now() + 5 * 60_000,
			});
		}
		await ctx.db.patch(row._id, { userId, token: await insertToken(ctx, userId, row.label), sessionCode });
	},
});

/** The helper polls: pending, expired, or its token (once). */
export const pollPairing = mutation({
	args: { code: v.string(), pollSecret: v.string() },
	handler: async (ctx, { code, pollSecret }) => {
		const row = await ctx.db
			.query("helperPairings")
			.withIndex("by_code", (q) => q.eq("code", code))
			.unique();
		if (!row || row.pollSecretHash !== (await sha256(pollSecret))) return { status: "expired" as const };
		if (row.expiresAt < Date.now()) {
			await ctx.db.delete(row._id);
			return { status: "expired" as const };
		}
		if (row.collectedAt) return { status: "expired" as const };
		if (!row.token) return { status: "pending" as const };
		// Hand over once; keep the row (without secrets) so the Connect page
		// still shows "Connected". Expired rows go on the next startPairing.
		await ctx.db.patch(row._id, { token: undefined, sessionCode: undefined, collectedAt: Date.now() });
		return { status: "approved" as const, token: row.token, sessionCode: row.sessionCode };
	},
});

/** The helper signs out: its token stops working. */
export const signOut = mutation({
	args: { token: v.string() },
	handler: async (ctx, { token }) => {
		const row = await tokenOwner(ctx, token);
		if (row) await ctx.db.delete(row._id);
	},
});

// ---- Guild data for the addon's tooltips ------------------------------------

type GuildDataBase = {
	mine: string[];
	guilds: {
		name: string;
		region: string;
		members: {
			name: string;
			slug: string;
			classId: number;
			professions: { name: string; skill?: number; knownRecipes: number[] }[];
		}[];
	}[];
	/** Active guildmates (not the token owner's own characters) for gear-upgrade suggestions. */
	upgradeMembers: UpgradeMember[];
	characters: GuildData["characters"];
	requests: GuildData["requests"];
	myRequests: GuildData["myRequests"];
};

export type GuildData = {
	version: 1;
	generatedAt: number;
	guilds: string[];
	mine: string[];
	recipesKnown: number;
	recipesInCatalog: number;
	reagents: Record<
		string,
		{ name: string; users: { name: string; classId: number; profession: string; recipes: number }[] }
	>;
	/**
	 * Gear-upgrade suggestions (addon 0.5.0+; older addons ignore it): the
	 * rules and weights once (shared/upgrades.ts, shared/weights.ts), and each
	 * active guildmate with the scores of what they wear.
	 */
	upgrades: { version: 1; rules: Rules; members: UpgradeMember[] };
	/**
	 * The token owner's own claimed characters as Guildie shows them now, by
	 * name (addon 0.6.0+; older addons ignore it): the addon compares them
	 * with the live game ("3 changes not on Guildie yet"). See addonView.ts.
	 */
	characters: Record<string, AddonView>;
	/**
	 * Guild requests (addon 0.8.0+; older addons ignore it): each active
	 * request by item id ("Todd is requesting 20", "claimed by Miller"), and
	 * the player's own counts for the addon window.
	 */
	requests: Record<string, AddonRequest[]>;
	myRequests: { open: number; stale: number };
};

/** The token's guilds (those its claimed characters are in) and their members. */
export const guildDataBase = internalQuery({
	args: { token: v.string() },
	handler: async (ctx, { token }): Promise<GuildDataBase | null> => {
		const row = await tokenOwner(ctx, token);
		if (!row) return null;
		const owned = await ctx.db
			.query("ownedCharacters")
			.withIndex("by_user", (q) => q.eq("userId", row.userId))
			.collect();
		const guildIds = new Set<Id<"guilds">>();
		const characters: GuildData["characters"] = {};
		for (const c of owned) {
			const member = await ctx.db
				.query("characters")
				.withIndex("by_slug", (q) => q.eq("flavor", c.flavor).eq("region", c.region).eq("slug", c.slug))
				.first();
			if (member?.inRoster) guildIds.add(member.guildId);
			if (!member) continue;
			const view = addonView(member, await snapshotOf(ctx, member));
			// The same first name twice (two regions): the one synced last.
			const before = characters[member.name];
			if (!before || (view.synced?.at ?? 0) > (before.synced?.at ?? 0)) characters[member.name] = view;
		}
		const guilds = [];
		const rules = upgradeRules();
		const itemCache = new Map<number, ItemInfo | undefined>();
		const ownSlugs = new Set(owned.map((c) => `${c.region}:${c.slug}`));
		const upgradeMembers: UpgradeMember[] = [];
		const now = Date.now();
		for (const guildId of guildIds) {
			const guild = await ctx.db.get(guildId);
			if (!guild) continue;
			const members = await ctx.db
				.query("characters")
				.withIndex("by_guild", (q) => q.eq("guildId", guildId).eq("inRoster", true))
				.collect();
			const profiles = await Promise.all(members.map((m) => pickProfile(ctx, m)));
			for (const [i, m] of members.entries()) {
				if (ownSlugs.has(`${m.region}:${m.slug}`)) continue;
				const found = await memberForUpgrades(ctx, m, profiles[i], rules, itemCache);
				// Only who's been around lately; the addon checks again as time passes.
				if (found && now - found.member.seen * 1000 <= rules.activeDays * 86_400_000) upgradeMembers.push(found.member);
			}
			guilds.push({
				name: guild.name,
				region: guild.region,
				members: members.map((m, i) => ({
					name: m.name,
					slug: m.slug,
					classId: m.classId,
					professions: profiles[i].professions.map((p) => ({
						name: p.name,
						skill: p.skill,
						knownRecipes: p.knownRecipes ?? [],
					})),
				})),
			});
		}
		const requests = await addonRequests(ctx, [...guildIds], row.userId);
		return {
			mine: owned.map((c) => c.name),
			guilds,
			upgradeMembers,
			characters,
			requests: requests.byItem,
			myRequests: requests.mine,
		};
	},
});

/**
 * What the addon shows on item tooltips. Reagents: for each, the guild
 * members whose known recipes use it (most recipes first). Gear: who it
 * might be an upgrade for (`upgrades`, judged in game). Suggestions, not
 * certainties: knowing a recipe doesn't mean someone is still making it.
 */
export const guildData = action({
	args: { token: v.string() },
	handler: async (ctx, { token }): Promise<GuildData | null> => {
		const base: GuildDataBase | null = await ctx.runQuery(internal.helper.guildDataBase, { token });
		if (!base) return null;
		const ids = [
			...new Set(base.guilds.flatMap((g) => g.members.flatMap((m) => m.professions.flatMap((p) => p.knownRecipes)))),
		];
		const reagentsByRecipe = new Map<number, { itemId: number; name: string }[]>();
		for (let i = 0; i < ids.length; i += 400) {
			for (const r of await ctx.runQuery(internal.recipes.byIds, { ids: ids.slice(i, i + 400) })) {
				reagentsByRecipe.set(r.recipeId, r.reagents);
			}
		}
		// itemId -> member -> { profession, recipes using it }
		const uses = new Map<
			number,
			{ name: string; users: Map<string, { name: string; classId: number; profession: string; recipes: number }> }
		>();
		for (const g of base.guilds) {
			for (const m of g.members) {
				for (const p of m.professions) {
					for (const recipeId of p.knownRecipes) {
						for (const reagent of reagentsByRecipe.get(recipeId) ?? []) {
							let entry = uses.get(reagent.itemId);
							if (!entry) uses.set(reagent.itemId, (entry = { name: reagent.name, users: new Map() }));
							const key = `${g.region}:${m.slug}:${p.name}`;
							const user = entry.users.get(key) ?? { name: m.name, classId: m.classId, profession: p.name, recipes: 0 };
							user.recipes += 1;
							entry.users.set(key, user);
						}
					}
				}
			}
		}
		const reagents: GuildData["reagents"] = {};
		for (const [itemId, entry] of uses) {
			reagents[itemId] = {
				name: entry.name,
				users: [...entry.users.values()]
					.sort((a, b) => b.recipes - a.recipes || a.name.localeCompare(b.name))
					.slice(0, 8),
			};
		}
		return {
			version: 1,
			generatedAt: Date.now(),
			guilds: base.guilds.map((g) => g.name),
			mine: base.mine,
			recipesKnown: ids.length,
			recipesInCatalog: reagentsByRecipe.size,
			reagents,
			upgrades: { version: 1, rules: upgradeRules(), members: base.upgradeMembers },
			characters: base.characters,
			requests: base.requests,
			myRequests: base.myRequests,
		};
	},
});
