import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type QueryCtx, query } from "./_generated/server";
import { access, itemRow } from "./guilds";
import { pickProfile } from "./helper";
import { heldUnlearned, learners, recipeItem, recipeItemsFor } from "./recipeItems";
import { activeIn, membership } from "./requests";
import { vRegion } from "./schema";
import { type ItemInfo, itemInfoFromTooltip, untradeable } from "./shared/itemInfo";
import { type CrafterProfession, recipeState } from "./shared/recipeStatus";
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
		if (!guild || !(await access(ctx, guild)).canView || character.hidden) return null;
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
 * with who knows it (highest skill first) and who could learn it (couldLearn).
 * The UI sorts it into Crafting's tabs (shared/craftGroups.ts) and searches
 * it by recipe, item, item kind ("Bag") and tooltip text ("8 Slot Bag").
 */
export const guildCrafting = query({
	args: { region: vRegion, slug: v.string() },
	handler: async (ctx, { region, slug }) => {
		const guild = await guildByKey(ctx, region, slug);
		if (!guild) return null;
		const allowed = await access(ctx, guild);
		if (!allowed.canView) return null;
		const members = await roster(ctx, guild);
		const professions = await professionsOf(ctx, members);
		const crafters = crafterMap(members, professions);
		const learn = await couldLearn(ctx, members, professions, allowed.isMember);
		const items = new Map<number, Doc<"items"> | null>();
		const out = [];
		for (const [recipeId, who] of crafters) {
			const recipe = await recipeRow(ctx, recipeId);
			if (!recipe) continue;
			out.push({ ...(await recipeView(ctx, recipe, items)), crafters: who, learners: learn.get(recipeId) ?? [] });
		}
		return out.sort((a, b) => a.profession.localeCompare(b.profession) || a.name.localeCompare(b.name));
	},
});

/**
 * Recipe items (patterns, plans, formulas...) for the professions the guild
 * has, and the guild's characters with those professions: skill, max skill,
 * which of the taught recipes they know and which recipe items they hold
 * unlearned. The page works out who can learn what with recipeCandidates
 * (shared/recipeStatus.ts), so each character comes once instead of once per
 * item. "Holding" reads members' bags, so only members see it.
 */
export const guildRecipeLearners = query({
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
		const byId = new Map(items.map((i) => [i.itemId, i]));
		const held = allowed.isMember ? await heldUnlearned(ctx, members, byId, (i) => professions[i]) : [];
		const withItems = new Set(items.map((i) => i.professionId));
		const taught = new Set(items.flatMap((i) => i.recipeIds));
		return {
			characters: members
				.map((m, i) => ({
					name: m.name,
					slug: m.slug,
					classId: m.classId,
					professions: professions[i]
						.filter((p) => withItems.has(p.id))
						.map((p) => ({
							id: p.id,
							skill: p.skill,
							maxSkill: p.maxSkill,
							knownRecipes: (p.knownRecipes ?? []).filter((id) => taught.has(id)),
						})),
					holding: [...(held[i] ?? [])],
				}))
				.filter((c) => c.professions.length > 0),
			items: items.sort(
				(a, b) =>
					a.profession.localeCompare(b.profession) || (a.skill ?? 0) - (b.skill ?? 0) || a.name.localeCompare(b.name),
			),
		};
	},
});

/**
 * What each recipe item makes, for searching recipe items like recipes
 * ("8 slot bag", "Agility"): the crafted item's name, kind and tooltip, and
 * the reagents, as [itemId, name, kind, tooltip, reagents] text. One
 * profession at a time (a few hundred reads each). The same for every guild
 * and only changes with the weekly catalog sync, so each is cached once for
 * everyone; pages load them when someone searches.
 */
export const recipeItemSearch = query({
	args: { professionId: v.number() },
	handler: async (ctx, { professionId }) => {
		const items = await recipeItemsFor(ctx, [professionId]);
		const recipes = new Map(
			(
				await ctx.db
					.query("recipes")
					.withIndex("by_professionId", (q) => q.eq("professionId", professionId))
					.collect()
			).map((r) => [r.recipeId, r]),
		);
		const crafted = new Map<number, Doc<"items"> | null>();
		const out: [itemId: number, name: string, kind: string, tooltip: string, reagents: string][] = [];
		for (const ri of items) {
			const names: string[] = [];
			const kinds: string[] = [];
			const tips: string[] = [];
			const reagents = new Set<string>();
			// A cookbook teaches dozens; its own name says enough.
			for (const recipeId of ri.recipeIds.slice(0, 3)) {
				const recipe = recipes.get(recipeId) ?? (await recipeRow(ctx, recipeId));
				if (!recipe) continue;
				names.push(recipe.name);
				for (const r of recipe.reagents) reagents.add(r.name);
				if (recipe.craftedItemId === undefined) continue;
				if (!crafted.has(recipe.craftedItemId))
					crafted.set(recipe.craftedItemId, await itemRow(ctx, recipe.craftedItemId));
				const item = crafted.get(recipe.craftedItemId);
				if (!item) continue;
				names.push(item.name);
				if (item.kind) kinds.push(item.kind);
				// The first lines carry what people search by ("8 Slot Bag", binds, slot, stats); flavor text comes last.
				for (const line of item.tooltip.slice(0, 8)) tips.push(line.right ? `${line.left} ${line.right}` : line.left);
			}
			out.push([ri.itemId, names.join(" "), kinds.join(" "), tips.join(" "), [...reagents].join(" ")]);
		}
		return out;
	},
});

async function roster(ctx: QueryCtx, guild: Doc<"guilds">) {
	return await ctx.db
		.query("characters")
		.withIndex("by_guild", (q) => q.eq("guildId", guild._id).eq("inRoster", true))
		.collect();
}

/** Each character's professions (merged profiles), in the same order. */
async function professionsOf(ctx: QueryCtx, characters: Doc<"characters">[]) {
	return (await Promise.all(characters.map((c) => pickProfile(ctx, c)))).map((p) => p.professions);
}

type Crafter = { name: string; slug: string; classId: number; skill?: number };

function crafterMap(members: Doc<"characters">[], professions: CrafterProfession[][]) {
	const crafters = new Map<number, Crafter[]>();
	for (const [i, m] of members.entries()) {
		for (const p of professions[i]) {
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

/** Recipe id -> the roster characters who know it, highest skill first. */
export async function guildCrafters(ctx: QueryCtx, guild: Doc<"guilds">) {
	const members = await roster(ctx, guild);
	return crafterMap(members, await professionsOf(ctx, members));
}

/**
 * Someone who could learn a recipe: they have the profession and the skill
 * for its pattern (plans, formula...) and don't know it ("now"), or they
 * already hold the pattern unlearned ("has"; read from bags, members only).
 * Only recipes taught by an item: trainers' aren't tracked.
 */
export type CouldLearn = Crafter & { state: "now" | "has" };

/** Recipe id -> who could learn it (shared/recipeStatus.ts), holders first, then highest skill. */
async function couldLearn(
	ctx: QueryCtx,
	members: Doc<"characters">[],
	professions: CrafterProfession[][],
	showHeld: boolean,
): Promise<Map<number, CouldLearn[]>> {
	const items = await recipeItemsFor(
		ctx,
		professions.flatMap((list) => list.map((p) => p.id)),
	);
	const byId = new Map(items.map((i) => [i.itemId, i]));
	const held = showHeld ? await heldUnlearned(ctx, members, byId, (i) => professions[i]) : [];
	const found = new Map<number, Map<string, CouldLearn>>();
	for (const item of items) {
		// A rank (Expert Cookbook) teaches no recipe.
		if (item.rank !== undefined) continue;
		for (const [i, m] of members.entries()) {
			const state = recipeState(item, professions[i], held[i], item.itemId);
			if (state !== "now" && state !== "has") continue;
			const p = professions[i].find((x) => x.id === item.professionId);
			for (const id of item.recipeIds) {
				// A cookbook they know part of.
				if (p?.knownRecipes?.includes(id)) continue;
				const who = found.get(id) ?? new Map<string, CouldLearn>();
				if (who.get(m.slug)?.state !== "has")
					who.set(m.slug, { name: m.name, slug: m.slug, classId: m.classId, skill: p?.skill, state });
				found.set(id, who);
			}
		}
	}
	const order = (x: CouldLearn) => (x.state === "has" ? 0 : 1);
	return new Map(
		[...found].map(([id, who]) => [
			id,
			[...who.values()].sort(
				(a, b) => order(a) - order(b) || (b.skill ?? 0) - (a.skill ?? 0) || a.name.localeCompare(b.name),
			),
		]),
	);
}

/** Guildmates listed per row of Upgrades (the rest is a count). */
const OTHERS_MAX = 12;

/**
 * Upgrades, one row per item: what someone in the guild can craft that would
 * be an upgrade (or a maybe) for one of the viewer's characters, and what the
 * viewer's characters can craft that would be one for anyone in the guild.
 * By the same rules as the item panel and the addon (shared/upgrades.ts),
 * with each player's stat priority. Each row: the recipe, everyone who knows
 * it (`mine` marks the viewer's characters), who it helps and why (the
 * viewer's characters all, flagged when the player removed it, for "Show
 * removed"; guildmates the best few, `others` counting them all) and the
 * guild's open requests for it. A Binds when picked up item only counts for
 * whoever would craft it. Null for anyone who isn't a member; `noGear` lists
 * the viewer's characters whose gear we haven't read (they can't be judged).
 */
export const upgrades = query({
	args: { region: vRegion, slug: v.string() },
	handler: async (ctx, { region, slug }) => {
		const guild = await guildByKey(ctx, region, slug);
		const viewer = guild && (await membership(ctx, guild));
		if (!guild || !viewer) return null;

		const rules = upgradeRules();
		const cache = new Map<number, ItemInfo | undefined>();
		type Found = NonNullable<Awaited<ReturnType<typeof memberForUpgrades>>> & { character: Doc<"characters"> };
		const mineSlugs = new Set(viewer.characters.map((c) => c.slug));
		const members = await roster(ctx, guild);
		const profiles = await Promise.all(members.map((m) => pickProfile(ctx, m)));
		const profileOf = new Map(members.map((m, i) => [m.slug, profiles[i]]));
		const mine: Found[] = [];
		const noGear: { slug: string; name: string; classId: number }[] = [];
		for (const c of viewer.characters) {
			const f = await memberForUpgrades(ctx, c, profileOf.get(c.slug) ?? (await pickProfile(ctx, c)), rules, cache);
			if (f) mine.push({ ...f, character: c });
			else noGear.push({ slug: c.slug, name: c.name, classId: c.classId });
		}
		const others: Found[] = [];
		for (const [i, m] of members.entries()) {
			if (mineSlugs.has(m.slug)) continue;
			const f = await memberForUpgrades(ctx, m, profiles[i], rules, cache);
			if (f) others.push({ ...f, character: m });
		}
		const byMember = new Map(others.map((f) => [f.member, f]));

		const requested = new Map<number, { name: string; classId: number }[]>();
		for (const r of await activeIn(ctx, guild._id)) {
			if (r.kind !== "craft" || r.recipeId === undefined) continue;
			const list = requested.get(r.recipeId) ?? [];
			list.push({ name: r.character.name, classId: r.character.classId });
			requested.set(r.recipeId, list);
		}

		const professions = profiles.map((p) => p.professions);
		const crafterList = crafterMap(members, professions);
		const learn = await couldLearn(ctx, members, professions, true);
		const learners = (recipeId: number) =>
			(learn.get(recipeId) ?? []).map((l) => ({ ...l, mine: mineSlugs.has(l.slug) }));

		const items = new Map<number, Doc<"items"> | null>();
		const hits = [];
		const now = Date.now() / 1000;
		for (const [recipeId, crafters] of crafterList) {
			const iCraft = crafters.some((c) => mineSlugs.has(c.slug));
			// Only what the viewer is part of: for one of theirs, or by one of theirs.
			if (!iCraft && mine.length === 0) continue;
			const recipe = await recipeRow(ctx, recipeId);
			if (!recipe?.craftedItemId) continue;
			if (!items.has(recipe.craftedItemId)) items.set(recipe.craftedItemId, await itemRow(ctx, recipe.craftedItemId));
			const made = items.get(recipe.craftedItemId);
			const info = made ? itemInfoFromTooltip(made.tooltip) : undefined;
			if (!info) continue;
			// Binds when picked up: it binds to whoever crafts it.
			const bound = !!untradeable(made?.tooltip);
			const knows = (s: string) => crafters.some((c) => c.slug === s);
			const helps: (Help & { mine: boolean })[] = [];
			for (const f of mine) {
				if (bound && !knows(f.character.slug)) continue;
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
					mine: true,
				});
			}
			if (!iCraft && helps.length === 0) continue;
			// Guildmates: who else it would help (the viewer can craft it for them,
			// or can see who else would want one).
			const picks = suggest(
				info,
				others.filter((f) => !bound || knows(f.character.slug)).map((f) => f.member),
				rules,
				{ now, itemId: recipe.craftedItemId, max: Number.POSITIVE_INFINITY },
			);
			for (const { member, verdict } of picks.slice(0, OTHERS_MAX)) {
				const f = byMember.get(member)!;
				helps.push({
					slug: f.character.slug,
					name: f.character.name,
					classId: f.character.classId,
					level: member.level,
					kind: verdict.kind,
					gain: verdict.gain,
					spec: rules.specs[verdict.spec]?.name ?? CLASS_TOKENS[member.classId],
					at: verdict.at,
					why: explain(info, verdict, f.worn, rules),
					mine: false,
				});
			}
			if (helps.length === 0) continue;
			hits.push({
				...(await recipeView(ctx, recipe, items)),
				crafters: (bound ? crafters.filter((c) => helps.some((h) => h.slug === c.slug)) : crafters).map((c) => ({
					...c,
					mine: mineSlugs.has(c.slug),
				})),
				for: helps,
				/** Guildmates it helps, all of them (`for` lists the best few). */
				others: picks.length,
				requested: requested.get(recipeId) ?? [],
				learners: learners(recipeId),
			});
		}
		// Recipes nobody knows yet that someone could learn: rows when the item
		// would help one of the viewer's characters (guildmates aren't judged
		// here, to keep this quick). Binds when picked up: only for whoever learns it.
		for (const [recipeId, who] of learn) {
			if (mine.length === 0) break;
			if (crafterList.has(recipeId)) continue;
			const recipe = await recipeRow(ctx, recipeId);
			if (!recipe?.craftedItemId) continue;
			if (!items.has(recipe.craftedItemId)) items.set(recipe.craftedItemId, await itemRow(ctx, recipe.craftedItemId));
			const made = items.get(recipe.craftedItemId);
			const info = made ? itemInfoFromTooltip(made.tooltip) : undefined;
			if (!info) continue;
			const bound = !!untradeable(made?.tooltip);
			const helps: (Help & { mine: boolean })[] = [];
			for (const f of mine) {
				if (bound && !who.some((w) => w.slug === f.character.slug)) continue;
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
					mine: true,
				});
			}
			if (helps.length === 0) continue;
			hits.push({
				...(await recipeView(ctx, recipe, items)),
				crafters: [] as (Crafter & { mine: boolean })[],
				for: helps,
				others: 0,
				requested: requested.get(recipeId) ?? [],
				learners: learners(recipeId).filter((l) => !bound || helps.some((h) => h.slug === l.slug)),
			});
		}
		// Best verdict first, then ones someone can make now, then the viewer's own, then how many it helps.
		const best = (h: { for: Help[] }) => Math.min(...h.for.map((x) => kindRank(x.kind)));
		const nobody = (h: { crafters: unknown[] }) => (h.crafters.length ? 0 : 1);
		const forMine = (h: { for: (Help & { mine: boolean })[] }) => (h.for.some((x) => x.mine && !x.removed) ? 0 : 1);
		hits.sort(
			(a, b) =>
				best(a) - best(b) ||
				nobody(a) - nobody(b) ||
				forMine(a) - forMine(b) ||
				b.for.length - a.for.length ||
				Math.max(...b.for.map((x) => x.gain)) - Math.max(...a.for.map((x) => x.gain)) ||
				a.name.localeCompare(b.name),
		);
		return {
			characters: viewer.characters.map((c) => ({ slug: c.slug, name: c.name, classId: c.classId, level: c.level })),
			noGear,
			/** The viewer's characters whose gear types leave other types out ("Only this type"). */
			strict: mine
				.filter((f) => f.member.armorStrict || f.member.weaponStrict)
				.map((f) => ({ slug: f.character.slug, name: f.character.name })),
			hits,
		};
	},
});

/**
 * Everyone in the guild besides the viewer's characters whom a recipe's item
 * would help, and why: Upgrades' "+N more" (its rows list the best few).
 * Null for anyone who isn't a member.
 */
export const upgradeRecipients = query({
	args: { region: vRegion, slug: v.string(), recipeId: v.number() },
	handler: async (ctx, { region, slug, recipeId }) => {
		const guild = await guildByKey(ctx, region, slug);
		const viewer = guild && (await membership(ctx, guild));
		if (!guild || !viewer) return null;
		const recipe = await recipeRow(ctx, recipeId);
		const made = recipe?.craftedItemId ? await itemRow(ctx, recipe.craftedItemId) : null;
		const info = made ? itemInfoFromTooltip(made.tooltip) : undefined;
		if (!recipe?.craftedItemId || !made || !info) return [];
		const bound = !!untradeable(made.tooltip);
		const mineSlugs = new Set(viewer.characters.map((c) => c.slug));
		const members = await ctx.db
			.query("characters")
			.withIndex("by_guild", (q) => q.eq("guildId", guild._id).eq("inRoster", true))
			.collect();
		const rules = upgradeRules();
		const cache = new Map<number, ItemInfo | undefined>();
		const found: (NonNullable<Awaited<ReturnType<typeof memberForUpgrades>>> & { character: Doc<"characters"> })[] = [];
		for (const m of members) {
			if (mineSlugs.has(m.slug)) continue;
			const profile = await pickProfile(ctx, m);
			// Binds when picked up: only for whoever would craft it.
			if (bound && !profile.professions.some((p) => p.knownRecipes?.includes(recipeId))) continue;
			const f = await memberForUpgrades(ctx, m, profile, rules, cache);
			if (f) found.push({ ...f, character: m });
		}
		const byMember = new Map(found.map((f) => [f.member, f]));
		const picks = suggest(
			info,
			found.map((f) => f.member),
			rules,
			{ now: Date.now() / 1000, itemId: recipe.craftedItemId, max: Number.POSITIVE_INFINITY },
		);
		return picks.map(({ member, verdict }) => {
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
				mine: false,
			};
		});
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
