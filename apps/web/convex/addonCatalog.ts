import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { type CurseMod, type CurseModFiles, catalogEntry, folderProjects } from "./shared/addons";

// CurseForge projects of the addons players run (addonCatalog in schema.ts):
// name, summary, logo, link and categories for the Addons pages. Looked up by
// the project ID an addon's .toc carries (`## X-Curse-Project-ID`, sent by
// the Guildie addon 0.20+); addons without one show their .toc notes instead.
// CurseForge's search is closed to our key, so addons without an ID are
// matched by folder: syncPopular (weekly) pages through CurseForge's popular
// WoW projects and keeps which folders each one installs (addonFolders).
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

/** Folder (lowercase) → project for these addon folders, from addonFolders. */
export async function foldersFor(ctx: QueryCtx, names: Iterable<string>) {
	const out = new Map<string, number>();
	for (const folder of new Set([...names].map((n) => n.toLowerCase()))) {
		const row = await ctx.db
			.query("addonFolders")
			.withIndex("by_folder", (q) => q.eq("folder", folder))
			.unique();
		if (row) out.set(folder, row.curseId);
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
			const folders = await foldersFor(
				ctx,
				(row.list ?? []).filter((a) => !a.curseId).map((a) => a.name),
			);
			for (const id of folders.values()) ids.add(id);
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

const POPULAR_PAGES = 120;

/** Replace the folder map with this one (in chunks: see syncPopular). */
export const saveFolders = internalMutation({
	args: { folders: v.array(v.object({ folder: v.string(), curseId: v.number() })), startedAt: v.number() },
	handler: async (ctx, { folders, startedAt }) => {
		for (const { folder, curseId } of folders) {
			const row = await ctx.db
				.query("addonFolders")
				.withIndex("by_folder", (q) => q.eq("folder", folder))
				.unique();
			if (row) await ctx.db.patch(row._id, { curseId, fetchedAt: startedAt });
			else await ctx.db.insert("addonFolders", { folder, curseId, fetchedAt: startedAt });
		}
	},
});

/** Folders no longer in the popular list (after a full sync). */
export const dropStaleFolders = internalMutation({
	args: { before: v.number() },
	handler: async (ctx, { before }) => {
		const stale = (await ctx.db.query("addonFolders").collect()).filter((r) => r.fetchedAt < before);
		for (const row of stale) await ctx.db.delete(row._id);
		return stale.length;
	},
});

/**
 * Page through CurseForge's popular WoW projects (its "featured" call, which
 * our key may use, excluding the ones already seen) and keep which folders
 * each installs, plus the projects themselves in the catalog. Weekly.
 */
export const syncPopular = internalAction({
	args: {},
	handler: async (ctx): Promise<{ projects: number; folders: number; skipped?: string; error?: number }> => {
		const key = process.env.CURSEFORGE_API_KEY;
		if (!key) return { projects: 0, folders: 0, skipped: "no CURSEFORGE_API_KEY" };
		const startedAt = Date.now();
		const seen = new Map<number, CurseModFiles>();
		for (let page = 0; page < POPULAR_PAGES; page++) {
			const res = await fetch(`${API}/mods/featured`, {
				method: "POST",
				headers: { "x-api-key": key, "Content-Type": "application/json", Accept: "application/json" },
				body: JSON.stringify({ gameId: 1, excludedModIds: [...seen.keys()] }),
			});
			if (!res.ok) {
				console.warn(`CurseForge /mods/featured: ${res.status}`);
				if (seen.size === 0) return { projects: 0, folders: 0, error: res.status };
				break;
			}
			const { data } = (await res.json()) as {
				data?: { featured?: CurseModFiles[]; popular?: CurseModFiles[]; recentlyUpdated?: CurseModFiles[] };
			};
			let added = 0;
			for (const mod of [...(data?.featured ?? []), ...(data?.popular ?? []), ...(data?.recentlyUpdated ?? [])]) {
				if (!seen.has(mod.id)) {
					seen.set(mod.id, mod);
					added++;
				}
			}
			if (added === 0) break;
		}
		const mods = [...seen.values()];
		const folders = [...folderProjects(mods)].map(([folder, curseId]) => ({ folder, curseId }));
		for (let i = 0; i < folders.length; i += 400) {
			await ctx.runMutation(internal.addonCatalog.saveFolders, { folders: folders.slice(i, i + 400), startedAt });
		}
		await ctx.runMutation(internal.addonCatalog.dropStaleFolders, { before: startedAt });
		// The projects players run, straight from these pages (no second call).
		const wanted = new Set(await ctx.runQuery(internal.addonCatalog.due, {}));
		const entries = mods.filter((m) => wanted.has(m.id)).map((m) => catalogEntry(m));
		for (let i = 0; i < entries.length; i += 100) {
			await ctx.runMutation(internal.addonCatalog.save, { entries: entries.slice(i, i + 100) });
		}
		await ctx.runAction(internal.addonCatalog.refresh, {});
		return { projects: mods.length, folders: folders.length };
	},
});
