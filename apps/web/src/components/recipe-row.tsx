import type { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { ENCHANT_ICON, ItemHover, ItemIcon, isEnchant, QUALITY_COLORS } from "@/components/item";
import { cn } from "@/lib/utils";

// Pieces shared by a character's Professions tab and the guild's "who can
// make..." search: what a recipe makes, what it takes, and the text search.

type Professions = NonNullable<FunctionReturnType<typeof api.crafting.characterProfessions>>;
export type Recipe = Professions[number]["recipes"][number];
export type GuildRecipe = NonNullable<FunctionReturnType<typeof api.crafting.guildCrafting>>[number];

/** Secondary professions, listed after the primary ones (as the game does). */
export const SECONDARY_PROFESSIONS = new Set(["Cooking", "First Aid", "Fishing"]);

/** Primary professions first, then secondary, each alphabetical. */
export function compareProfessions(a: string, b: string) {
	return Number(SECONDARY_PROFESSIONS.has(a)) - Number(SECONDARY_PROFESSIONS.has(b)) || a.localeCompare(b);
}

/**
 * The crafted item (icon + quality-colored name, tooltip on hover), with the
 * recipe's own name under it when it differs ("Brilliant Mana Oil" vs.
 * "Enchant ..."). Enchants and items the item sync hasn't reached yet have no
 * item: the recipe name stands in, next to an empty icon slot.
 */
export function RecipeItem({
	recipe,
	size = 28,
	detail,
	className,
}: {
	recipe: Recipe;
	size?: number;
	/** A second line under the name (after the recipe's own name when it differs), e.g. the profession. */
	detail?: string;
	className?: string;
}) {
	const { item } = recipe;
	const showRecipeName = item && item.name.toLowerCase() !== recipe.name.toLowerCase();
	return (
		<div className={cn("flex min-w-0 items-center gap-2.5", className)}>
			{item ? (
				<ItemHover item={item} className="shrink-0">
					<ItemIcon icon={item.icon} quality={item.quality} size={size} className="block" />
				</ItemHover>
			) : isEnchant(recipe) ? (
				<ItemIcon icon={ENCHANT_ICON} size={size} className="block" />
			) : (
				<ItemIcon size={size} empty className="block" />
			)}
			<div className="min-w-0 leading-tight">
				{item ? (
					<ItemHover item={item} className="block truncate hover:underline">
						<span style={{ color: QUALITY_COLORS[item.quality ?? "COMMON"] }}>{item.name}</span>
					</ItemHover>
				) : (
					<div className="truncate">{recipe.name}</div>
				)}
				{showRecipeName || detail ? (
					<div className="mt-0.5 truncate text-xs text-muted-foreground">
						{[showRecipeName ? recipe.name : undefined, detail].filter(Boolean).join(" · ")}
					</div>
				) : null}
			</div>
		</div>
	);
}

/** Reagents as small icons with the quantity in the corner, like the game's bags; names on hover. */
export function Reagents({ reagents, className }: { reagents: Recipe["reagents"]; className?: string }) {
	if (reagents.length === 0) return null;
	return (
		<div className={cn("flex shrink-0 flex-wrap items-center gap-1", className)}>
			{reagents.map((r) => (
				<ItemHover
					key={r.itemId}
					item={{ itemId: r.itemId, name: r.name, quality: r.quality, icon: r.icon }}
					side="top"
					className="relative block"
				>
					<ItemIcon icon={r.icon} quality={r.quality} size={22} className="block" />
					{r.quantity > 1 ? (
						<span className="num pointer-events-none absolute -right-0.5 -bottom-0.5 text-[10px] leading-none font-semibold text-white [text-shadow:0_0_2px_#000,0_0_2px_#000,0_0_1px_#000]">
							{r.quantity}
						</span>
					) : null}
				</ItemHover>
			))}
		</div>
	);
}

// --- Search ---------------------------------------------------------------

/** Lowercase, punctuation to spaces, padded so `" " + word` finds word starts. */
const normalize = (s: string) =>
	` ${s
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim()} `;

export const queryWords = (q: string) => normalize(q).trim().split(" ").filter(Boolean);

type Indexed<T> = { recipe: T; fields: [name: string, kind: string, tooltip: string, reagents: string] };

/**
 * Built once per data change. Fields are searched by word prefix, so "8"
 * finds "8 Slot Bag" but not "18 Armor", and weighted so name matches rank
 * above tooltip and reagent matches.
 */
export function buildIndex<T extends Recipe>(recipes: T[]): Indexed<T>[] {
	return recipes.map((recipe) => ({
		recipe,
		fields: [
			normalize(`${recipe.name} ${recipe.item?.name ?? ""}`),
			normalize(`${recipe.item?.kind ?? ""} ${recipe.profession}`),
			normalize((recipe.item?.tooltip ?? []).map((l) => `${l.left} ${l.right ?? ""}`).join(" ")),
			normalize(recipe.reagents.map((r) => r.name).join(" ")),
		],
	}));
}

const WEIGHTS = [8, 4, 2, 1];

/** Recipes where every word matches somewhere, best first (ties keep index order). */
export function searchIndex<T extends Recipe>(index: Indexed<T>[], words: string[]): T[] {
	if (words.length === 0) return index.map((e) => e.recipe);
	const hits: { recipe: T; score: number; order: number }[] = [];
	index.forEach((entry, order) => {
		let score = 0;
		for (const word of words) {
			const needle = ` ${word}`;
			let best = 0;
			for (let f = 0; f < 4; f++) {
				if (entry.fields[f].includes(needle)) {
					best = WEIGHTS[f];
					break;
				}
			}
			if (best === 0) return;
			score += best;
		}
		hits.push({ recipe: entry.recipe, score, order });
	});
	return hits.sort((a, b) => b.score - a.score || a.order - b.order).map((h) => h.recipe);
}
