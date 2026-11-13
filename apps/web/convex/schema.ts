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
/** An item and how many, from the addon's bag/bank read; name and quality (0-7) as the game shows them (addon 0.9+). */
export const vItemCount = v.object({
	id: v.number(),
	count: v.number(),
	name: v.optional(v.string()),
	quality: v.optional(v.number()),
});

/**
 * A quest in a character's log as the Guildie addon read it in game (payload
 * version 4, addon 0.10.0): the game's title, level, tag ("Dungeon",
 * "Elite", "Raid"...) and the quest log header it was under (a zone or
 * dungeon), whether it's complete (or failed), and each objective's text
 * ("Defias Pillager slain: 3/8") as the game shows it.
 */
export const vQuestLogEntry = v.object({
	id: v.number(),
	title: v.optional(v.string()),
	level: v.optional(v.number()),
	tag: v.optional(v.string()),
	zone: v.optional(v.string()),
	complete: v.optional(v.boolean()),
	failed: v.optional(v.boolean()),
	objectives: v.optional(v.array(v.object({ text: v.string(), done: v.boolean() }))),
});

/**
 * Preferred armor or weapon types, first to last (`types`), and whether other
 * types are left out (`strict`). `type` is the one-type shape from before
 * lists, still on older rows; shared/upgrades.ts typesOf reads either.
 */
export const vTypeChoice = v.object({
	types: v.optional(v.array(v.number())),
	type: v.optional(v.number()),
	strict: v.boolean(),
});

/** A character as a request shows it. */
const vStatPriority = v.object({
	tree: v.optional(v.number()),
	stats: v.optional(v.array(v.string())),
	tiers: v.optional(v.array(v.number())),
});

const vGearPreference = v.object({
	armor: v.optional(vTypeChoice),
	weapon: v.optional(vTypeChoice),
});

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
		/**
		 * Quests in progress (ids), from Blizzard's profile: as of the
		 * character's last logout, like the rest of it; `syncedAt` is when we
		 * fetched it. Titles and types are in the quests table.
		 */
		quests: v.optional(v.object({ syncedAt: v.number(), ids: v.array(v.number()) })),
		profileSyncedAt: v.optional(v.number()),
		/** 404 from the profile endpoint: under level 10 or not logged out yet. */
		profileMissing: v.optional(v.boolean()),
		/** Still in the guild as of the last roster sync. */
		inRoster: v.boolean(),
		/** The highest level the guild's feed has seen (feed.ts); unset until first seen, so history isn't replayed. */
		feedLevel: v.optional(v.number()),
		/** Dungeons (shared/dungeons.ts keys) whose final boss they've killed, from Blizzard's statistics; unset until first read. */
		clearedDungeons: v.optional(v.array(v.string())),
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
		/**
		 * Legacy: preferences used to live here, and claims.save rewrote the row
		 * on every sign-in, wiping them. They're in characterPreferences now;
		 * preferences:backfill moves these over and clears them. Read only as a
		 * fallback (preferences.ts preferencesOf); remove once backfilled.
		 */
		statPriority: v.optional(vStatPriority),
		gearPreference: v.optional(vGearPreference),
		dismissedItems: v.optional(v.array(v.number())),
	})
		.index("by_user", ["userId"])
		.index("by_slug", ["flavor", "region", "slug"]),

	/**
	 * What a player chose for one of their characters (preferences.ts). The
	 * player's own: claims come and go with Battle.net (sign-in, someone else
	 * claiming, a character leaving the account) and never touch these, so a
	 * re-claim gets them back. Only the player changes them; nothing deletes
	 * them.
	 */
	characterPreferences: defineTable({
		userId: v.id("users"),
		flavor: vFlavor,
		region: vRegion,
		slug: v.string(),
		/**
		 * The stats this character looks for on gear, if the player chose:
		 * another talent tree's (index in the class), or their own three to
		 * ten with how much each counts next to the first (`tiers`, unset:
		 * Balanced) (shared/statPriority.ts). Unset: from their talents.
		 */
		statPriority: v.optional(vStatPriority),
		/**
		 * The armor and weapon types this character prefers, if the player
		 * chose (armor and weapon subclass ids): others count less in gear
		 * suggestions, or (strict) aren't suggested (shared/upgrades.ts).
		 */
		gearPreference: v.optional(vGearPreference),
		/**
		 * Items (ids) the player removed from this character's gear
		 * suggestions ("Remove" on Upgrades for me): never suggested for it
		 * again, on the site or in anyone's addon tooltips.
		 */
		dismissedItems: v.optional(v.array(v.number())),
		updatedAt: v.number(),
	}).index("by_user_slug", ["userId", "flavor", "region", "slug"]),

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
		/** The quest log (payload 4): shown instead of Blizzard's quest list while newer (convex/profile.ts). */
		quests: v.optional(v.object({ capturedAt: v.number(), list: v.array(vQuestLogEntry) })),
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
		.index("by_professionId", ["professionId"])
		// Omni search (search.ts).
		.searchIndex("search_name", { searchField: "name" }),

	/**
	 * Recipe items (patterns, plans, formulas...) and what they teach, from
	 * Blizzard's static data (recipeItems.ts, weekly after the recipes).
	 * `recipeId`: the recipe in `recipes` it teaches, unset when we couldn't
	 * match it. `skill`: the profession skill it needs to learn.
	 */
	recipeItems: defineTable({
		itemId: v.number(),
		name: v.string(),
		/** Blizzard's quality type ("UNCOMMON") and icon URL, so lists need no items lookups. */
		quality: v.string(),
		icon: v.optional(v.string()),
		professionId: v.number(),
		profession: v.string(),
		skill: v.optional(v.number()),
		recipeId: v.optional(v.number()),
		syncedAt: v.number(),
	})
		.index("by_itemId", ["itemId"])
		.index("by_recipeId", ["recipeId"])
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
		/**
		 * What it does, from the tooltip ("Use:", "Equip:", set, flavor
		 * text), for omni search (shared/search.ts `itemDescription`).
		 * Optional: items saved before it get it from `items.backfillDescriptions`.
		 */
		description: v.optional(v.string()),
		syncedAt: v.number(),
	})
		.index("by_itemId", ["itemId"])
		// Requests → "what do you need?" search.
		.searchIndex("search_name", { searchField: "name" })
		// Omni search (search.ts).
		.searchIndex("search_description", { searchField: "description" }),

	/**
	 * Forever's quests that characters have in progress: title, type
	 * ("Dungeon", "Raid"; most quests have none) and area (a zone, or the
	 * dungeon) from Blizzard's static data (quests.ts). `level` is the quest's
	 * level as the game shows it (Blizzard's API has none; learned from addon
	 * uploads). `partial`: Blizzard's quest endpoint 404'd, so title (and
	 * type, area) are what the game or Blizzard's in-progress list called it.
	 */
	quests: defineTable({
		questId: v.number(),
		title: v.string(),
		type: v.optional(v.string()),
		area: v.optional(v.string()),
		level: v.optional(v.number()),
		minLevel: v.optional(v.number()),
		/** Only these classes can take it (Blizzard's `requirements.classes`). */
		classes: v.optional(v.array(v.number())),
		/** One side only, worked out from the reputations it rewards (dungeons.ts). */
		faction: v.optional(v.union(v.literal("alliance"), v.literal("horde"))),
		/** Items it rewards (all of them, or the ones to choose from). */
		rewardItems: v.optional(v.array(v.number())),
		partial: v.optional(v.boolean()),
		syncedAt: v.number(),
	})
		.index("by_questId", ["questId"])
		// Omni search (search.ts).
		.searchIndex("search_title", { searchField: "title" }),

	/**
	 * A guild's feed (feed.ts): level-ups, first dungeon clears, dungeon
	 * quests turned in, and requests made, claimed and fulfilled. Written as
	 * they're noticed (roster and profile syncs, addon uploads, requests).
	 */
	feedEvents: defineTable({
		guildId: v.id("guilds"),
		at: v.number(),
		kind: v.union(
			v.literal("level"),
			v.literal("dungeon"),
			v.literal("quests"),
			v.literal("request"),
			v.literal("claim"),
			v.literal("fulfilled"),
		),
		/** Who it's about (the requester for requests). */
		character: vRequestCharacter,
		/** level: the new level, and the one before. */
		level: v.optional(v.number()),
		fromLevel: v.optional(v.number()),
		/** dungeon, quests: the dungeon's key. */
		dungeon: v.optional(v.string()),
		questIds: v.optional(v.array(v.number())),
		/** Requests. `other`: who claimed or fulfilled it. */
		requestId: v.optional(v.id("requests")),
		requestKind: v.optional(v.union(v.literal("item"), v.literal("craft"))),
		itemId: v.optional(v.number()),
		quantity: v.optional(v.number()),
		/** An ongoing request ("is collecting Silk Cloth"). */
		ongoing: v.optional(v.boolean()),
		other: v.optional(vRequestCharacter),
	}).index("by_guild", ["guildId", "at"]),

	/**
	 * Each dungeon's quests (shared/dungeons.ts), from Blizzard's quest areas:
	 * the ones Blizzard types "Dungeon". Weekly (dungeons.ts).
	 */
	dungeonQuests: defineTable({
		key: v.string(),
		questIds: v.array(v.number()),
		syncedAt: v.number(),
	}).index("by_key", ["key"]),

	/**
	 * Quests a character has turned in, from Blizzard's profile (as of its last
	 * logout), with the profile sync. Its own table: the list runs to
	 * thousands, and most reads of characters don't need it.
	 */
	completedQuests: defineTable({
		characterId: v.id("characters"),
		ids: v.array(v.number()),
		syncedAt: v.number(),
	}).index("by_character", ["characterId"]),

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
	 * version 3). Private: only its own player sees it (Inventory,
	 * convex/inventory.ts), and it tells them, for their own craft requests,
	 * whether they have the reagents (convex/requests.ts). The one thing
	 * guildmates see: recipe items held unlearned for a profession the
	 * character has (recipeItems.ts heldUnlearned). Item id → count.
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
		/** 0 for ongoing requests (no amount). */
		quantity: v.number(),
		note: v.optional(v.string()),
		/**
		 * Ongoing ("send me any you have"): items only, never claimed, closes
		 * as expired at `until` (2 weeks to 3 months after it was set).
		 */
		ongoing: v.optional(v.boolean()),
		until: v.optional(v.number()),
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
		.index("by_status_activity", ["status", "lastActivityAt"])
		.index("by_status_until", ["status", "until"]),

	/** Cached client-credentials tokens for the Blizzard API. */
	apiTokens: defineTable({
		region: vRegion,
		token: v.string(),
		expiresAt: v.number(),
	}).index("by_region", ["region"]),

	/**
	 * AI apps (Claude, ChatGPT...) connected through the MCP server (apps/mcp,
	 * docs/mcp.md). The Worker holds the OAuth tokens; every tool call names
	 * one of these, so deleting it (Settings → Account) cuts the app off at once.
	 */
	aiConnections: defineTable({
		userId: v.id("users"),
		/** The app's name as it registered itself (not verified), and where its tokens go. */
		client: v.string(),
		redirectHost: v.string(),
		createdAt: v.number(),
		lastUsedAt: v.optional(v.number()),
		/**
		 * The player let it change their characters' stat priority and gear
		 * preferences (OAuth scope guildie:write). Unset: read only, like every
		 * connection made before writing existed.
		 */
		canWrite: v.optional(v.boolean()),
	}).index("by_user", ["userId"]),

	/**
	 * One-time codes for the hop back from the site to the MCP Worker after the
	 * player confirms who they are (mcp.ts). Five minutes, single use, bound to
	 * the Worker's state; only hashes are stored.
	 */
	aiConnectCodes: defineTable({
		codeHash: v.string(),
		stateHash: v.string(),
		userId: v.id("users"),
		client: v.string(),
		redirectHost: v.string(),
		expiresAt: v.number(),
	})
		.index("by_codeHash", ["codeHash"])
		.index("by_user", ["userId"]),
});
