// Is a recipe item (a pattern, plans, formula...) worth sending someone?
// For each guild character with its profession: they already know it, they
// already have one and haven't learned it, they can learn it now, or their
// skill is too low for now. The same rule runs in the addon's tooltips
// (apps/addon/Guildie/Tooltip.lua, recipeRows); keep the two in step
// (recipeStatus.test.ts and apps/addon/tests/recipes_test.lua).

/** Most useful first: who could learn it now, later, who has one, who knows it. */
export const RECIPE_STATES = ["now", "later", "has", "knows"] as const;
export type RecipeState = (typeof RECIPE_STATES)[number];

/**
 * What a recipe item teaches and the skill it needs (unknown for a few):
 * recipes (one, or several for a cookbook), or a profession rank (`rank`:
 * the max skill it unlocks, 225 for the Expert books).
 */
export type RecipeItemInfo = { recipeIds: number[]; rank?: number; professionId: number; skill?: number };

/** One of a character's professions, as merged profiles have them. */
export type CrafterProfession = { id: number; skill?: number; maxSkill?: number; knownRecipes?: number[] };

/** Knows what it teaches: every recipe, or the rank (their max skill is there already). */
function knowsAll(item: RecipeItemInfo, p: CrafterProfession) {
	if (item.rank !== undefined) return p.maxSkill !== undefined && p.maxSkill >= item.rank;
	return item.recipeIds.length > 0 && item.recipeIds.every((id) => p.knownRecipes?.includes(id));
}

/**
 * Where this character stands with this recipe item, or null when they don't
 * have its profession. `holding`: recipe item ids in their bags or bank.
 * Unknown skill (or an unknown requirement) counts as "now": the game will say.
 */
export function recipeState(
	item: RecipeItemInfo,
	professions: CrafterProfession[],
	holding?: ReadonlySet<number>,
	itemId?: number,
): RecipeState | null {
	const p = professions.find((x) => x.id === item.professionId);
	if (!p) return null;
	if (knowsAll(item, p)) return "knows";
	if (itemId !== undefined && holding?.has(itemId)) return "has";
	if (item.skill !== undefined && p.skill !== undefined && p.skill < item.skill) return "later";
	return "now";
}

export type RecipeCandidate<C> = C & { state: RecipeState; skill?: number };

/**
 * Every character with the item's profession and where they stand, in
 * RECIPE_STATES order, then highest skill first (closest to learning it),
 * then by name.
 */
export function recipeCandidates<
	C extends { name: string; professions: CrafterProfession[]; holding?: ReadonlySet<number> },
>(itemId: number, item: RecipeItemInfo, characters: C[]): RecipeCandidate<Omit<C, "professions" | "holding">>[] {
	const out: RecipeCandidate<Omit<C, "professions" | "holding">>[] = [];
	for (const c of characters) {
		const state = recipeState(item, c.professions, c.holding, itemId);
		if (!state) continue;
		const { professions, holding: _, ...rest } = c;
		out.push({ ...rest, state, skill: professions.find((p) => p.id === item.professionId)?.skill });
	}
	const rank = (s: RecipeState) => RECIPE_STATES.indexOf(s);
	return out.sort(
		(a, b) => rank(a.state) - rank(b.state) || (b.skill ?? 0) - (a.skill ?? 0) || a.name.localeCompare(b.name),
	);
}

/**
 * Recipe item ids a character holds that are worth telling the guild about:
 * for a profession they have, not yet learned. Nothing else in their bags is
 * shared (inventories stay private otherwise).
 */
export function unlearnedHeld(
	heldItemIds: Iterable<number>,
	recipeItems: ReadonlyMap<number, RecipeItemInfo>,
	professions: CrafterProfession[],
): number[] {
	const out = new Set<number>();
	for (const id of heldItemIds) {
		const item = recipeItems.get(id);
		if (!item) continue;
		const state = recipeState(item, professions);
		if (state && state !== "knows") out.add(id);
	}
	return [...out];
}

/** "Pattern: Red Linen Robe" -> "Red Linen Robe": what the recipe is called. */
export function taughtName(itemName: string) {
	const i = itemName.indexOf(": ");
	return i > 0 && i < 12 ? itemName.slice(i + 2) : itemName;
}

/** Short labels for the UI ("can learn", "at 125"). */
export function recipeStateLabel(state: RecipeState, need?: number) {
	if (state === "now") return "can learn";
	if (state === "later") return need !== undefined ? `at ${need}` : "skill too low";
	if (state === "has") return "has one";
	return "knows it";
}

/**
 * What the addon gets (GuildieData.lua `recipes`, addon 0.14.0+): each recipe
 * item as { profession, skill needed (0: unknown), recipe id, more recipe
 * ids (0.15.0: a cookbook teaching several) }; rank books (0.15.0, apart so
 * 0.14.0 leaves them out) as { profession, skill needed, max skill it
 * unlocks }; and each guild character with a profession that has recipe
 * items: its skill per profession (-1: unknown), its max skill (0.15.0),
 * the taught recipes it knows, and the recipe items it holds unlearned. The
 * addon applies recipeState to them in game (Tooltip.lua, recipeRows).
 */
export type AddonRecipes = {
	items: Record<string, [profession: string, skill: number, ...recipeIds: number[]]>;
	ranks: Record<string, [profession: string, skill: number, rank: number]>;
	crafters: {
		name: string;
		classId: number;
		skills: Record<string, number>;
		max: Record<string, number>;
		known: number[];
		has: number[];
	}[];
};

export function addonRecipes(
	items: (RecipeItemInfo & { itemId: number; profession: string })[],
	characters: {
		name: string;
		classId: number;
		professions: (CrafterProfession & { name: string })[];
		holding?: Iterable<number>;
	}[],
): AddonRecipes {
	const out: AddonRecipes = { items: {}, ranks: {}, crafters: [] };
	const nameOf = new Map<number, string>();
	const taught = new Set<number>();
	for (const i of items) {
		if (i.rank !== undefined) out.ranks[i.itemId] = [i.profession, i.skill ?? 0, i.rank];
		else if (i.recipeIds.length) out.items[i.itemId] = [i.profession, i.skill ?? 0, ...i.recipeIds];
		else continue;
		nameOf.set(i.professionId, i.profession);
		for (const id of i.recipeIds) taught.add(id);
	}
	for (const c of characters) {
		const skills: Record<string, number> = {};
		const max: Record<string, number> = {};
		const known: number[] = [];
		for (const p of c.professions) {
			const name = nameOf.get(p.id);
			if (!name) continue;
			skills[name] = p.skill ?? -1;
			max[name] = p.maxSkill ?? -1;
			for (const id of p.knownRecipes ?? []) if (taught.has(id)) known.push(id);
		}
		if (!Object.keys(skills).length) continue;
		out.crafters.push({
			name: c.name,
			classId: c.classId,
			skills,
			max,
			known: [...new Set(known)].sort((a, b) => a - b),
			has: [...new Set(c.holding ?? [])].sort((a, b) => a - b),
		});
	}
	return out;
}
