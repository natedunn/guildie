import { equipSlot } from "./itemInfo.ts";

// Crafting's three tabs, by what a recipe makes: Gear (anything worn),
// Enchants (enchants, and the items that take the same spot on gear: armor
// kits, shield spikes, scopes) and Supplies (everything else: potions, food,
// bags, ammo, materials). Supplies split further by type for its filter.
// Used by the Crafting page and by links into it (omni search).
//
// Kept free of Convex imports so `node --test` can run it.

export type CraftGroup = "gear" | "enchants" | "supplies";

export const CRAFT_GROUPS = ["gear", "enchants", "supplies"] as const satisfies CraftGroup[];

/** Gathering professions: their few "recipes" aren't crafts anyone asks for. */
const GATHERING = new Set(["Herbalism", "Skinning", "Fishing"]);

type Craft = {
	profession: string;
	name: string;
	item: { kind?: string; tooltip: { left: string; right?: string }[] } | null;
};

/**
 * Which tab a recipe goes in, or null for none (gathering). Enchants make no
 * item; armor kits, spikes and scopes are "Permanent" item enhancements.
 * Recipes whose item we haven't read yet go to Supplies.
 */
export function craftGroup(r: Craft): CraftGroup | null {
	if (GATHERING.has(r.profession)) return null;
	if (!r.item) return r.profession === "Enchanting" || r.name.startsWith("Enchant ") ? "enchants" : "supplies";
	if (r.item.kind === "Permanent") return "enchants";
	return equipSlot(r.item.tooltip) ? "gear" : "supplies";
}

export type SupplyType = "potions" | "food" | "bandages" | "bags" | "oils" | "devices" | "ammo" | "materials" | "other";

/** In the filter's order; Materials and the rest come last (many, rarely asked for). */
export const SUPPLY_TYPES: { type: SupplyType; label: string }[] = [
	{ type: "potions", label: "Potions and elixirs" },
	{ type: "food", label: "Food and drink" },
	{ type: "bandages", label: "Bandages" },
	{ type: "bags", label: "Bags and quivers" },
	{ type: "oils", label: "Weapon oils and stones" },
	{ type: "devices", label: "Explosives and devices" },
	{ type: "ammo", label: "Ammo" },
	{ type: "materials", label: "Materials" },
	{ type: "other", label: "Everything else" },
];

/** Blizzard's item subclass names ("Elixirs", "Ammo Pouch") to a type. */
const BY_KIND: Record<string, SupplyType> = {
	Potions: "potions",
	Elixirs: "potions",
	Flasks: "potions",
	"Food & Drink": "food",
	Bandages: "bandages",
	Bag: "bags",
	Quiver: "bags",
	"Ammo Pouch": "bags",
	"Soul Bag": "bags",
	"Herb Bag": "bags",
	"Enchanting Bag": "bags",
	"Reagent Bag": "bags",
	Temporary: "oils",
	Explosives: "devices",
	Device: "devices",
	Holiday: "devices",
	Pet: "devices",
	Bullet: "ammo",
	Arrow: "ammo",
	"Metal & Stone": "materials",
	Leather: "materials",
	Cloth: "materials",
	Parts: "materials",
	Elemental: "materials",
	Herb: "materials",
	Reagent: "materials",
	Enchanting: "materials",
};

/**
 * A Supplies recipe's type. Mostly the item's subclass; "Other" (Blizzard's
 * catch-all for consumables) by profession and name: bandages, food, oils
 * and stones. Enchanting's oils are "Enchanting" like its shards.
 */
export function supplyType(r: Craft): SupplyType {
	if (/ Oil$|Sharpening Stone$|Weightstone$/.test(r.name)) return "oils";
	const kind = r.item?.kind;
	if (kind === "Other" || kind === undefined) {
		if (r.profession === "First Aid") return "bandages";
		if (r.profession === "Cooking") return "food";
		return "other";
	}
	return BY_KIND[kind] ?? "other";
}
