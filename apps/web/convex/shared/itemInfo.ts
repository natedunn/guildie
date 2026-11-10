import { CLASSES } from "./wow.ts";

// What gear-upgrade suggestions need to know about an item (shared/upgrades.ts):
// where it goes, its type, its stats, and who may use it. Read from the
// item's tooltip lines, which is what we have for every item we know:
//
// - Blizzard's equipped items and item data: tooltipLines() (items.ts) builds
//   them from Blizzard's own display strings ("+7 Stamina", "76 Armor",
//   "Classes: Druid"), English (we ask for en_US), so reading them back loses
//   nothing;
// - gear the addon read in game: the game's tooltip, in the player's
//   language. Non-English lines aren't understood (no slot found); callers
//   then use the item's row in the items table (English, from Blizzard), or
//   an estimate from the item level.
//
// Kept free of Convex imports so `node --test` can run it.

export type ItemInfo = {
	/** The game's equip location without "INVTYPE_": HEAD, 2HWEAPON, WEAPONOFFHAND, RANGEDRIGHT... */
	invType: string;
	/** Item class: 2 weapon, 4 armor. */
	cls: 2 | 4;
	/** Subclass id within the class (proficiencies.ts ARMOR_SUBCLASS / WEAPON_SUBCLASS). */
	subclass?: number;
	/** Stat type -> value (Blizzard's stat types, as in weights.ts). */
	stats: Record<string, number>;
	armor?: number;
	/** Weapon damage per second. */
	dps?: number;
	reqLevel?: number;
	/** "Classes: ...": only these class ids may use it. */
	classes?: number[];
	/** Unique or Unique-Equipped: one at a time. */
	unique?: boolean;
};

/** The tooltip's slot line ("Two-Hand", "Back") to the game's equip location. */
const SLOT_NAMES: Record<string, string> = {
	Head: "HEAD",
	Neck: "NECK",
	Shoulder: "SHOULDER",
	Back: "CLOAK",
	Chest: "CHEST",
	Shirt: "BODY",
	Tabard: "TABARD",
	Wrist: "WRIST",
	Hands: "HAND",
	Waist: "WAIST",
	Legs: "LEGS",
	Feet: "FEET",
	Finger: "FINGER",
	Trinket: "TRINKET",
	"Main Hand": "WEAPONMAINHAND",
	"One-Hand": "WEAPON",
	"Two-Hand": "2HWEAPON",
	"Off Hand": "WEAPONOFFHAND",
	"Held In Off-hand": "HOLDABLE",
	Ranged: "RANGEDRIGHT",
	Thrown: "THROWN",
	Relic: "RELIC",
};

/** Equip locations that are weapons (item class 2). */
export const WEAPON_INV_TYPES = new Set([
	"WEAPON",
	"2HWEAPON",
	"WEAPONMAINHAND",
	"WEAPONOFFHAND",
	"RANGED",
	"RANGEDRIGHT",
	"THROWN",
]);

const ARMOR_NAMES: Record<string, number> = {
	Miscellaneous: 0,
	Cloth: 1,
	Leather: 2,
	Mail: 3,
	Plate: 4,
	Shield: 6,
	Libram: 7,
	Idol: 8,
	Totem: 9,
};

/** One-hand id, two-hand id (axes, maces and swords share a name). */
const WEAPON_NAMES: Record<string, [number, number]> = {
	Axe: [0, 1],
	Bow: [2, 2],
	Gun: [3, 3],
	Mace: [4, 5],
	Polearm: [6, 6],
	Sword: [7, 8],
	Staff: [10, 10],
	"Fist Weapon": [13, 13],
	Miscellaneous: [14, 14],
	Dagger: [15, 15],
	Thrown: [16, 16],
	Crossbow: [18, 18],
	Wand: [19, 19],
	"Fishing Pole": [20, 20],
};

/** "+7 Stamina" style lines: the name after the number. */
export const STAT_NAMES: Record<string, string> = {
	Strength: "STRENGTH",
	Agility: "AGILITY",
	Stamina: "STAMINA",
	Intellect: "INTELLECT",
	Spirit: "SPIRIT",
	"Attack Power": "ATTACK_POWER",
	"Spell Power": "SPELL_POWER",
	"Spell Damage": "SPELL_DAMAGE_DONE",
	"Spell Healing": "SPELL_HEALING_DONE",
	Defense: "DEFENSE_SKILL_RATING",
	Block: "BLOCK_RATING",
	"Bonus Armor": "EXTRA_ARMOR",
	"Health Per 5 Sec.": "HEALTH_REGEN",
	"Mana Regeneration per 5 sec": "MANA_REGENERATION",
	"Critical Strike Rating": "CRIT_RATING",
	"Crit Rating": "CRIT_RATING",
	"Hit Rating": "HIT_RATING",
	"Arcane Damage": "BONUS_STAT_ARCANE_DAMAGE_DONE",
	"Fire Damage": "BONUS_STAT_FIRE_DAMAGE_DONE",
	"Frost Damage": "BONUS_STAT_FROST_DAMAGE_DONE",
	"Nature Damage": "BONUS_STAT_NATURE_DAMAGE_DONE",
	"Shadow Damage": "BONUS_STAT_SHADOW_DAMAGE_DONE",
	"Holy Damage": "BONUS_STAT_HOLY_DAMAGE_DONE",
	"Arcane Resistance": "ARCANE_RESISTANCE",
	"Fire Resistance": "FIRE_RESISTANCE",
	"Frost Resistance": "FROST_RESISTANCE",
	"Nature Resistance": "NATURE_RESISTANCE",
	"Shadow Resistance": "SHADOW_RESISTANCE",
};

/** Older items word some stats as an Equip: line. */
const EQUIP_LINES: [RegExp, string][] = [
	[/^Equip: Increases damage and healing done by magical spells and effects by up to (\d+)\.$/, "SPELL_POWER"],
	[/^Equip: Increases healing done by spells and effects by up to (\d+)\.$/, "SPELL_HEALING_DONE"],
	[
		/^Equip: Increases damage done by (Arcane|Fire|Frost|Nature|Shadow|Holy) spells and effects by up to (\d+)\.$/,
		"school",
	],
	[/^Equip: \+(\d+) Attack Power\.$/, "ATTACK_POWER"],
	[/^Equip: Restores (\d+) mana per 5 sec\.$/, "MANA_REGENERATION"],
	[/^Equip: Restores (\d+) health (?:every|per) 5 sec\.$/, "HEALTH_REGEN"],
	[/^Equip: Increased Defense \+(\d+)\.$/, "DEFENSE_SKILL_RATING"],
];

const CLASS_BY_NAME = new Map(Object.entries(CLASSES).map(([id, c]) => [c.name, Number(id)]));

/**
 * An item's slot, type and stats from its tooltip lines (name line excluded),
 * or undefined when no line names a slot (not gear, or not English).
 */
export function itemInfoFromTooltip(lines: { left: string; right?: string }[]): ItemInfo | undefined {
	let info: ItemInfo | undefined;
	const stats: Record<string, number> = {};
	let armor: number | undefined;
	let dps: number | undefined;
	let reqLevel: number | undefined;
	let classes: number[] | undefined;
	let unique = false;
	for (const { left, right } of lines) {
		const text = left.trim();
		if (!info && SLOT_NAMES[text]) {
			let invType = SLOT_NAMES[text];
			const sub = right?.trim();
			if (invType === "WEAPONOFFHAND" && sub === "Shield") invType = "SHIELD";
			if (invType === "RANGEDRIGHT" && sub === "Bow") invType = "RANGED";
			const cls = WEAPON_INV_TYPES.has(invType) ? 2 : 4;
			let subclass: number | undefined;
			if (cls === 2 && sub && WEAPON_NAMES[sub]) subclass = WEAPON_NAMES[sub][invType === "2HWEAPON" ? 1 : 0];
			else if (cls === 4) subclass = sub ? ARMOR_NAMES[sub] : 0;
			info = { invType, cls, subclass, stats };
			continue;
		}
		let m: RegExpMatchArray | null;
		if ((m = text.match(/^([+-]\d+) (.+)$/)) && STAT_NAMES[m[2]]) {
			const key = STAT_NAMES[m[2]];
			stats[key] = (stats[key] ?? 0) + Number(m[1]);
		} else if ((m = text.match(/^(\d+) Armor$/))) {
			armor = Number(m[1]);
		} else if ((m = text.match(/^\(([\d.]+) damage per second\)$/))) {
			dps = Number(m[1]);
		} else if ((m = text.match(/^Requires Level (\d+)$/))) {
			reqLevel = Number(m[1]);
		} else if ((m = text.match(/^Classes: (.+)$/))) {
			classes = m[1].split(/,\s*/).flatMap((name) => CLASS_BY_NAME.get(name) ?? []);
		} else if (/^Unique(-Equipped)?( \(\d+\))?$/.test(text)) {
			unique = true;
		} else if (text.startsWith("Equip: ")) {
			for (const [re, key] of EQUIP_LINES) {
				const e = text.match(re);
				if (!e) continue;
				if (key === "school") {
					const k = `BONUS_STAT_${e[1].toUpperCase()}_DAMAGE_DONE`;
					stats[k] = (stats[k] ?? 0) + Number(e[2]);
				} else {
					stats[key] = (stats[key] ?? 0) + Number(e[1]);
				}
				break;
			}
		}
	}
	if (!info) return undefined;
	if (armor !== undefined) info.armor = armor;
	if (dps !== undefined) info.dps = dps;
	if (reqLevel !== undefined) info.reqLevel = reqLevel;
	if (classes?.length) info.classes = classes;
	if (unique) info.unique = true;
	return info;
}
