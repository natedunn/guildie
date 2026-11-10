import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Which game a guild plays. Forever is the only one implemented; the field
 * exists so realm-based flavors (Classic Era, Anniversary) can be added
 * without reshaping data. See convex/wow/flavors.ts.
 */
export const vFlavor = v.literal("forever");
export const vRegion = v.union(v.literal("us"), v.literal("eu"), v.literal("kr"), v.literal("tw"));
export const vVisibility = v.union(v.literal("public"), v.literal("members"));

/**
 * One line of an in-game item tooltip, built from Blizzard's display strings
 * (convex/items.ts). `color` is a CSS hex color from Blizzard; white when
 * absent.
 */
export const vTooltipLine = v.object({
	left: v.string(),
	right: v.optional(v.string()),
	color: v.optional(v.string()),
});

export const vEquippedItem = v.object({
	slot: v.string(),
	itemId: v.number(),
	name: v.string(),
	quality: v.string(),
	itemLevel: v.optional(v.number()),
	/** The tooltip as worn (enchants included), name line excluded. */
	tooltip: v.optional(v.array(vTooltipLine)),
	/** From the addon: the enchant and random suffix ids in the item's link. */
	enchantId: v.optional(v.number()),
	suffixId: v.optional(v.number()),
});

/** A talent tree with points in it, from the active talent group. */
export const vTalentTree = v.object({
	id: v.number(),
	name: v.string(),
	points: v.number(),
	/** `id` is the TraitDefinition ID (same in Blizzard's API and in game). */
	talents: v.array(v.object({ id: v.optional(v.number()), name: v.string(), rank: v.number() })),
});

export const vProfession = v.object({
	id: v.number(),
	name: v.string(),
	skill: v.optional(v.number()),
	maxSkill: v.optional(v.number()),
	secondary: v.boolean(),
	/** Recipe ids this character knows (see the recipes table). */
	knownRecipes: v.optional(v.array(v.number())),
});

/** An item id and how many (inventory scans). */
export const vItemCount = v.object({ id: v.number(), count: v.number() });

/** A character as a request shows it. */
export const vRequestCharacter = v.object({ slug: v.string(), name: v.string(), classId: v.number() });

export default defineSchema({
	users: defineTable({
		battletag: v.optional(v.string()),
		/** Battle.net account id (the OIDC `sub`). */
		battlenetId: v.optional(v.string()),
		name: v.optional(v.string()),
		/** Don't show my BattleTag to guildmates on the roster (Account page). */
		hideBattletag: v.optional(v.boolean()),
		/** Set when a person links Discord for notifications (not built yet). */
		discordId: v.optional(v.string()),
	}).index("by_battlenetId", ["battlenetId"]),

	guilds: defineTable({
		flavor: vFlavor,
		region: vRegion,
		/** The API slug: the guild name in lowercase, spaces as hyphens. Unique per flavor + region. */
		slug: v.string(),
		name: v.string(),
		faction: v.optional(v.string()),
		ruleset: v.optional(v.string()),
		visibility: vVisibility,
		/**
		 * The player who claimed the guild master's character (rank 0), set by
		 * roster syncs and claims. Can change visibility. Guilds added before
		 * this rule keep whoever added them until the guild master claims.
		 */
		ownerId: v.optional(v.id("users")),
		memberCount: v.number(),
		rosterSyncedAt: v.optional(v.number()),
		/** When someone pressed "Sync now"; syncing until rosterSyncedAt passes it. */
		syncRequestedAt: v.optional(v.number()),
		lastSyncError: v.optional(v.string()),
	})
		.index("by_key", ["flavor", "region", "slug"])
		.searchIndex("search_name", { searchField: "name", filterFields: ["visibility"] }),

	/** One row per guild member, from the roster plus each character's profile. */
	characters: defineTable({
		guildId: v.id("guilds"),
		flavor: vFlavor,
		region: vRegion,
		/** `{name}-{surname}`, lowercase; unique per flavor + region. */
		slug: v.string(),
		/** Blizzard's character id; also the number in the in-game GUID. */
		blizzardId: v.optional(v.number()),
		name: v.string(),
		surname: v.optional(v.string()),
		level: v.number(),
		classId: v.number(),
		raceId: v.number(),
		faction: v.optional(v.string()),
		gender: v.optional(v.string()),
		rank: v.number(),
		/** Profile details: only for level 10+ characters that have logged out since. */
		lastLoginAt: v.optional(v.number()),
		averageItemLevel: v.optional(v.number()),
		equipment: v.optional(v.array(vEquippedItem)),
		professions: v.optional(v.array(vProfession)),
		/** Trees with points spent, most points first. */
		talentTrees: v.optional(v.array(vTalentTree)),
		/** When we first saw Blizzard's current talentTrees (compared with addon uploads). */
		talentsChangedAt: v.optional(v.number()),
		avatarUrl: v.optional(v.string()),
		/** Full-body render on a transparent background ("main-raw"). */
		renderUrl: v.optional(v.string()),
		profileSyncedAt: v.optional(v.number()),
		/** 404 from the profile endpoint: under level 10 or not logged out yet. */
		profileMissing: v.optional(v.boolean()),
		/** Still in the guild as of the last roster sync. */
		inRoster: v.boolean(),
	})
		.index("by_guild", ["guildId", "inRoster"])
		.index("by_slug", ["flavor", "region", "slug"])
		.index("by_profileSyncedAt", ["inRoster", "profileSyncedAt"]),

	/** Characters a person proved they own, via Battle.net's account profile. */
	ownedCharacters: defineTable({
		userId: v.id("users"),
		flavor: vFlavor,
		region: vRegion,
		slug: v.string(),
		blizzardId: v.optional(v.number()),
		name: v.string(),
		level: v.optional(v.number()),
		classId: v.optional(v.number()),
		claimedAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_slug", ["flavor", "region", "slug"]),

	/** In-flight "claim my characters" OAuth flows (every region at once). */
	claimRequests: defineTable({
		userId: v.id("users"),
		stateHash: v.string(),
		/** Unused: claims used to be per region. Left optional for rows in flight at deploy. */
		region: v.optional(vRegion),
		/** The app origin that started the flow; the callback returns there. */
		origin: v.string(),
		/** The redirect_uri sent to Battle.net (the gateway's or ours), reused for the code exchange. */
		callbackUrl: v.string(),
		expiresAt: v.number(),
	})
		.index("by_stateHash", ["stateHash"])
		.index("by_user", ["userId"]),

	/** Tokens the desktop app (and the retired helper) uploads addon data with. Only the hash is stored. */
	helperTokens: defineTable({
		userId: v.id("users"),
		tokenHash: v.string(),
		label: v.string(),
		createdAt: v.number(),
		lastUsedAt: v.optional(v.number()),
	})
		.index("by_tokenHash", ["tokenHash"])
		.index("by_user", ["userId"]),

	/**
	 * "Connect the helper" in the browser: the helper shows a short code, the
	 * signed-in player approves it at /helper/connect, and the helper picks up
	 * its token by polling with a secret only it has. Single use, 10 minutes.
	 */
	helperPairings: defineTable({
		code: v.string(),
		pollSecretHash: v.string(),
		/** A name for the device, from the helper (e.g. the PC's name). */
		label: v.string(),
		expiresAt: v.number(),
		/** Set when approved; handed to the helper once, then the row is deleted. */
		token: v.optional(v.string()),
		userId: v.optional(v.id("users")),
		/** The desktop app also wants a signed-in session for its window. */
		wantsSession: v.optional(v.boolean()),
		/** Set when approved (if wanted): a one-time code for desktopSessionCodes. */
		sessionCode: v.optional(v.string()),
		/**
		 * When the app picked up its token. The token and session code are
		 * cleared then, but the row stays until it expires so the Connect page
		 * still says "Connected" instead of "expired".
		 */
		collectedAt: v.optional(v.number()),
	}).index("by_code", ["code"]),

	/**
	 * One-time codes the desktop app swaps for a signed-in session in its own
	 * window (auth:signInWithDesktopCode), issued when the player approves the
	 * app in their browser. Five minutes, single use; only the hash is stored.
	 */
	desktopSessionCodes: defineTable({
		codeHash: v.string(),
		userId: v.id("users"),
		expiresAt: v.number(),
	}).index("by_codeHash", ["codeHash"]),

	/**
	 * The latest in-game snapshot per character, uploaded by the helper from
	 * the Guildie addon. Each part is shown instead of Blizzard's only while
	 * it's newer (convex/profile.ts). Parts the addon reads separately carry
	 * their own capturedAt; the rest share the snapshot's.
	 */
	addonSnapshots: defineTable({
		userId: v.id("users"),
		flavor: vFlavor,
		region: vRegion,
		slug: v.string(),
		/** Game server time of the snapshot (level, XP, guild, talents), ms. */
		capturedAt: v.number(),
		receivedAt: v.number(),
		/** The payload version it came in (1: level and talents only). */
		version: v.optional(v.number()),
		level: v.optional(v.number()),
		xp: v.optional(v.number()),
		xpMax: v.optional(v.number()),
		classToken: v.optional(v.string()),
		raceToken: v.optional(v.string()),
		guild: v.optional(v.object({ name: v.string(), rank: v.optional(v.string()), rankIndex: v.optional(v.number()) })),
		talentTrees: v.array(vTalentTree),
		/** Worn gear with each item's tooltip as the game showed it. */
		equipment: v.optional(
			v.object({ capturedAt: v.number(), averageItemLevel: v.optional(v.number()), items: v.array(vEquippedItem) }),
		),
		/** Professions with skill (Blizzard's skill line ids). */
		professions: v.optional(v.object({ capturedAt: v.number(), list: v.array(vProfession) })),
		/**
		 * Known recipes per profession, as of when its window was last open in
		 * game, matched to the recipes table. `unmatched`: names the catalog
		 * doesn't have; `count`: how many the game listed.
		 */
		recipes: v.optional(
			v.array(
				v.object({
					professionId: v.number(),
					profession: v.string(),
					capturedAt: v.number(),
					recipeIds: v.array(v.number()),
					count: v.number(),
					unmatched: v.number(),
				}),
			),
		),
		/**
		 * Weapon and armor skills the game listed (English names), with the
		 * level they were read at; `proficiencies:audit` checks them against
		 * shared/proficiencies.ts.
		 */
		proficiencies: v.optional(
			v.object({
				capturedAt: v.number(),
				level: v.optional(v.number()),
				skills: v.array(v.string()),
				dualWield: v.optional(v.boolean()),
			}),
		),
	}).index("by_slug", ["flavor", "region", "slug"]),

	/**
	 * Blizzard's id and name for each class's talent trees, learned from synced
	 * characters (convex/shared/foreverTalents.ts maps talents to trees). Lets
	 * addon uploads use the same tree names as Blizzard's data.
	 */
	talentTreeInfo: defineTable({
		classToken: v.string(),
		treeIndex: v.number(),
		blizzardId: v.number(),
		name: v.string(),
	}).index("by_class_tree", ["classToken", "treeIndex"]),

	/** Forever's recipes and their reagents, from Blizzard's static data (recipes.ts). */
	recipes: defineTable({
		recipeId: v.number(),
		professionId: v.number(),
		profession: v.string(),
		name: v.string(),
		craftedItemId: v.optional(v.number()),
		reagents: v.array(v.object({ itemId: v.number(), name: v.string(), quantity: v.number() })),
		syncedAt: v.number(),
	})
		.index("by_recipeId", ["recipeId"])
		.index("by_craftedItemId", ["craftedItemId"])
		.index("by_professionId", ["professionId"]),

	/**
	 * Forever items we show: equipped gear, crafted items and reagents. Name,
	 * quality, icon and tooltip from Blizzard's static data (items.ts).
	 */
	items: defineTable({
		itemId: v.number(),
		name: v.string(),
		quality: v.string(),
		/** Icon URL on render.worldofwarcraft.com (56px). */
		icon: v.optional(v.string()),
		/** "Bag", "Cloth", "Two-Hand"...: item subclass, for search. */
		kind: v.optional(v.string()),
		tooltip: v.array(vTooltipLine),
		syncedAt: v.number(),
	})
		.index("by_itemId", ["itemId"])
		// Requests → "what do you need?" search.
		.searchIndex("search_name", { searchField: "name" }),

	/**
	 * Each talent tree's layout, from Blizzard's talent-tree data (talents.ts).
	 * `specId` is the id characters' talentTrees use.
	 */
	talentLayouts: defineTable({
		specId: v.number(),
		classId: v.number(),
		name: v.string(),
		nodes: v.array(
			v.object({
				/** TraitDefinition id: matches characters' talents[].id. */
				talentId: v.number(),
				name: v.string(),
				row: v.number(),
				col: v.number(),
				maxRank: v.number(),
				icon: v.optional(v.string()),
				/** Talents that need this one (arrows point to them). */
				unlocks: v.array(v.number()),
				/** Description per rank. */
				ranks: v.array(v.string()),
			}),
		),
		syncedAt: v.number(),
	})
		.index("by_specId", ["specId"])
		.index("by_classId", ["classId"]),

	/**
	 * Each character's bags and last bank read, from the Guildie addon (payload
	 * version 3). Private: never shown to anyone. Only used to tell a player,
	 * for their own craft requests, whether they have the reagents
	 * (convex/requests.ts). Item id → count.
	 */
	inventories: defineTable({
		userId: v.id("users"),
		flavor: vFlavor,
		region: vRegion,
		slug: v.string(),
		bags: v.optional(v.object({ capturedAt: v.number(), items: v.array(vItemCount) })),
		/** The bank as of the last time it was open in game. */
		bank: v.optional(v.object({ capturedAt: v.number(), items: v.array(vItemCount) })),
		receivedAt: v.number(),
	})
		.index("by_slug", ["flavor", "region", "slug"])
		.index("by_user", ["userId"]),

	/**
	 * Guild requests: a member asks for an item or a craft, a guildmate claims
	 * it, the requester marks it done. Only the guild's signed-in members see
	 * them. Rules: convex/shared/requests.ts.
	 */
	requests: defineTable({
		guildId: v.id("guilds"),
		/** The requester, and the character they asked as. */
		userId: v.id("users"),
		character: vRequestCharacter,
		kind: v.union(v.literal("item"), v.literal("craft")),
		/** The item wanted, or the crafted item (none for enchants). */
		itemId: v.optional(v.number()),
		recipeId: v.optional(v.number()),
		quantity: v.number(),
		note: v.optional(v.string()),
		status: v.union(
			v.literal("open"),
			v.literal("claimed"),
			v.literal("done"),
			v.literal("cancelled"),
			v.literal("expired"),
		),
		claim: v.optional(
			v.object({
				userId: v.id("users"),
				character: vRequestCharacter,
				claimedAt: v.number(),
				/** The claimant says it's in the mail (or traded); the requester confirms with done. */
				sentAt: v.optional(v.number()),
			}),
		),
		/** Crafts: how we know the requester has the reagents (shared/requests.ts, MatsState). */
		mats: v.optional(
			v.object({
				state: v.union(v.literal("inventory"), v.literal("declared"), v.literal("missing")),
				/** "I have the mats" ticked. */
				declared: v.boolean(),
				/** The scan the inventory check used. */
				checkedAt: v.optional(v.number()),
			}),
		),
		createdAt: v.number(),
		lastActivityAt: v.number(),
		closedAt: v.optional(v.number()),
	})
		.index("by_guild_status", ["guildId", "status"])
		.index("by_user_status", ["userId", "status"])
		.index("by_status_activity", ["status", "lastActivityAt"]),

	/** Cached client-credentials tokens for the Blizzard API. */
	apiTokens: defineTable({
		region: vRegion,
		token: v.string(),
		expiresAt: v.number(),
	}).index("by_region", ["region"]),
});
