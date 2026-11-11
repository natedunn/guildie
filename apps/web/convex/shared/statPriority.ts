import { type StatChoice, specsOf, validStats } from "./upgrades.ts";
import { CLASS_TOKENS, SPECS } from "./weights.ts";

// Stat priority: the three stats a character should look for on gear, first
// to third. From their main talent tree (the same one gear suggestions use,
// shared/upgrades.ts specsOf), unless the player who claimed the character
// chose another tree or their own three. A general guide, not a sim. The
// choice also steers gear suggestions on the site and in game (specsFor).
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
export type { StatChoice };
export { validStats };

export type StatPriority = {
	/** The tree it's from; absent for the player's own three. */
	tree?: string;
	/** Three stat keys (PRIORITY_STATS), first to third. */
	stats: string[];
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
	if (own) return { stats: own, chosen: true };
	if (choice?.tree !== undefined && trees[choice.tree]) {
		const t = trees[choice.tree];
		return { tree: t.name, stats: [...t.stats], chosen: true };
	}
	const spec = specsOf(classId, talentTrees)?.spec;
	const t = trees[Number(spec?.split(":")[1])];
	return t ? { tree: t.name, stats: [...t.stats], chosen: false } : undefined;
}
