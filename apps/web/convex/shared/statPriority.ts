import {
	MAX_STATS,
	MIN_STATS,
	STAT_SHORT,
	type StatChoice,
	type Steepness,
	specsOf,
	steepnessOf,
	TIER_PRESETS,
	validStats,
	validTiers,
} from "./upgrades.ts";
import { CLASS_TOKENS, SPECS, STAT_POINTS, type Weights } from "./weights.ts";

// Stat priority: the stats a character should look for on gear, first to
// last. From their main talent tree (the same one gear suggestions use,
// shared/upgrades.ts specsOf), unless the player who claimed the character
// chose another tree or their own three to five, with how much each counts
// next to the first (Even, Balanced, Steep or their own shares). Pages show
// the first three; all of them count in gear suggestions on the site and in
// game (specsFor). A general guide, not a sim.
//
// Kept free of Convex imports so `node --test` can run it.

/** Stats a priority can name (Blizzard's stat types, as in weights.ts), with their labels, in the order pickers list them. */
export const PRIORITY_STATS: Record<string, string> = {
	STRENGTH: "Strength",
	AGILITY: "Agility",
	STAMINA: "Stamina",
	INTELLECT: "Intellect",
	SPIRIT: "Spirit",
	ATTACK_POWER: "Attack power",
	SPELL_DAMAGE_DONE: "Spell damage",
	SPELL_HEALING_DONE: "Healing",
	CRIT_RATING: "Crit",
	HIT_RATING: "Hit",
	DEFENSE_SKILL_RATING: "Defense",
	MANA_REGENERATION: "Mana per 5",
	ARMOR: "Armor",
};

/** A player's choice, stored on their claim (ownedCharacters.statPriority). Gear suggestions use it too (upgrades.ts specsFor). */
export type { StatChoice, Steepness };
export { MAX_STATS, MIN_STATS, steepnessOf, TIER_PRESETS, validStats, validTiers };

export type StatPriority = {
	/** The tree it's from; absent for the player's own three. */
	tree?: string;
	/** Stat keys (PRIORITY_STATS), first to last: three from a tree, three to five of the player's own. Pages show three. */
	stats: string[];
	/** How much each counts next to the first, per stat point (1 first): the player's shares, or a tree's weights. */
	shares: number[];
	/** The player's own stats: which preset their shares are. */
	steepness?: Steepness;
	/** The player chose it (another tree, or their own three) rather than their talents. */
	chosen: boolean;
};

type Tree = { name: string; points: number; talents: { id?: number }[] };

export function statPriority(
	classId: number,
	talentTrees: Tree[] | undefined,
	choice?: StatChoice,
): StatPriority | undefined {
	const token = CLASS_TOKENS[classId];
	const trees = token ? SPECS[token] : undefined;
	if (!token || !trees) return undefined;
	const own = validStats(choice?.stats);
	if (own) {
		const tiers = validTiers(choice?.tiers, own.length);
		return { stats: own, shares: tiers, steepness: steepnessOf(tiers), chosen: true };
	}
	if (choice?.tree !== undefined && trees[choice.tree]) {
		const t = trees[choice.tree];
		return { tree: t.name, stats: [...t.stats], shares: treeShares(t.w, t.stats), chosen: true };
	}
	const spec = specsOf(classId, talentTrees)?.spec;
	const t = trees[Number(spec?.split(":")[1])];
	return t ? { tree: t.name, stats: [...t.stats], shares: treeShares(t.w, t.stats), chosen: false } : undefined;
}

/** A tree's stats' weights per stat point, as shares of its best (as customWeights counts them). */
function treeShares(w: Weights, stats: readonly string[]) {
	const per = (k: string) => (w[k] ?? 0) / (STAT_POINTS[k] ?? 1);
	const top = Math.max(
		...Object.keys(STAT_SHORT)
			.filter((k) => k !== "ARMOR")
			.map(per),
	);
	return stats.map((k) => (k === "ARMOR" || top <= 0 ? 1 : Math.round((per(k) / top) * 100) / 100));
}
