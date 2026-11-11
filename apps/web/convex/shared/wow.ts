// Static WoW data shared by the backend and the app. Imported by both, so
// keep it free of Convex server imports.

export type Flavor = "forever";
export type Region = "us" | "eu" | "kr" | "tw";
export type NamespaceKind = "static" | "dynamic" | "profile";

/**
 * How each flavor talks to the Blizzard API. Forever is realmless: characters
 * are `{name}-{surname}` and guilds are a bare name slug. A realm-based flavor
 * (Classic Era: `profile-classic1x-{region}`) would add realm slugs to both
 * paths — that's the main thing to change to support one.
 */
export const FLAVORS = {
	forever: {
		label: "WoW: Forever",
		namespace: (kind: NamespaceKind, region: Region) => `${kind}-forever-${region}`,
		guildPath: (slug: string) => `/data/wow/guild/${encodeURIComponent(slug)}`,
		characterPath: (slug: string) => `/profile/wow/character/${encodeURIComponent(slug)}`,
		/** Characters only appear in the profile API from this level, after a logout. */
		minProfileLevel: 10,
		maxLevel: 60,
	},
} as const satisfies Record<Flavor, unknown>;

export const REGIONS: Region[] = ["us", "eu", "kr", "tw"];

/** The API's guild slug: lowercase, spaces as hyphens. */
export function guildSlug(name: string) {
	return name.trim().toLowerCase().replace(/\s+/g, "-");
}

// From Blizzard's static-forever playable-class index (checked 2026-11-09).
export const CLASSES: Record<number, { name: string; color: string }> = {
	1: { name: "Warrior", color: "#C69B6D" },
	2: { name: "Paladin", color: "#F48CBA" },
	3: { name: "Hunter", color: "#AAD372" },
	4: { name: "Rogue", color: "#FFF468" },
	5: { name: "Priest", color: "#FFFFFF" },
	7: { name: "Shaman", color: "#0070DD" },
	8: { name: "Mage", color: "#3FC7EB" },
	9: { name: "Warlock", color: "#8788EE" },
	11: { name: "Druid", color: "#FF7C0A" },
};

// From Blizzard's static-forever playable-race index (checked 2026-11-09).
// Forever's Skyborne appear as two races.
export const RACES: Record<number, string> = {
	1: "Human",
	2: "Orc",
	3: "Dwarf",
	4: "Night Elf",
	5: "Undead",
	6: "Tauren",
	7: "Gnome",
	8: "Troll",
	95: "High Order Skyborne",
	96: "Windshaper Skyborne",
};

export const className = (id: number) => CLASSES[id]?.name ?? `Class ${id}`;
export const raceName = (id: number) => RACES[id] ?? `Race ${id}`;

export const QUALITY_ORDER = ["POOR", "COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "ARTIFACT"];

/** Equipment slots in paper-doll order. */
export const SLOT_ORDER = [
	"HEAD",
	"NECK",
	"SHOULDER",
	"BACK",
	"CHEST",
	"SHIRT",
	"TABARD",
	"WRIST",
	"HANDS",
	"WAIST",
	"LEGS",
	"FEET",
	"FINGER_1",
	"FINGER_2",
	"TRINKET_1",
	"TRINKET_2",
	"MAIN_HAND",
	"OFF_HAND",
	"RANGED",
];

/** Rosters sync by themselves this often (convex/crons.ts). */
export const AUTO_SYNC_INTERVAL_MS = 60 * 60_000;
/** "Sync now" is allowed this long after the last sync, so it can't be spammed. */
export const MANUAL_SYNC_COOLDOWN_MS = 10 * 60_000;

/**
 * Reagents trade supplies and food vendors sell, by item id. Nobody needs a
 * guildmate for these, so the addon's tooltips don't suggest who "might
 * want" them (reagentSuggestions.ts). Only classic items whose vendors are
 * known; Forever's own items (Cerulean Dye...) aren't listed.
 */
export const VENDOR_REAGENTS: Record<number, string> = {
	159: "Refreshing Spring Water",
	814: "Flask of Oil",
	1179: "Ice Cold Milk",
	1205: "Melon Juice",
	1645: "Moonberry Juice",
	1708: "Sweet Nectar",
	2320: "Coarse Thread",
	2321: "Fine Thread",
	2324: "Bleach",
	2325: "Black Dye",
	2604: "Red Dye",
	2605: "Green Dye",
	2678: "Mild Spices",
	2692: "Hot Spices",
	2880: "Weak Flux",
	3371: "Empty Vial",
	3372: "Leaded Vial",
	3466: "Strong Flux",
	3713: "Soothing Spices",
	4289: "Salt",
	4291: "Silken Thread",
	4340: "Gray Dye",
	4341: "Yellow Dye",
	4342: "Purple Dye",
	4399: "Wooden Stock",
	4400: "Heavy Stock",
	4470: "Simple Wood",
	6217: "Copper Rod",
	6260: "Blue Dye",
	6261: "Orange Dye",
	8343: "Heavy Silken Thread",
	8766: "Morning Glory Dew",
	8925: "Crystal Vial",
	10290: "Pink Dye",
	14341: "Rune Thread",
	18256: "Imbued Vial",
	18567: "Elemental Flux",
};
