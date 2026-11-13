import assert from "node:assert/strict";
import { test } from "node:test";
import { itemInfoFromTooltip } from "./shared/itemInfo.ts";
import { PRIORITY_STATS, statPriority, steepnessOf, validStats, validTiers } from "./shared/statPriority.ts";
import {
	customWeights,
	gearPrefs,
	judge,
	STAT_SHORT,
	specsFor,
	upgradeMember,
	upgradeRules,
} from "./shared/upgrades.ts";
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
		shares: [1, 0.6, 0.3],
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
		shares: [1, 0.8, 0.6],
		steepness: "balanced",
		chosen: true,
	});
	// Up to five, with their own shares.
	const five = ["INTELLECT", "SPIRIT", "STAMINA", "CRIT_RATING", "ARMOR"];
	assert.deepEqual(statPriority(2, talents, { stats: five, tiers: [1, 0.55, 0.35, 0.25, 0.2] })?.steepness, "steep");
	assert.deepEqual(statPriority(2, talents, { stats: five, tiers: [1, 0.7, 0.7, 0.3, 0.1] })?.steepness, "custom");
	const ten = [...five, "HIT_RATING", "STRENGTH", "AGILITY", "ATTACK_POWER", "MANA_REGENERATION"];
	assert.equal(statPriority(2, talents, { stats: ten })?.chosen, true, "ten is fine");
	assert.equal(statPriority(2, talents, { stats: ten })?.shares.length, 10);
	assert.equal(
		statPriority(2, talents, { stats: [...ten, "SPELL_HEALING_DONE"] })?.chosen,
		false,
		"eleven is too many",
	);
	assert.equal(statPriority(2, talents, { tree: 0 })?.tree, "Holy");
	// Bad choices fall back to the talents.
	assert.equal(statPriority(2, talents, { tree: 7 })?.chosen, false);
	assert.equal(statPriority(2, talents, { stats: ["INTELLECT", "INTELLECT", "STAMINA"] })?.chosen, false);
	assert.equal(validStats(["NOPE", "SPIRIT", "STAMINA"]), undefined);
});

test("shares: first 1, never more than the one before, else Balanced", () => {
	assert.deepEqual(validTiers([1, 0.7, 0.4], 3), [1, 0.7, 0.4]);
	assert.deepEqual(validTiers(undefined, 4), [1, 0.8, 0.6, 0.5]);
	assert.deepEqual(validTiers([1, 0.6, 0.7], 3), [1, 0.8, 0.6], "rising");
	assert.deepEqual(validTiers([0.9, 0.6, 0.5], 3), [1, 0.8, 0.6], "first not 1");
	assert.deepEqual(validTiers([1, 0.6, 0.05], 3), [1, 0.8, 0.6], "below the floor");
	assert.deepEqual(validTiers([1, 0.6], 3), [1, 0.8, 0.6], "wrong length");
	assert.equal(steepnessOf([1, 0.9, 0.8]), "even");
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
	// Up to ten stats all get a weight; a trade-off only looks at the first five.
	const ten = ["STRENGTH", "ATTACK_POWER", "INTELLECT", "AGILITY", "SPELL_DAMAGE_DONE"];
	const many = specsFor(
		7,
		enhTalents,
		{ stats: [...ten, "SPIRIT", "STAMINA", "CRIT_RATING", "HIT_RATING", "ARMOR"] },
		r,
	);
	assert.deepEqual(r.specs[many!.spec].stats, ten);
	assert.ok((r.specs[many!.spec].w.HIT_RATING ?? 0) > 0);
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
	assert.equal(judge(intGloves, shaman(), r), undefined, "talents' weights: under a point more, not worth a line");
	const custom = judge(intGloves, shaman({ stats: ["STRENGTH", "INTELLECT", "AGILITY"] }), r);
	assert.equal(custom?.kind, "tradeoff", "Strength, Intellect, Agility: worth it, but 2 Strength is given up");
	assert.equal(r.specs[custom!.spec].name, "Str/Int/Agi");
});

test("steepness: Agility pants for a Strength-first shaman are a trade-off, or nothing when steep", () => {
	const r = upgradeRules();
	const worn = [
		{
			slot: "LEGS",
			itemId: 1,
			name: "Sea Dog Britches",
			quality: "UNCOMMON",
			info: itemInfoFromTooltip([{ left: "Legs", right: "Leather" }, { left: "70 Armor" }, { left: "+4 Strength" }]),
		},
	];
	const shaman = (tiers?: number[]) =>
		upgradeMember(
			{
				name: "Todd",
				classId: 7,
				level: 25,
				seenMs: 0,
				talentTrees: [tree("Enhancement", 16)],
				equipment: worn,
				statPriority: { stats: ["STRENGTH", "INTELLECT", "AGILITY"], tiers },
			},
			r,
		)!;
	const pants = itemInfoFromTooltip([
		{ left: "Legs", right: "Leather" },
		{ left: "82 Armor" },
		{ left: "+8 Agility" },
	])!;
	assert.equal(judge(pants, shaman(), r)?.kind, "tradeoff", "Balanced: 8 Agility is worth more than 4 Strength");
	assert.equal(judge(pants, shaman([1, 0.55, 0.35]), r), undefined, "Steep: it isn't");
	assert.equal(judge(pants, shaman([1, 0.9, 0.8]), r)?.kind, "tradeoff", "Even: still gives up Strength");
	assert.notEqual(shaman([1, 0.55, 0.35]).spec, shaman().spec, "own shares: their own spec key");
	const better = itemInfoFromTooltip([
		{ left: "Legs", right: "Leather" },
		{ left: "82 Armor" },
		{ left: "+5 Strength" },
		{ left: "+3 Agility" },
	])!;
	assert.equal(judge(better, shaman(), r)?.kind, "upgrade", "more of every priority stat");
});

test("gear types: only types the class can use; strict leaves the rest out", () => {
	const r = upgradeRules();
	// Mage (8): daggers yes, plate no.
	assert.deepEqual(gearPrefs(8, { armor: { type: 4, strict: true }, weapon: { type: 15, strict: false } }, r), {
		weaponPref: 15,
	});
	assert.deepEqual(gearPrefs(7, { armor: { type: 3, strict: true } }, r), { armorPref: 3, armorStrict: true });
	assert.deepEqual(gearPrefs(7, undefined, r), {});

	// A level 45 shaman (mail from 40) who wants leather only: mail isn't suggested.
	const worn = [
		{
			slot: "CHEST",
			itemId: 1,
			name: "Old Vest",
			quality: "UNCOMMON",
			info: itemInfoFromTooltip([{ left: "Chest", right: "Leather" }, { left: "80 Armor" }, { left: "+4 Strength" }]),
		},
	];
	const shaman = (gearPreference?: { armor: { type: number; strict: boolean } }) =>
		upgradeMember(
			{
				name: "Nate",
				classId: 7,
				level: 45,
				seenMs: 0,
				talentTrees: [tree("Enhancement", 31)],
				equipment: worn,
				gearPreference,
			},
			r,
		)!;
	const mail = itemInfoFromTooltip([
		{ left: "Chest", right: "Mail" },
		{ left: "220 Armor" },
		{ left: "+9 Strength" },
		{ left: "+6 Stamina" },
	])!;
	assert.equal(judge(mail, shaman(), r)?.kind, "upgrade");
	assert.equal(judge(mail, shaman({ armor: { type: 2, strict: true } }), r), undefined, "leather only");
	const soft = judge(mail, shaman({ armor: { type: 2, strict: false } }), r);
	const free = judge(mail, shaman(), r);
	assert.ok(soft && free && soft.gain < free.gain, "leather preferred: mail counts less");
});
