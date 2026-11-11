// Gear-upgrade suggestions: how much each stat is worth to each class and
// talent tree, and the thresholds the decision uses (shared/upgrades.ts).
// What each class can wear and wield is in shared/proficiencies.ts (from the
// game's data). Plain data, meant to be tweaked by hand. Explained, with
// tables of these numbers, in docs/gear-upgrades.md: update those too.
// The addon gets all of this in GuildieData.lua (helper.ts), so changing a
// number here changes the game's tooltips with the next download, no addon
// release needed.
//
// A best guess, not a sim. Seeded from WowSims' EP weights (MIT):
// - github.com/wowsims/forever (ui/specs/*/presets.ts, ui/specs/druid/feral_ep.ts;
//   commit 3d67a0a1a069) where a spec has presets: warrior, rogue, feral,
//   balance, shadow and healing priest, elemental, enhancement, retribution;
// - github.com/wowsims/classic (ui/*/sim.ts, commit 7779ebbf79dc) for the rest:
//   hunter, mage, warlock, holy and protection paladin, restoration druid
//   and shaman.
// Their numbers are endgame raid values relative to attack or spell power;
// here each tree's main stat is 1 and the rest are scaled to it, then moved by
// hand toward leveling: Stamina counts for everyone, primary stats count more,
// hit and crit less (nobody is near a cap), and set-piece or rune effects
// (Season of Discovery's spell power for Enhancement) are left out.
//
// Stat keys are Blizzard's stat types (an equipped item's `stats[].type.type`,
// and the game's ITEM_MOD_<KEY>_SHORT from GetItemStats), plus:
//   ARMOR: the item's armor; DPS: weapon damage per second in the main hand
//   (or a two-hander); OFFHAND_DPS: a weapon in the off hand; RANGED_DPS: a
//   bow, gun, crossbow, thrown weapon or wand.

export type Weights = Record<string, number>;
/**
 * `stats`: what to look for on gear, first to third (shared/statPriority.ts),
 * for the roster and character pages. Written by hand rather than read off
 * `w`: per-point weights rank Attack Power and spell power oddly next to the
 * main stats, and players think in "Stamina, then Strength". Every stat here
 * must have a weight in `w` (statPriority.test.ts checks).
 */
export type Spec = { name: string; stats: [string, string, string]; w: Weights };

/** Class ids (Blizzard's) to the game's class tokens (UnitClass). */
export const CLASS_TOKENS: Record<number, string> = {
	1: "WARRIOR",
	2: "PALADIN",
	3: "HUNTER",
	4: "ROGUE",
	5: "PRIEST",
	7: "SHAMAN",
	8: "MAGE",
	9: "WARLOCK",
	11: "DRUID",
};

/** Leveling basics most specs share; each spec spreads its own on top. */
const STAMINA = 0.6;
const ARMOR = 0.02;

// Casters: Intellect is the anchor. Spell power counts a bit more per point
// (items carry fewer points of it), Spirit for leveling's downtime.
const caster = (w: Weights): Weights => ({
	INTELLECT: 1,
	SPIRIT: 0.5,
	STAMINA,
	ARMOR,
	MANA_REGENERATION: 0.6,
	SPELL_POWER: 1.3,
	SPELL_DAMAGE_DONE: 1.3,
	SPELL_HEALING_DONE: 0.2,
	CRIT_RATING: 0.6,
	HIT_RATING: 0.6,
	// Wands: what casters level with between spells.
	RANGED_DPS: 1,
	...w,
});

const healer = (w: Weights): Weights => ({
	INTELLECT: 1,
	SPIRIT: 0.7,
	STAMINA: 0.5,
	ARMOR,
	MANA_REGENERATION: 1,
	SPELL_POWER: 1.2,
	SPELL_HEALING_DONE: 1.1,
	// Healers level by doing damage too.
	SPELL_DAMAGE_DONE: 0.5,
	CRIT_RATING: 0.4,
	RANGED_DPS: 1,
	...w,
});

/**
 * Per class token, its three talent trees in the game's order (the same order
 * as shared/foreverTalents.ts). `name` is what tooltips show.
 */
export const SPECS: Record<string, [Spec, Spec, Spec]> = {
	// wowsims/forever warrior/dps "Pre-BiS - Arms" (Str 2.2, Agi 1.82, AP 1,
	// crit 2.36, hit 4.59, MH DPS 17.69) and "Pre-BiS - Fury" (Str 2.2, Agi 2.25,
	// MH DPS 9.89, OH DPS 3.15); warrior/protection "Pre-BiS" (Sta 1.15, Str .62,
	// Agi .66, defense .22, block value .6, armor .05, MH DPS 2.16).
	WARRIOR: [
		{
			name: "Arms",
			stats: ["STRENGTH", "CRIT_RATING", "HIT_RATING"],
			w: {
				STRENGTH: 1,
				AGILITY: 0.7,
				STAMINA,
				ARMOR,
				ATTACK_POWER: 0.45,
				CRIT_RATING: 0.9,
				HIT_RATING: 0.9,
				DEFENSE_SKILL_RATING: 0.2,
				DPS: 8,
				RANGED_DPS: 0.3,
			},
		},
		{
			name: "Fury",
			stats: ["STRENGTH", "HIT_RATING", "CRIT_RATING"],
			w: {
				STRENGTH: 1,
				AGILITY: 0.8,
				STAMINA,
				ARMOR,
				ATTACK_POWER: 0.45,
				CRIT_RATING: 1,
				HIT_RATING: 0.9,
				DEFENSE_SKILL_RATING: 0.2,
				DPS: 4.5,
				OFFHAND_DPS: 1.4,
				RANGED_DPS: 0.3,
			},
		},
		{
			name: "Protection",
			stats: ["STAMINA", "DEFENSE_SKILL_RATING", "STRENGTH"],
			w: {
				STAMINA: 1,
				STRENGTH: 0.6,
				AGILITY: 0.6,
				ARMOR: 0.05,
				EXTRA_ARMOR: 0.05,
				ATTACK_POWER: 0.25,
				DEFENSE_SKILL_RATING: 0.45,
				BLOCK_RATING: 0.2,
				HIT_RATING: 0.5,
				CRIT_RATING: 0.4,
				HEALTH_REGEN: 0.5,
				DPS: 2.5,
				RANGED_DPS: 0.2,
			},
		},
	],
	// wowsims/classic holy_paladin (Int .38, Spi .34, SP 1) and
	// protection_paladin; wowsims/forever paladin/retribution "Unsealed Wrath"
	// (Str 2.4, Agi 2.23, Int 2.06, spell damage 2.36, AP 1, MH DPS 13.85).
	PALADIN: [
		{
			name: "Holy",
			stats: ["SPELL_HEALING_DONE", "INTELLECT", "MANA_REGENERATION"],
			w: healer({ STRENGTH: 0.3, DPS: 1 }),
		},
		{
			name: "Protection",
			stats: ["STAMINA", "STRENGTH", "INTELLECT"],
			w: {
				STAMINA: 1,
				STRENGTH: 0.6,
				AGILITY: 0.5,
				INTELLECT: 0.3,
				ARMOR: 0.05,
				EXTRA_ARMOR: 0.05,
				DEFENSE_SKILL_RATING: 0.45,
				BLOCK_RATING: 0.2,
				SPELL_POWER: 0.4,
				SPELL_DAMAGE_DONE: 0.4,
				ATTACK_POWER: 0.2,
				HEALTH_REGEN: 0.5,
				MANA_REGENERATION: 0.3,
				DPS: 2,
			},
		},
		{
			name: "Retribution",
			stats: ["STRENGTH", "CRIT_RATING", "HIT_RATING"],
			w: {
				STRENGTH: 1,
				AGILITY: 0.7,
				INTELLECT: 0.4,
				STAMINA,
				ARMOR,
				ATTACK_POWER: 0.42,
				SPELL_POWER: 0.5,
				SPELL_DAMAGE_DONE: 0.5,
				CRIT_RATING: 0.9,
				HIT_RATING: 0.9,
				MANA_REGENERATION: 0.3,
				DPS: 5.8,
			},
		},
	],
	// wowsims/classic hunter (Agi .64, Str .3, AP 1, RAP 1, ranged DPS 6.32,
	// MH DPS 2.11): the bow matters most; Agility over Strength by far.
	// Survival leans on Agility and Stamina a little more.
	HUNTER: [
		{
			name: "Beast Mastery",
			stats: ["AGILITY", "CRIT_RATING", "STAMINA"],
			w: {
				AGILITY: 1,
				STAMINA: 0.5,
				INTELLECT: 0.3,
				SPIRIT: 0.1,
				STRENGTH: 0.15,
				ARMOR,
				ATTACK_POWER: 0.45,
				CRIT_RATING: 0.8,
				HIT_RATING: 0.8,
				MANA_REGENERATION: 0.4,
				RANGED_DPS: 3,
				DPS: 0.5,
				OFFHAND_DPS: 0.2,
			},
		},
		{
			name: "Marksmanship",
			stats: ["AGILITY", "HIT_RATING", "CRIT_RATING"],
			w: {
				AGILITY: 1,
				STAMINA: 0.5,
				INTELLECT: 0.3,
				SPIRIT: 0.1,
				STRENGTH: 0.15,
				ARMOR,
				ATTACK_POWER: 0.45,
				CRIT_RATING: 0.9,
				HIT_RATING: 0.9,
				MANA_REGENERATION: 0.4,
				RANGED_DPS: 3.2,
				DPS: 0.4,
				OFFHAND_DPS: 0.2,
			},
		},
		{
			name: "Survival",
			stats: ["AGILITY", "CRIT_RATING", "STAMINA"],
			w: {
				AGILITY: 1,
				STAMINA: 0.6,
				INTELLECT: 0.3,
				SPIRIT: 0.1,
				STRENGTH: 0.2,
				ARMOR,
				ATTACK_POWER: 0.45,
				CRIT_RATING: 0.9,
				HIT_RATING: 0.8,
				MANA_REGENERATION: 0.4,
				RANGED_DPS: 3,
				DPS: 0.7,
				OFFHAND_DPS: 0.3,
			},
		},
	],
	// wowsims/forever rogue/dps "Assassination", "Combat Sinister",
	// "Subtlety" (Agi ~2, Str 1.1, AP 1, MH DPS 8.4-10.6, OH DPS 2.3-4.2).
	ROGUE: [
		{
			name: "Assassination",
			stats: ["AGILITY", "CRIT_RATING", "HIT_RATING"],
			w: {
				AGILITY: 1,
				STRENGTH: 0.55,
				STAMINA: 0.5,
				ARMOR,
				ATTACK_POWER: 0.5,
				CRIT_RATING: 0.9,
				HIT_RATING: 0.9,
				DPS: 4.1,
				OFFHAND_DPS: 2,
				RANGED_DPS: 0.3,
			},
		},
		{
			name: "Combat",
			stats: ["AGILITY", "HIT_RATING", "CRIT_RATING"],
			w: {
				AGILITY: 1,
				STRENGTH: 0.55,
				STAMINA: 0.5,
				ARMOR,
				ATTACK_POWER: 0.5,
				CRIT_RATING: 0.85,
				HIT_RATING: 0.9,
				DPS: 5.4,
				OFFHAND_DPS: 1.5,
				RANGED_DPS: 0.3,
			},
		},
		{
			name: "Subtlety",
			stats: ["AGILITY", "CRIT_RATING", "STRENGTH"],
			w: {
				AGILITY: 1,
				STRENGTH: 0.55,
				STAMINA: 0.5,
				ARMOR,
				ATTACK_POWER: 0.5,
				CRIT_RATING: 0.85,
				HIT_RATING: 0.9,
				DPS: 5.4,
				OFFHAND_DPS: 1.2,
				RANGED_DPS: 0.3,
			},
		},
	],
	// wowsims/forever priest/healer (healing power 1, Int .2-.35, Spi .15-.3,
	// MP5 .4-.6) and priest/dps "Shadow" (Int .24, spell damage 1, shadow 1).
	// Spirit counts more than the sims say: Spirit Tap and drinking less.
	PRIEST: [
		{
			name: "Discipline",
			stats: ["INTELLECT", "SPELL_HEALING_DONE", "SPIRIT"],
			w: healer({
				SPIRIT: 0.8,
				SPELL_DAMAGE_DONE: 0.7,
				BONUS_STAT_SHADOW_DAMAGE_DONE: 0.3,
				BONUS_STAT_HOLY_DAMAGE_DONE: 0.3,
			}),
		},
		{
			name: "Holy",
			stats: ["SPELL_HEALING_DONE", "SPIRIT", "INTELLECT"],
			w: healer({ SPIRIT: 0.9, BONUS_STAT_HOLY_DAMAGE_DONE: 0.3 }),
		},
		{
			name: "Shadow",
			stats: ["SPELL_DAMAGE_DONE", "INTELLECT", "SPIRIT"],
			w: caster({ SPIRIT: 0.8, BONUS_STAT_SHADOW_DAMAGE_DONE: 1.2 }),
		},
	],
	// wowsims/forever shaman/elemental (Int .19, spell damage 1, nature .69,
	// fire .31) and shaman/enhancement "Pre-BiS" (Str 2.2, Agi 1.32, Int 1.99,
	// AP 1, MH DPS 14.18); wowsims/classic restoration_shaman (Int .22, SP 1).
	SHAMAN: [
		{
			name: "Elemental",
			stats: ["SPELL_DAMAGE_DONE", "INTELLECT", "CRIT_RATING"],
			w: caster({ SPIRIT: 0.4, BONUS_STAT_NATURE_DAMAGE_DONE: 0.9, BONUS_STAT_FIRE_DAMAGE_DONE: 0.4 }),
		},
		{
			name: "Enhancement",
			stats: ["STRENGTH", "CRIT_RATING", "AGILITY"],
			w: {
				STRENGTH: 1,
				AGILITY: 0.6,
				INTELLECT: 0.45,
				STAMINA,
				ARMOR,
				ATTACK_POWER: 0.45,
				SPELL_POWER: 0.3,
				SPELL_DAMAGE_DONE: 0.3,
				CRIT_RATING: 0.9,
				HIT_RATING: 0.8,
				MANA_REGENERATION: 0.3,
				DPS: 6.4,
			},
		},
		{
			name: "Restoration",
			stats: ["SPELL_HEALING_DONE", "INTELLECT", "MANA_REGENERATION"],
			w: healer({ SPIRIT: 0.5, STRENGTH: 0.2, DPS: 0.8 }),
		},
	],
	// wowsims/classic mage (Int .49, spell power 1, school power 1).
	MAGE: [
		{
			name: "Arcane",
			stats: ["SPELL_DAMAGE_DONE", "INTELLECT", "SPIRIT"],
			w: caster({ BONUS_STAT_ARCANE_DAMAGE_DONE: 1.1 }),
		},
		{
			name: "Fire",
			stats: ["SPELL_DAMAGE_DONE", "CRIT_RATING", "INTELLECT"],
			w: caster({ BONUS_STAT_FIRE_DAMAGE_DONE: 1.1 }),
		},
		{
			name: "Frost",
			stats: ["SPELL_DAMAGE_DONE", "INTELLECT", "HIT_RATING"],
			w: caster({ BONUS_STAT_FROST_DAMAGE_DONE: 1.1 }),
		},
	],
	// wowsims/classic warlock (Int .23, SP 1, shadow .9, fire .1). Stamina is
	// worth a lot more while leveling (Life Tap, drain tanking).
	WARLOCK: [
		{
			name: "Affliction",
			stats: ["SPELL_DAMAGE_DONE", "STAMINA", "INTELLECT"],
			w: caster({ STAMINA: 0.9, BONUS_STAT_SHADOW_DAMAGE_DONE: 1.1 }),
		},
		{
			name: "Demonology",
			stats: ["STAMINA", "SPELL_DAMAGE_DONE", "INTELLECT"],
			w: caster({ STAMINA: 1, BONUS_STAT_SHADOW_DAMAGE_DONE: 1.1 }),
		},
		{
			name: "Destruction",
			stats: ["SPELL_DAMAGE_DONE", "CRIT_RATING", "STAMINA"],
			w: caster({ STAMINA: 0.8, BONUS_STAT_FIRE_DAMAGE_DONE: 1.1, BONUS_STAT_SHADOW_DAMAGE_DONE: 0.8 }),
		},
	],
	// wowsims/forever druid/balance "Pre-BiS" (Int .2, spell damage 1, arcane
	// .68, nature .32) and druid/feral_ep.ts Cat (Str .50, Agi .52, AP .2) and
	// Bear (Sta .97, armor .2, defense .95): one Feral tree in the game, so a
	// cat with some bear. Weapon damage doesn't matter in forms.
	DRUID: [
		{
			name: "Balance",
			stats: ["SPELL_DAMAGE_DONE", "INTELLECT", "CRIT_RATING"],
			w: caster({ BONUS_STAT_ARCANE_DAMAGE_DONE: 0.9, BONUS_STAT_NATURE_DAMAGE_DONE: 0.7, SPELL_HEALING_DONE: 0.3 }),
		},
		{
			name: "Feral",
			stats: ["AGILITY", "STRENGTH", "STAMINA"],
			w: {
				AGILITY: 1,
				STRENGTH: 0.95,
				STAMINA: 0.7,
				INTELLECT: 0.15,
				SPIRIT: 0.1,
				ARMOR: 0.08,
				EXTRA_ARMOR: 0.08,
				ATTACK_POWER: 0.4,
				DEFENSE_SKILL_RATING: 0.3,
				CRIT_RATING: 0.75,
				HIT_RATING: 0.8,
				MANA_REGENERATION: 0.2,
			},
		},
		{ name: "Restoration", stats: ["SPELL_HEALING_DONE", "INTELLECT", "SPIRIT"], w: healer({ SPIRIT: 0.9 }) },
	],
};

/**
 * The tree a character is treated as while it has fewer than MIN_SPEC_POINTS
 * in any tree (or as a tie-break): how most players level each class.
 */
export const DEFAULT_TREE: Record<string, number> = {
	WARRIOR: 0, // Arms
	PALADIN: 2, // Retribution
	HUNTER: 0, // Beast Mastery
	ROGUE: 1, // Combat
	PRIEST: 2, // Shadow
	SHAMAN: 1, // Enhancement
	MAGE: 2, // Frost
	WARLOCK: 0, // Affliction
	DRUID: 1, // Feral
};

/**
 * How many plain stat points one point of a stat is roughly worth on an item,
 * for `minFit`'s raw total (anything not listed: 1). Without it a mace with
 * +32 Attack Power and +60 Bonus Armor would look like mostly armor.
 */
export const STAT_POINTS: Record<string, number> = {
	ATTACK_POWER: 0.5,
	EXTRA_ARMOR: 0.1,
};

/** Thresholds for the decision (shared/upgrades.ts). */
export const THRESHOLDS = {
	/** Gain over what they wear for "upgrade" (usable now, main spec). */
	upgrade: 0.15,
	/** Smallest gain worth a "maybe". */
	maybe: 0.03,
	/** Items they can use within this many levels are a "maybe (at 24)". */
	levelsAhead: 3,
	/** Members not seen (last logout, or the addon's last read) for longer are skipped. */
	activeDays: 14,
	/** A tree needs this many points to count as a spec (fewer: DEFAULT_TREE). */
	minSpecPoints: 10,
	/**
	 * An item whose stats are worth less than this share of their raw total to
	 * a spec doesn't suit it (Agility cloth on a mage: 0).
	 */
	minFit: 0.3,
	/** From this level, armor below the class's best type is worth less... */
	preferBestFrom: 40,
	/** ...this much (leather on a level 45 warrior). */
	preferBestFactor: 0.8,
	/** Each step down a player's list of preferred armor or weapon types counts this much less. */
	preferStep: 0.05,
	/** Gains are relative to what they wear, but never to less than this (an empty slot). */
	minBase: 1,
} as const;
