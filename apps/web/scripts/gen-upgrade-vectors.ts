// Writes apps/addon/tests/upgrade_vectors.json: shared cases for the
// gear-upgrade rules, run by both apps/web/convex/upgrades.test.ts and the
// addon's Lua port (apps/addon/tests/upgrades_test.lua). Inputs are written
// here by hand (test rules, not the real weights); expected values come from
// shared/upgrades.ts. After changing the rules: change both implementations,
// run this, review the diff, and run both test suites.
//   node scripts/gen-upgrade-vectors.ts
import { writeFileSync } from "node:fs";
import { judge, type Rules, scoreItem, suggest, usableAt } from "../convex/shared/upgrades.ts";

const rules = {
	upgrade: 0.15,
	maybe: 0.03,
	levelsAhead: 3,
	activeDays: 14,
	minFit: 0.3,
	preferBestFrom: 40,
	preferBestFactor: 0.8,
	preferStep: 0.05,
	minBase: 1,
	minGain: 1,
	offTypeFactors: [
		[1, 0.7],
		[20, 0.6],
		[40, 0.5],
		[60, 0.3],
	],
	points: { ATTACK_POWER: 0.5, EXTRA_ARMOR: 0.1 },
	specs: {
		"DRUID:1": { name: "Feral", w: { AGILITY: 1, STRENGTH: 0.9, STAMINA: 0.6, ARMOR: 0.05, ATTACK_POWER: 0.4 } },
		"DRUID:2": { name: "Restoration", w: { INTELLECT: 1, SPIRIT: 0.8, STAMINA: 0.5, ARMOR: 0.02 } },
		"WARRIOR:0": { name: "Arms", w: { STRENGTH: 1, AGILITY: 0.7, STAMINA: 0.6, ARMOR: 0.02, DPS: 8 } },
		// Priority stats (a player's own, up to five): losing any of them makes an upgrade only a possible one.
		"WARRIOR:0:STRENGTH,AGILITY,STAMINA,ARMOR": {
			name: "Str/Agi/Sta",
			w: { STRENGTH: 1, AGILITY: 0.7, STAMINA: 0.6, ARMOR: 0.02, DPS: 8 },
			stats: ["STRENGTH", "AGILITY", "STAMINA", "ARMOR"],
		},
		"MAGE:2:INTELLECT,SPELL_DAMAGE_DONE,STAMINA": {
			name: "Int/Spell dmg/Sta",
			w: { INTELLECT: 1, SPIRIT: 0.5, STAMINA: 0.6, SPELL_POWER: 1.3, SPELL_DAMAGE_DONE: 1.3, ARMOR: 0.02 },
			stats: ["INTELLECT", "SPELL_DAMAGE_DONE", "STAMINA"],
		},
		// A player's own list: Spirit last, worth little, but named (fit), so it never counts against an item.
		"DRUID:1:AGILITY,INTELLECT,SPIRIT": {
			name: "Agi/Int/Spi",
			w: { AGILITY: 1, INTELLECT: 0.5, SPIRIT: 0.1, STAMINA: 0.6, ARMOR: 0.02 },
			stats: ["AGILITY", "INTELLECT", "SPIRIT"],
			fit: ["AGILITY", "INTELLECT", "SPIRIT"],
		},
		"WARRIOR:1": {
			name: "Fury",
			w: { STRENGTH: 1, AGILITY: 0.8, STAMINA: 0.6, ARMOR: 0.02, ATTACK_POWER: 0.45, DPS: 4.5, OFFHAND_DPS: 1.4 },
		},
		"MAGE:2": { name: "Frost", w: { INTELLECT: 1, SPIRIT: 0.5, STAMINA: 0.6, SPELL_POWER: 1.3, ARMOR: 0.02 } },
		"HUNTER:0": {
			name: "Beast Mastery",
			w: { AGILITY: 1, STAMINA: 0.5, INTELLECT: 0.3, ARMOR: 0.02, RANGED_DPS: 3, DPS: 0.5 },
		},
	},
	classes: {
		"1": {
			armor: { "1": 1, "2": 1, "3": 1, "4": 40, "6": 1 },
			weapons: { "0": 1, "1": 1, "2": 1, "7": 1, "8": 1, "15": 1 },
			dualWield: 20,
		},
		"3": {
			armor: { "1": 1, "2": 1, "3": 40 },
			weapons: { "0": 1, "1": 1, "2": 1, "15": 1, "16": 1 },
			dualWield: 20,
			unlessChosen: [16],
		},
		"8": { armor: { "1": 1 }, weapons: { "10": 1, "15": 1, "19": 1 } },
		"11": { armor: { "1": 1, "2": 1, "8": 1 }, weapons: { "4": 1, "5": 1, "10": 1, "15": 1 } },
	},
} as unknown as Rules;
const items: Record<string, any> = {
	leatherAgiGloves: {
		invType: "HAND",
		cls: 4,
		subclass: 2,
		stats: { AGILITY: 6, STAMINA: 4 },
		armor: 60,
		reqLevel: 20,
	},
	clothIntHead: {
		invType: "HEAD",
		cls: 4,
		subclass: 1,
		stats: { INTELLECT: 8, SPELL_POWER: 5 },
		armor: 30,
		reqLevel: 24,
	},
	greatsword: {
		invType: "2HWEAPON",
		cls: 2,
		subclass: 8,
		stats: { STRENGTH: 10, STAMINA: 6 },
		dps: 20.5,
		reqLevel: 25,
	},
	agiRing: { invType: "FINGER", cls: 4, subclass: 0, stats: { AGILITY: 5, STAMINA: 3 }, unique: true },
	mailChest: { invType: "CHEST", cls: 4, subclass: 3, stats: { AGILITY: 8, STAMINA: 8 }, armor: 200, reqLevel: 40 },
	leatherChest: { invType: "CHEST", cls: 4, subclass: 2, stats: { STRENGTH: 8, STAMINA: 8 }, armor: 100, reqLevel: 40 },
	dagger: { invType: "WEAPON", cls: 2, subclass: 15, stats: { AGILITY: 4 }, dps: 12 },
	shield: { invType: "SHIELD", cls: 4, subclass: 6, stats: { STAMINA: 5 }, armor: 300 },
	bow: { invType: "RANGED", cls: 2, subclass: 2, stats: { AGILITY: 3 }, dps: 15, reqLevel: 21 },
	paladinRing: { invType: "FINGER", cls: 4, subclass: 0, stats: { STRENGTH: 6 }, classes: [2] },
	fireCloak: { invType: "CLOAK", cls: 4, subclass: 1, stats: { FIRE_RESISTANCE: 10 }, armor: 20 },
	plainCloak: { invType: "CLOAK", cls: 4, subclass: 0, stats: {}, armor: 20 },
	apMace: { invType: "2HWEAPON", cls: 2, subclass: 5, stats: { ATTACK_POWER: 32, EXTRA_ARMOR: 60 }, dps: 27.7 },
	spiritRobe: { invType: "ROBE", cls: 4, subclass: 1, stats: { SPIRIT: 9, INTELLECT: 3 }, armor: 40 },
	strMailGloves: { invType: "HAND", cls: 4, subclass: 3, stats: { STRENGTH: 6, AGILITY: 2 }, armor: 90 },
	mailAgiGloves: { invType: "HAND", cls: 4, subclass: 3, stats: { AGILITY: 6, STAMINA: 4 }, armor: 90 },
	thinStrGloves: { invType: "HAND", cls: 4, subclass: 3, stats: { STRENGTH: 9, STAMINA: 3 }, armor: 40 },
	agiRingPlain: { invType: "FINGER", cls: 4, subclass: 0, stats: { AGILITY: 7, STAMINA: 2 } },
	clothAgiShoulders: { invType: "SHOULDER", cls: 4, subclass: 1, stats: { AGILITY: 6, STAMINA: 4 }, armor: 25 },
	plainClothHelm: { invType: "HEAD", cls: 4, subclass: 1, stats: {}, armor: 30 },
	plainLeatherHelm: { invType: "HEAD", cls: 4, subclass: 2, stats: {}, armor: 60 },
	clothIntBracers: { invType: "WRIST", cls: 4, subclass: 1, stats: { INTELLECT: 3 }, armor: 14 },
	leatherIntSpiBracers: { invType: "WRIST", cls: 4, subclass: 2, stats: { INTELLECT: 3, SPIRIT: 4 }, armor: 39 },
	tinyIntGloves: { invType: "HAND", cls: 4, subclass: 1, stats: { INTELLECT: 4 }, armor: 10 },
	throwingKnife: { invType: "THROWN", cls: 2, subclass: 16, stats: {}, dps: 20 },
};
const SEEN = 2_000_000;
const members: Record<string, any> = {
	Brisket: {
		name: "Brisket",
		classId: 11,
		level: 30,
		spec: "DRUID:1",
		spec2: "DRUID:2",
		seen: SEEN,
		slots: { 1: 10, 5: 20, 10: 8, 11: 12, 12: 5 },
		slots2: { 1: 5, 5: 4, 10: 3, 11: 2, 12: 2 },
		worn: [5001, 5003],
	},
	Miller: {
		name: "Miller",
		classId: 1,
		level: 22,
		spec: "WARRIOR:0",
		seen: SEEN,
		slots: { 5: 18, 10: 2, 16: 150 },
		th: true,
	},
	Rage: { name: "Rage", classId: 1, level: 45, spec: "WARRIOR:1", seen: SEEN, slots: { 5: 10, 16: 60, 17: 10 } },
	Frosty: { name: "Frosty", classId: 8, level: 30, spec: "MAGE:2", seen: SEEN, slots: { 1: 5, 10: 4 } },
	Arrow: { name: "Arrow", classId: 3, level: 39, spec: "HUNTER:0", seen: SEEN, slots: { 5: 8, 18: 40, 16: 10 } },
	Stale: { name: "Stale", classId: 11, level: 30, spec: "DRUID:1", seen: 0, slots: {} },
	// Priority stats on what they wear (keys): Strength and armor on the gloves, a Strength ring.
	Sturdy: {
		name: "Sturdy",
		classId: 1,
		level: 30,
		spec: "WARRIOR:0:STRENGTH,AGILITY,STAMINA,ARMOR",
		seen: SEEN,
		slots: { 10: 5, 11: 3, 12: 6 },
		keys: { 10: { STRENGTH: 3, ARMOR: 60 }, 11: { STRENGTH: 3 }, 12: { STAMINA: 10 } },
	},
	// Spell power on the hat counts as spell damage.
	Sparky: {
		name: "Sparky",
		classId: 8,
		level: 30,
		spec: "MAGE:2:INTELLECT,SPELL_DAMAGE_DONE,STAMINA",
		seen: SEEN,
		slots: { 1: 5 },
		keys: { 1: { INTELLECT: 2, SPELL_DAMAGE_DONE: 4 } },
	},
	// Players' armor and weapon type preferences (soft: others count less; strict: left out).
	Chainmail: {
		name: "Chainmail",
		classId: 1,
		level: 45,
		spec: "WARRIOR:1",
		seen: SEEN,
		slots: { 5: 10, 16: 60, 17: 10 },
		armorPref: 3,
	},
	MailOnly: {
		name: "MailOnly",
		classId: 1,
		level: 45,
		spec: "WARRIOR:1",
		seen: SEEN,
		slots: { 5: 10, 16: 60, 17: 10 },
		armorPref: 3,
		armorStrict: true,
		weaponPref: 15,
		weaponStrict: true,
	},
	Stabby: {
		name: "Stabby",
		classId: 1,
		level: 45,
		spec: "WARRIOR:1",
		seen: SEEN,
		slots: { 5: 10, 16: 60, 17: 10 },
		weaponPref: 15,
	},
	// Several preferred types, first to last: each step down counts preferStep less.
	LeatherThenMail: {
		name: "LeatherThenMail",
		classId: 1,
		level: 45,
		spec: "WARRIOR:1",
		seen: SEEN,
		slots: { 5: 10, 16: 60, 17: 10 },
		armorPref: 2,
		armorPrefs: [2, 3],
	},
	MacesSwordsBows: {
		name: "MacesSwordsBows",
		classId: 1,
		level: 45,
		spec: "WARRIOR:1",
		seen: SEEN,
		slots: { 5: 10, 16: 60, 17: 10, 18: 10 },
		weaponPref: 5,
		weaponPrefs: [5, 8, 2],
		weaponStrict: true,
	},
	// Removed an item from their suggestions on the site.
	Picky: {
		name: "Picky",
		classId: 11,
		level: 30,
		spec: "DRUID:1",
		seen: SEEN,
		slots: { 10: 8 },
		dismissed: [6001],
	},
	// Lists thrown weapons, which hunters otherwise never get (unlessChosen).
	Thrower: {
		name: "Thrower",
		classId: 3,
		level: 39,
		spec: "HUNTER:0",
		seen: SEEN,
		slots: { 5: 8, 18: 40, 16: 10 },
		weaponPref: 2,
		weaponPrefs: [2, 16],
	},
	// Their own list ends in Spirit; cloth bracers worn (Int 3, armor 14, cloth counting less: 1.5).
	Spirited: {
		name: "Spirited",
		classId: 11,
		level: 27,
		spec: "DRUID:1:AGILITY,INTELLECT,SPIRIT",
		seen: SEEN,
		slots: { 9: 1.5 },
		keys: { 9: { INTELLECT: 3 } },
	},
	// The same without Spirit on the list (Feral's built-in weights: no Spirit, no Intellect).
	Spiritless: { name: "Spiritless", classId: 11, level: 27, spec: "DRUID:1", seen: SEEN, slots: { 9: 1.5 } },
	// A low-level hunter with no head or shoulders.
	Cub: { name: "Cub", classId: 3, level: 12, spec: "HUNTER:0", seen: SEEN, slots: { 5: 2 } },
	Bowman: {
		name: "Bowman",
		classId: 3,
		level: 39,
		spec: "HUNTER:0",
		seen: SEEN,
		slots: { 5: 8, 18: 40, 16: 10 },
		weaponPref: 2,
		weaponStrict: true,
	},
};
const verdictOut = (v: any) =>
	v
		? {
				kind: v.kind,
				gain: v.gain,
				spec: v.spec,
				at: v.at ?? null,
				second: v.second ?? false,
				against: v.against,
				off: v.off ?? null,
			}
		: null;
const judgeCases: [string, string, string, number?][] = [
	["leather agility gloves: feral upgrade", "leatherAgiGloves", "Brisket"],
	["leather agility gloves: mage can't wear leather", "leatherAgiGloves", "Frosty"],
	["leather agility gloves: a warrior in mail, a maybe at most", "leatherAgiGloves", "Miller"],
	["cloth int head: mage upgrade", "clothIntHead", "Frosty"],
	["cloth int head: feral doesn't suit, resto second spec", "clothIntHead", "Brisket"],
	["two-hander vs main hand plus off hand", "greatsword", "Rage"],
	["two-hander for a level 22: at 25", "greatsword", "Miller"],
	["unique ring already worn", "agiRing", "Brisket", 5001],
	["ring vs the weaker ring", "agiRing", "Brisket", 5002],
	["mail at 40: hunter at 39 is a maybe at 40", "mailChest", "Arrow"],
	["leather on a level 45 warrior: two types below plate, too little left", "leatherChest", "Rage"],
	["mail on a level 45 warrior, too", "mailChest", "Rage"],
	["one-hander can go in the off hand for dual wielders", "dagger", "Rage"],
	["shield with a two-hander means losing it", "shield", "Miller"],
	["bow: hunter's ranged slot", "bow", "Arrow"],
	["class-restricted ring", "paladinRing", "Miller"],
	["resistance cloak suits nobody", "fireCloak", "Brisket"],
	["plain cloak over an empty slot", "plainCloak", "Frosty"],
	["spirit robe only fits the second spec", "spiritRobe", "Brisket"],
	["attack power and bonus armor count as fewer stat points", "apMace", "Brisket"],
	["prefers mail: mail on a level 45 warrior counts in full", "mailChest", "Chainmail"],
	["prefers mail: leather counts by level, too little left", "leatherChest", "Chainmail"],
	["mail only: leather left out", "leatherChest", "MailOnly"],
	["daggers only: a greatsword left out", "greatsword", "MailOnly"],
	["daggers only: a dagger is fine", "dagger", "MailOnly"],
	["prefers daggers: a greatsword counts less", "greatsword", "Stabby"],
	["bows only: melee weapons aren't covered", "dagger", "Bowman"],
	["bows only: a bow", "bow", "Bowman"],
	["leather then mail: leather counts in full", "leatherChest", "LeatherThenMail"],
	["leather then mail: mail second, a little less", "mailChest", "LeatherThenMail"],
	["maces, swords, bows only: a two-handed mace first", "apMace", "MacesSwordsBows"],
	["maces, swords, bows only: a greatsword second", "greatsword", "MacesSwordsBows"],
	["maces, swords, bows only: a dagger left out", "dagger", "MacesSwordsBows"],
	["maces, swords, bows only: a bow first among ranged", "bow", "MacesSwordsBows"],
	["more of every priority stat: an upgrade", "strMailGloves", "Sturdy"],
	["less armor than worn: a possible upgrade", "thinStrGloves", "Sturdy"],
	["gives up Strength for Agility: a possible upgrade", "mailAgiGloves", "Sturdy"],
	["ring vs the weaker ring: its Strength is given up", "agiRingPlain", "Sturdy"],
	["spell power counts as spell damage: an upgrade", "clothIntHead", "Sparky"],
	["no priority stats known: an upgrade as before", "clothIntHead", "Frosty"],
	["removed by the player: never suggested", "leatherAgiGloves", "Picky", 6001],
	["removed something else: still an upgrade", "leatherAgiGloves", "Picky", 6002],
	["already worn: not suggested again", "clothIntHead", "Brisket", 5003],
	["already worn, a ring: a second copy can still go in the other slot", "agiRingPlain", "Brisket", 5001],
	["too small a gain: under minGain points", "tinyIntGloves", "Frosty"],
	["no preference: cloth on a hunter is a maybe at most", "clothAgiShoulders", "Cub"],
	["no preference: cloth on a level 39 hunter counts less still", "clothAgiShoulders", "Arrow"],
	["leather then mail: cloth is a maybe at most", "clothAgiShoulders", "LeatherThenMail"],
	["plain armor for an empty slot: empty slot", "plainLeatherHelm", "Cub"],
	["plain armor over something worn: nothing", "plainClothHelm", "Frosty"],
	["plain armor of a type they don't want, empty slot", "plainClothHelm", "Miller"],
	["thrown weapon for a hunter: left out", "throwingKnife", "Arrow"],
	["thrown weapon for a hunter who lists it", "throwingKnife", "Thrower"],
	["low-weight Spirit on their list doesn't count against the item: an upgrade", "leatherIntSpiBracers", "Spirited"],
	["Spirit and Intellect off the list: doesn't suit", "leatherIntSpiBracers", "Spiritless"],
];
const cases = judgeCases.map(([name, item, member, itemId]) => ({
	name,
	item,
	member,
	...(itemId ? { itemId } : {}),
	expect: verdictOut(judge(items[item], members[member], rules, itemId)),
}));
const scoreCases: [string, string, number, boolean][] = [
	["leatherAgiGloves", "DRUID:1", 30, false],
	["greatsword", "WARRIOR:1", 45, false],
	["leatherChest", "WARRIOR:1", 45, false],
	["dagger", "WARRIOR:1", 45, true],
	["apMace", "WARRIOR:1", 45, false],
	["bow", "HUNTER:0", 39, false],
	["clothIntHead", "MAGE:2", 30, false],
	["clothAgiShoulders", "HUNTER:0", 12, false],
	["clothAgiShoulders", "HUNTER:0", 39, false],
	["clothAgiShoulders", "HUNTER:0", 60, false],
	["leatherChest", "WARRIOR:1", 30, false],
	["leatherAgiGloves", "DRUID:1", 45, false],
];
const scores = scoreCases.map(([item, spec, level, offHand]) => {
	const classId = { DRUID: 11, WARRIOR: 1, HUNTER: 3, MAGE: 8 }[spec.split(":")[0]]!;
	return {
		item,
		spec,
		classId,
		level,
		offHand,
		expect: scoreItem(items[item], rules.specs[spec].w, level, rules.classes[classId], rules, offHand),
	};
});
const usable = [
	["greatsword", "Miller"],
	["mailChest", "Arrow"],
	["mailChest", "Frosty"],
	["bow", "Miller"],
	["dagger", "Brisket"],
].map(([item, member]) => ({ item, member, expect: usableAt(items[item], members[member], rules) ?? null }));
// Who the suggest cases rank (the members with preferences have judge cases of their own).
const suggestMembers = ["Brisket", "Miller", "Rage", "Frosty", "Arrow", "Stale", "Sturdy", "Cub"];
const suggestCases = [
	{ name: "agility gloves, everyone", item: "leatherAgiGloves", now: SEEN + 3600, skip: [], max: 3 },
	{ name: "own characters skipped", item: "leatherAgiGloves", now: SEEN + 3600, skip: ["Arrow"], max: 3 },
	{ name: "inactive members skipped", item: "plainCloak", now: SEEN + 20 * 86400, skip: [], max: 3 },
	{ name: "plain cloak", item: "plainCloak", now: SEEN + 3600, skip: [], max: 3 },
	{ name: "two-hander: upgrades before maybes", item: "greatsword", now: SEEN + 3600, skip: [], max: 3 },
	{ name: "agility gloves: upgrades before maybes", item: "leatherAgiGloves", now: SEEN + 3600, skip: [], max: 6 },
	{ name: "plain helm: empty slots only", item: "plainLeatherHelm", now: SEEN + 3600, skip: [], max: 6 },
	{ name: "mail gloves: possible upgrades after upgrades", item: "mailAgiGloves", now: SEEN + 3600, skip: [], max: 6 },
].map((c) => ({
	...c,
	expect: suggest(
		items[c.item],
		suggestMembers.map((n) => members[n]),
		rules,
		{ now: c.now, skip: c.skip, max: c.max },
	).map((p) => `${p.member.name}:${p.verdict.kind}`),
}));
const out = {
	_comment:
		"Shared cases for the gear-upgrade rules: apps/web/convex/upgrades.test.ts runs them against shared/upgrades.ts, apps/addon/tests/upgrades_test.lua against Guildie/Upgrades.lua. Rules and weights here are test values, not the real table (shared/weights.ts). Expected values come from the TypeScript: apps/web/scripts/gen-upgrade-vectors.ts writes this file.",
	rules,
	items,
	members,
	judge: cases,
	scores,
	usable,
	suggestMembers,
	suggest: suggestCases,
};
writeFileSync(
	new URL("../../addon/tests/upgrade_vectors.json", import.meta.url),
	`${JSON.stringify(out, null, "\t")}\n`,
);
console.log(
	`Wrote ${cases.length} judge, ${scores.length} score, ${usable.length} usable and ${suggestCases.length} suggest cases.`,
);
