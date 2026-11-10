// What each class can wear and wield, and from which level: WoW: Forever's own
// game data (proficiencies.generated.ts, written by
// apps/web/scripts/gen-proficiencies.mjs and kept current by
// .github/workflows/game-data.yml) plus the reviewed overrides below.
//
// Used by the gear-upgrade rules (shared/upgrades.ts, and through
// GuildieData.lua the addon's Upgrades.lua), the character page's "Can use"
// and the guild's Gear page. Players confirm it in game: the addon uploads the
// weapon and armor skills each character has, and `proficiencies:audit` lists
// any that contradict these rules.
//
// Kept free of Convex imports so `node --test` can run it.

import { GAME_BUILD, GENERATED_SKILLS } from "./proficiencies.generated.ts";

export { GAME_BUILD };

// Item subclass ids (Blizzard's and the game's GetItemInfoInstant).
export const ARMOR_SUBCLASS = {
	MISC: 0,
	CLOTH: 1,
	LEATHER: 2,
	MAIL: 3,
	PLATE: 4,
	SHIELD: 6,
	LIBRAM: 7,
	IDOL: 8,
	TOTEM: 9,
} as const;
export const WEAPON_SUBCLASS = {
	AXE: 0,
	AXE_2H: 1,
	BOW: 2,
	GUN: 3,
	MACE: 4,
	MACE_2H: 5,
	POLEARM: 6,
	SWORD: 7,
	SWORD_2H: 8,
	STAFF: 10,
	FIST: 13,
	MISC: 14,
	DAGGER: 15,
	THROWN: 16,
	CROSSBOW: 18,
	WAND: 19,
	FISHING_POLE: 20,
} as const;

/** Class ids in Blizzard's order. */
export const CLASS_IDS = [1, 2, 3, 4, 5, 7, 8, 9, 11] as const;

const A = ARMOR_SUBCLASS;
const W = WEAPON_SUBCLASS;

/**
 * One class's rules, as `subclass id: from level`. `dualWield`: the level an
 * off-hand weapon becomes possible. Cloaks, rings, necks, trinkets and
 * held-in-off-hand items (armor subclass Miscellaneous) are for everyone.
 * This shape goes into GuildieData.lua (`upgrades.rules.classes`).
 */
export type ClassRules = { armor: Record<number, number>; weapons: Record<number, number>; dualWield?: number };

/** What an override changes. */
export type ProficiencyKey = { kind: "armor" | "weapon"; subclass: number } | { kind: "dualWield" };

export type Override = ProficiencyKey & {
	classId: number;
	/** From this level; null: the class can't (whatever the data says). */
	level: number | null;
	/** Why the data is wrong or incomplete here. */
	reason: string;
	/** How it was, or will be, confirmed. */
	confirm: string;
};

/**
 * Where the game data is wrong or silent. Each has a reason and how it's
 * confirmed; a test fails when an override no longer changes anything (the
 * data caught up: remove it) or a grant the generator flags as suspect has
 * no override.
 */
export const OVERRIDES: Override[] = [
	{
		classId: 7,
		kind: "dualWield",
		level: null,
		reason:
			"SkillRaceClassInfo row 2455 gives shamans Dual Wield from level 1. Classic Era's data has the same row, where it is Season of Discovery's Dual Wield Specialization rune; no Forever talent or trainer is known to grant it.",
		confirm:
			"Unconfirmed. The addon (0.7.0+) uploads each character's skills; `proficiencies:audit` lists any shaman who has Dual Wield. One such shaman: remove this override.",
	},
	{
		classId: 11,
		kind: "weapon",
		subclass: W.POLEARM,
		level: null,
		reason:
			"SkillRaceClassInfo row 2483 gives druids Polearms at 20. Classic Era's data has it too (added for Season of Discovery), where druids can't train polearms.",
		confirm:
			"Unconfirmed. `proficiencies:audit` lists any druid with the Polearms skill; a weapon master refusing a level 20+ druid confirms this override.",
	},
	{
		classId: 2,
		kind: "armor",
		subclass: A.LIBRAM,
		level: 1,
		reason: "Relics have no skill line; librams are for paladins (the item's class restriction says so too).",
		confirm: "Game rule since 1.x; every libram's tooltip says Classes: Paladin.",
	},
	{
		classId: 7,
		kind: "armor",
		subclass: A.TOTEM,
		level: 1,
		reason: "Relics have no skill line; totems (the relic slot item) are for shamans.",
		confirm: "Game rule since 1.x; every totem relic's tooltip says Classes: Shaman.",
	},
	{
		classId: 11,
		kind: "armor",
		subclass: A.IDOL,
		level: 1,
		reason: "Relics have no skill line; idols are for druids.",
		confirm: "Game rule since 1.x; every idol's tooltip says Classes: Druid.",
	},
];

/** The rules straight from the game data, suspects included. */
export function rulesFromData(): Record<number, ClassRules> {
	const out: Record<number, ClassRules> = {};
	for (const classId of CLASS_IDS) out[classId] = { armor: {}, weapons: {} };
	for (const skill of GENERATED_SKILLS) {
		for (const [id, grant] of Object.entries(skill.classes)) {
			const cls = out[Number(id)];
			if (!cls) continue;
			if (skill.armor !== undefined) cls.armor[skill.armor] = grant.level;
			else if (skill.weapon !== undefined) cls.weapons[skill.weapon] = grant.level;
			else if (skill.dualWield) cls.dualWield = grant.level;
		}
	}
	return out;
}

function applyOverride(cls: ClassRules, o: Override) {
	if (o.kind === "dualWield") {
		if (o.level === null) delete cls.dualWield;
		else cls.dualWield = o.level;
		return;
	}
	const map = o.kind === "armor" ? cls.armor : cls.weapons;
	if (o.level === null) delete map[o.subclass];
	else map[o.subclass] = o.level;
}

/** The data with the overrides applied: what the app uses. */
export function buildRules(overrides: Override[] = OVERRIDES): Record<number, ClassRules> {
	const rules = rulesFromData();
	for (const o of overrides) {
		const cls = rules[o.classId];
		if (cls) applyOverride(cls, o);
	}
	// Stable key order (by subclass), for GuildieData.lua and tests.
	for (const cls of Object.values(rules)) {
		cls.armor = sortKeys(cls.armor);
		cls.weapons = sortKeys(cls.weapons);
	}
	return rules;
}

const sortKeys = (m: Record<number, number>) =>
	Object.fromEntries(Object.entries(m).sort(([a], [b]) => Number(a) - Number(b)));

/** What each class can wear and wield (game data plus OVERRIDES). */
export const CLASS_RULES: Record<number, ClassRules> = buildRules();

// ---- Types, for showing them ------------------------------------------------------

export type ProficiencyType = {
	/** "armor:3", "weapon:6", "dualWield". */
	key: string;
	kind: "armor" | "weapon" | "dualWield";
	subclass?: number;
	/** As the game names the item type (tooltips) or skill. */
	name: string;
	/** The skill line's name, as the game's skill list shows it (none for relics). */
	skill?: string;
	group: "armor" | "offHand" | "melee" | "ranged";
};

const t = (
	kind: ProficiencyType["kind"],
	subclass: number | undefined,
	name: string,
	skill: string | undefined,
	group: ProficiencyType["group"],
): ProficiencyType => ({
	key: kind === "dualWield" ? kind : `${kind}:${subclass}`,
	kind,
	...(subclass !== undefined ? { subclass } : {}),
	name,
	...(skill ? { skill } : {}),
	group,
});

/** Every armor and weapon type a class rule can name, in display order. */
export const PROFICIENCY_TYPES: ProficiencyType[] = [
	t("armor", A.CLOTH, "Cloth", "Cloth", "armor"),
	t("armor", A.LEATHER, "Leather", "Leather", "armor"),
	t("armor", A.MAIL, "Mail", "Mail", "armor"),
	t("armor", A.PLATE, "Plate", "Plate Mail", "armor"),
	t("armor", A.SHIELD, "Shields", "Shield", "offHand"),
	t("dualWield", undefined, "Dual Wield", "Dual Wield", "offHand"),
	t("armor", A.LIBRAM, "Librams", undefined, "offHand"),
	t("armor", A.IDOL, "Idols", undefined, "offHand"),
	t("armor", A.TOTEM, "Totems", undefined, "offHand"),
	t("weapon", W.DAGGER, "Daggers", "Daggers", "melee"),
	t("weapon", W.FIST, "Fist Weapons", "Fist Weapons", "melee"),
	t("weapon", W.SWORD, "Swords", "Swords", "melee"),
	t("weapon", W.AXE, "Axes", "Axes", "melee"),
	t("weapon", W.MACE, "Maces", "Maces", "melee"),
	t("weapon", W.SWORD_2H, "Two-Handed Swords", "Two-Handed Swords", "melee"),
	t("weapon", W.AXE_2H, "Two-Handed Axes", "Two-Handed Axes", "melee"),
	t("weapon", W.MACE_2H, "Two-Handed Maces", "Two-Handed Maces", "melee"),
	t("weapon", W.POLEARM, "Polearms", "Polearms", "melee"),
	t("weapon", W.STAFF, "Staves", "Staves", "melee"),
	t("weapon", W.BOW, "Bows", "Bows", "ranged"),
	t("weapon", W.CROSSBOW, "Crossbows", "Crossbows", "ranged"),
	t("weapon", W.GUN, "Guns", "Guns", "ranged"),
	t("weapon", W.THROWN, "Thrown", "Thrown", "ranged"),
	t("weapon", W.WAND, "Wands", "Wands", "ranged"),
];

export const PROFICIENCY_BY_KEY = new Map(PROFICIENCY_TYPES.map((p) => [p.key, p]));
/** By the skill's name as the (English) game shows it. */
export const PROFICIENCY_BY_SKILL = new Map(
	PROFICIENCY_TYPES.filter((p) => p.skill).map((p) => [p.skill as string, p]),
);

/** The type an override (or any kind + subclass) is about. */
export function typeOf(k: ProficiencyKey): ProficiencyType | undefined {
	return PROFICIENCY_BY_KEY.get(k.kind === "dualWield" ? "dualWield" : `${k.kind}:${k.subclass}`);
}

/** From which level a class can use a type; undefined: never. */
export function unlockLevel(classId: number, type: ProficiencyType, rules = CLASS_RULES): number | undefined {
	const cls = rules[classId];
	if (!cls) return undefined;
	if (type.kind === "dualWield") return cls.dualWield;
	return (type.kind === "armor" ? cls.armor : cls.weapons)[type.subclass ?? -1];
}

/** Every type a class can use (now or later), in display order, with its level. */
export function proficienciesOf(classId: number, rules = CLASS_RULES) {
	const out: { type: ProficiencyType; from: number }[] = [];
	for (const type of PROFICIENCY_TYPES) {
		const from = unlockLevel(classId, type, rules);
		if (from !== undefined) out.push({ type, from });
	}
	return out;
}

// ---- Checking against the game ----------------------------------------------------

export type Observation = { classId: number; level: number; skills: string[] };

export type Contradiction = {
	/** The skill's name, as uploaded. */
	skill: string;
	type: ProficiencyType;
	/** What the rules say: never (undefined) or from a higher level. */
	rule?: number;
	/** The override this observation speaks to, if any. */
	override?: Override;
};

/**
 * Skills a character has that the rules say they can't (yet). Lacking a skill
 * the rules allow is normal (weapon skills are trained, a level 30 rogue may
 * never have visited the axe trainer), so only "has it, rules say no" counts.
 */
export function contradictions(o: Observation, rules = CLASS_RULES, overrides = OVERRIDES): Contradiction[] {
	const out: Contradiction[] = [];
	for (const skill of o.skills) {
		const type = PROFICIENCY_BY_SKILL.get(skill);
		if (!type) continue;
		const rule = unlockLevel(o.classId, type, rules);
		if (rule !== undefined && rule <= o.level) continue;
		const override = overrides.find((x) => x.classId === o.classId && typeOf(x) === type);
		out.push({ skill, type, ...(rule !== undefined ? { rule } : {}), ...(override ? { override } : {}) });
	}
	return out;
}

export type AuditFinding = {
	who: string;
	classId: number;
	level: number;
	skill: string;
	/** The rules: never (undefined) or from this level. */
	rule?: number;
	/** An override this finding speaks against (remove it once confirmed). */
	override?: string;
};

/**
 * What `proficiencies:audit` reports: every contradiction, and per override
 * how many observed characters speak against it (have the skill) or are
 * consistent with it (the class, at or above the data's level, without it;
 * weak evidence alone, since skills are trained).
 */
export function auditReport(observations: (Observation & { who: string })[], rules = CLASS_RULES) {
	const findings: AuditFinding[] = [];
	for (const o of observations) {
		for (const c of contradictions(o, rules)) {
			findings.push({
				who: o.who,
				classId: o.classId,
				level: o.level,
				skill: c.skill,
				...(c.rule !== undefined ? { rule: c.rule } : {}),
				...(c.override ? { override: c.override.reason } : {}),
			});
		}
	}
	const raw = rulesFromData();
	const overrides = OVERRIDES.map((x) => {
		const type = typeOf(x);
		const dataLevel = type ? unlockLevel(x.classId, type, raw) : undefined;
		const seen = observations.filter((o) => o.classId === x.classId);
		const has = seen.filter((o) => type?.skill && o.skills.includes(type.skill));
		const without = seen.filter(
			(o) => type?.skill && !o.skills.includes(type.skill) && dataLevel !== undefined && o.level >= dataLevel,
		);
		return {
			classId: x.classId,
			type: type?.name ?? x.kind,
			level: x.level,
			dataLevel: dataLevel ?? null,
			contradictedBy: has.map((o) => o.who),
			consistentWith: without.length,
		};
	}).filter((x) => x.level === null);
	return { build: GAME_BUILD.version, observed: observations.length, findings, overrides };
}
