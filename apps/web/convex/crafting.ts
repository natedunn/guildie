import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type QueryCtx, query } from "./_generated/server";
import { access, itemRow } from "./guilds";
import { pickProfile } from "./helper";
import { learners, recipeItem, recipeItemsFor } from "./recipeItems";
import { activeIn, membership } from "./requests";
import { vRegion } from "./schema";
import { type ItemInfo, itemInfoFromTooltip, untradeable } from "./shared/itemInfo";
import { explain, judge, kindRank, suggest, upgradeRules, type VerdictKind } from "./shared/upgrades";
import { CLASS_TOKENS } from "./shared/weights";
import { memberForUpgrades } from "./upgradeProfiles";

// What characters can craft: their professions' known recipes (Blizzard's
// profiles, with newer reads from the Guildie addon on top: pickProfile),
// joined with the recipe catalog and item data.

async function recipeRow(ctx: QueryCtx, recipeId: number) {
	return await ctx.db
		.query("recipes")
		.withIndex("by_recipeId", (q) => q.eq("recipeId", recipeId))
		.unique();
}

/** A recipe as the UI shows it: what it makes and what it takes. */
async function recipeView(ctx: QueryCtx, recipe: Doc<"recipes">, items: Map<number, Doc<"items"> | null>) {
	const item = async (itemId: number) => {
		if (!items.has(itemId)) items.set(itemId, await itemRow(ctx, itemId));
		return items.get(itemId) ?? null;
	};
	const made = recipe.craftedItemId ? await item(recipe.craftedItemId) : null;
	return {
		recipeId: recipe.recipeId,
		name: recipe.name,
		profession: recipe.profession,
		professionId: recipe.professionId,
		item: made
			? {
					itemId: made.itemId,
					name: made.name,
					quality: made.quality,
					icon: made.icon,
					kind: made.kind,
					tooltip: made.tooltip,
					/** "Binds when picked up" and the like: only the crafter can have it, so no requests. */
					untradeable: untradeable(made.tooltip),
				}
			: null,
		reagents: await Promise.all(
			recipe.reagents.map(async (r) => {
				const known = await item(r.itemId);
				return { itemId: r.itemId, name: r.name, quantity: r.quantity, icon: known?.icon, quality: known?.quality };
			}),
		),
	};
}

async function guildByKey(ctx: QueryCtx, region: Doc<"guilds">["region"], slug: string) {
	return await ctx.db
		.query("guilds")
		.withIndex("by_key", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
		.unique();
}

/** One character's professions, each with every recipe they know. */
export const characterProfessions = query({
	args: { region: vRegion, slug: v.string() },
	handler: async (ctx, { region, slug }) => {
		const character = await ctx.db
			.query("characters")
			.withIndex("by_slug", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
			.first();
		if (!character) return null;
		const guild = await ctx.db.get(character.guildId);
		if (!guild || !(await access(ctx, guild)).canView) return null;
		const items = new Map<number, Doc<"items"> | null>();
		const profile = await pickProfile(ctx, character);
		return await Promise.all(
			profile.professions.map(async (p) => {
				const recipes = [];
				for (const id of p.knownRecipes ?? []) {
					const recipe = await recipeRow(ctx, id);
					if (recipe) recipes.push(await recipeView(ctx, recipe, items));
				}
				recipes.sort((a, b) => a.name.localeCompare(b.name));
				return {
					id: p.id,
					name: p.name,
					skill: p.skill,
					maxSkill: p.maxSkill,
					secondary: p.secondary,
					recipes,
					/** Where the skill and the recipes came from (the game or Blizzard). */
					source: profile.sources.professions,
					recipesSource: p.recipesSource ?? { kind: "blizzard" as const, at: character.lastLoginAt },
				};
			}),
		);
	},
});

/**
 * Everything the guild can craft: each recipe someone in the guild knows,
 * with who knows it (highest skill first). The UI searches it by recipe,
 * item, item kind ("Bag") and tooltip text ("8 Slot Bag").
 */
export const guildCrafting = query({
	args: { region: vRegion, slug: v.string() },
	handler: async (ctx, { region, slug }) => {
		const guild = await guildByKey(ctx, region, slug);
		if (!guild || !(await access(ctx, guild)).canView) return null;
		const crafters = await guildCrafters(ctx, guild);
		const items = new Map<number, Doc<"items"> | null>();
		const out = [];
		for (const [recipeId, who] of crafters) {
			const recipe = await recipeRow(ctx, recipeId);
			if (!recipe) continue;
			out.push({ ...(await recipeView(ctx, recipe, items)), crafters: who });
		}
		return out.sort((a, b) => a.profession.localeCompare(b.profession) || a.name.localeCompare(b.name));
	},
});

/**
 * Recipe items (patterns, plans, formulas...) for the professions the guild
 * has, each with who has the profession and where they stand: could learn it
 * now, later (skill too low), already has one, or knows it. Characters come
 * once (`characters`); rows point into it. "Has one" reads members' bags, so
 * only members see it.
 */
export const guildRecipeItems = query({
	args: { region: vRegion, slug: v.string() },
	handler: async (ctx, { region, slug }) => {
		const guild = await guildByKey(ctx, region, slug);
		if (!guild) return null;
		const allowed = await access(ctx, guild);
		if (!allowed.canView) return null;
		const members = await ctx.db
			.query("characters")
			.withIndex("by_guild", (q) => q.eq("guildId", guild._id).eq("inRoster", true))
			.collect();
		const professions = (await Promise.all(members.map((m) => pickProfile(ctx, m)))).map((p) => p.professions);
		const items = await recipeItemsFor(
			ctx,
			professions.flatMap((list) => list.map((p) => p.id)),
		);
		const who = await learners(ctx, members, professions, items, allowed.isMember);
		const index = new Map(members.map((m, i) => [m.slug, i]));
		return {
			characters: members.map((m) => ({ name: m.name, slug: m.slug, classId: m.classId })),
			items: items
				.map((item) => ({
					itemId: item.itemId,
					name: item.name,
					quality: item.quality,
					icon: item.icon,
					profession: item.profession,
					skill: item.skill,
					who: (who.get(item.itemId) ?? []).map((l) => ({
						i: index.get(l.slug) as number,
						state: l.state,
						skill: l.skill,
					})),
				}))
				.sort(
					(a, b) =>
						a.profession.localeCompare(b.profession) || (a.skill ?? 0) - (b.skill ?? 0) || a.name.localeCompare(b.name),
				),
		};
	},
});

/** Recipe id -> the roster characters who know it, highest skill first. */
export async function guildCrafters(ctx: QueryCtx, guild: Doc<"guilds">) {
	const members = await ctx.db
		.query("characters")
		.withIndex("by_guild", (q) => q.eq("guildId", guild._id).eq("inRoster", true))
		.collect();
	const crafters = new Map<number, { name: string; slug: string; classId: number; skill?: number }[]>();
	for (const m of members) {
		for (const p of (await pickProfile(ctx, m)).professions) {
			for (const id of p.knownRecipes ?? []) {
				const list = crafters.get(id) ?? [];
				list.push({ name: m.name, slug: m.slug, classId: m.classId, skill: p.skill });
				crafters.set(id, list);
			}
		}
	}
	for (const list of crafters.values()) list.sort((a, b) => (b.skill ?? 0) - (a.skill ?? 0));
	return crafters;
}

/**
 * "Upgrades for me": what someone in the guild can craft that would be an
 * upgrade (or a maybe) for the viewer's characters in this guild, by the same
 * rules as the item panel and the addon (shared/upgrades.ts). Each hit is a
 * recipe with its crafters and, per character it helps, the verdict and a
 * short why. Null for anyone who isn't a member; `noGear` lists the viewer's
 * characters whose gear we haven't read (they can't be judged).
 */
export const upgradesForMe = query({
	args: { region: vRegion, slug: v.string() },
	handler: async (ctx, { region, slug }) => {
		const guild = await guildByKey(ctx, region, slug);
		const viewer = guild && (await membership(ctx, guild));
		if (!guild || !viewer) return null;

		const rules = upgradeRules();
		const cache = new Map<number, ItemInfo | undefined>();
		const mine: (NonNullable<Awaited<ReturnType<typeof memberForUpgrades>>> & { character: Doc<"characters"> })[] = [];
		const noGear: { slug: string; name: string; classId: number }[] = [];
		for (const c of viewer.characters) {
			const profile = await pickProfile(ctx, c);
			const f = await memberForUpgrades(ctx, c, profile, rules, cache);
			if (f) mine.push({ ...f, character: c });
			else noGear.push({ slug: c.slug, name: c.name, classId: c.classId });
		}

		const items = new Map<number, Doc<"items"> | null>();
		const hits = [];
		for (const [recipeId, crafters] of await guildCrafters(ctx, guild)) {
			if (mine.length === 0) break;
			const recipe = await recipeRow(ctx, recipeId);
			if (!recipe?.craftedItemId) continue;
			if (!items.has(recipe.craftedItemId)) items.set(recipe.craftedItemId, await itemRow(ctx, recipe.craftedItemId));
			const made = items.get(recipe.craftedItemId);
			const info = made ? itemInfoFromTooltip(made.tooltip) : undefined;
			if (!info) continue;
			// Binds when picked up: it binds to whoever crafts it, so it's only
			// for those of the viewer's characters who know the recipe themselves.
			const bound = !!untradeable(made?.tooltip);
			const helps: Help[] = [];
			for (const f of mine) {
				if (bound && !crafters.some((c) => c.slug === f.character.slug)) continue;
				// Removed ones are judged anyway, flagged, for "Show removed".
				const removed = !!f.member.dismissed?.includes(recipe.craftedItemId);
				const member = removed ? { ...f.member, dismissed: undefined } : f.member;
				const verdict = judge(info, member, rules, recipe.craftedItemId);
				if (!verdict) continue;
				helps.push({
					...(removed ? { removed: true } : {}),
					slug: f.character.slug,
					name: f.character.name,
					classId: f.character.classId,
					level: f.member.level,
					kind: verdict.kind,
					gain: verdict.gain,
					spec: rules.specs[verdict.spec]?.name ?? CLASS_TOKENS[f.member.classId],
					at: verdict.at,
					why: explain(info, verdict, f.worn, rules),
				});
			}
			if (helps.length === 0) continue;
			helps.sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || b.gain - a.gain);
			hits.push({
				...(await recipeView(ctx, recipe, items)),
				crafters: bound ? crafters.filter((c) => helps.some((h) => h.slug === c.slug)) : crafters,
				for: helps,
			});
		}
		hits.sort(
			(a, b) =>
				kindRank(a.for[0].kind) - kindRank(b.for[0].kind) ||
				b.for[0].gain - a.for[0].gain ||
				a.name.localeCompare(b.name),
		);
		return {
			characters: viewer.characters.map((c) => ({ slug: c.slug, name: c.name, classId: c.classId })),
			noGear,
			/** The viewer's characters whose gear types leave other types out ("Only this type"). */
			strict: mine
				.filter((f) => f.member.armorStrict || f.member.weaponStrict)
				.map((f) => ({ slug: f.character.slug, name: f.character.name })),
			hits,
		};
	},
});

/** How many guildmates "Upgrades I can craft" lists per recipe. */
const CRAFT_FOR_MAX = 12;

/**
 * "Upgrades I can craft": the viewer's characters' recipes whose item would
 * be an upgrade (or a maybe) for someone in the guild, their own other
 * characters included, by the same rules as everywhere else (with each
 * player's stat priority, specsFor). A Binds when picked up item only counts
 * for the character who'd craft it. Each hit: the recipe, which of the
 * viewer's characters know it, who it helps and why, and the guild's open
 * requests for it. Null for anyone who isn't a member.
 */
export const upgradesICanCraft = query({
	args: { region: vRegion, slug: v.string() },
	handler: async (ctx, { region, slug }) => {
		const guild = await guildByKey(ctx, region, slug);
		const viewer = guild && (await membership(ctx, guild));
		if (!guild || !viewer) return null;

		// The viewer's recipes: recipe id -> which of their characters know it.
		const mineBySlug = new Set(viewer.characters.map((c) => c.slug));
		const myRecipes = new Map<number, { name: string; slug: string; classId: number; skill?: number }[]>();
		for (const c of viewer.characters) {
			for (const p of (await pickProfile(ctx, c)).professions) {
				for (const id of p.knownRecipes ?? []) {
					const list = myRecipes.get(id) ?? [];
					list.push({ name: c.name, slug: c.slug, classId: c.classId, skill: p.skill });
					myRecipes.set(id, list);
				}
			}
		}

		const members = await ctx.db
			.query("characters")
			.withIndex("by_guild", (q) => q.eq("guildId", guild._id).eq("inRoster", true))
			.collect();
		const rules = upgradeRules();
		const cache = new Map<number, ItemInfo | undefined>();
		const found: (NonNullable<Awaited<ReturnType<typeof memberForUpgrades>>> & { character: Doc<"characters"> })[] = [];
		for (const m of members) {
			const f = await memberForUpgrades(ctx, m, await pickProfile(ctx, m), rules, cache);
			if (f) found.push({ ...f, character: m });
		}
		const byMember = new Map(found.map((f) => [f.member, f]));

		const requested = new Map<number, { name: string; classId: number }[]>();
		for (const r of await activeIn(ctx, guild._id)) {
			if (r.kind !== "craft" || r.recipeId === undefined) continue;
			const list = requested.get(r.recipeId) ?? [];
			list.push({ name: r.character.name, classId: r.character.classId });
			requested.set(r.recipeId, list);
		}

		const items = new Map<number, Doc<"items"> | null>();
		const hits = [];
		const now = Date.now() / 1000;
		for (const [recipeId, crafters] of myRecipes) {
			const recipe = await recipeRow(ctx, recipeId);
			if (!recipe?.craftedItemId) continue;
			if (!items.has(recipe.craftedItemId)) items.set(recipe.craftedItemId, await itemRow(ctx, recipe.craftedItemId));
			const made = items.get(recipe.craftedItemId);
			const info = made ? itemInfoFromTooltip(made.tooltip) : undefined;
			if (!info) continue;
			// Binds when picked up: only for the character who crafts it.
			const bound = !!untradeable(made?.tooltip);
			const candidates = found.filter((f) => !bound || crafters.some((c) => c.slug === f.character.slug));
			const picks = suggest(
				info,
				candidates.map((f) => f.member),
				rules,
				{ now, itemId: recipe.craftedItemId, max: CRAFT_FOR_MAX },
			);
			if (picks.length === 0) continue;
			const helps: (Help & { mine: boolean })[] = picks.map(({ member, verdict }) => {
				const f = byMember.get(member)!;
				return {
					slug: f.character.slug,
					name: f.character.name,
					classId: f.character.classId,
					level: member.level,
					kind: verdict.kind,
					gain: verdict.gain,
					spec: rules.specs[verdict.spec]?.name ?? CLASS_TOKENS[member.classId],
					at: verdict.at,
					why: explain(info, verdict, f.worn, rules),
					mine: mineBySlug.has(f.character.slug),
				};
			});
			hits.push({
				...(await recipeView(ctx, recipe, items)),
				crafters: [...crafters].sort((a, b) => (b.skill ?? 0) - (a.skill ?? 0)),
				for: helps,
				requested: requested.get(recipeId) ?? [],
			});
		}
		const upgrades = (h: { for: Help[] }) => h.for.filter((x) => x.kind === "upgrade" || x.kind === "tradeoff").length;
		hits.sort(
			(a, b) =>
				upgrades(b) - upgrades(a) ||
				b.for.length - a.for.length ||
				b.for[0].gain - a.for[0].gain ||
				a.name.localeCompare(b.name),
		);
		return { hits };
	},
});

/** A character an item would help, and why. */
type Help = {
	slug: string;
	name: string;
	classId: number;
	level: number;
	kind: VerdictKind;
	gain: number;
	spec: string;
	at?: number;
	why: string;
	/** The player removed this item from the character's suggestions. */
	removed?: boolean;
};

/** Most names the item panel's "Upgrade for" lists (the addon's tooltip line shows 3). */
const PANEL_UPGRADES = 5;

/**
 * Who in the guild an item might be an upgrade for (shared/upgrades.ts), with
 * a short why each, leaving out the viewer's own characters. Empty when we
 * can't read the item's stats.
 */
async function upgradesFor(
	ctx: QueryCtx,
	item: Doc<"items"> | null,
	members: Doc<"characters">[],
	profiles: Awaited<ReturnType<typeof pickProfile>>[],
) {
	const info = item ? itemInfoFromTooltip(item.tooltip) : undefined;
	if (!item || !info) return [];
	const userId = (await getAuthUserId(ctx)) as Id<"users"> | null;
	const own = userId
		? new Set(
				(
					await ctx.db
						.query("ownedCharacters")
						.withIndex("by_user", (q) => q.eq("userId", userId))
						.collect()
				).map((c) => `${c.region}:${c.slug}`),
			)
		: new Set<string>();
	const rules = upgradeRules();
	const cache = new Map<number, ItemInfo | undefined>();
	const found: (NonNullable<Awaited<ReturnType<typeof memberForUpgrades>>> & { character: Doc<"characters"> })[] = [];
	for (const [i, m] of members.entries()) {
		if (own.has(`${m.region}:${m.slug}`)) continue;
		const f = await memberForUpgrades(ctx, m, profiles[i], rules, cache);
		if (f) found.push({ ...f, character: m });
	}
	const picks = suggest(
		info,
		found.map((f) => f.member),
		rules,
		{ now: Date.now() / 1000, itemId: item.itemId, max: PANEL_UPGRADES },
	);
	return picks.map(({ member, verdict }) => {
		const f = found.find((x) => x.member === member)!;
		return {
			name: member.name,
			slug: f.character.slug,
			region: f.character.region,
			classId: member.classId,
			level: member.level,
			kind: verdict.kind,
			gain: verdict.gain,
			spec: rules.specs[verdict.spec]?.name ?? CLASS_TOKENS[member.classId],
			at: verdict.at,
			why: explain(info, verdict, f.worn, rules),
		};
	});
}

/**
 * One item, for the item panel: its tooltip, the recipes that make it (with
 * who in the guild knows them), the recipes it's a reagent in, and who in the
 * guild it might be an upgrade for. `guild` is the guild in view (a guild
 * page, or the character's guild on a character page); without it, crafters
 * and upgrades are left out.
 */
export const itemDetail = query({
	args: {
		itemId: v.number(),
		guild: v.optional(
			v.object({ region: vRegion, slug: v.string(), kind: v.union(v.literal("guild"), v.literal("character")) }),
		),
	},
	handler: async (ctx, { itemId, guild: where }) => {
		const items = new Map<number, Doc<"items"> | null>();
		const item = await itemRow(ctx, itemId);
		items.set(itemId, item);

		let guild: Doc<"guilds"> | null = null;
		if (where?.kind === "guild") guild = await guildByKey(ctx, where.region, where.slug);
		if (where?.kind === "character") {
			const character = await ctx.db
				.query("characters")
				.withIndex("by_slug", (q) => q.eq("flavor", "forever").eq("region", where.region).eq("slug", where.slug))
				.first();
			guild = character ? await ctx.db.get(character.guildId) : null;
		}
		const allowed = guild ? await access(ctx, guild) : null;
		if (guild && !allowed?.canView) guild = null;
		const members = guild
			? await ctx.db
					.query("characters")
					.withIndex("by_guild", (q) => q.eq("guildId", guild._id).eq("inRoster", true))
					.collect()
			: [];
		const profiles = await Promise.all(members.map((m) => pickProfile(ctx, m)));
		const craftersOf = (recipeId: number) =>
			members
				.flatMap((m, i) =>
					profiles[i].professions
						.filter((p) => p.knownRecipes?.includes(recipeId))
						.map((p) => ({ name: m.name, slug: m.slug, region: m.region, classId: m.classId, skill: p.skill })),
				)
				.sort((a, b) => (b.skill ?? 0) - (a.skill ?? 0));

		const makers = await ctx.db
			.query("recipes")
			.withIndex("by_craftedItemId", (q) => q.eq("craftedItemId", itemId))
			.collect();
		const craftedBy = await Promise.all(
			makers.map(async (r) => ({ ...(await recipeView(ctx, r, items)), crafters: craftersOf(r.recipeId) })),
		);

		// No index on reagents (an array); the catalog is a few thousand small rows.
		const usedIn = [];
		for await (const r of ctx.db.query("recipes")) {
			const reagent = r.reagents.find((x) => x.itemId === itemId);
			if (!reagent) continue;
			const view = await recipeView(ctx, r, items);
			usedIn.push({
				recipeId: view.recipeId,
				name: view.name,
				profession: view.profession,
				item: view.item,
				quantity: reagent.quantity,
			});
			if (usedIn.length >= 40) break;
		}
		usedIn.sort((a, b) => a.profession.localeCompare(b.profession) || a.name.localeCompare(b.name));

		// A pattern, plans, formula...: who in the guild could use it.
		const taught = await recipeItem(ctx, itemId);
		let learn = null;
		if (taught && guild) {
			const who = await learners(
				ctx,
				members,
				profiles.map((p) => p.professions),
				[taught],
				!!allowed?.isMember,
			);
			const names = [];
			for (const id of taught.recipeIds) {
				const recipe = await recipeRow(ctx, id);
				if (recipe) names.push(recipe.name);
			}
			learn = {
				profession: taught.profession,
				skill: taught.skill,
				/** What it teaches: "Red Linen Robe", "Grand Lobster Banquet and Specklefin Feast", or a rank. */
				teaches:
					taught.rank !== undefined ? `up to ${taught.profession} ${taught.rank}` : names.join(" and ") || undefined,
				/** Guildie's own recipe entry (Blizzard's catalog lacks it). */
				ownEntry: taught.recipeIds.some((id) => id < 0),
				who: who.get(itemId) ?? [],
			};
		}

		return {
			itemId,
			learn,
			item: item
				? { name: item.name, quality: item.quality, icon: item.icon, kind: item.kind, tooltip: item.tooltip }
				: null,
			/** "Binds when picked up" and the like: nobody can trade it, so no requests. */
			untradeable: untradeable(item?.tooltip),
			guild: guild ? { name: guild.name, region: guild.region, slug: guild.slug } : null,
			craftedBy,
			usedIn,
			upgrades: await upgradesFor(ctx, item, members, profiles),
		};
	},
});
