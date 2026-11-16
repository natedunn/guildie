import { equipSlot } from "./itemInfo.ts";

// Inventory's categories, like the game's bag addons (Baganator) sort bags:
// gear, consumables, trade goods, recipes, quest items, bags, ammo, junk.
// From what we know of an item: its quality, Blizzard's subclass name
// ("Elixirs", "Cloth") and its tooltip lines (a slot, "Quest Item", "Use:").
//
// Kept free of Convex imports so `node --test` can run it.

export type ItemCategory =
	| "equipment"
	| "consumables"
	| "tradeGoods"
	| "recipes"
	| "quest"
	| "bags"
	| "ammo"
	| "junk"
	| "other";

/** In the order Inventory shows them. */
export const ITEM_CATEGORIES: { key: ItemCategory; label: string }[] = [
	{ key: "equipment", label: "Equipment" },
	{ key: "consumables", label: "Consumables" },
	{ key: "tradeGoods", label: "Trade goods" },
	{ key: "recipes", label: "Recipes" },
	{ key: "quest", label: "Quest items" },
	{ key: "bags", label: "Bags" },
	{ key: "ammo", label: "Ammo" },
	{ key: "other", label: "Other" },
	{ key: "junk", label: "Junk" },
];

const CONSUMABLES = new Set([
	"Potions",
	"Elixirs",
	"Flasks",
	"Food & Drink",
	"Bandages",
	"Scroll",
	"Consumable",
	"Temporary",
	"Permanent",
	"Item Enhancement",
]);
const TRADE_GOODS = new Set([
	"Cloth",
	"Leather",
	"Metal & Stone",
	"Herb",
	"Elemental",
	"Parts",
	"Enchanting",
	"Meat",
	"Cooking",
	"Trade Goods",
	"Devices",
	"Device",
	"Explosives",
	"Materials",
	"Reagent",
]);
const BAGS = new Set(["Bag", "Quiver", "Ammo Pouch", "Soul Bag", "Herb Bag", "Enchanting Bag", "Reagent Bag"]);
const AMMO = new Set(["Arrow", "Bullet"]);
/** Recipe items: "Pattern: Red Linen Robe", "Plans: ...", "Formula: ...". */
const RECIPE_NAME = /^(Pattern|Plans|Formula|Recipe|Schematic|Manual|Design): /;

type Item = { name?: string; quality?: string; kind?: string; tooltip?: { left: string; right?: string }[] };

/** Which category an item goes in. `recipeItem`: it teaches a recipe (recipeItems). */
export function itemCategory(item: Item | null | undefined, recipeItem = false): ItemCategory {
	if (!item) return recipeItem ? "recipes" : "other";
	const lines = item.tooltip ?? [];
	if (item.kind === "Quest" || lines.some((l) => l.left === "Quest Item")) return "quest";
	if (item.quality === "POOR") return "junk";
	if (recipeItem || (item.name && RECIPE_NAME.test(item.name))) return "recipes";
	if (equipSlot(lines)) return "equipment";
	const kind = item.kind ?? "";
	if (BAGS.has(kind)) return "bags";
	if (AMMO.has(kind)) return "ammo";
	if (CONSUMABLES.has(kind)) return "consumables";
	if (TRADE_GOODS.has(kind)) return "tradeGoods";
	// Blizzard's "Other" covers consumables and miscellany alike: something you use is a consumable.
	if (lines.some((l) => l.left.startsWith("Use: "))) return "consumables";
	return "other";
}
