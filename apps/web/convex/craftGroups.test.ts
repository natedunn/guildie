import assert from "node:assert/strict";
import { test } from "node:test";
import { craftGroup, supplyType } from "./shared/craftGroups.ts";

const item = (kind: string, ...lines: string[]) => ({ kind, tooltip: lines.map((left) => ({ left })) });

test("worn items are gear, enchants and permanent enhancements are enchants, the rest supplies", () => {
	assert.equal(
		craftGroup({ profession: "Tailoring", name: "Pearl-clasped Cloak", item: item("Cloth", "Back", "+3 Intellect") }),
		"gear",
	);
	assert.equal(craftGroup({ profession: "Engineering", name: "Gnomish Goggles", item: item("Cloth", "Head") }), "gear");
	assert.equal(
		craftGroup({ profession: "Enchanting", name: "Enchant Bracer - Lesser Intellect", item: null }),
		"enchants",
	);
	assert.equal(
		craftGroup({ profession: "Leatherworking", name: "Medium Armor Kit", item: item("Permanent") }),
		"enchants",
	);
	assert.equal(
		craftGroup({ profession: "Alchemy", name: "Greater Healing Potion", item: item("Potions") }),
		"supplies",
	);
	assert.equal(
		craftGroup({ profession: "Tailoring", name: "Mageweave Bag", item: item("Bag", "12 Slot Bag") }),
		"supplies",
	);
	assert.equal(craftGroup({ profession: "Fishing", name: "Raw Sagefish", item: item("Cooking") }), null);
});

test("supply types: by subclass, and Blizzard's Other by profession and name", () => {
	assert.equal(supplyType({ profession: "Alchemy", name: "Elixir of Agility", item: item("Elixirs") }), "potions");
	assert.equal(
		supplyType({ profession: "First Aid", name: "Dense Runecloth Bandage", item: item("Other") }),
		"bandages",
	);
	assert.equal(supplyType({ profession: "Cooking", name: "Smoked Redgill", item: item("Other") }), "food");
	assert.equal(
		supplyType({ profession: "Blacksmithing", name: "Dense Sharpening Stone", item: item("Other") }),
		"oils",
	);
	assert.equal(supplyType({ profession: "Enchanting", name: "Lesser Mana Oil", item: item("Enchanting") }), "oils");
	assert.equal(
		supplyType({ profession: "Enchanting", name: "Small Glowing Shard", item: item("Enchanting") }),
		"materials",
	);
	assert.equal(
		supplyType({ profession: "Leatherworking", name: "Light Leather Quiver", item: item("Quiver") }),
		"bags",
	);
	assert.equal(supplyType({ profession: "Engineering", name: "Thorium Grenade", item: item("Explosives") }), "devices");
	assert.equal(supplyType({ profession: "Engineering", name: "Thorium Shells", item: item("Bullet") }), "ammo");
	assert.equal(
		supplyType({ profession: "Enchanting", name: "Enchanted Sigil: Innovation", item: item("Other") }),
		"other",
	);
});
