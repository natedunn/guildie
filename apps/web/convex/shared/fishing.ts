// Fishing gear isn't a build. Fishing addons swap a pole into the main hand
// and often take off or swap other gear too (a fishing hat, boots, no off
// hand), and a player who logs out by the water leaves Blizzard's profile
// that way. Gear read with a pole in the main hand doesn't replace gear
// read without one (helper.ts for the addon's uploads, sync.ts for
// Blizzard's), so the profile and the upgrade suggestions keep comparing
// with the gear the player plays in. The addon does the same for its "For
// you" row (Upgrades.lua, `fishing`).
//
// Kept free of Convex imports so `node --test` can run it.

/** Fishing poles by item id, for tooltips we can't read (not English). */
const POLE_IDS = new Set([6256, 6365, 6366, 6367, 12225, 19022, 19970]);
/** The weapon type on the slot line: the game's tooltip says "Fishing Pole", Blizzard's item data "Fishing Poles". */
const POLE_TYPES = new Set(["Fishing Pole", "Fishing Poles"]);

type Worn = { slot: string; itemId: number; tooltip?: { left: string; right?: string }[] };

/** True when the item is a fishing pole. */
export function isFishingPole(item: Pick<Worn, "itemId" | "tooltip">): boolean {
	if (POLE_IDS.has(item.itemId)) return true;
	return !!item.tooltip?.some((l) => l.right !== undefined && POLE_TYPES.has(l.right.trim()));
}

/** True when this gear was read while fishing: a fishing pole in the main hand. */
export function fishing(items: readonly Worn[] | undefined): boolean {
	const main = items?.find((i) => i.slot === "MAIN_HAND");
	return !!main && isFishingPole(main);
}

/** Whether gear just read should be set aside for the gear kept: it's fishing gear and the kept gear isn't. */
export function keepBuild(incoming: readonly Worn[] | undefined, kept: readonly Worn[] | undefined): boolean {
	return fishing(incoming) && !!kept?.length && !fishing(kept);
}
