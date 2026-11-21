import { gathering } from "./shared/gathering.ts";
import { type RecipeColor, recipeColor, recipeSkill } from "./shared/recipeSkills.ts";
import { GENERATED_WAYLAID, type GeneratedWaylaid } from "./shared/waylaid.generated.ts";

// Who in the guild can fill a Waylaid Crate or Waylaid Supplies item, for
// the addon's item tooltips (GuildieData.lua `waylaid`, built in helper.ts
// guildData). Kept free of Convex imports so `node --test` can run it
// (waylaidUse.test.ts).
//
// A crate takes any one of its bundles, a Supplies item its one
// (shared/waylaid.generated.ts, from the game's data). For each profession
// that can supply a bundle:
// - Makes it: knows a recipe that crafts it (smelting counts: Mining).
//   Ranked by the color that recipe shows them, orange first, as the
//   reagent tooltip does.
// - Gathers it: has the gathering profession at the skill the item asks for
//   (shared/gathering.ts; disenchanting is Enchanting).
// `covers`: how many of that profession's bundles they can supply, so a
// crate of five herbs shows who can gather all five.

/** How many people each profession lists; `count` says how many in all. */
export const SHOWN_PER_PROFESSION = 3;

export type WaylaidMember = {
	name: string;
	classId: number;
	professions: { name: string; skill?: number; knownRecipes: number[] }[];
};
/** A recipe that crafts something (recipes.craftedItemId). */
export type MakerRecipe = { recipeId: number; profession: string; craftedItemId: number };
export type WaylaidPerson = {
	name: string;
	classId: number;
	skill: number;
	/** Makes it: the color their best recipe for it shows (none when grey). */
	color?: Exclude<RecipeColor, "grey">;
	/** How many of the profession's bundles they can supply (of `of`). */
	covers: number;
};
export type WaylaidProfession = {
	name: string;
	how: "makes" | "gathers";
	/** Bundles this profession can supply. */
	of: number;
	/** Everyone who can; `users` holds the best few. */
	count: number;
	users: WaylaidPerson[];
	/** Gathers it, nobody can yet: the guildmate closest to `need`, the lowest skill it asks for. */
	closest?: { name: string; classId: number; skill: number; need: number };
	/** Nobody in the guild has the profession. */
	nobody?: true;
};
/** Crate or Supplies item id -> who can fill it, as pairs (like reagentUse). */
export type WaylaidUse = [number, { professions: WaylaidProfession[] }][];

const RANK: Record<string, number> = { orange: 0, yellow: 1, green: 2 };

type Source = { profession: string; how: "makes" | "gathers"; itemId: number; skill: number; recipes: number[] };

/** What supplies each bundle: recipes that make it, or how it's gathered. */
function sourcesOf(w: GeneratedWaylaid, makers: Map<number, MakerRecipe[]>): Source[] {
	const out: Source[] = [];
	for (const t of w.takes) {
		const byProfession = new Map<string, number[]>();
		for (const r of makers.get(t.itemId) ?? []) {
			byProfession.set(r.profession, [...(byProfession.get(r.profession) ?? []), r.recipeId]);
		}
		for (const [profession, recipes] of byProfession) {
			out.push({ profession, how: "makes", itemId: t.itemId, skill: 0, recipes });
		}
		const g = gathering(t.itemId);
		if (g) out.push({ profession: g.profession, how: "gathers", itemId: t.itemId, skill: g.skill, recipes: [] });
	}
	return out;
}

/** Better first: covers more, then (makers) a skill-up color, then higher skill, then name. */
function better(a: WaylaidPerson, b: WaylaidPerson) {
	return (
		b.covers - a.covers ||
		(RANK[a.color ?? ""] ?? 3) - (RANK[b.color ?? ""] ?? 3) ||
		b.skill - a.skill ||
		a.name.localeCompare(b.name)
	);
}

/**
 * [itemId, { professions }] for every Waylaid item someone could fill, or
 * whose profession nobody has. `members`: the guild without the player's
 * own characters (or only theirs). `makers`: recipes that craft each item.
 * `list`: the crates (tests pass their own).
 */
export function waylaidUse(
	members: WaylaidMember[],
	makers: MakerRecipe[],
	list: GeneratedWaylaid[] = GENERATED_WAYLAID,
): WaylaidUse {
	const byItem = new Map<number, MakerRecipe[]>();
	for (const r of makers) byItem.set(r.craftedItemId, [...(byItem.get(r.craftedItemId) ?? []), r]);
	const known = members.map(
		(m) => new Map(m.professions.map((p) => [p.name, { skill: p.skill, known: new Set(p.knownRecipes) }])),
	);
	const out: WaylaidUse = [];
	for (const w of list) {
		const groups = new Map<string, Source[]>();
		for (const s of sourcesOf(w, byItem)) {
			const key = `${s.how}:${s.profession}`;
			groups.set(key, [...(groups.get(key) ?? []), s]);
		}
		const professions: WaylaidProfession[] = [];
		for (const sources of groups.values()) {
			const { profession, how } = sources[0];
			const of = new Set(sources.map((s) => s.itemId)).size;
			const people: WaylaidPerson[] = [];
			let has = 0;
			let closest: WaylaidProfession["closest"];
			const need = Math.min(...sources.map((s) => s.skill));
			for (const [i, m] of members.entries()) {
				const p = known[i].get(profession);
				if (!p) continue;
				has++;
				const skill = p.skill ?? 0;
				const items = new Set<number>();
				let color: WaylaidPerson["color"];
				for (const s of sources) {
					if (how === "gathers") {
						if (p.skill !== undefined && skill >= s.skill) items.add(s.itemId);
						continue;
					}
					for (const id of s.recipes) {
						if (!p.known.has(id)) continue;
						items.add(s.itemId);
						const levels = recipeSkill(id);
						const c = levels ? recipeColor(levels, skill) : "grey";
						if (c !== "grey" && (!color || RANK[c] < RANK[color])) color = c;
					}
				}
				if (items.size) people.push({ name: m.name, classId: m.classId, skill, covers: items.size, color });
				else if (how === "gathers" && p.skill !== undefined && (!closest || skill > closest.skill))
					closest = { name: m.name, classId: m.classId, skill, need };
			}
			people.sort(better);
			const users = people.slice(0, SHOWN_PER_PROFESSION);
			if (users.length) professions.push({ name: profession, how, of, count: people.length, users });
			else if (closest) professions.push({ name: profession, how, of, count: 0, users, closest });
			else if (!has) professions.push({ name: profession, how, of, count: 0, users, nobody: true });
			// Has it but knows none of the recipes: nothing useful to say.
		}
		if (!professions.length) continue;
		// Professions with people first (best person first), then closest, then nobody.
		const order = (p: WaylaidProfession) => (p.users.length ? 0 : p.closest ? 1 : 2);
		professions.sort(
			(a, b) =>
				order(a) - order(b) ||
				(a.users[0] && b.users[0] ? better(a.users[0], b.users[0]) : 0) ||
				a.name.localeCompare(b.name),
		);
		out.push([w.id, { professions }]);
	}
	return out;
}

/** Every item a Waylaid crate or Supplies item takes (to look up the recipes that make them). */
export function waylaidItems(list: GeneratedWaylaid[] = GENERATED_WAYLAID): number[] {
	return [...new Set(list.flatMap((w) => w.takes.map((t) => t.itemId)))].sort((a, b) => a - b);
}
