import { VENDOR_REAGENTS } from "./shared/wow.ts";

// Who "might want" a reagent, for the addon's item tooltips (GuildieData.lua
// `reagents`, built in helper.ts guildData): guild members whose known
// recipes use it, most recipes first. Suggestions, not certainties. Kept
// free of Convex imports so `node --test` can run it
// (reagentSuggestions.test.ts).

/**
 * Secondary professions nearly everyone levels: "Brisket (Cooking) might want
 * this" would be on every fish and meat, so they're left out.
 */
const EVERYONE_HAS = new Set(["Cooking", "Fishing", "First Aid"]);

/**
 * Gathering professions. Forever gives each three camping recipes (Incense
 * Candle, Camp Chair, Lodestone and their upgrades) that every herbalist,
 * skinner and miner learns. Their simple mats (common herbs, leather, stone)
 * would put every gatherer on every common material, so a camping recipe
 * only counts for its green-or-better reagents (Silver Bar, Truesilver Bar).
 * Mining's smelting counts in full.
 */
const GATHERING = new Set(["Herbalism", "Skinning", "Mining"]);
const NOTABLE = new Set(["UNCOMMON", "RARE", "EPIC", "LEGENDARY", "ARTIFACT"]);

/** How a known recipe's reagents count: all of them, green-or-better only, or none. */
export function reagentUse(profession: string, recipeName: string): "all" | "notable" | "none" {
	if (EVERYONE_HAS.has(profession)) return "none";
	if (GATHERING.has(profession) && !(profession === "Mining" && recipeName.startsWith("Smelt "))) return "notable";
	return "all";
}

/** Reagents whose quality reagentSuggestions needs (camping recipes'). */
export function reagentsNeedingQuality(recipes: Iterable<[number, ReagentRecipe & { profession: string }]>) {
	const ids = new Set<number>();
	for (const [, r] of recipes) {
		if (reagentUse(r.profession, r.name) === "notable") for (const x of r.reagents) ids.add(x.itemId);
	}
	return [...ids];
}

/** Most users listed per reagent. */
export const MAX_REAGENT_USERS = 8;

export type ReagentRecipe = { name: string; reagents: { itemId: number; name: string }[] };
export type ReagentMember = {
	name: string;
	slug: string;
	classId: number;
	professions: { name: string; knownRecipes: number[] }[];
};
export type ReagentUser = { name: string; classId: number; profession: string; recipes: number };

/**
 * itemId -> { name, users }, leaving out vendor-sold reagents. `quality`:
 * item quality by id, for camping recipes' reagents (unknown: left out).
 */
export function reagentSuggestions(
	guilds: { region: string; members: ReagentMember[] }[],
	recipes: Map<number, ReagentRecipe>,
	quality: Map<number, string> = new Map(),
): Record<string, { name: string; users: ReagentUser[] }> {
	const uses = new Map<number, { name: string; users: Map<string, ReagentUser> }>();
	for (const g of guilds) {
		for (const m of g.members) {
			for (const p of m.professions) {
				for (const recipeId of p.knownRecipes) {
					const recipe = recipes.get(recipeId);
					const use = recipe ? reagentUse(p.name, recipe.name) : "none";
					if (!recipe || use === "none") continue;
					for (const reagent of recipe.reagents) {
						if (VENDOR_REAGENTS[reagent.itemId]) continue;
						if (use === "notable" && !NOTABLE.has(quality.get(reagent.itemId) ?? "")) continue;
						let entry = uses.get(reagent.itemId);
						if (!entry) uses.set(reagent.itemId, (entry = { name: reagent.name, users: new Map() }));
						const key = `${g.region}:${m.slug}:${p.name}`;
						const user = entry.users.get(key) ?? { name: m.name, classId: m.classId, profession: p.name, recipes: 0 };
						user.recipes += 1;
						entry.users.set(key, user);
					}
				}
			}
		}
	}
	const reagents: Record<string, { name: string; users: ReagentUser[] }> = {};
	for (const [itemId, entry] of uses) {
		reagents[itemId] = {
			name: entry.name,
			users: [...entry.users.values()]
				.sort((a, b) => b.recipes - a.recipes || a.name.localeCompare(b.name))
				.slice(0, MAX_REAGENT_USERS),
		};
	}
	return reagents;
}
