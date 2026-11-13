import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { type CurseMod, catalogEntry } from "./shared/addons";

// CurseForge projects of the addons players run (addonCatalog in schema.ts):
// name, summary, logo, link and categories for the Addons pages. Looked up by
// the project ID an addon's .toc carries (`## X-Curse-Project-ID`, sent by
// the Guildie addon 0.20+); addons without one show their .toc notes instead.
// CurseForge's search is closed to our key, so there's no lookup by name.
// Needs CURSEFORGE_API_KEY (console.curseforge.com); without it nothing is
// looked up and the pages show what the game gave.

const API = "https://api.curseforge.com/v1";
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const MISSING_RETRY_MS = 30 * 24 * 60 * 60 * 1000;
const PER_RUN = 500;
const PER_REQUEST = 50;

/** The catalog rows for these project IDs, by ID. */
export async function catalogFor(ctx: QueryCtx, ids: Iterable<number>) {
	const out = new Map<number, Doc<"addonCatalog">>();
	for (const curseId of new Set(ids)) {
		const row = await ctx.db
			.query("addonCatalog")
			.withIndex("by_curseId", (q) => q.eq("curseId", curseId))
			.unique();
		if (row && !row.missing) out.set(curseId, row);
	}
	return out;
}

/** Project IDs players' lists name that we haven't looked up, or not lately. */
export const due = internalQuery({
	args: {},
	handler: async (ctx): Promise<number[]> => {
		const ids = new Set<number>();
		for (const row of await ctx.db.query("playerAddons").collect()) {
			for (const a of row.list ?? []) if (a.curseId) ids.add(a.curseId);
		}
		const now = Date.now();
		const out: number[] = [];
		for (const curseId of ids) {
			const row = await ctx.db
				.query("addonCatalog")
				.withIndex("by_curseId", (q) => q.eq("curseId", curseId))
				.unique();
			const age = row ? now - row.fetchedAt : Number.POSITIVE_INFINITY;
			if (age > (row?.missing ? MISSING_RETRY_MS : FRESH_MS)) out.push(curseId);
			if (out.length >= PER_RUN) break;
		}
		return out;
	},
});

/** Whether any of these IDs has no catalog row yet (to look them up right after an upload). */
export async function anyUnknown(ctx: QueryCtx, ids: number[]) {
	for (const curseId of new Set(ids)) {
		const row = await ctx.db
			.query("addonCatalog")
			.withIndex("by_curseId", (q) => q.eq("curseId", curseId))
			.unique();
		if (!row) return true;
	}
	return false;
}

const vEntry = v.object({
	curseId: v.number(),
	name: v.optional(v.string()),
	summary: v.optional(v.string()),
	logo: v.optional(v.string()),
	url: v.optional(v.string()),
	categories: v.optional(v.array(v.string())),
	missing: v.optional(v.boolean()),
});

export const save = internalMutation({
	args: { entries: v.array(vEntry) },
	handler: async (ctx, { entries }) => {
		const fetchedAt = Date.now();
		for (const entry of entries) {
			const row = await ctx.db
				.query("addonCatalog")
				.withIndex("by_curseId", (q) => q.eq("curseId", entry.curseId))
				.unique();
			// CurseForge forgetting a project we had keeps what we had.
			if (row && entry.missing && !row.missing) {
				await ctx.db.patch(row._id, { fetchedAt });
			} else if (row) {
				await ctx.db.replace(row._id, { ...entry, fetchedAt });
			} else {
				await ctx.db.insert("addonCatalog", { ...entry, fetchedAt });
			}
		}
	},
});

/** Look up the projects that are due (after an upload with new ones, and daily). */
export const refresh = internalAction({
	args: {},
	handler: async (ctx): Promise<{ looked: number; skipped?: string; error?: number }> => {
		const key = process.env.CURSEFORGE_API_KEY;
		if (!key) return { looked: 0, skipped: "no CURSEFORGE_API_KEY" };
		const ids: number[] = await ctx.runQuery(internal.addonCatalog.due, {});
		for (let i = 0; i < ids.length; i += PER_REQUEST) {
			const chunk = ids.slice(i, i + PER_REQUEST);
			const res = await fetch(`${API}/mods`, {
				method: "POST",
				headers: { "x-api-key": key, "Content-Type": "application/json", Accept: "application/json" },
				body: JSON.stringify({ modIds: chunk }),
			});
			if (!res.ok) {
				console.warn(`CurseForge /mods: ${res.status}`);
				return { looked: i, error: res.status };
			}
			const { data } = (await res.json()) as { data?: CurseMod[] };
			const found = new Map((data ?? []).map((m) => [m.id, m]));
			const entries = chunk.map((curseId) => {
				const mod = found.get(curseId);
				return mod ? catalogEntry(mod) : { curseId, missing: true };
			});
			await ctx.runMutation(internal.addonCatalog.save, { entries });
		}
		return { looked: ids.length };
	},
});
