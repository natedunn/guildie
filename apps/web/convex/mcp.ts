import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, type QueryCtx, query } from "./_generated/server";
import { sha256 } from "./claims";
import { guildCrafters } from "./crafting";
import { guildsOf, itemRow } from "./guilds";
import { pickProfile } from "./helper";
import { activeIn } from "./requests";
import { DUNGEON_BY_KEY } from "./shared/dungeons";
import { ago, capped, matches, quality, slotName } from "./shared/mcpText";
import { PRIORITY_STATS, statPriority } from "./shared/statPriority";
import { className, raceName } from "./shared/wow";
import { requireUserId } from "./users";

// AI apps (Claude, ChatGPT...) reading a player's guild data through the MCP
// server in apps/mcp (docs/mcp.md). The Worker does OAuth and the MCP
// protocol; everything here runs as the player who connected the app, and
// only ever sees what they'd see on the site: their own guilds (members
// only, whatever the guild's visibility) and their own bags and banks.
// Tools answer in short plain text, not JSON: a model reads it, and every
// character costs the player tokens.

const CODE_TTL_MS = 5 * 60_000;
/** Don't write lastUsedAt on every call. */
const TOUCH_EVERY_MS = 5 * 60_000;
/** Connections per player; connecting one more retires the least recently used. */
const MAX_CONNECTIONS = 10;

function randomToken() {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

/** Text an AI app chose (its name): no control characters, bounded. */
const clean = (text: string, max: number) =>
	[...text]
		.filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
		.join("")
		.trim()
		.slice(0, max);

// ---- Connecting (the /connect/ai page, then the Worker) -------------------------

/**
 * The player confirmed on /connect/ai: a one-time code for the Worker, bound
 * to the Worker's `state`, and where to send the browser with it.
 */
export const startConnect = mutation({
	args: { state: v.string(), client: v.string(), host: v.string() },
	handler: async (ctx, { state, client, host }) => {
		const userId = await requireUserId(ctx);
		const mcpUrl = process.env.MCP_URL?.replace(/\/+$/, "");
		if (!mcpUrl) throw new ConvexError("AI apps can't connect to this copy of Guildie.");
		if (state.length < 16 || state.length > 256)
			throw new ConvexError("This link is broken. Start again from your AI app.");
		// One pending code per player: starting again replaces it.
		const pending = await ctx.db
			.query("aiConnectCodes")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		for (const old of pending) await ctx.db.delete(old._id);
		const code = randomToken();
		await ctx.db.insert("aiConnectCodes", {
			codeHash: await sha256(code),
			stateHash: await sha256(state),
			userId,
			client: clean(client, 60) || "An AI app",
			redirectHost: clean(host, 120),
			expiresAt: Date.now() + CODE_TTL_MS,
		});
		const next = new URL(`${mcpUrl}/callback`);
		next.searchParams.set("state", state);
		next.searchParams.set("code", code);
		return { redirect: next.toString() };
	},
});

/** The Worker swaps the code, with the state it came back with, for a connection. Null if it's no good. */
export const exchange = internalMutation({
	args: { code: v.string(), state: v.string() },
	handler: async (ctx, { code, state }): Promise<{ userId: Id<"users">; connectionId: Id<"aiConnections"> } | null> => {
		const codeHash = await sha256(code);
		const row = await ctx.db
			.query("aiConnectCodes")
			.withIndex("by_codeHash", (q) => q.eq("codeHash", codeHash))
			.unique();
		if (!row) return null;
		await ctx.db.delete(row._id);
		if (row.expiresAt < Date.now() || row.stateHash !== (await sha256(state))) return null;
		const existing = await ctx.db
			.query("aiConnections")
			.withIndex("by_user", (q) => q.eq("userId", row.userId))
			.collect();
		if (existing.length >= MAX_CONNECTIONS) {
			const oldest = existing.sort((a, b) => (a.lastUsedAt ?? a.createdAt) - (b.lastUsedAt ?? b.createdAt))[0];
			await ctx.db.delete(oldest._id);
		}
		const connectionId = await ctx.db.insert("aiConnections", {
			userId: row.userId,
			client: row.client,
			redirectHost: row.redirectHost,
			createdAt: Date.now(),
		});
		return { userId: row.userId, connectionId };
	},
});

/** Settings → Account: the AI apps connected to this account. */
export const connections = query({
	args: {},
	handler: async (ctx) => {
		const userId = await requireUserId(ctx);
		const rows = await ctx.db
			.query("aiConnections")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		return rows
			.sort((a, b) => b.createdAt - a.createdAt)
			.map(({ _id, client, redirectHost, createdAt, lastUsedAt }) => ({
				_id,
				client,
				redirectHost,
				createdAt,
				lastUsedAt,
			}));
	},
});

export const disconnect = mutation({
	args: { connectionId: v.id("aiConnections") },
	handler: async (ctx, { connectionId }) => {
		const userId = await requireUserId(ctx);
		const row = await ctx.db.get(connectionId);
		if (row?.userId === userId) await ctx.db.delete(connectionId);
	},
});

/** Each tool call: note when the connection was last used (every few minutes at most). */
export const touch = internalMutation({
	args: { connectionId: v.id("aiConnections") },
	handler: async (ctx, { connectionId }) => {
		const row = await ctx.db.get(connectionId);
		const now = Date.now();
		if (row && now - (row.lastUsedAt ?? 0) > TOUCH_EVERY_MS) await ctx.db.patch(connectionId, { lastUsedAt: now });
	},
});

// ---- Who's asking, and which guild ------------------------------------------------

/** The player behind a connection, or a ConvexError the app shows (disconnected in Settings). */
async function viewerOf(ctx: QueryCtx, connectionId: string) {
	const id = ctx.db.normalizeId("aiConnections", connectionId);
	const row = id && (await ctx.db.get(id));
	if (!row) throw new ConvexError("This app was disconnected from Guildie. Connect it again to keep using it.");
	return row.userId;
}

/** The guild a tool means: the one named, or the player's only guild. */
async function pickGuild(ctx: QueryCtx, userId: Id<"users">, name: string | undefined) {
	const guilds = await guildsOf(ctx, userId);
	if (!guilds.length) {
		throw new ConvexError(
			"None of your characters is in a guild on Guildie. Sign in on guildie.club and refresh your characters.",
		);
	}
	if (name?.trim()) {
		const hit = guilds.find((g) => matches(name, g.name) || g.slug === name.trim().toLowerCase());
		if (hit) return hit;
		throw new ConvexError(
			`You're not in a guild called "${name}". Your guilds: ${guilds.map((g) => g.name).join(", ")}.`,
		);
	}
	if (guilds.length === 1) return guilds[0];
	throw new ConvexError(`You're in several guilds; say which: ${guilds.map((g) => g.name).join(", ")}.`);
}

async function roster(ctx: QueryCtx, guild: Doc<"guilds">) {
	return await ctx.db
		.query("characters")
		.withIndex("by_guild", (q) => q.eq("guildId", guild._id).eq("inRoster", true))
		.collect();
}

const fullName = (c: { name: string; surname?: string }) => (c.surname ? `${c.name} ${c.surname}` : c.name);

const vConnection = { connectionId: v.string() };

// ---- Tools (apps/mcp/src/tools.ts describes them to the app) -------------------------

/** Who the player is: their claimed characters and the guilds those are in. */
export const me = internalQuery({
	args: vConnection,
	handler: async (ctx, { connectionId }): Promise<string> => {
		const userId = await viewerOf(ctx, connectionId);
		const user = await ctx.db.get(userId);
		const owned = await ctx.db
			.query("ownedCharacters")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		const lines = [`Player: ${user?.battletag ?? user?.name ?? "unknown"}`];
		if (!owned.length) lines.push("No claimed characters yet (claim them on guildie.club → Settings).");
		else lines.push("Characters:");
		for (const c of owned) {
			const row = await ctx.db
				.query("characters")
				.withIndex("by_slug", (q) => q.eq("flavor", c.flavor).eq("region", c.region).eq("slug", c.slug))
				.first();
			const guild = row?.inRoster ? await ctx.db.get(row.guildId) : null;
			const level = row ? (await pickProfile(ctx, row)).level : c.level;
			const classId = row?.classId ?? c.classId;
			lines.push(
				`- ${row ? fullName(row) : c.name}: level ${level ?? "?"} ${classId ? className(classId) : ""}, ${
					guild ? `<${guild.name}>` : "no guild"
				} (${c.region.toUpperCase()})`,
			);
		}
		const guilds = await guildsOf(ctx, userId);
		if (guilds.length) lines.push(`Guilds: ${guilds.map((g) => `${g.name} (${g.memberCount} members)`).join(", ")}`);
		return lines.join("\n");
	},
});

/** Everyone in the guild: level, class, item level, professions, last logout. */
export const guildRoster = internalQuery({
	args: { ...vConnection, guild: v.optional(v.string()), search: v.optional(v.string()) },
	handler: async (ctx, { connectionId, guild: name, search }): Promise<string> => {
		const userId = await viewerOf(ctx, connectionId);
		const guild = await pickGuild(ctx, userId, name);
		const now = Date.now();
		const members = await roster(ctx, guild);
		const rows = [];
		for (const c of members) {
			const p = await pickProfile(ctx, c);
			const professions = p.professions.map((x) => `${x.name}${x.skill !== undefined ? ` ${x.skill}` : ""}`).join(", ");
			const talents = p.talentTrees
				?.filter((t) => t.points > 0)
				.map((t) => `${t.name} ${t.points}`)
				.join("/");
			const text = [
				`${fullName(c)}: ${p.level} ${raceName(c.raceId)} ${className(c.classId)}`,
				c.rank === 0 ? "guild master" : `rank ${c.rank}`,
				p.averageItemLevel ? `ilvl ${p.averageItemLevel}` : "",
				talents ? `talents ${talents}` : "",
				professions ? `professions ${professions}` : "",
				c.lastLoginAt ? `last logout ${ago(c.lastLoginAt, now)}` : "",
			]
				.filter(Boolean)
				.join("; ");
			if (!search || matches(search, text)) rows.push({ level: p.level, text });
		}
		rows.sort((a, b) => b.level - a.level || a.text.localeCompare(b.text));
		const head = `${guild.name}: ${members.length} members${search ? `, ${rows.length} matching "${search}"` : ""}.`;
		return [
			head,
			...capped(
				rows.map((r) => `- ${r.text}`),
				150,
				"Add a search (a class, a profession, a name).",
			),
		].join("\n");
	},
});

/** One character in the player's guilds (or one of their own): gear, talents, professions, stat priority. */
export const character = internalQuery({
	args: { ...vConnection, name: v.string() },
	handler: async (ctx, { connectionId, name }): Promise<string> => {
		const userId = await viewerOf(ctx, connectionId);
		const now = Date.now();
		const candidates = (await Promise.all((await guildsOf(ctx, userId)).map((g) => roster(ctx, g)))).flat();
		const exact = candidates.filter((c) => c.slug === name.trim().toLowerCase() || matches(name, c.name, c.surname));
		const firstName = exact.filter((c) => matches(name, c.name));
		const hits = firstName.length ? firstName : exact;
		if (!hits.length) return `No character called "${name}" in your guilds.`;
		if (hits.length > 1 && !hits.some((c) => c.slug === name.trim().toLowerCase())) {
			return `Several match "${name}": ${hits.map(fullName).join(", ")}. Use the full name.`;
		}
		const c = hits.find((h) => h.slug === name.trim().toLowerCase()) ?? hits[0];
		const guild = await ctx.db.get(c.guildId);
		const p = await pickProfile(ctx, c);
		const claims = await ctx.db
			.query("ownedCharacters")
			.withIndex("by_slug", (q) => q.eq("flavor", c.flavor).eq("region", c.region).eq("slug", c.slug))
			.collect();
		const mine = claims.find((x) => x.userId === userId);
		const priority = statPriority(c.classId, p.talentTrees, (mine ?? claims[0])?.statPriority);
		const lines = [
			`${fullName(c)}: level ${p.level} ${raceName(c.raceId)} ${className(c.classId)}, <${guild?.name}> ${
				c.rank === 0 ? "guild master" : `rank ${c.rank}`
			}${mine ? " (your character)" : ""}.`,
		];
		if (p.averageItemLevel) lines.push(`Item level: ${p.averageItemLevel}`);
		const trees = p.talentTrees?.filter((t) => t.points > 0);
		if (trees?.length) {
			lines.push(`Talents: ${trees.map((t) => `${t.name} ${t.points}`).join(", ")}`);
			for (const t of trees) {
				const picked = t.talents.filter((x) => x.rank > 0).map((x) => `${x.name} ${x.rank}`);
				if (picked.length) lines.push(`  ${t.name}: ${picked.join(", ")}`);
			}
		}
		if (priority) {
			lines.push(
				`Stat priority: ${priority.stats.map((s) => PRIORITY_STATS[s] ?? s).join(" > ")}${priority.tree ? ` (${priority.tree})` : ""}${
					priority.chosen ? ", chosen by the player" : ", from talents"
				}`,
			);
		}
		if (p.professions.length) {
			lines.push(
				`Professions: ${p.professions
					.map(
						(x) =>
							`${x.name}${x.skill !== undefined ? ` ${x.skill}/${x.maxSkill ?? "?"}` : ""}${
								x.knownRecipes?.length ? ` (${x.knownRecipes.length} recipes)` : ""
							}`,
					)
					.join(", ")}`,
			);
		}
		if (p.equipment?.length) {
			lines.push("Gear:");
			for (const item of p.equipment) {
				lines.push(
					`- ${slotName(item.slot)}: ${item.name} (${[
						quality(item.quality),
						item.itemLevel ? `ilvl ${item.itemLevel}` : "",
					]
						.filter(Boolean)
						.join(", ")})`,
				);
			}
		} else if (c.profileMissing) {
			lines.push("Gear: unknown (Blizzard has no profile until level 10 and a logout).");
		}
		if (c.clearedDungeons?.length) {
			lines.push(`Dungeons cleared: ${c.clearedDungeons.map((k) => DUNGEON_BY_KEY.get(k)?.name ?? k).join(", ")}`);
		}
		lines.push(
			p.synced
				? `Data as of ${ago(p.synced.at, now)}, from ${p.synced.kind === "app" ? "the game (Guildie app)" : "Blizzard (last logout)"}.`
				: "Data: not synced yet.",
		);
		return lines.join("\n");
	},
});

/** Who in the guild can craft something: recipes known in the guild matching the search, with crafters and reagents. */
export const whoCanCraft = internalQuery({
	args: { ...vConnection, search: v.string(), guild: v.optional(v.string()) },
	handler: async (ctx, { connectionId, search, guild: name }): Promise<string> => {
		const userId = await viewerOf(ctx, connectionId);
		const guild = await pickGuild(ctx, userId, name);
		const crafters = await guildCrafters(ctx, guild);
		const hits = [];
		for (const [recipeId, who] of crafters) {
			const recipe = await ctx.db
				.query("recipes")
				.withIndex("by_recipeId", (q) => q.eq("recipeId", recipeId))
				.unique();
			if (!recipe) continue;
			const item = recipe.craftedItemId ? await itemRow(ctx, recipe.craftedItemId) : null;
			const tooltip = item?.tooltip?.map((l) => `${l.left} ${l.right ?? ""}`).join(" ");
			if (!matches(search, recipe.name, recipe.profession, item?.name, item?.kind, tooltip)) continue;
			const reagents = recipe.reagents.map((r) => `${r.quantity}× ${r.name}`).join(", ");
			hits.push(
				`- ${recipe.name} (${recipe.profession}${item ? `, makes ${item.name}${item.quality ? ` [${quality(item.quality)}]` : ""}` : ""}): ${who
					.map((w) => `${w.name}${w.skill !== undefined ? ` (${w.skill})` : ""}`)
					.join(", ")}${reagents ? `. Needs ${reagents}` : ""}`,
			);
		}
		if (!hits.length) return `Nobody in ${guild.name} knows a recipe matching "${search}".`;
		hits.sort();
		return [
			`${guild.name}: ${hits.length} recipes match "${search}" (crafters, highest skill first):`,
			...capped(hits, 25, "Search for something more specific."),
		].join("\n");
	},
});

/** The guild's open and claimed requests. */
export const requests = internalQuery({
	args: { ...vConnection, guild: v.optional(v.string()) },
	handler: async (ctx, { connectionId, guild: name }): Promise<string> => {
		const userId = await viewerOf(ctx, connectionId);
		const guild = await pickGuild(ctx, userId, name);
		const now = Date.now();
		const rows = (await activeIn(ctx, guild._id)).sort((a, b) => b.lastActivityAt - a.lastActivityAt);
		if (!rows.length) return `${guild.name} has no open requests.`;
		const lines = [];
		for (const r of rows) {
			const item = r.itemId !== undefined ? await itemRow(ctx, r.itemId) : null;
			const recipe =
				r.recipeId !== undefined
					? await ctx.db
							.query("recipes")
							.withIndex("by_recipeId", (q) => q.eq("recipeId", r.recipeId as number))
							.unique()
					: null;
			const what = item?.name ?? recipe?.name ?? (r.itemId !== undefined ? `item ${r.itemId}` : "something");
			lines.push(
				[
					`- ${r.character.name}${r.userId === userId ? " (you)" : ""} wants ${r.quantity}× ${what}`,
					r.kind === "craft" ? ` crafted${recipe ? ` (${recipe.profession})` : ""}` : "",
					r.claim ? `; ${r.claim.character.name} is on it${r.claim.sentAt ? ", sent" : ""}` : "; open",
					r.kind === "craft" && r.mats ? (r.mats.state === "missing" ? "; needs mats" : "; has mats") : "",
					`; ${ago(r.createdAt, now)}`,
					r.note ? `; note: "${r.note}"` : "",
				].join(""),
			);
		}
		return [`${guild.name}: ${rows.length} open requests.`, ...capped(lines, 60, "")].join("\n");
	},
});

/** The guild's feed: level-ups, dungeon clears, quests, requests. */
export const activity = internalQuery({
	args: { ...vConnection, guild: v.optional(v.string()), limit: v.optional(v.number()) },
	handler: async (ctx, { connectionId, guild: name, limit }): Promise<string> => {
		const userId = await viewerOf(ctx, connectionId);
		const guild = await pickGuild(ctx, userId, name);
		const now = Date.now();
		const take = Math.min(Math.max(Math.floor(limit ?? 30), 1), 100);
		const events = await ctx.db
			.query("feedEvents")
			.withIndex("by_guild", (q) => q.eq("guildId", guild._id))
			.order("desc")
			.take(take);
		if (!events.length) return `Nothing in ${guild.name}'s feed yet.`;
		const lines = [];
		for (const e of events) {
			const who = e.character.name;
			const dungeon = e.dungeon ? (DUNGEON_BY_KEY.get(e.dungeon)?.name ?? e.dungeon) : "";
			const item = e.itemId !== undefined ? ((await itemRow(ctx, e.itemId))?.name ?? `item ${e.itemId}`) : "";
			const what =
				e.kind === "level"
					? `${who} reached level ${e.level}`
					: e.kind === "dungeon"
						? `${who} cleared ${dungeon}`
						: e.kind === "quests"
							? `${who} turned in ${e.questIds?.length ?? 0} ${dungeon} quests`
							: e.kind === "request"
								? `${who} asked for ${e.quantity ?? 1}× ${item}`
								: e.kind === "claim"
									? `${e.other?.name ?? "Someone"} took ${who}'s request for ${item}`
									: `${e.other?.name ?? "Someone"} got ${who} ${item}`;
			lines.push(`- ${ago(e.at, now)}: ${what}`);
		}
		return [`${guild.name}, newest first:`, ...lines].join("\n");
	},
});

/** The player's own bags and banks (every claimed character), as the addon last read them. */
export const inventory = internalQuery({
	args: { ...vConnection, search: v.optional(v.string()) },
	handler: async (ctx, { connectionId, search }): Promise<string> => {
		const userId = await viewerOf(ctx, connectionId);
		const now = Date.now();
		const scans = await ctx.db
			.query("inventories")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		if (!scans.length) {
			return "No bags or banks read yet. They come from the Guildie addon, uploaded by the Guildie app.";
		}
		const totals = new Map<number, { name: string; total: number; where: string[] }>();
		const seen = [];
		for (const inv of scans) {
			const row = await ctx.db
				.query("characters")
				.withIndex("by_slug", (q) => q.eq("flavor", inv.flavor).eq("region", inv.region).eq("slug", inv.slug))
				.first();
			const who = row?.name ?? inv.slug.split("-")[0];
			seen.push(
				`${who} (bags ${inv.bags ? ago(inv.bags.capturedAt, now) : "never"}, bank ${inv.bank ? ago(inv.bank.capturedAt, now) : "never"})`,
			);
			for (const part of ["bags", "bank"] as const) {
				for (const { id, count, name } of inv[part]?.items ?? []) {
					let t = totals.get(id);
					if (!t) {
						t = { name: name ?? (await itemRow(ctx, id))?.name ?? `item ${id}`, total: 0, where: [] };
						totals.set(id, t);
					}
					t.total += count;
					t.where.push(`${who} ${part} ${count}`);
				}
			}
		}
		const items = [...totals.values()].filter((t) => !search || matches(search, t.name));
		items.sort((a, b) => a.name.localeCompare(b.name));
		const lines = items.map((t) => `- ${t.name}: ${t.total} (${t.where.join(", ")})`);
		return [
			`Read: ${seen.join("; ")}.`,
			search ? `${items.length} items match "${search}":` : `${items.length} different items:`,
			...capped(lines, 120, "Add a search to narrow it."),
		].join("\n");
	},
});
