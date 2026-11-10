import { FOREVER_TALENT_TREES, TALENT_TREE_BY_ID } from "./foreverTalents.ts";
import { type ItemInfo, WEAPON_INV_TYPES } from "./itemInfo.ts";
import { CLASS_RULES, type ClassRules } from "./proficiencies.ts";
import { CLASS_TOKENS, DEFAULT_TREE, SPECS, STAT_POINTS, THRESHOLDS, type Weights } from "./weights.ts";

// Gear-upgrade suggestions: would this item help a guildmate? A best guess
// from stat weights (weights.ts), not a sim.
//
// For each guildmate:
// 1. Skip if they can't use it: class restriction, armor or weapon type at
//    their level, required level more than `levelsAhead` above theirs, or
//    they already wear it and it's Unique. (Activity and "is it me" are the
//    callers' part.)
// 2. Spec: the tree with the most points (ties and characters with fewer than
//    `minSpecPoints`: the class's DEFAULT_TREE); a second spec is another tree
//    with `minSpecPoints` or more. Score = Σ weight × stat + armor and weapon
//    DPS terms. An item whose stats are of little use to a spec doesn't suit it.
// 3. Compared with what they wear where it would go: the weaker ring or
//    trinket, main hand plus off hand for a two-hander, and so on.
// 4. Upgrade: gain of `upgrade` or more, usable now, main spec. Maybe: a
//    smaller gain (from `maybe`), only the second spec, or usable within
//    `levelsAhead` levels ("at 24").
//
// The addon runs the same rules in Lua (apps/addon/Guildie/Upgrades.lua) with
// what helper.ts puts in GuildieData.lua: `upgradeRules()` once and each
// member's `UpgradeMember` (scores of what they wear, worked out here). The
// cases in apps/addon/tests/upgrade_vectors.json are run by both test suites
// so the two can't drift; change both together.
//
// Kept free of Convex imports so `node --test` can run it.

export type Rules = {
	upgrade: number;
	maybe: number;
	levelsAhead: number;
	activeDays: number;
	minFit: number;
	preferBestFrom: number;
	preferBestFactor: number;
	minBase: number;
	/** Stat -> plain stat points per point, for the raw total (missing: 1). */
	points: Record<string, number>;
	/** "DRUID:1" (class token, tree index) -> name and weights. */
	specs: Record<string, { name: string; w: Weights }>;
	classes: Record<number, ClassRules>;
};

/** Everything the decision needs about a guildmate. Compact: it goes into GuildieData.lua. */
export type UpgradeMember = {
	name: string;
	classId: number;
	level: number;
	/** Spec keys ("DRUID:1"). */
	spec: string;
	spec2?: string;
	/** Last seen (last logout, or the addon's newest read), Unix seconds. */
	seen: number;
	/** Inventory slot (1 head ... 18 ranged) -> score of what they wear there, main spec. Empty slots left out. */
	slots: Record<number, number>;
	/** The same for the second spec. */
	slots2?: Record<number, number>;
	/** Wears a two-hander. */
	th?: boolean;
	/** Item ids worn in rings, trinkets and weapon slots (Unique items can't be worn twice). */
	worn?: number[];
};

export type Verdict = {
	kind: "upgrade" | "maybe";
	/** (new - current) / current, current at least `minBase`. */
	gain: number;
	/** The spec it was judged for. */
	spec: string;
	/** Usable only from this level (above theirs). */
	at?: number;
	/** Fits only their second spec. */
	second?: boolean;
	/** Inventory slot(s) compared against. */
	against: number[];
};

export function upgradeRules(): Rules {
	const specs: Rules["specs"] = {};
	for (const [token, trees] of Object.entries(SPECS)) {
		trees.forEach((s, i) => {
			specs[`${token}:${i}`] = { name: s.name, w: s.w };
		});
	}
	return { ...THRESHOLDS, points: STAT_POINTS, specs, classes: CLASS_RULES };
}

// ---- Specs ---------------------------------------------------------------------

type Tree = { name: string; points: number; talents: { id?: number }[] };

/** A talent tree's index in its class (foreverTalents.ts order), from its talents, else its name. */
function treeIndex(token: string, tree: Tree) {
	for (const t of tree.talents) {
		const where = t.id !== undefined ? TALENT_TREE_BY_ID.get(t.id) : undefined;
		if (where?.classToken === token) return where.treeIndex;
	}
	const names = FOREVER_TALENT_TREES[token]?.map((t) => t.name.toLowerCase()) ?? [];
	// Blizzard's names can be longer ("Shadow Magic" for "Shadow").
	const name = tree.name.toLowerCase();
	const i = names.findIndex((n) => name === n || name.startsWith(`${n} `) || n.startsWith(`${name} `));
	return i >= 0 ? i : undefined;
}

/** Main and second spec keys for a character, from their talent trees. */
export function specsOf(classId: number, trees: Tree[] | undefined) {
	const token = CLASS_TOKENS[classId];
	if (!token) return undefined;
	const points = [0, 0, 0];
	for (const tree of trees ?? []) {
		const i = treeIndex(token, tree);
		if (i !== undefined) points[i] += tree.points;
	}
	const fallback = DEFAULT_TREE[token];
	let main = fallback;
	let most = THRESHOLDS.minSpecPoints - 1;
	for (let i = 0; i < 3; i++) {
		if (points[i] > most || (points[i] === most && i === fallback)) {
			main = i;
			most = points[i];
		}
	}
	let second: number | undefined;
	for (let i = 0; i < 3; i++) {
		if (i !== main && points[i] >= THRESHOLDS.minSpecPoints && (second === undefined || points[i] > points[second]))
			second = i;
	}
	return { spec: `${token}:${main}`, spec2: second !== undefined ? `${token}:${second}` : undefined };
}

// ---- Scoring --------------------------------------------------------------------

/** Where an equip location goes (inventory slots), for comparing. */
export const SLOTS_BY_INV_TYPE: Record<string, number[]> = {
	HEAD: [1],
	NECK: [2],
	SHOULDER: [3],
	CHEST: [5],
	ROBE: [5],
	WAIST: [6],
	LEGS: [7],
	FEET: [8],
	WRIST: [9],
	HAND: [10],
	FINGER: [11, 12],
	TRINKET: [13, 14],
	CLOAK: [15],
	WEAPON: [16],
	"2HWEAPON": [16, 17],
	WEAPONMAINHAND: [16],
	WEAPONOFFHAND: [17],
	SHIELD: [17],
	HOLDABLE: [17],
	RANGED: [18],
	RANGEDRIGHT: [18],
	THROWN: [18],
	RELIC: [18],
};

/** Blizzard's equipment slot types to inventory slots. */
export const SLOT_NUMBERS: Record<string, number> = {
	HEAD: 1,
	NECK: 2,
	SHOULDER: 3,
	SHIRT: 4,
	CHEST: 5,
	WAIST: 6,
	LEGS: 7,
	FEET: 8,
	WRIST: 9,
	HANDS: 10,
	FINGER_1: 11,
	FINGER_2: 12,
	TRINKET_1: 13,
	TRINKET_2: 14,
	BACK: 15,
	MAIN_HAND: 16,
	OFF_HAND: 17,
	RANGED: 18,
	TABARD: 19,
};

const RANGED_TYPES = new Set(["RANGED", "RANGEDRIGHT", "THROWN"]);
const BODY_ARMOR = [1, 2, 3, 4];

/** The best body armor type (cloth 1 ... plate 4) a class wears at a level. */
function bestArmor(rules: ClassRules, level: number) {
	let best = 1;
	for (const sub of BODY_ARMOR) if ((rules.armor[sub] ?? Infinity) <= level) best = sub;
	return best;
}

/** True when it's body armor (cloth to plate) other than a cloak. */
const isBodyArmor = (item: ItemInfo) =>
	item.cls === 4 && item.invType !== "CLOAK" && BODY_ARMOR.includes(item.subclass ?? 0);

/**
 * An item's worth to a spec. `stat`: the stats' part alone; `total`: the
 * item's raw stat points (what `minFit` compares with; `points` scales Attack
 * Power and the like down to plain stat points). `offHand`: as a
 * weapon in the off hand (OFFHAND_DPS instead of DPS).
 */
export function scoreItem(
	item: ItemInfo,
	w: Weights,
	level: number,
	classRules: ClassRules,
	rules: Pick<Rules, "preferBestFrom" | "preferBestFactor" | "points">,
	offHand = false,
) {
	let stat = 0;
	let total = 0;
	for (const key of Object.keys(item.stats).sort()) {
		const value = item.stats[key];
		stat += (w[key] ?? 0) * value;
		total += Math.abs(value) * (rules.points?.[key] ?? 1);
	}
	let score = stat + (w.ARMOR ?? 0) * (item.armor ?? 0);
	if (item.dps) {
		const dpsKey = RANGED_TYPES.has(item.invType)
			? "RANGED_DPS"
			: offHand || item.invType === "WEAPONOFFHAND"
				? "OFFHAND_DPS"
				: "DPS";
		score += (w[dpsKey] ?? 0) * item.dps;
	}
	if (isBodyArmor(item) && level >= rules.preferBestFrom && (item.subclass ?? 0) < bestArmor(classRules, level)) {
		score *= rules.preferBestFactor;
		stat *= rules.preferBestFactor;
	}
	return { score, stat, total };
}

/** Whether a spec has a use for the item at all. */
export function suits(s: { score: number; stat: number; total: number }, rules: Pick<Rules, "minFit">) {
	return s.total > 0 ? s.stat >= rules.minFit * s.total : s.score > 0;
}

/**
 * The level from which a member can use the item (theirs or a few above), or
 * undefined when they can't (or not within `levelsAhead`).
 */
export function usableAt(
	item: ItemInfo,
	m: Pick<UpgradeMember, "classId" | "level" | "worn">,
	rules: Rules,
	itemId?: number,
) {
	const cls = rules.classes[m.classId];
	if (!cls || !SLOTS_BY_INV_TYPE[item.invType]) return undefined;
	if (item.classes && !item.classes.includes(m.classId)) return undefined;
	if (item.unique && itemId !== undefined && m.worn?.includes(itemId)) return undefined;
	let at = item.reqLevel ?? 1;
	if (item.cls === 2) {
		const from = item.subclass !== undefined ? cls.weapons[item.subclass] : undefined;
		if (from === undefined) return undefined;
		at = Math.max(at, from);
		if (item.invType === "WEAPONOFFHAND") {
			if (cls.dualWield === undefined) return undefined;
			at = Math.max(at, cls.dualWield);
		}
	} else if (item.invType !== "CLOAK" && (item.subclass ?? 0) !== 0) {
		const from = cls.armor[item.subclass ?? 0];
		if (from === undefined) return undefined;
		at = Math.max(at, from);
	}
	return at <= m.level + rules.levelsAhead ? Math.max(at, 1) : undefined;
}

/** What the item would replace: its score and which slots. */
export function baseline(item: ItemInfo, slots: Record<number, number>, th: boolean | undefined, offHand: boolean) {
	const at = (s: number) => slots[s] ?? 0;
	switch (item.invType) {
		case "FINGER":
			return at(11) <= at(12) ? { base: at(11), against: [11] } : { base: at(12), against: [12] };
		case "TRINKET":
			return at(13) <= at(14) ? { base: at(13), against: [13] } : { base: at(14), against: [14] };
		case "2HWEAPON":
			return { base: at(16) + at(17), against: [16, 17] };
		case "WEAPONOFFHAND":
		case "SHIELD":
		case "HOLDABLE":
			// With a two-hander, an off hand means giving it up.
			return th ? { base: at(16), against: [16] } : { base: at(17), against: [17] };
		case "WEAPON":
			return offHand ? { base: at(17), against: [17] } : { base: at(16), against: [16] };
		default: {
			const slot = SLOTS_BY_INV_TYPE[item.invType][0];
			return { base: at(slot), against: [slot] };
		}
	}
}

/** The best gain for one spec, or undefined when it doesn't suit that spec. */
function gainFor(item: ItemInfo, m: UpgradeMember, specKey: string, slots: Record<number, number>, rules: Rules) {
	const spec = rules.specs[specKey];
	const cls = rules.classes[m.classId];
	if (!spec || !cls) return undefined;
	const options = [false];
	// A one-hander can go in the off hand for those who dual wield.
	if (item.invType === "WEAPON" && cls.dualWield !== undefined && cls.dualWield <= m.level && !m.th) options.push(true);
	let best: { gain: number; against: number[] } | undefined;
	for (const offHand of options) {
		const s = scoreItem(item, spec.w, m.level, cls, rules, offHand);
		if (!suits(s, rules)) continue;
		const { base, against } = baseline(item, slots, m.th, offHand);
		const gain = (s.score - base) / Math.max(base, rules.minBase);
		if (!best || gain > best.gain) best = { gain, against };
	}
	return best;
}

/** Upgrade, maybe, or nothing, for one guildmate. */
export function judge(item: ItemInfo, m: UpgradeMember, rules: Rules, itemId?: number): Verdict | undefined {
	const at = usableAt(item, m, rules, itemId);
	if (at === undefined) return undefined;
	const later = at > m.level ? at : undefined;
	const main = gainFor(item, m, m.spec, m.slots, rules);
	if (main && main.gain >= rules.maybe) {
		const kind = main.gain >= rules.upgrade && !later ? "upgrade" : "maybe";
		return { kind, gain: main.gain, spec: m.spec, against: main.against, ...(later ? { at: later } : {}) };
	}
	if (m.spec2 && m.slots2) {
		const second = gainFor(item, m, m.spec2, m.slots2, rules);
		if (second && second.gain >= rules.maybe) {
			return {
				kind: "maybe",
				gain: second.gain,
				spec: m.spec2,
				second: true,
				against: second.against,
				...(later ? { at: later } : {}),
			};
		}
	}
	return undefined;
}

/**
 * Who the item would help: upgrades first, then by gain, at most `max`.
 * `skip`: names to leave out (the viewer's own characters). `now` in seconds.
 */
export function suggest(
	item: ItemInfo,
	members: UpgradeMember[],
	rules: Rules,
	opts: { now: number; skip?: string[]; itemId?: number; max?: number },
) {
	const out: { member: UpgradeMember; verdict: Verdict }[] = [];
	for (const m of members) {
		if (opts.skip?.includes(m.name)) continue;
		if (opts.now - m.seen > rules.activeDays * 86400) continue;
		const verdict = judge(item, m, rules, opts.itemId);
		if (verdict) out.push({ member: m, verdict });
	}
	out.sort(
		(a, b) =>
			(a.verdict.kind === "upgrade" ? 0 : 1) - (b.verdict.kind === "upgrade" ? 0 : 1) ||
			b.verdict.gain - a.verdict.gain ||
			a.member.name.localeCompare(b.member.name),
	);
	return out.slice(0, opts.max ?? 3);
}

// ---- What they wear --------------------------------------------------------------

/** A worn item as the profile has it, with what's known about it. */
export type WornItem = {
	slot: string;
	itemId: number;
	name: string;
	quality: string;
	itemLevel?: number;
	info?: ItemInfo;
};

// Unknown items (no English tooltip, no item data) are estimated from item
// level: roughly the stat points Blizzard budgets per item level for each
// quality and slot, as if all of it suited them (they chose to wear it), and
// a weapon's DPS likewise. Rough on purpose; better than counting the slot as
// empty, which would make anything look like an upgrade.
const QUALITY_BUDGET: Record<string, number> = {
	POOR: 0.05,
	COMMON: 0.15,
	UNCOMMON: 0.45,
	RARE: 0.6,
	EPIC: 0.75,
	LEGENDARY: 0.9,
};
const SLOT_BUDGET: Record<number, number> = {
	1: 1,
	2: 0.6,
	3: 0.75,
	5: 1,
	6: 0.75,
	7: 1,
	8: 0.75,
	9: 0.55,
	10: 0.75,
	11: 0.6,
	12: 0.6,
	13: 0.6,
	14: 0.6,
	15: 0.55,
	16: 0.45,
	17: 0.45,
	18: 0.3,
};

export function estimateScore(slot: number, itemLevel: number | undefined, quality: string, w: Weights) {
	if (!itemLevel) return 0;
	const points = itemLevel * (QUALITY_BUDGET[quality] ?? 0.3) * (SLOT_BUDGET[slot] ?? 0.5);
	// What a point of their two best stats is worth.
	const top = Object.entries(w)
		.filter(([k]) => ["STRENGTH", "AGILITY", "STAMINA", "INTELLECT", "SPIRIT"].includes(k))
		.map(([, v]) => v)
		.sort((a, b) => b - a);
	let score = points * (((top[0] ?? 0) + (top[1] ?? 0)) / 2);
	// About 0.5 DPS per item level for a one-hander at these levels.
	if (slot === 16) score += (w.DPS ?? 0) * itemLevel * 0.5;
	if (slot === 17) score += (w.OFFHAND_DPS ?? 0) * itemLevel * 0.5 * 0.5;
	if (slot === 18) score += (w.RANGED_DPS ?? 0) * itemLevel * 0.5;
	return score;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Scores of what a member wears, per inventory slot, for one spec. */
export function wornScores(items: WornItem[], level: number, classId: number, specKey: string, rules: Rules) {
	const spec = rules.specs[specKey];
	const cls = rules.classes[classId];
	const slots: Record<number, number> = {};
	if (!spec || !cls) return slots;
	for (const item of items) {
		const slot = SLOT_NUMBERS[item.slot];
		if (!slot || slot === 4 || slot === 19) continue;
		const score = item.info
			? scoreItem(item.info, spec.w, level, cls, rules, slot === 17 && item.info.cls === 2).score
			: estimateScore(slot, item.itemLevel, item.quality, spec.w);
		slots[slot] = round1(score);
	}
	return slots;
}

/** A guild member's compact profile for upgrade checks, or undefined if nothing's known (no gear read). */
export function upgradeMember(
	c: {
		name: string;
		classId: number;
		level: number;
		seenMs: number;
		talentTrees: Tree[] | undefined;
		equipment: WornItem[] | undefined;
	},
	rules: Rules,
): UpgradeMember | undefined {
	if (!c.equipment) return undefined;
	const specs = specsOf(c.classId, c.talentTrees);
	if (!specs) return undefined;
	const main = c.equipment.find((i) => i.slot === "MAIN_HAND");
	const worn = c.equipment
		.filter((i) => [11, 12, 13, 14, 16, 17].includes(SLOT_NUMBERS[i.slot] ?? 0))
		.map((i) => i.itemId);
	return {
		name: c.name,
		classId: c.classId,
		level: c.level,
		spec: specs.spec,
		...(specs.spec2 ? { spec2: specs.spec2 } : {}),
		seen: Math.floor(c.seenMs / 1000),
		slots: wornScores(c.equipment, c.level, c.classId, specs.spec, rules),
		...(specs.spec2 ? { slots2: wornScores(c.equipment, c.level, c.classId, specs.spec2, rules) } : {}),
		...(main?.info?.invType === "2HWEAPON" ? { th: true } : {}),
		...(worn.length ? { worn } : {}),
	};
}

// ---- Why (the site's item panel) -------------------------------------------------

const STAT_LABELS: Record<string, string> = {
	STRENGTH: "Strength",
	AGILITY: "Agility",
	STAMINA: "Stamina",
	INTELLECT: "Intellect",
	SPIRIT: "Spirit",
	ATTACK_POWER: "Attack Power",
	SPELL_POWER: "Spell Power",
	SPELL_DAMAGE_DONE: "Spell Damage",
	SPELL_HEALING_DONE: "Spell Healing",
	DEFENSE_SKILL_RATING: "Defense",
	BLOCK_RATING: "Block",
	EXTRA_ARMOR: "Bonus Armor",
	HEALTH_REGEN: "Health per 5",
	MANA_REGENERATION: "Mana per 5",
	CRIT_RATING: "Crit",
	HIT_RATING: "Hit",
	BONUS_STAT_ARCANE_DAMAGE_DONE: "Arcane Damage",
	BONUS_STAT_FIRE_DAMAGE_DONE: "Fire Damage",
	BONUS_STAT_FROST_DAMAGE_DONE: "Frost Damage",
	BONUS_STAT_NATURE_DAMAGE_DONE: "Nature Damage",
	BONUS_STAT_SHADOW_DAMAGE_DONE: "Shadow Damage",
	BONUS_STAT_HOLY_DAMAGE_DONE: "Holy Damage",
};

const signed = (n: number) => `${n > 0 ? "+" : ""}${Number.isInteger(n) ? n : n.toFixed(1)}`;

/**
 * A short why: "+6 Agility, +4 Stamina over Embossed Leather Gloves" — the
 * stat differences that matter most to the spec (up to three), against what
 * they wear in the compared slots.
 */
export function explain(item: ItemInfo, verdict: Verdict, worn: WornItem[], rules: Rules) {
	const w = rules.specs[verdict.spec]?.w ?? {};
	const replaced = worn.filter((i) => verdict.against.includes(SLOT_NUMBERS[i.slot] ?? 0));
	const diff: Record<string, number> = { ...item.stats };
	let dps = item.dps ?? 0;
	let unknown = false;
	for (const old of replaced) {
		if (!old.info) unknown = true;
		for (const [k, v] of Object.entries(old.info?.stats ?? {})) diff[k] = (diff[k] ?? 0) - v;
		if (old.info?.cls === 2 && old.info.dps) dps -= old.info.dps;
	}
	const parts = Object.entries(diff)
		.filter(([k, v]) => v !== 0 && (w[k] ?? 0) > 0 && STAT_LABELS[k])
		.sort((a, b) => Math.abs(b[1] * (w[b[0]] ?? 0)) - Math.abs(a[1] * (w[a[0]] ?? 0)))
		.slice(0, 3)
		.map(([k, v]) => `${signed(v)} ${STAT_LABELS[k]}`);
	const dpsKey = RANGED_TYPES.has(item.invType) ? "RANGED_DPS" : "DPS";
	if (WEAPON_INV_TYPES.has(item.invType) && Math.abs(dps) >= 0.1 && (w[dpsKey] ?? 0) > 0)
		parts.unshift(`${signed(Math.round(dps * 10) / 10)} DPS`);
	const what = parts.join(", ") || "about the same stats";
	const over = replaced.length
		? ` over ${replaced.map((i) => i.name).join(" and ")}${unknown ? " (estimated)" : ""}`
		: " (nothing worn there)";
	const notes = [
		verdict.second ? rules.specs[verdict.spec]?.name : undefined,
		verdict.at ? `at ${verdict.at}` : undefined,
	].filter(Boolean);
	return `${what}${over}${notes.length ? `; ${notes.join(", ")}` : ""}`;
}
