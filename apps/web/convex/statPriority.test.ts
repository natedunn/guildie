import assert from "node:assert/strict";
import { test } from "node:test";
import { itemInfoFromTooltip } from "./shared/itemInfo.ts";
import { PRIORITY_STATS, statPriority, validStats } from "./shared/statPriority.ts";
import { customWeights, judge, STAT_SHORT, specsFor, upgradeMember, upgradeRules } from "./shared/upgrades.ts";
import { SPECS } from "./shared/weights.ts";

test("every tree's priority: three known stats, each weighted in that tree", () => {
	for (const [token, trees] of Object.entries(SPECS)) {
		for (const t of trees) {
			assert.equal(new Set(t.stats).size, 3, `${token} ${t.name}`);
			for (const s of t.stats) {
				assert.ok(s in PRIORITY_STATS, `${token} ${t.name}: ${s} has no label`);
				assert.ok((t.w[s] ?? 0) > 0, `${token} ${t.name}: ${s} has no weight`);
			}
		}
	}
});

const tree = (name: string, points: number) => ({ name, points, talents: [] });

test("from the main talent tree, else the class's default", () => {
	// Paladin (2): 31 in Protection.
	assert.deepEqual(statPriority(2, [tree("Protection", 31), tree("Holy", 5)]), {
		tree: "Protection",
		stats: ["STAMINA", "STRENGTH", "INTELLECT"],
		chosen: false,
	});
	// No talents yet: Retribution.
	assert.equal(statPriority(2, [])?.tree, "Retribution");
	assert.equal(statPriority(6, []), undefined);
});

test("the player's choice wins: their own three, else another tree", () => {
	const talents = [tree("Protection", 31)];
	assert.deepEqual(statPriority(2, talents, { stats: ["INTELLECT", "SPIRIT", "STAMINA"] }), {
		stats: ["INTELLECT", "SPIRIT", "STAMINA"],
		chosen: true,
	});
	assert.equal(statPriority(2, talents, { tree: 0 })?.tree, "Holy");
	// Bad choices fall back to the talents.
	assert.equal(statPriority(2, talents, { tree: 7 })?.chosen, false);
	assert.equal(statPriority(2, talents, { stats: ["INTELLECT", "INTELLECT", "STAMINA"] })?.chosen, false);
	assert.equal(validStats(["NOPE", "SPIRIT", "STAMINA"]), undefined);
});

// Gear suggestions follow the same choice (shared/upgrades.ts specsFor).

test("every stat a priority can name has a short name for custom specs", () => {
	assert.deepEqual(Object.keys(STAT_SHORT).sort(), Object.keys(PRIORITY_STATS).sort());
});

test("own three stats bend the talents' weights: Enhancement as Strength, Intellect, Agility", () => {
	const r = upgradeRules();
	const enh = r.specs["SHAMAN:1"].w;
	const w = customWeights(enh, ["STRENGTH", "INTELLECT", "AGILITY"], r.points);
	assert.equal(w.STRENGTH, 1);
	assert.equal(w.INTELLECT, 0.8, "raised to second");
	assert.equal(w.AGILITY, 0.6, "third");
	assert.ok(w.CRIT_RATING <= 0.54 && w.CRIT_RATING < enh.CRIT_RATING, "crit left out: below the third");
	assert.equal(w.ATTACK_POWER, 0.27, "per plain stat point (half a point each)");
	assert.equal(w.DPS, enh.DPS, "weapon DPS stays");
	// Never more than the stat before it.
	const caster = customWeights(r.specs["MAGE:2"].w, ["INTELLECT", "SPELL_DAMAGE_DONE", "CRIT_RATING"], r.points);
	assert.ok(caster.INTELLECT >= caster.SPELL_DAMAGE_DONE && caster.SPELL_DAMAGE_DONE >= caster.CRIT_RATING);
	assert.equal(caster.SPELL_POWER, caster.SPELL_DAMAGE_DONE, "spell power counts as spell damage");
});

test("specsFor: talents, another tree, or a custom spec added to the rules", () => {
	const r = upgradeRules();
	const enhTalents = [tree("Enhancement", 21), tree("Restoration", 10)];
	assert.deepEqual(specsFor(7, enhTalents, undefined, r), {
		spec: "SHAMAN:1",
		spec2: "SHAMAN:2",
		talented: true,
	});
	assert.deepEqual(specsFor(7, enhTalents, { tree: 2 }, r), { spec: "SHAMAN:2", spec2: "SHAMAN:1" });
	// No talents yet: the chosen tree alone (the default tree isn't a second spec).
	assert.deepEqual(specsFor(7, [], { tree: 2 }, r), { spec: "SHAMAN:2", spec2: undefined });
	const own = specsFor(7, enhTalents, { stats: ["STRENGTH", "INTELLECT", "AGILITY"] }, r);
	assert.deepEqual(own, { spec: "SHAMAN:1:STRENGTH,INTELLECT,AGILITY", spec2: "SHAMAN:2" });
	assert.equal(r.specs[own!.spec].name, "Str/Int/Agi");
	assert.equal(r.specs[own!.spec].w.INTELLECT, 0.8);
	// Bad choices: the talents.
	assert.equal(specsFor(7, enhTalents, { stats: ["STRENGTH", "STRENGTH", "AGILITY"] }, r)?.spec, "SHAMAN:1");
});

test("a custom priority changes the verdict: Intellect gloves for an Enhancement shaman", () => {
	const r = upgradeRules();
	const worn = [
		{
			slot: "HANDS",
			itemId: 1,
			name: "Chain Gloves",
			quality: "UNCOMMON",
			info: itemInfoFromTooltip([{ left: "Hands", right: "Mail" }, { left: "90 Armor" }, { left: "+6 Strength" }]),
		},
	];
	const shaman = (statPriority?: { stats: string[] }) =>
		upgradeMember(
			{
				name: "Nate",
				classId: 7,
				level: 40,
				seenMs: 0,
				talentTrees: [tree("Enhancement", 31)],
				equipment: worn,
				statPriority,
			},
			r,
		)!;
	const intGloves = itemInfoFromTooltip([
		{ left: "Hands", right: "Mail" },
		{ left: "92 Armor" },
		{ left: "+4 Strength" },
		{ left: "+6 Intellect" },
	])!;
	assert.equal(judge(intGloves, shaman(), r)?.kind, "maybe", "talents' weights: a small gain");
	const custom = judge(intGloves, shaman({ stats: ["STRENGTH", "INTELLECT", "AGILITY"] }), r);
	assert.equal(custom?.kind, "upgrade", "Strength, Intellect, Agility: worth it");
	assert.equal(r.specs[custom!.spec].name, "Str/Int/Agi");
});
