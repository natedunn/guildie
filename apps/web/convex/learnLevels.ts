import type { Id } from "./_generated/dataModel";
import { internalQuery, type MutationCtx, type QueryCtx, query } from "./_generated/server";
import { matchTrainer, type TrainerRead } from "./addonPayload";
import { isMaintainer } from "./maintainers";
import { recipeSkill } from "./shared/recipeSkills";
import { RECIPE_SKILLS_BUILD } from "./shared/recipeSkills.generated";

// The skill a trainer asks for to learn each recipe (orange starts there).
// Forever's game files don't have it, so the addon reads it in trainer
// windows and uploads it with the character data (`trainers`); one read
// covers everyone. docs/game-data.md, "Learn levels".

/**
 * Store an upload's trainer reads: each profession's read matched to the
 * catalog, newest read per recipe wins. A read no newer than this player's
 * last one for the profession is skipped (the addon sends its reads with
 * every upload).
 */
export async function storeTrainers(ctx: MutationCtx, userId: Id<"users">, reads: TrainerRead[], now: number) {
	for (const read of reads) {
		const last = await ctx.db
			.query("trainerReads")
			.withIndex("by_user_profession", (q) => q.eq("userId", userId).eq("professionId", read.professionId))
			.unique();
		if (last && last.capturedAt >= read.capturedAt) continue;
		const catalog = await ctx.db
			.query("recipes")
			.withIndex("by_professionId", (q) => q.eq("professionId", read.professionId))
			.collect();
		const { levels } = matchTrainer(read.services, catalog);
		let matched = 0;
		for (const { recipeId, skill } of levels) {
			const known = recipeSkill(recipeId);
			// Only recipes whose colors we know, and a requirement that fits them.
			if (!known || skill > known.grey) continue;
			matched++;
			const row = {
				recipeId,
				professionId: read.professionId,
				skill,
				yellow: known.yellow,
				grey: known.grey,
				seenAt: read.capturedAt,
				build: read.build,
				receivedAt: now,
			};
			const existing = await ctx.db
				.query("recipeLearnLevels")
				.withIndex("by_recipeId", (q) => q.eq("recipeId", recipeId))
				.unique();
			if (!existing) await ctx.db.insert("recipeLearnLevels", row);
			else if (existing.seenAt <= read.capturedAt) await ctx.db.replace(existing._id, row);
		}
		const summary = {
			userId,
			professionId: read.professionId,
			capturedAt: read.capturedAt,
			build: read.build,
			unavailableShown: read.unavailableShown,
			services: read.services.length,
			matched,
			receivedAt: now,
		};
		if (last) await ctx.db.replace(last._id, summary);
		else await ctx.db.insert("trainerReads", summary);
	}
}

/** Learn levels still current: read when the recipe had the levels it has now. */
export function currentLevels(rows: { recipeId: number; skill: number; yellow: number; grey: number }[]) {
	const out = new Map<number, number>();
	for (const r of rows) {
		const now = recipeSkill(r.recipeId);
		if (now && now.yellow === r.yellow && now.grey === r.grey) out.set(r.recipeId, r.skill);
	}
	return out;
}

/** Every current learn level, as [recipeId, skill] pairs (guildData). */
export const all = internalQuery({
	args: {},
	handler: async (ctx): Promise<[number, number][]> => {
		const rows = await ctx.db.query("recipeLearnLevels").collect();
		return [...currentLevels(rows)];
	},
});

type Coverage = Record<string, { recipes: number; learnLevels: number; stale: number; lastReadAt?: number }>;

async function coverageOf(ctx: QueryCtx): Promise<Coverage> {
	const rows = await ctx.db.query("recipeLearnLevels").collect();
	const current = currentLevels(rows);
	const recipes = await ctx.db.query("recipes").collect();
	const out: Coverage = {};
	for (const r of recipes) {
		if (!recipeSkill(r.recipeId)) continue;
		const p = (out[r.profession] ??= { recipes: 0, learnLevels: 0, stale: 0 });
		p.recipes++;
	}
	const professionOf = new Map(recipes.map((r) => [r.recipeId, r.profession]));
	for (const row of rows) {
		const p = out[professionOf.get(row.recipeId) ?? ""];
		if (!p) continue;
		if (current.has(row.recipeId)) p.learnLevels++;
		else p.stale++;
		if (!p.lastReadAt || row.seenAt > p.lastReadAt) p.lastReadAt = row.seenAt;
	}
	return out;
}

/**
 * How far the readings have come, per profession: recipes with known colors,
 * how many have a current learn level, how many a stale one (the recipe's
 * levels changed since), and the newest read. For maintainers (also the Admin page):
 * `npx convex run learnLevels:coverage --deployment <name>`.
 */
export const coverage = internalQuery({
	args: {},
	handler: async (ctx) =>
		Object.fromEntries(
			Object.entries(await coverageOf(ctx)).map(([name, { lastReadAt, ...p }]) => [
				name,
				{ ...p, newest: lastReadAt && new Date(lastReadAt).toISOString().slice(0, 10) },
			]),
		),
});

/**
 * The Admin page's Learn levels tab: coverage per profession, the trainer
 * reads behind it (how many, from how many players, the latest), and the
 * game build the recipe colors are from. Null unless a maintainer asks.
 */
export const report = query({
	args: {},
	handler: async (ctx) => {
		if (!(await isMaintainer(ctx))) return null;
		const reads = await ctx.db.query("trainerReads").collect();
		return {
			professions: Object.entries(await coverageOf(ctx))
				.map(([name, p]) => ({ name, ...p }))
				.sort((a, b) => a.name.localeCompare(b.name)),
			reads: reads.length,
			players: new Set(reads.map((r) => r.userId)).size,
			lastReadAt: reads.reduce<number | undefined>(
				(max, r) => (max && max > r.capturedAt ? max : r.capturedAt),
				undefined,
			),
			colors: RECIPE_SKILLS_BUILD,
		};
	},
});

/** The skill each pattern, plan or formula asks for, by the recipe it teaches, as [recipeId, skill] pairs. */
export const patternSkills = internalQuery({
	args: {},
	handler: async (ctx): Promise<[number, number][]> => {
		const out = new Map<number, number>();
		for (const item of await ctx.db.query("recipeItems").collect()) {
			if (item.skill === undefined) continue;
			for (const id of [item.recipeId, ...(item.recipeIds ?? [])]) {
				if (id !== undefined && (out.get(id) ?? Infinity) > item.skill) out.set(id, item.skill);
			}
		}
		return [...out];
	},
});
