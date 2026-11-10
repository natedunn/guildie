import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { itemInfoFromTooltip } from "./shared/itemInfo.ts";
import { CLASS_RULES } from "./shared/proficiencies.ts";
import {
	explain,
	judge,
	type Rules,
	scoreItem,
	specsOf,
	suggest,
	upgradeMember,
	upgradeRules,
	usableAt,
} from "./shared/upgrades.ts";
import { SPECS } from "./shared/weights.ts";

// The shared cases: the addon's Lua port runs the same file
// (apps/addon/tests/upgrades_test.lua).
const vectors = JSON.parse(readFileSync(new URL("../../addon/tests/upgrade_vectors.json", import.meta.url), "utf8"));
const rules = vectors.rules as Rules;

const close = (actual: number, expected: number, what: string) =>
	assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual} vs ${expected}`);

test("shared vectors: judge", () => {
	for (const c of vectors.judge) {
		const v = judge(vectors.items[c.item], vectors.members[c.member], rules, c.itemId);
		if (c.expect === null) {
			assert.equal(v, undefined, c.name);
			continue;
		}
		assert.ok(v, c.name);
		assert.equal(v.kind, c.expect.kind, c.name);
		close(v.gain, c.expect.gain, c.name);
		assert.equal(v.spec, c.expect.spec, c.name);
		assert.equal(v.at ?? null, c.expect.at, c.name);
		assert.equal(v.second ?? false, c.expect.second, c.name);
		assert.deepEqual(v.against, c.expect.against, c.name);
	}
});

test("shared vectors: scores, usable levels, suggestions", () => {
	for (const c of vectors.scores) {
		const s = scoreItem(
			vectors.items[c.item],
			rules.specs[c.spec].w,
			c.level,
			rules.classes[c.classId],
			rules,
			c.offHand,
		);
		close(s.score, c.expect.score, `${c.item} score`);
		close(s.stat, c.expect.stat, `${c.item} stat`);
		assert.equal(s.total, c.expect.total, `${c.item} total`);
	}
	for (const c of vectors.usable) {
		assert.equal(
			usableAt(vectors.items[c.item], vectors.members[c.member], rules) ?? null,
			c.expect,
			`${c.item} for ${c.member}`,
		);
	}
	for (const c of vectors.suggest) {
		const picks = suggest(vectors.items[c.item], Object.values(vectors.members), rules, {
			now: c.now,
			skip: c.skip,
			max: c.max,
		});
		assert.deepEqual(
			picks.map((p) => `${p.member.name}:${p.verdict.kind}`),
			c.expect,
			c.name,
		);
	}
});

test("weights table: every class has three trees and rules", () => {
	for (const classId of [1, 2, 3, 4, 5, 7, 8, 9, 11]) assert.ok(CLASS_RULES[classId], `class ${classId}`);
	for (const [token, trees] of Object.entries(SPECS)) {
		assert.equal(trees.length, 3, token);
		for (const t of trees)
			for (const [k, v] of Object.entries(t.w)) assert.ok(v >= 0 && v <= 10, `${token} ${t.name} ${k}`);
	}
	const real = upgradeRules();
	assert.equal(Object.keys(real.specs).length, 27);
	assert.equal(real.specs["DRUID:1"].name, "Feral");
});

test("item info from Blizzard's tooltip lines", () => {
	const staff = itemInfoFromTooltip([
		{ left: "Binds when equipped" },
		{ left: "Two-Hand", right: "Staff" },
		{ left: "65 - 99 Damage", right: "Speed 3.20" },
		{ left: "(25.6 damage per second)" },
		{ left: "+6 Stamina" },
		{ left: "+15 Spirit", color: "#00ff00" } as { left: string },
		{ left: "Durability 96 / 100" },
		{ left: "Requires Level 26" },
	]);
	assert.deepEqual(staff, {
		invType: "2HWEAPON",
		cls: 2,
		subclass: 10,
		stats: { STAMINA: 6, SPIRIT: 15 },
		dps: 25.6,
		reqLevel: 26,
	});

	const ring = itemInfoFromTooltip([
		{ left: "Binds when picked up" },
		{ left: "Unique-Equipped" },
		{ left: "Finger" },
		{ left: "+4 Intellect" },
		{ left: "-2 Spirit" },
	]);
	assert.deepEqual(ring, { invType: "FINGER", cls: 4, subclass: 0, stats: { INTELLECT: 4, SPIRIT: -2 }, unique: true });

	const head = itemInfoFromTooltip([
		{ left: "Head", right: "Cloth" },
		{ left: "43 Armor" },
		{ left: "Equip: Increases damage and healing done by magical spells and effects by up to 8." },
		{ left: "Classes: Priest, Mage" },
	]);
	assert.deepEqual(head, {
		invType: "HEAD",
		cls: 4,
		subclass: 1,
		stats: { SPELL_POWER: 8 },
		armor: 43,
		classes: [5, 8],
	});

	assert.equal(
		itemInfoFromTooltip([{ left: "Kopf", right: "Stoff" }, { left: "+5 Ausdauer" }]),
		undefined,
		"not English: unknown",
	);
	assert.equal(itemInfoFromTooltip([{ left: "Ammo", right: "Arrow" }]), undefined, "ammo isn't compared");
	assert.equal(itemInfoFromTooltip([{ left: "Off Hand", right: "Shield" }])?.invType, "SHIELD");
	assert.equal(itemInfoFromTooltip([{ left: "Ranged", right: "Bow" }])?.invType, "RANGED");
	assert.equal(itemInfoFromTooltip([{ left: "One-Hand", right: "Axe" }])?.subclass, 0);
	assert.equal(itemInfoFromTooltip([{ left: "Two-Hand", right: "Axe" }])?.subclass, 1);
});

test("specs: most points, a second tree with 10+, the class default below 10", () => {
	const tree = (name: string, points: number) => ({ name, points, talents: [] });
	assert.deepEqual(specsOf(11, [tree("Feral Combat", 15), tree("Restoration", 5)]), {
		spec: "DRUID:1",
		spec2: undefined,
	});
	assert.deepEqual(specsOf(11, [tree("Restoration", 12), tree("Balance", 10)]), { spec: "DRUID:2", spec2: "DRUID:0" });
	assert.deepEqual(specsOf(5, [tree("Shadow Magic", 7), tree("Discipline", 2)]), {
		spec: "PRIEST:2",
		spec2: undefined,
	});
	assert.deepEqual(
		specsOf(5, [tree("Discipline", 9)]),
		{ spec: "PRIEST:2", spec2: undefined },
		"under 10: class default (Shadow)",
	);
	assert.deepEqual(
		specsOf(1, [tree("Arms", 10), tree("Protection", 10)]),
		{ spec: "WARRIOR:0", spec2: "WARRIOR:2" },
		"tie: the default wins",
	);
	assert.deepEqual(specsOf(1, undefined), { spec: "WARRIOR:0", spec2: undefined });
	// Talent ids place a tree whatever its name.
	assert.equal(specsOf(11, [{ name: "Whatever", points: 12, talents: [{ id: 134399 }] }])?.spec, "DRUID:1");
});

test("real weights: plausible picks", () => {
	const r = upgradeRules();
	const worn = (slot: string, lines: { left: string; right?: string }[], name = "Old") => ({
		slot,
		itemId: 1,
		name,
		quality: "UNCOMMON",
		itemLevel: 20,
		info: itemInfoFromTooltip(lines),
	});
	const member = (
		name: string,
		classId: number,
		level: number,
		trees: { name: string; points: number }[],
		equipment: ReturnType<typeof worn>[],
	) =>
		upgradeMember(
			{ name, classId, level, seenMs: 0, talentTrees: trees.map((t) => ({ ...t, talents: [] })), equipment },
			r,
		)!;
	const gloves = [
		worn(
			"HANDS",
			[{ left: "Hands", right: "Leather" }, { left: "40 Armor" }, { left: "+2 Agility" }],
			"Embossed Leather Gloves",
		),
	];
	const feral = member("Brisket", 11, 24, [{ name: "Feral Combat", points: 15 }], gloves);
	const rogue = member("Tir", 4, 24, [{ name: "Combat", points: 15 }], gloves);
	const mage = member(
		"Frosty",
		8,
		24,
		[{ name: "Frost", points: 15 }],
		[worn("HANDS", [{ left: "Hands", right: "Cloth" }, { left: "10 Armor" }])],
	);
	const warrior = member("Thalon", 1, 24, [{ name: "Fury", points: 15 }], gloves);
	const agiGloves = itemInfoFromTooltip([
		{ left: "Hands", right: "Leather" },
		{ left: "55 Armor" },
		{ left: "+6 Agility" },
		{ left: "+4 Stamina" },
	])!;
	const picks = suggest(agiGloves, [feral, rogue, mage, warrior], r, { now: 0 });
	// Biggest gain over what they wear first: the warrior's gloves were worth least to him.
	assert.deepEqual(
		picks.map((p) => `${p.member.name}:${p.verdict.kind}`),
		["Thalon:upgrade", "Tir:upgrade", "Brisket:upgrade"],
	);
	const brisket = picks.find((p) => p.member.name === "Brisket")!;
	assert.equal(
		explain(agiGloves, brisket.verdict, [gloves[0]], r),
		"+4 Agility, +4 Stamina over Embossed Leather Gloves",
	);

	const intHead = itemInfoFromTooltip([
		{ left: "Head", right: "Cloth" },
		{ left: "30 Armor" },
		{ left: "+7 Intellect" },
		{ left: "+3 Spirit" },
	])!;
	const v = judge(intHead, mage, r);
	assert.equal(v?.kind, "upgrade", "empty head slot");
	assert.equal(judge(intHead, rogue, r), undefined, "intellect doesn't suit a rogue");
	assert.match(explain(intHead, v!, [], r), /^\+7 Intellect, \+3 Spirit \(nothing worn there\)$/);
});

test("worn gear: two-hander flag, unique ids, estimates for unknown items", () => {
	const r = upgradeRules();
	const m = upgradeMember(
		{
			name: "Lich",
			classId: 5,
			level: 35,
			seenMs: 1_794_000_000_500,
			talentTrees: [{ name: "Discipline", points: 18, talents: [] }],
			equipment: [
				{
					slot: "MAIN_HAND",
					itemId: 10,
					name: "Staff",
					quality: "UNCOMMON",
					info: itemInfoFromTooltip([{ left: "Two-Hand", right: "Staff" }, { left: "+10 Intellect" }]),
				},
				{ slot: "FINGER_1", itemId: 11, name: "Ring", quality: "RARE", itemLevel: 30 },
				{ slot: "SHIRT", itemId: 12, name: "Shirt", quality: "COMMON" },
			],
		},
		r,
	)!;
	assert.equal(m.seen, 1_794_000_000);
	assert.equal(m.th, true);
	assert.deepEqual(m.worn, [10, 11]);
	assert.equal(m.slots[16], 10);
	assert.ok(m.slots[11] > 0, "unknown ring estimated from item level");
	assert.equal(m.slots[4], undefined, "shirts don't count");
	assert.equal(
		upgradeMember({ name: "X", classId: 5, level: 9, seenMs: 0, talentTrees: [], equipment: undefined }, r),
		undefined,
		"nothing known",
	);
});
