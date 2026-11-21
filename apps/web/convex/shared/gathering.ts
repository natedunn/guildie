// Who can gather an item, and from what skill: for the Waylaid Crates and
// Supplies on item tooltips (waylaidUse.ts), whose contents are often raw
// herbs, ore, leather or fish rather than something a recipe makes.
//
// Hand-written: the game's files don't link a herb node or a mob to what it
// drops (loot is on the server). The skills are Classic's, which Forever
// kept as far as we know; correct one here if the game disagrees.
// - Herbalism and Mining: the skill the node asks for.
// - Skinning: the lowest skill that skins the mobs it mostly comes from
//   (5 per mob level past 20).
// - Fishing: where it's caught varies, so no skill (0): any fisher.
// - Enchanting: disenchanting, by the item levels it comes from (Classic's
//   table: 1 up to item level 20, then 25 more per 5 levels).
// Only items a Waylaid Crate or Supplies item takes are listed.

export type Gathering = { profession: string; skill: number };

const herb = (skill: number): Gathering => ({ profession: "Herbalism", skill });
const ore = (skill: number): Gathering => ({ profession: "Mining", skill });
const skin = (skill: number): Gathering => ({ profession: "Skinning", skill });
const fish: Gathering = { profession: "Fishing", skill: 0 };
const disenchant = (skill: number): Gathering => ({ profession: "Enchanting", skill });

/** Item id -> how it's gathered. */
export const GATHERING: Record<number, Gathering> = {
	// Herbs
	2447: herb(1), // Peacebloom
	765: herb(1), // Silverleaf
	2449: herb(15), // Earthroot
	785: herb(50), // Mageroyal
	2450: herb(70), // Briarthorn
	2452: herb(50), // Swiftthistle (from Mageroyal and Briarthorn)
	3820: herb(85), // Stranglekelp
	2453: herb(100), // Bruiseweed
	3355: herb(115), // Wild Steelbloom
	3369: herb(120), // Grave Moss
	3356: herb(125), // Kingsblood
	3357: herb(150), // Liferoot
	3818: herb(160), // Fadeleaf
	3821: herb(170), // Goldthorn
	3358: herb(185), // Khadgar's Whisker
	3819: herb(195), // Wintersbite
	4625: herb(205), // Firebloom
	8831: herb(210), // Purple Lotus
	8836: herb(220), // Arthas' Tears
	8838: herb(230), // Sungrass
	8839: herb(235), // Blindweed
	8845: herb(245), // Ghost Mushroom
	8846: herb(250), // Gromsblood
	13464: herb(260), // Golden Sansam
	13463: herb(270), // Dreamfoil
	13465: herb(280), // Mountain Silversage
	13466: herb(285), // Plaguebloom
	13467: herb(290), // Icecap
	// Ore and stone
	2770: ore(1), // Copper Ore
	2835: ore(1), // Rough Stone
	2771: ore(65), // Tin Ore
	2775: ore(75), // Silver Ore
	2772: ore(125), // Iron Ore
	2776: ore(155), // Gold Ore
	3858: ore(175), // Mithril Ore
	7911: ore(230), // Truesilver Ore
	11370: ore(230), // Dark Iron Ore
	10620: ore(245), // Thorium Ore
	// Leather and hides
	2318: skin(1), // Light Leather
	2319: skin(100), // Medium Leather
	4234: skin(150), // Heavy Leather
	4235: skin(150), // Heavy Hide
	4304: skin(200), // Thick Leather
	8169: skin(200), // Thick Hide
	8170: skin(250), // Rugged Leather
	// Fish
	6290: fish, // Brilliant Smallfish
	4594: fish, // Rockscale Cod
	// Disenchanting
	10940: disenchant(1), // Strange Dust
	10939: disenchant(1), // Greater Magic Essence
	10978: disenchant(1), // Small Glimmering Shard
	11084: disenchant(25), // Large Glimmering Shard
	11083: disenchant(50), // Soul Dust
	11082: disenchant(50), // Greater Astral Essence
	11138: disenchant(50), // Small Glowing Shard
	11139: disenchant(75), // Large Glowing Shard
	11137: disenchant(100), // Vision Dust
	11135: disenchant(100), // Greater Mystic Essence
	11177: disenchant(100), // Small Radiant Shard
	11178: disenchant(125), // Large Radiant Shard
	11176: disenchant(150), // Dream Dust
	11175: disenchant(150), // Greater Nether Essence
	14343: disenchant(150), // Small Brilliant Shard
	14344: disenchant(175), // Large Brilliant Shard
};

/** How an item is gathered, if it is. */
export function gathering(itemId: number): Gathering | undefined {
	return GATHERING[itemId];
}
