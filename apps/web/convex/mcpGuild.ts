import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { addonRow, summarize } from "./addons";
import { guildCrafters } from "./crafting";
import { guildsOf, itemRow } from "./guilds";
import { pickProfile } from "./helper";
import { fullName, pickGuild, roster, vConnection, viewerOf } from "./mcp";
import { catalogOf } from "./quests";
import { activeIn } from "./requests";
import { type AddonEntry, canSeeAddons } from "./shared/addons";
import { capped, fold, listed, matches, quality } from "./shared/mcpText";
import { dungeonGroups } from "./shared/quests";
import { recipeSkill } from "./shared/recipeSkills";
import { VENDOR_REAGENTS } from "./shared/wow";

// MCP tools about a guild and the game's catalogs (docs/mcp.md): dungeon
// quests across the guild, the addons members share, recipes and items.
// Same rules as convex/mcp.ts: as the connected player, what they'd see on
// the site, short plain text.

// ---- Finding recipes and items by what a model calls them -------------------------

/** Recipes matching a name (or a recipe id), the closest first. */
export async function findRecipes(ctx: QueryCtx, text: string, take = 25) {
	const trimmed = text.trim();
	if (/^-?\d+$/.test(trimmed)) {
		const row = await ctx.db
			.query("recipes")
			.withIndex("by_recipeId", (q) => q.eq("recipeId", Number(trimmed)))
			.unique();
		return row ? [row] : [];
	}
	const byName = await ctx.db
		.query("recipes")
		.withSearchIndex("search_name", (q) => q.search("name", trimmed))
		.take(take);
	const exact = fold(trimmed);
	return byName
		.filter((r) => matches(trimmed, r.name, r.profession))
		.sort((a, b) => Number(fold(b.name) === exact) - Number(fold(a.name) === exact));
}

/** The one recipe a name means, or the player-facing reason it's not clear. */
export async function resolveRecipe(ctx: QueryCtx, text: string) {
	const hits = await findRecipes(ctx, text);
	const exact = hits.filter((r) => fold(r.name) === fold(text));
	if (exact.length === 1 || hits.length === 1) return exact[0] ?? hits[0];
	if (!hits.length) throw new ConvexError(`Guildie has no recipe called "${text}". Try the recipes tool to search.`);
	const list = (exact.length ? exact : hits).slice(0, 8);
	throw new ConvexError(
		`Several recipes match "${text}": ${list.map((r) => `${r.name} (${r.profession}, recipe id ${r.recipeId})`).join("; ")}. Give the recipe id.`,
	);
}

/** Items matching a name (or an item id), the closest first. */
export async function findItems(ctx: QueryCtx, text: string, take = 10) {
	const trimmed = text.trim();
	if (/^\d+$/.test(trimmed)) {
		const row = await itemRow(ctx, Number(trimmed));
		return row ? [row] : [];
	}
	const hits = await ctx.db
		.query("items")
		.withSearchIndex("search_name", (q) => q.search("name", trimmed))
		.take(take);
	const exact = fold(trimmed);
	return hits
		.filter((i) => matches(trimmed, i.name))
		.sort((a, b) => Number(fold(b.name) === exact) - Number(fold(a.name) === exact));
}

/** The one item a name means, or the player-facing reason it's not clear. */
export async function resolveItem(ctx: QueryCtx, text: string) {
	const hits = await findItems(ctx, text);
	const exact = hits.filter((i) => fold(i.name) === fold(text));
	if (exact.length === 1 || hits.length === 1) return exact[0] ?? hits[0];
	if (!hits.length) throw new ConvexError(`Guildie doesn't know an item called "${text}".`);
	const list = (exact.length ? exact : hits).slice(0, 8);
	throw new ConvexError(
		`Several items match "${text}": ${list.map((i) => `${i.name} (item id ${i.itemId})`).join("; ")}. Give the item id.`,
	);
}

/** "orange until 125, yellow 125, green 137, grey 150", or "" when the game's data doesn't have it. */
export function skillText(recipeId: number) {
	const s = recipeSkill(recipeId);
	return s ? `skill-ups: orange until ${s.yellow}, yellow ${s.yellow}, green ${s.green}, grey ${s.grey}` : "";
}

/** The skill a trainer asks for to learn it, if the addon has seen one teach it (and the game hasn't changed it since). */
export async function trainerSkill(ctx: QueryCtx, recipeId: number) {
	const row = await ctx.db
		.query("recipeLearnLevels")
		.withIndex("by_recipeId", (q) => q.eq("recipeId", recipeId))
		.first();
	const s = recipeSkill(recipeId);
	return row && (!s || (row.yellow === s.yellow && row.grey === s.grey)) ? row.skill : undefined;
}

/** Recipe id → who in the player's guilds knows it ("Miller 225 <Wildhammers>"), computed once per call. */
async function guildKnowers(ctx: QueryCtx, userId: Id<"users">) {
	const guilds = await guildsOf(ctx, userId);
	const maps = await Promise.all(guilds.map(async (g) => ({ guild: g, crafters: await guildCrafters(ctx, g) })));
	return (recipeId: number) =>
		maps.flatMap(({ guild, crafters }) =>
			(crafters.get(recipeId) ?? []).map(
				(c) => `${c.name}${c.skill !== undefined ? ` ${c.skill}` : ""}${guilds.length > 1 ? ` <${guild.name}>` : ""}`,
			),
		);
}

// ---- Tools ---------------------------------------------------------------------

/** Dungeon and raid quests the guild's members have in progress, by dungeon: who to group with. Members only. */
export const guildQuests = internalQuery({
	args: { ...vConnection, guild: v.optional(v.string()), dungeon: v.optional(v.string()) },
	handler: async (ctx, { connectionId, guild: name, dungeon }): Promise<string> => {
		const userId = await viewerOf(ctx, connectionId);
		const guild = await pickGuild(ctx, userId, name);
		const owned = await ctx.db
			.query("ownedCharacters")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		const ownSlugs = new Set(owned.filter((c) => c.region === guild.region).map((c) => c.slug));
		const members = await roster(ctx, guild);
		const logs = [];
		for (const m of members) {
			const p = await pickProfile(ctx, m);
			if (p.quests) logs.push({ member: m, level: p.level, quests: p.quests });
		}
		const catalog = await catalogOf(
			ctx,
			logs.flatMap((l) => l.quests.map((q) => q.id)),
		);
		const groups = dungeonGroups(
			logs.map((l) => ({
				key: l.member.slug,
				name: fullName(l.member),
				classId: l.member.classId,
				level: l.level,
				mine: ownSlugs.has(l.member.slug),
				quests: l.quests.map((q) => {
					const row = catalog.get(q.id);
					return {
						id: q.id,
						title: row?.title ?? q.title ?? `Quest ${q.id}`,
						type: row?.type ?? q.tag,
						area: row?.area ?? q.zone,
						level: q.level ?? row?.level,
					};
				}),
			})),
		).filter((g) => !dungeon || matches(dungeon, g.area));
		const head = `${guild.name}: quest logs for ${logs.length} of ${members.length} members.`;
		if (!groups.length)
			return `${head} Nobody has ${dungeon ? `a quest for "${dungeon}"` : "a dungeon or raid quest"} in progress.`;
		const lines = [head];
		for (const g of groups) {
			lines.push(`${g.area} (${g.type}): ${g.people.length} people`);
			lines.push(
				`  Quests: ${g.quests.map((q) => `${q.title}${q.level ? ` (${q.level})` : ""} ×${q.holders}`).join("; ")}`,
			);
			lines.push(
				`  Who: ${g.people.map((p) => `${p.name}${p.mine ? " (yours)" : ""} ${p.level}, ${p.questIds.length} quests`).join("; ")}`,
			);
		}
		return capped(lines, 150, "Name a dungeon to narrow it.").join("\n");
	},
});

/** The addons the guild's members share (each player's own choice), most used first. */
export const guildAddons = internalQuery({
	args: { ...vConnection, guild: v.optional(v.string()), search: v.optional(v.string()) },
	handler: async (ctx, { connectionId, guild: name, search }): Promise<string> => {
		const userId = await viewerOf(ctx, connectionId);
		const guild = await pickGuild(ctx, userId, name, true);
		const byUser = new Map<Id<"users">, Doc<"characters">[]>();
		for (const c of await roster(ctx, guild)) {
			const claim = await ctx.db
				.query("ownedCharacters")
				.withIndex("by_slug", (q) => q.eq("flavor", c.flavor).eq("region", c.region).eq("slug", c.slug))
				.first();
			if (claim) byUser.set(claim.userId, [...(byUser.get(claim.userId) ?? []), c]);
		}
		const people: { name: string; mine: boolean; list: AddonEntry[] }[] = [];
		for (const [owner, theirs] of byUser) {
			const row = await addonRow(ctx, owner);
			if (!row?.list || !canSeeAddons(row.share, { isOwner: owner === userId, isMember: guild.member })) continue;
			const main = [...theirs].sort((a, b) => b.level - a.level || a.name.localeCompare(b.name))[0];
			people.push({ name: main.name, mine: owner === userId, list: row.list });
		}
		if (!people.length) return `Nobody in ${guild.name} shares their addons${guild.member ? "" : " publicly"} yet.`;
		const rows = (await summarize(ctx, people)).filter(
			(a) => !search || matches(search, a.title, a.summary, ...a.folders, ...a.categories),
		);
		const head = `${guild.name}: ${people.length} players share their addons${search ? `; ${rows.length} addons match "${search}"` : ""}.`;
		const lines = rows.map((a) => {
			const users = a.users.map((u) => `${people[u.person].name}${u.version ? ` ${u.version}` : ""}`);
			return `- ${a.title} (${a.users.length} ${a.users.length === 1 ? "player" : "players"})${
				a.summary ? `: ${a.summary.slice(0, 120)}` : ""
			}${search || a.users.length <= 3 ? `. Who: ${users.join(", ")}` : ""}`;
		});
		return [head, ...capped(lines, 60, "Add a search (an addon, a category).")].join("\n");
	},
});

/** Any recipe in the game's catalog: what it makes and takes, skill levels, how it's learned, who in the player's guilds knows it. */
export const recipes = internalQuery({
	args: { ...vConnection, search: v.string(), profession: v.optional(v.string()) },
	handler: async (ctx, { connectionId, search, profession }): Promise<string> => {
		const userId = await viewerOf(ctx, connectionId);
		const hits = (await findRecipes(ctx, search, 40)).filter((r) => !profession || matches(profession, r.profession));
		if (!hits.length) return `No recipe matches "${search}"${profession ? ` in ${profession}` : ""}.`;
		const knowers = await guildKnowers(ctx, userId);
		const lines = [`${hits.length} recipes match "${search}":`];
		for (const r of hits.slice(0, 15)) {
			const made = r.craftedItemId ? await itemRow(ctx, r.craftedItemId) : null;
			const taughtBy = await ctx.db
				.query("recipeItems")
				.withIndex("by_recipeId", (q) => q.eq("recipeId", r.recipeId))
				.first();
			const trainer = taughtBy ? undefined : await trainerSkill(ctx, r.recipeId);
			const who = knowers(r.recipeId);
			lines.push(
				[
					`- ${r.name} (${r.profession}, recipe id ${r.recipeId})`,
					made ? `makes ${made.name}${made.quality ? ` [${quality(made.quality)}]` : ""}` : "",
					r.reagents.length
						? `needs ${r.reagents.map((x) => `${x.quantity}× ${x.name}${x.itemId in VENDOR_REAGENTS ? " (vendor)" : ""}`).join(", ")}`
						: "",
					skillText(r.recipeId),
					taughtBy
						? `learned from ${taughtBy.name}${taughtBy.skill ? ` (needs ${taughtBy.skill})` : ""}`
						: trainer !== undefined
							? `a trainer teaches it from ${trainer}`
							: "",
					who.length ? `known in your guilds by ${listed(who, 8)}` : "nobody in your guilds knows it",
				]
					.filter(Boolean)
					.join("; "),
			);
		}
		if (hits.length > 15) lines.push(`…and ${hits.length - 15} more. Narrow the search or name a profession.`);
		return lines.join("\n");
	},
});

/** One item: its tooltip, who makes it, how many the player has, open requests for it. */
export const item = internalQuery({
	args: { ...vConnection, name: v.string() },
	handler: async (ctx, { connectionId, name }): Promise<string> => {
		const userId = await viewerOf(ctx, connectionId);
		const hits = await findItems(ctx, name);
		if (!hits.length) return `Guildie doesn't know an item called "${name}".`;
		const it = hits[0];
		const lines = [`${it.name} (item id ${it.itemId})${it.quality ? ` [${quality(it.quality)}]` : ""}`];
		for (const l of it.tooltip) {
			const text = `${l.left}${l.right ? `  ${l.right}` : ""}`.trim();
			if (text) lines.push(`  ${text}`);
		}
		if (it.itemId in VENDOR_REAGENTS) lines.push("Vendors sell it.");
		const teaches = await ctx.db
			.query("recipeItems")
			.withIndex("by_itemId", (q) => q.eq("itemId", it.itemId))
			.first();
		if (teaches)
			lines.push(`Teaches a ${teaches.profession} recipe${teaches.skill ? ` (needs ${teaches.skill})` : ""}.`);
		const makers = await ctx.db
			.query("recipes")
			.withIndex("by_craftedItemId", (q) => q.eq("craftedItemId", it.itemId))
			.collect();
		if (makers.length) {
			const knowers = await guildKnowers(ctx, userId);
			for (const r of makers) {
				const who = knowers(r.recipeId);
				lines.push(
					`Made with ${r.name} (${r.profession}, recipe id ${r.recipeId}): ${r.reagents.map((x) => `${x.quantity}× ${x.name}`).join(", ")}. ${
						who.length ? `Known in your guilds by ${listed(who, 8)}.` : "Nobody in your guilds knows it."
					}`,
				);
			}
		}
		const scans = await ctx.db
			.query("inventories")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		const have = [];
		for (const inv of scans) {
			for (const part of ["bags", "bank"] as const) {
				const n = (inv[part]?.items ?? []).filter((x) => x.id === it.itemId).reduce((sum, x) => sum + x.count, 0);
				const who = inv.slug.split("-")[0];
				if (n) have.push(`${who.charAt(0).toUpperCase()}${who.slice(1)} ${part} ${n}`);
			}
		}
		lines.push(
			have.length ? `You have: ${have.join(", ")}.` : "You have none (as the addon last read your bags and banks).",
		);
		for (const guild of await guildsOf(ctx, userId)) {
			const open = (await activeIn(ctx, guild._id)).filter((r) => r.itemId === it.itemId);
			if (open.length) {
				lines.push(
					`Open requests in ${guild.name}: ${open
						.map((r) => `${r.character.name} wants ${r.ongoing ? "any" : r.quantity} [id ${r._id}]`)
						.join("; ")}.`,
				);
			}
		}
		if (hits.length > 1)
			lines.push(
				`Also matching: ${hits
					.slice(1, 6)
					.map((i) => `${i.name} (${i.itemId})`)
					.join(", ")}.`,
			);
		return lines.join("\n");
	},
});
