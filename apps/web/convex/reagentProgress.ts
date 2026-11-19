import { type RecipeColor, recipeColor, recipeSkill } from "./shared/recipeSkills.ts";
import { VENDOR_REAGENTS } from "./shared/wow.ts";

// Who would get the most profession progress out of a reagent, for the
// addon's item tooltips (GuildieData.lua `reagentUse`, built in helper.ts
// guildData): per profession whose recipes use it, the guildmates for whom
// one of those recipes still gives skill-ups, best first. Kept free of
// Convex imports so `node --test` can run it (reagentProgress.test.ts).
//
// Only what the game itself says counts (docs/game-data.md):
// - A recipe's colors come from Forever's game data (shared/recipeSkills.ts).
//   Below yellow it's orange, but only once it can be learned.
// - A recipe someone knows: its color at their skill, orange included.
// - One they don't know: only if a trainer was seen teaching it (the addon
//   reads trainer windows), and only from the skill that trainer asks for.
//   A pattern's recipe needs the pattern, so it never counts unlearned.
// - Skill-up chances aren't in the game's data, so people are ranked by the
//   color their best recipe for it shows, then by how few of the reagent
//   that recipe takes, then by how far into the color they are (the chance
//   only falls toward grey), then lower skill first.

/** How many people each profession lists; `count` says how many in all. */
export const SHOWN_PER_PROFESSION = 3;

export type ProgressMember = {
	name: string;
	classId: number;
	professions: { name: string; skill?: number; knownRecipes: number[] }[];
};
export type ProgressRecipe = {
	recipeId: number;
	profession: string;
	reagents: { itemId: number; name: string; quantity: number }[];
};
export type ProgressUser = { name: string; classId: number; skill: number; color: Exclude<RecipeColor, "grey"> };
export type ProfessionUse = {
	name: string;
	/** The lowest skill any of its recipes for this reagent gives skill-ups from (learn level if known, else yellow). */
	from: number;
	/** Everyone who'd get skill-ups from it; `users` holds the best few. */
	count: number;
	users: ProgressUser[];
	/** Nobody can use it yet: the guildmate closest to `from`. */
	closest?: { name: string; classId: number; skill: number };
	/** Nobody can use it, though some are in range: none of them has learned a recipe for it (and no trainer was seen teaching one). */
	unlearned?: true;
	/** Nobody in the guild has the profession. */
	nobody?: true;
};

/**
 * itemId -> what it's for, as pairs: there are more reagents than the 1,024
 * fields Convex allows an object (the guild-data route makes it an object).
 */
export type ReagentUse = [number, { name: string; professions: ProfessionUse[] }][];

type Levels = { yellow: number; green: number; grey: number };
type Candidate = ProgressUser & { quantity: number; into: number };

const RANK: Record<Exclude<RecipeColor, "grey">, number> = { orange: 0, yellow: 1, green: 2 };

/** Better first: color, fewer per craft, further from grey, lower skill, then name. */
function better(a: Candidate, b: Candidate) {
	return (
		RANK[a.color] - RANK[b.color] ||
		a.quantity - b.quantity ||
		b.into - a.into ||
		a.skill - b.skill ||
		a.name.localeCompare(b.name)
	);
}

/** How much chance is left in the color, 1 at its start, toward 0 at grey (orange: 1). */
function into(levels: Levels, skill: number) {
	if (skill < levels.yellow) return 1;
	return (levels.grey - skill) / (levels.grey - levels.yellow);
}

/**
 * [itemId, { name, professions }], for every reagent of every recipe with
 * known levels (vendor-sold reagents left out). `members`: the guild, without
 * the player's own characters. `trainerLearn`: recipe id -> the skill a
 * trainer asked for (current ones only). `patternSkill`: recipe id -> the
 * skill its pattern asks for. `levels`: the recipe levels (tests pass their own).
 */
export function reagentProgress(
	members: ProgressMember[],
	recipes: ProgressRecipe[],
	trainerLearn: Map<number, number>,
	patternSkill: Map<number, number> = new Map(),
	levels: (recipeId: number) => Levels | undefined = recipeSkill,
): ReagentUse {
	/** itemId -> profession -> the recipes using it, with their levels. */
	const uses = new Map<
		number,
		{ name: string; byProfession: Map<string, { levels: Levels; recipeId: number; quantity: number }[]> }
	>();
	for (const r of recipes) {
		const l = levels(r.recipeId);
		if (!l) continue;
		for (const reagent of r.reagents) {
			if (VENDOR_REAGENTS[reagent.itemId]) continue;
			let entry = uses.get(reagent.itemId);
			if (!entry) uses.set(reagent.itemId, (entry = { name: reagent.name, byProfession: new Map() }));
			const list = entry.byProfession.get(r.profession) ?? [];
			list.push({ levels: l, recipeId: r.recipeId, quantity: reagent.quantity });
			entry.byProfession.set(r.profession, list);
		}
	}
	const known = members.map(
		(m) => new Map(m.professions.map((p) => [p.name, { skill: p.skill, known: new Set(p.knownRecipes) }])),
	);

	const out: ReagentUse = [];
	for (const [itemId, entry] of uses) {
		const professions: (ProfessionUse & { best?: Candidate })[] = [];
		for (const [profession, list] of entry.byProfession) {
			const from = Math.min(
				...list.map((x) => trainerLearn.get(x.recipeId) ?? patternSkill.get(x.recipeId) ?? x.levels.yellow),
			);
			const candidates: Candidate[] = [];
			let has = 0;
			let closest: ProfessionUse["closest"];
			let unlearned = false;
			const top = Math.max(...list.map((x) => x.levels.grey));
			for (const [i, m] of members.entries()) {
				const p = known[i].get(profession);
				if (!p) continue;
				has++;
				if (p.skill === undefined) continue;
				const skill = p.skill;
				let best: Candidate | undefined;
				for (const x of list) {
					const learn = trainerLearn.get(x.recipeId);
					if (!p.known.has(x.recipeId) && (learn === undefined || skill < learn)) continue;
					const color = recipeColor(x.levels, skill);
					if (color === "grey") continue;
					const c = {
						name: m.name,
						classId: m.classId,
						skill,
						color,
						quantity: x.quantity,
						into: into(x.levels, skill),
					};
					if (!best || better(c, best) < 0) best = c;
				}
				if (best) candidates.push(best);
				else if (skill < from) {
					if (!closest || skill > closest.skill) closest = { name: m.name, classId: m.classId, skill };
				} else if (skill < top) unlearned = true;
			}
			candidates.sort(better);
			const users = candidates
				.slice(0, SHOWN_PER_PROFESSION)
				.map(({ name, classId, skill, color }) => ({ name, classId, skill, color }));
			if (users.length)
				professions.push({ name: profession, from, count: candidates.length, users, best: candidates[0] });
			else if (unlearned) professions.push({ name: profession, from, count: 0, users, unlearned: true });
			else if (closest) professions.push({ name: profession, from, count: 0, users, closest });
			else if (!has) professions.push({ name: profession, from, count: 0, users, nobody: true });
			// Everyone with it is past it: nothing to say.
		}
		if (!professions.length) continue;
		// Professions with people first (best person first), then not learned, nobody yet, nobody has it.
		const order = (p: (typeof professions)[number]) => (p.best ? 0 : p.unlearned ? 1 : p.closest ? 2 : 3);
		professions.sort(
			(a, b) =>
				order(a) - order(b) ||
				(a.best && b.best ? better(a.best, b.best) : 0) ||
				a.from - b.from ||
				a.name.localeCompare(b.name),
		);
		out.push([itemId, { name: entry.name, professions: professions.map(({ best: _, ...p }) => p) }]);
	}
	return out;
}
