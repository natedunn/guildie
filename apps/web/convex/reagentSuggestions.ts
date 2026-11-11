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
 * skinner and miner learns, made mostly from what they gather themselves:
 * they'd put every herbalist on every common herb. Only Mining's smelting
 * counts.
 */
const GATHERING = new Set(["Herbalism", "Skinning", "Mining"]);

export function countsAsReagentUse(profession: string, recipeName: string) {
	if (EVERYONE_HAS.has(profession)) return false;
	if (GATHERING.has(profession)) return profession === "Mining" && recipeName.startsWith("Smelt ");
	return true;
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

/** itemId -> { name, users }, leaving out vendor-sold reagents. */
export function reagentSuggestions(
	guilds: { region: string; members: ReagentMember[] }[],
	recipes: Map<number, ReagentRecipe>,
): Record<string, { name: string; users: ReagentUser[] }> {
	const uses = new Map<number, { name: string; users: Map<string, ReagentUser> }>();
	for (const g of guilds) {
		for (const m of g.members) {
			for (const p of m.professions) {
				for (const recipeId of p.knownRecipes) {
					const recipe = recipes.get(recipeId);
					if (!recipe || !countsAsReagentUse(p.name, recipe.name)) continue;
					for (const reagent of recipe.reagents) {
						if (VENDOR_REAGENTS[reagent.itemId]) continue;
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
