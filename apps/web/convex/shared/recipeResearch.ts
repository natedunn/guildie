// What Blizzard's data doesn't say about some recipe items, worked out by
// Guildie (recipeItems.ts uses it when the recipe catalog has no match):
// - the max skill a rank book unlocks, read from its own text;
// - the recipe an item teaches, from its text, when Blizzard's recipe
//   catalog doesn't have it (Forever's new plans and patterns): Guildie keeps
//   its own entry for it (`guildieRecipeId`) until Blizzard adds the real one;
// - what a few items teach that neither says, from research (RESEARCHED).

/** Recipe items whose recipes we looked up ourselves, by item id: the recipe names, and where we found them. */
export const RESEARCHED: Record<number, { recipes: string[]; source: string }> = {
	// Carrie's Cookbook, the reward for The Great Feast (Carrie Hearthfire, New Avalon).
	239021: {
		recipes: ["Grand Lobster Banquet", "Specklefin Feast"],
		source: "https://www.warcrafttavern.com/wow-classic-sod/guides/new-avalon-cooking-quests-phase-8/",
	},
};

/** "Teaches you how to be an Expert Fisherman, allowing a maximum of 225 fishing skill." -> 225. */
export function rankFrom(texts: (string | undefined)[]) {
	for (const t of texts) {
		const m = t?.match(/allowing a maximum of (\d+)/i);
		if (m) return Number(m[1]);
	}
	return undefined;
}

/** "Teaches you how to craft Earthweaver's Adaptive Plate." -> "Earthweaver's Adaptive Plate". */
export function craftedName(texts: (string | undefined)[]) {
	for (const t of texts) {
		const m = t?.match(/^(?:Use: )?Teaches you how to (?:craft|make|sew|cook|brew|forge|create) (?:an? )?(.+?)\.?$/);
		if (m) return m[1];
	}
	return undefined;
}

/** Guildie's own id for a recipe Blizzard's catalog lacks: below zero, so it never meets one of Blizzard's. */
export function guildieRecipeId(recipeItemId: number) {
	return -recipeItemId;
}
