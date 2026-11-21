import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { guildsOf } from "./guilds";
import { pickProfile } from "./helper";
import { ownCharacters, requestLine, requestWhat, roster, vConnection, viewerOf } from "./mcp";
import { trainerSkill } from "./mcpGuild";
import { catalogOf } from "./quests";
import { activeOf } from "./requests";
import { ago, capped, listed, matches } from "./shared/mcpText";
import { recipeColor, recipeSkill } from "./shared/recipeSkills";
import { sumInventory } from "./shared/requests";
import { trackedList } from "./tracking";

// MCP tools about the player's own things (docs/mcp.md): their quest logs,
// requests, notifications, tracked crafts and what their characters can
// craft. Only ever the connected player's own; guildmates show by name.

/** The requester's closed requests stay listed this long, as on the Requests page. */
const RECENT_CLOSED_MS = 14 * 86_400_000;

/** The player's characters a tool means: the one named (any of theirs that matches), or all of them. */
async function mine(ctx: QueryCtx, userId: Id<"users">, name: string | undefined) {
	const all = await ownCharacters(ctx, userId);
	if (!name?.trim()) return all;
	const hits = all.filter((c) => c.claim.slug === name.trim().toLowerCase() || matches(name, c.name));
	return hits;
}

const noneCalled = async (ctx: QueryCtx, userId: Id<"users">, name: string) =>
	`You have no character called "${name}". Yours: ${(await ownCharacters(ctx, userId)).map((c) => c.name).join(", ") || "none"}.`;

/** The player's characters' quest logs, with objectives, and which guildmates have the same quests. */
export const myQuests = internalQuery({
	args: { ...vConnection, character: v.optional(v.string()), search: v.optional(v.string()) },
	handler: async (ctx, { connectionId, character, search }): Promise<string> => {
		const userId = await viewerOf(ctx, connectionId);
		const now = Date.now();
		const chosen = await mine(ctx, userId, character);
		if (!chosen.length) return character ? await noneCalled(ctx, userId, character) : "You have no claimed characters.";
		const logs = [];
		for (const c of chosen) {
			if (!c.row) continue;
			const p = await pickProfile(ctx, c.row);
			logs.push({ c, level: p.level, source: p.sources.quests, quests: p.quests });
		}
		// Guildmates on the same quests: questId → names.
		const own = new Set((await ownCharacters(ctx, userId)).map((c) => c.claim.slug));
		const others = new Map<number, string[]>();
		for (const guild of await guildsOf(ctx, userId)) {
			for (const m of await roster(ctx, guild)) {
				if (own.has(m.slug)) continue;
				for (const q of (await pickProfile(ctx, m)).quests ?? []) {
					const list = others.get(q.id) ?? [];
					if (!list.includes(m.name)) list.push(m.name);
					others.set(q.id, list);
				}
			}
		}
		const catalog = await catalogOf(
			ctx,
			logs.flatMap((l) => (l.quests ?? []).map((q) => q.id)),
		);
		const lines = [];
		for (const l of logs.sort((a, b) => b.level - a.level)) {
			if (!l.quests) {
				lines.push(`${l.c.name} (${l.level}): no quest log yet.`);
				continue;
			}
			const from =
				l.source?.kind === "addon"
					? `from the game ${ago(l.source.at, now)}`
					: "from Blizzard, as of their last logout";
			const quests = l.quests
				.map((q) => {
					const row = catalog.get(q.id);
					return {
						q,
						title: row?.title ?? q.title ?? `Quest ${q.id}`,
						type: row?.type ?? q.tag,
						area: row?.area ?? q.zone,
						level: q.level ?? row?.level,
					};
				})
				.filter((x) => !search || matches(search, x.title, x.area, x.type))
				.sort((a, b) => (a.area ?? "~").localeCompare(b.area ?? "~") || (a.level ?? 0) - (b.level ?? 0));
			lines.push(
				`${l.c.name} (${l.level}): ${quests.length} quests${search ? ` matching "${search}"` : ""} (${from}).`,
			);
			for (const x of quests) {
				const state = x.q.failed ? "failed" : x.q.complete ? "ready to turn in" : "";
				const objectives = x.q.objectives?.length
					? x.q.objectives.map((o) => `${o.text}${o.done ? " ✓" : ""}`).join("; ")
					: "";
				const also = others.get(x.q.id);
				lines.push(
					`- ${x.level ? `[${x.level}] ` : ""}${x.title}${[x.area, x.type].filter(Boolean).length ? ` (${[x.area, x.type].filter(Boolean).join(", ")})` : ""}${
						state ? `: ${state}` : ""
					}${objectives ? `. ${objectives}` : ""}${also?.length ? `. Guildmates on it: ${listed(also, 8)}` : ""}`,
				);
			}
		}
		return capped(lines, 200, "Name a character or add a search.").join("\n");
	},
});

/** The player's requests (open and recently closed), crafts asked of them, and crafts they're making, with ids. */
export const myRequests = internalQuery({
	args: vConnection,
	handler: async (ctx, { connectionId }): Promise<string> => {
		const userId = await viewerOf(ctx, connectionId);
		const now = Date.now();
		const guildNames = new Map((await guildsOf(ctx, userId)).map((g) => [g._id, g.name]));
		const several = guildNames.size > 1;
		const lineOf = async (r: Doc<"requests">) =>
			`${await requestLine(ctx, r, userId, now)}${several ? ` <${guildNames.get(r.guildId) ?? "another guild"}>` : ""}`;
		const reagentsOf = async (r: Doc<"requests">) => {
			const { recipe } = await requestWhat(ctx, r);
			return recipe?.reagents.length
				? `    Reagents for ${r.quantity}: ${recipe.reagents.map((x) => `${x.quantity * r.quantity}× ${x.name}`).join(", ")}`
				: "";
		};

		const yours = await activeOf(ctx, userId);
		for (const status of ["done", "cancelled", "expired"] as const) {
			const closed = await ctx.db
				.query("requests")
				.withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", status))
				.order("desc")
				.take(20);
			yours.push(...closed.filter((r) => now - (r.closedAt ?? 0) < RECENT_CLOSED_MS));
		}
		const asked = await ctx.db
			.query("requests")
			.withIndex("by_asked", (q) => q.eq("ask.userId", userId).eq("status", "open"))
			.collect();
		const making = await ctx.db
			.query("requests")
			.withIndex("by_claimant", (q) => q.eq("claim.userId", userId).eq("status", "claimed"))
			.collect();

		const lines = [];
		lines.push(yours.length ? `Your requests (${yours.length}, newest activity first):` : "You have no requests.");
		for (const r of yours.sort((a, b) => b.lastActivityAt - a.lastActivityAt)) lines.push(await lineOf(r));
		if (asked.length) {
			lines.push(`Crafts guildmates asked you to make (accept or decline):`);
			for (const r of asked) lines.push(await lineOf(r), await reagentsOf(r));
		}
		if (making.length) {
			lines.push(`Crafts you accepted:`);
			for (const r of making) lines.push(await lineOf(r), await reagentsOf(r));
		}
		return capped(lines.filter(Boolean), 150, "Ask about one guild's requests with guild_requests.").join("\n");
	},
});

/** The player's inbox: what happened to their requests, newest first. */
export const notifications = internalQuery({
	args: { ...vConnection, limit: v.optional(v.number()) },
	handler: async (ctx, { connectionId, limit }): Promise<string> => {
		const userId = await viewerOf(ctx, connectionId);
		const now = Date.now();
		const take = Math.min(Math.max(Math.floor(limit ?? 20), 1), 50);
		const rows = await ctx.db
			.query("notifications")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.order("desc")
			.take(take);
		if (!rows.length) return "No notifications.";
		const guilds = new Map<Id<"guilds">, string>();
		for (const n of rows) if (!guilds.has(n.guildId)) guilds.set(n.guildId, (await ctx.db.get(n.guildId))?.name ?? "");
		const unread = rows.filter((n) => n.readAt === undefined).length;
		return [
			`${unread} unread of the latest ${rows.length}:`,
			...rows.map(
				(n) =>
					`- ${ago(n.at, now)}${n.readAt === undefined ? " (unread)" : ""}${guilds.size > 1 ? ` <${guilds.get(n.guildId)}>` : ""}: ${n.text}${
						n.requestId ? ` [request ${n.requestId}]` : ""
					}`,
			),
		].join("\n");
	},
});

/** The crafts the player is gathering reagents for: have against need, where they are, where to get the rest. */
export const trackedCrafts = internalQuery({
	args: vConnection,
	handler: async (ctx, { connectionId }): Promise<string> => {
		const userId = await viewerOf(ctx, connectionId);
		const { crafts, reagents } = await trackedList(ctx, userId);
		if (!crafts.length) return "You're not tracking any crafts. track_craft adds one (if this app may act for you).";
		const names = (list: { name: string; mine: boolean }[]) =>
			listed(
				list.map((c) => `${c.name}${c.mine ? " (yours)" : ""}`),
				6,
			);
		const lines = [`Tracked crafts (${crafts.length}):`];
		for (const c of crafts) {
			lines.push(
				`- ${c.item?.name ?? c.name} ×${c.quantity} (${c.profession}, recipe id ${c.recipeId}): ${
					c.short ? `${c.short} reagents short` : "you have every reagent"
				}${c.crafters.length ? `; made by ${names(c.crafters)}` : "; nobody in your guilds knows it"}`,
			);
		}
		lines.push("Reagents, most missing first:");
		for (const r of reagents) {
			const missing = Math.max(0, r.need - r.have);
			lines.push(
				[
					`- ${r.name}: have ${r.have} of ${r.need}${missing ? ` (${missing} more)` : ""}`,
					r.where.length ? `in ${r.where.map((w) => `${w.name} ${w.part} ${w.count}`).join(", ")}` : "",
					missing && r.vendor ? "vendors sell it" : "",
					missing && r.madeBy ? `${r.madeBy.recipe} (${r.madeBy.profession}) by ${names(r.madeBy.crafters)}` : "",
					`for ${r.for.join(", ")}`,
				]
					.filter(Boolean)
					.join("; "),
			);
		}
		return lines.join("\n");
	},
});

/**
 * What the player's characters can craft: per profession, skill-ups from
 * recipes they know, what their bags and banks can make now, and recipes a
 * trainer teaches at their skill that they haven't learned.
 */
export const myCrafting = internalQuery({
	args: { ...vConnection, character: v.optional(v.string()), profession: v.optional(v.string()) },
	handler: async (ctx, { connectionId, character, profession }): Promise<string> => {
		const userId = await viewerOf(ctx, connectionId);
		const chosen = await mine(ctx, userId, character);
		if (!chosen.length) return character ? await noneCalled(ctx, userId, character) : "You have no claimed characters.";
		const scans = await ctx.db
			.query("inventories")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		const { counts, scanned } = sumInventory(scans);
		const recipes = new Map<number, Doc<"recipes"> | null>();
		const recipeOf = async (id: number) => {
			if (!recipes.has(id))
				recipes.set(
					id,
					await ctx.db
						.query("recipes")
						.withIndex("by_recipeId", (q) => q.eq("recipeId", id))
						.unique(),
				);
			return recipes.get(id) ?? null;
		};
		const makeable = (r: Doc<"recipes">) =>
			r.reagents.length ? Math.min(...r.reagents.map((x) => Math.floor((counts.get(x.itemId) ?? 0) / x.quantity))) : 0;
		const needs = (r: Doc<"recipes">) =>
			r.reagents
				.map((x) => `${x.quantity}× ${x.name}${scanned ? ` (have ${counts.get(x.itemId) ?? 0})` : ""}`)
				.join(", ");

		const lines = [
			scanned
				? "Reagents counted across all your characters' bags and banks, as the addon last read them."
				: "No bags or banks read yet (they come from the Guildie addon), so nothing counts as on hand.",
		];
		for (const c of chosen) {
			if (!c.row) continue;
			const p = await pickProfile(ctx, c.row);
			for (const prof of p.professions.filter((x) => !profession || matches(profession, x.name))) {
				const skill = prof.skill ?? 0;
				const known = new Set(prof.knownRecipes ?? []);
				lines.push(
					`${c.name}, ${prof.name} ${prof.skill ?? "?"}/${prof.maxSkill ?? "?"}: ${known.size} recipes known.`,
				);
				const ups = [];
				const ready = [];
				for (const id of known) {
					const r = await recipeOf(id);
					if (!r) continue;
					const levels = recipeSkill(id);
					const color = levels ? recipeColor(levels, skill) : undefined;
					const n = makeable(r);
					if (color && color !== "grey") ups.push({ r, color, n, at: levels?.yellow ?? 0 });
					else if (n > 0) ready.push({ r, n });
				}
				const rank = { orange: 0, yellow: 1, green: 2 } as const;
				ups.sort((a, b) => rank[a.color] - rank[b.color] || Number(b.n > 0) - Number(a.n > 0) || b.at - a.at);
				if (ups.length) {
					lines.push("  Skill-ups from what they know (orange always, yellow often, green sometimes):");
					for (const u of ups.slice(0, 8))
						lines.push(`  - ${u.r.name}: ${u.color}${u.n ? `, can make ${u.n} now` : ""}; needs ${needs(u.r)}`);
					if (ups.length > 8) lines.push(`  …and ${ups.length - 8} more.`);
				} else if (prof.knownRecipes) {
					lines.push("  No known recipe gives skill-ups at this skill.");
				}
				if (ready.length) {
					ready.sort((a, b) => b.n - a.n);
					lines.push(
						`  Can make now (no skill-ups): ${listed(
							ready.map((x) => `${x.r.name} ×${x.n}`),
							10,
						)}`,
					);
				}
				// Recipes a trainer was seen teaching at or below their skill, not learned, still worth skill.
				const learnable = [];
				const levels = await ctx.db
					.query("recipeLearnLevels")
					.withIndex("by_professionId", (q) => q.eq("professionId", prof.id))
					.collect();
				for (const row of levels) {
					if (known.has(row.recipeId) || row.skill > skill) continue;
					if ((await trainerSkill(ctx, row.recipeId)) === undefined) continue;
					const s = recipeSkill(row.recipeId);
					if (s && recipeColor(s, skill) === "grey") continue;
					const r = await recipeOf(row.recipeId);
					if (r) learnable.push({ r, color: s ? recipeColor(s, skill) : "?" });
				}
				if (learnable.length) {
					lines.push(
						`  A trainer teaches, not learned yet: ${listed(
							learnable.map((x) => `${x.r.name} (${x.color})`),
							10,
						)}`,
					);
				}
				const soon = levels
					.filter((row) => !known.has(row.recipeId) && row.skill > skill && row.skill <= skill + 25)
					.sort((a, b) => a.skill - b.skill);
				if (soon.length) {
					const names = [];
					for (const row of soon.slice(0, 6)) {
						const r = await recipeOf(row.recipeId);
						if (r) names.push(`${r.name} at ${row.skill}`);
					}
					if (names.length) lines.push(`  Trainer recipes coming up: ${names.join(", ")}`);
				}
			}
		}
		if (lines.length === 1) return `${lines[0]}\nNo professions${profession ? ` matching "${profession}"` : ""}.`;
		return capped(lines, 220, "Name a character or a profession.").join("\n");
	},
});
