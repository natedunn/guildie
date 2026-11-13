import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type QueryCtx, query } from "./_generated/server";
import { access, guildsOf, itemRow } from "./guilds";
import { activeIn } from "./requests";
import { vRegion } from "./schema";
import { EXTRA_DUNGEON_QUESTS } from "./shared/dungeonQuests";
import { remainingQuantity } from "./shared/requests";
import { bestLine, hasAllWords, matchScore } from "./shared/search";

// Omni search (⌘K): everything a player can see that lives in the database.
// Pages, settings and dungeons are matched in the browser
// (src/components/omni-search.tsx); this is the rest:
//   - guild members of their guilds (and the guild being looked at, if they
//     can see it), by name and surname
//   - public guilds by name
//   - items by name or description ("Use: Restores health", flavor text), with how many the viewer has in their own bags and bank
//     (private, like Personal → Inventory) and whether a recipe makes them
//   - recipes by name, or by what the item they make does
//   - quests by title, with the dungeon they belong to
//   - their guilds' open requests for matching items (members only)

const LIMIT = 8;

type GuildRef = { region: Doc<"guilds">["region"]; slug: string; name: string };

export const everything = query({
	args: {
		q: v.string(),
		/** The guild the viewer is looking at, so a public guild's roster is searched too. */
		guild: v.optional(v.object({ region: vRegion, slug: v.string() })),
	},
	handler: async (ctx, args) => {
		const q = args.q.trim().slice(0, 64);
		const empty = { members: [], guilds: [], items: [], recipes: [], quests: [], requests: [] };
		if (q.length < 2) return empty;
		const userId = (await getAuthUserId(ctx)) as Id<"users"> | null;

		// Whose rosters to search: the viewer's guilds, plus the one on screen.
		const mine = userId ? await guildsOf(ctx, userId) : [];
		const scope = [...mine];
		if (args.guild) {
			const { region, slug } = args.guild;
			const current = await ctx.db
				.query("guilds")
				.withIndex("by_key", (k) => k.eq("flavor", "forever").eq("region", region).eq("slug", slug))
				.unique();
			if (current && !scope.some((g) => g._id === current._id) && (await access(ctx, current)).canView) {
				scope.push(current);
			}
		}

		// Items whose description has every word of the query (the index matches
		// any one: "10 slot bag" would bring every "10%"), for both items and
		// the recipes that make them.
		const described = (
			await ctx.db
				.query("items")
				.withSearchIndex("search_description", (s) => s.search("description", q))
				.take(LIMIT * 4)
		)
			.filter((row) => row.description && hasAllWords(q, row.description))
			.slice(0, LIMIT);
		const [members, guilds, items, recipes, quests] = await Promise.all([
			searchMembers(ctx, q, scope),
			searchGuilds(ctx, q, mine),
			searchItems(ctx, q, userId, described),
			searchRecipes(ctx, q, described),
			searchQuests(ctx, q),
		]);
		const requests = await searchRequests(ctx, q, mine);
		return { members, guilds, items, recipes, quests, requests };
	},
});

async function searchMembers(ctx: QueryCtx, q: string, guilds: Doc<"guilds">[]) {
	const hits: { score: number; c: Doc<"characters">; guild: GuildRef }[] = [];
	const seen = new Set<string>();
	for (const guild of guilds) {
		const roster = await ctx.db
			.query("characters")
			.withIndex("by_guild", (k) => k.eq("guildId", guild._id).eq("inRoster", true))
			.collect();
		for (const c of roster) {
			const key = `${c.region}/${c.slug}`;
			if (seen.has(key)) continue;
			// The name counts most; the surname, or both together, a little less.
			const score = Math.max(
				matchScore(q, c.name),
				0.9 * Math.max(matchScore(q, c.surname ?? ""), matchScore(q, `${c.name} ${c.surname ?? ""}`)),
			);
			if (score <= 0) continue;
			seen.add(key);
			hits.push({
				score: score + c.level / 1000,
				c,
				guild: { region: guild.region, slug: guild.slug, name: guild.name },
			});
		}
	}
	return hits
		.sort((a, b) => b.score - a.score)
		.slice(0, LIMIT)
		.map(({ c, guild }) => ({
			region: c.region,
			slug: c.slug,
			name: c.name,
			surname: c.surname,
			level: c.level,
			classId: c.classId,
			avatarUrl: c.avatarUrl,
			guild,
		}));
}

/** Public guilds by name (members-only ones never turn up), not the viewer's own: the browser lists those. */
async function searchGuilds(ctx: QueryCtx, q: string, mine: Doc<"guilds">[]) {
	const rows = await ctx.db
		.query("guilds")
		.withSearchIndex("search_name", (s) => s.search("name", q).eq("visibility", "public"))
		.take(LIMIT);
	return rows
		.filter((g) => !mine.some((m) => m._id === g._id))
		.slice(0, 5)
		.map((g) => ({ region: g.region, slug: g.slug, name: g.name, memberCount: g.memberCount, faction: g.faction }));
}

/**
 * Items by name, items in the viewer's own bags and bank by the name the
 * game gave them (some aren't in the catalog yet), then items by
 * description. `have`: how many, on which of their characters. `craft`: a
 * profession whose recipe makes it. `matched`: the description line that
 * matched, when the name didn't.
 */
async function searchItems(ctx: QueryCtx, q: string, userId: Id<"users"> | null, described: Doc<"items">[]) {
	const found = await ctx.db
		.query("items")
		.withSearchIndex("search_name", (s) => s.search("name", q))
		.take(LIMIT);

	// The viewer's own inventories (theirs only: an upload under someone else's claim stays theirs).
	const have = new Map<number, { total: number; where: { name: string; count: number }[] }>();
	const named = new Map<number, { name: string; quality?: number }>();
	if (userId) {
		const owned = await ctx.db
			.query("ownedCharacters")
			.withIndex("by_user", (k) => k.eq("userId", userId))
			.collect();
		const names = new Map(owned.map((c) => [`${c.region}/${c.slug}`, c.name]));
		const inventories = await ctx.db
			.query("inventories")
			.withIndex("by_user", (k) => k.eq("userId", userId))
			.collect();
		for (const inv of inventories) {
			const name = names.get(`${inv.region}/${inv.slug}`);
			if (!name) continue;
			for (const part of [inv.bags, inv.bank]) {
				for (const it of part?.items ?? []) {
					const entry = have.get(it.id) ?? { total: 0, where: [] };
					entry.total += it.count;
					const at = entry.where.find((w) => w.name === name);
					if (at) at.count += it.count;
					else entry.where.push({ name, count: it.count });
					have.set(it.id, entry);
					if (it.name && !named.has(it.id)) named.set(it.id, { name: it.name, quality: it.quality });
				}
			}
		}
	}

	type Hit = { score: number; row: Doc<"items"> | null; itemId: number; name: string; matched?: string };
	// Names the index found on one word alone ("bag" for "10 slot bag") don't count.
	const hits: Hit[] = found
		.filter((row) => matchScore(q, row.name) > 0)
		.map((row, i) => ({
			// The search index ranks; our score breaks its ties toward exact and prefix matches.
			score: matchScore(q, row.name) + (LIMIT - i) / 100 + (have.has(row.itemId) ? 5 : 0),
			row,
			itemId: row.itemId,
			name: row.name,
		}));
	for (const [itemId, { name }] of named) {
		if (hits.some((h) => h.itemId === itemId)) continue;
		const score = matchScore(q, name);
		if (score > 0) hits.push({ score: score + 5, row: await itemRow(ctx, itemId), itemId, name });
	}
	// A name match beats any description match.
	described.forEach((row, i) => {
		if (hits.some((h) => h.itemId === row.itemId) || !row.description) return;
		hits.push({
			score: 5 + (LIMIT - i) / 100 + (have.has(row.itemId) ? 2 : 0),
			row,
			itemId: row.itemId,
			name: row.name,
			matched: bestLine(q, row.description),
		});
	});
	const top = hits.sort((a, b) => b.score - a.score).slice(0, LIMIT);
	return await Promise.all(
		top.map(async ({ row, itemId, name, matched }) => {
			const recipe = await ctx.db
				.query("recipes")
				.withIndex("by_craftedItemId", (k) => k.eq("craftedItemId", itemId))
				.first();
			const mine = have.get(itemId);
			return {
				itemId,
				name: row?.name ?? name,
				quality: row?.quality ?? QUALITY_BY_NUMBER[named.get(itemId)?.quality ?? 1] ?? "COMMON",
				icon: row?.icon,
				kind: row?.kind,
				craft: recipe?.profession,
				have: mine ? { total: mine.total, where: mine.where.sort((a, b) => b.count - a.count) } : undefined,
				matched,
			};
		}),
	);
}

/** The game's quality numbers (inventory reads) as Blizzard's names. */
const QUALITY_BY_NUMBER: Record<number, string> = {
	0: "POOR",
	1: "COMMON",
	2: "UNCOMMON",
	3: "RARE",
	4: "EPIC",
	5: "LEGENDARY",
	6: "ARTIFACT",
	7: "HEIRLOOM",
};

/** Recipes by name, then recipes whose item's description matches (`matched`: that line). */
async function searchRecipes(ctx: QueryCtx, q: string, described: Doc<"items">[]) {
	const rows = await ctx.db
		.query("recipes")
		.withSearchIndex("search_name", (s) => s.search("name", q))
		.take(LIMIT);
	const hits: { r: Doc<"recipes">; score: number; matched?: string }[] = rows
		.filter((r) => matchScore(q, r.name) > 0)
		.map((r, i) => ({
			r,
			score: matchScore(q, r.name) + (LIMIT - i) / 100,
		}));
	for (const [i, item] of described.entries()) {
		if (!item.description) continue;
		const makers = await ctx.db
			.query("recipes")
			.withIndex("by_craftedItemId", (k) => k.eq("craftedItemId", item.itemId))
			.take(3);
		for (const r of makers) {
			if (hits.some((h) => h.r.recipeId === r.recipeId)) continue;
			hits.push({ r, score: 5 + (LIMIT - i) / 100, matched: bestLine(q, item.description) });
		}
	}
	const top = hits.sort((a, b) => b.score - a.score).slice(0, 6);
	return await Promise.all(
		top.map(async ({ r, matched }) => {
			const made = r.craftedItemId ? await itemRow(ctx, r.craftedItemId) : null;
			return {
				recipeId: r.recipeId,
				name: r.name,
				profession: r.profession,
				item: made ? { itemId: made.itemId, quality: made.quality, icon: made.icon } : null,
				matched,
			};
		}),
	);
}

/** Quests by title (the catalog holds the quests characters have had in progress), with their dungeon. */
async function searchQuests(ctx: QueryCtx, q: string) {
	const rows = await ctx.db
		.query("quests")
		.withSearchIndex("search_title", (s) => s.search("title", q))
		.take(LIMIT);
	if (!rows.length) return [];
	const dungeonOf = new Map<number, string>();
	for (const row of await ctx.db.query("dungeonQuests").collect()) {
		for (const id of row.questIds) dungeonOf.set(id, row.key);
	}
	for (const [key, ids] of Object.entries(EXTRA_DUNGEON_QUESTS)) for (const id of ids) dungeonOf.set(id, key);
	return rows
		.map((r, i) => ({ r, score: matchScore(q, r.title) + (LIMIT - i) / 100 }))
		.sort((a, b) => b.score - a.score)
		.slice(0, 6)
		.map(({ r }) => ({
			questId: r.questId,
			title: r.title,
			type: r.type,
			area: r.area,
			level: r.level,
			dungeon: dungeonOf.get(r.questId),
		}));
}

/** Open and claimed requests in the viewer's guilds whose item or recipe matches. */
async function searchRequests(ctx: QueryCtx, q: string, guilds: Doc<"guilds">[]) {
	const out = [];
	for (const guild of guilds) {
		for (const r of await activeIn(ctx, guild._id)) {
			const item = r.itemId ? await itemRow(ctx, r.itemId) : null;
			const recipe =
				!item && r.recipeId
					? await ctx.db
							.query("recipes")
							.withIndex("by_recipeId", (k) => k.eq("recipeId", r.recipeId as number))
							.unique()
					: null;
			const name = item?.name ?? recipe?.name;
			if (!name) continue;
			const score = Math.max(matchScore(q, name), 0.8 * matchScore(q, r.character.name));
			if (score <= 0) continue;
			out.push({
				score,
				id: r._id,
				name,
				quality: item?.quality,
				icon: item?.icon,
				quantity: remainingQuantity(r),
				ongoing: !!r.ongoing,
				status: r.status,
				character: r.character,
				guild: { region: guild.region, slug: guild.slug, name: guild.name },
			});
		}
	}
	return out
		.sort((a, b) => b.score - a.score)
		.slice(0, 5)
		.map(({ score: _, ...r }) => r);
}
