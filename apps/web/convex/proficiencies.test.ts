import assert from "node:assert/strict";
import { test } from "node:test";
import { GAME_BUILD, GENERATED_SKILLS } from "./shared/proficiencies.generated.ts";
import {
	ARMOR_SUBCLASS as A,
	auditReport,
	buildRules,
	CLASS_IDS,
	CLASS_RULES,
	contradictions,
	OVERRIDES,
	PROFICIENCY_BY_KEY,
	PROFICIENCY_TYPES,
	proficienciesOf,
	rulesFromData,
	WEAPON_SUBCLASS as W,
} from "./shared/proficiencies.ts";

const WARRIOR = 1;
const PALADIN = 2;
const HUNTER = 3;
const ROGUE = 4;
const PRIEST = 5;
const SHAMAN = 7;
const DRUID = 11;

test("generated data: stamped and complete", () => {
	assert.equal(GAME_BUILD.product, "wowf");
	assert.match(GAME_BUILD.version, /^\d+\.\d+\.\d+\.\d+$/);
	for (const name of ["Cloth", "Leather", "Mail", "Plate Mail", "Shield", "Dual Wield", "Axes", "Wands"]) {
		assert.ok(
			GENERATED_SKILLS.some((s) => s.name === name),
			name,
		);
	}
});

test("every class: cloth from level 1, at least one weapon", () => {
	for (const classId of CLASS_IDS) {
		const cls = CLASS_RULES[classId];
		assert.equal(cls.armor[A.CLOTH], 1, `class ${classId}`);
		assert.ok(Object.keys(cls.weapons).length > 0, `class ${classId}`);
	}
});

test("the game's data as the rules read it", () => {
	assert.equal(CLASS_RULES[ROGUE].weapons[W.AXE], 1, "rogues can use axes (new in Forever)");
	for (const classId of [WARRIOR, PALADIN, HUNTER]) assert.equal(CLASS_RULES[classId].weapons[W.POLEARM], 20);
	assert.equal(CLASS_RULES[WARRIOR].armor[A.PLATE], 40);
	assert.equal(CLASS_RULES[PALADIN].armor[A.PLATE], 40);
	assert.equal(CLASS_RULES[HUNTER].armor[A.MAIL], 40);
	assert.equal(CLASS_RULES[SHAMAN].armor[A.MAIL], 40);
	assert.equal(CLASS_RULES[WARRIOR].armor[A.MAIL], 1);
	assert.equal(CLASS_RULES[ROGUE].dualWield, 10);
	assert.equal(CLASS_RULES[WARRIOR].dualWield, 20);
	assert.equal(CLASS_RULES[HUNTER].dualWield, 20);
	assert.equal(CLASS_RULES[PRIEST].weapons[W.SWORD], undefined);
	assert.equal(CLASS_RULES[PRIEST].armor[A.SHIELD], undefined);
});

test("overrides apply", () => {
	const raw = rulesFromData();
	assert.ok(raw[SHAMAN].dualWield !== undefined, "the data has shaman Dual Wield");
	assert.equal(CLASS_RULES[SHAMAN].dualWield, undefined, "but the rules don't");
	assert.ok(raw[DRUID].weapons[W.POLEARM] !== undefined, "the data has druid Polearms");
	assert.equal(CLASS_RULES[DRUID].weapons[W.POLEARM], undefined, "but the rules don't");
	assert.equal(CLASS_RULES[PALADIN].armor[A.LIBRAM], 1);
	assert.equal(CLASS_RULES[SHAMAN].armor[A.TOTEM], 1);
	assert.equal(CLASS_RULES[DRUID].armor[A.IDOL], 1);
	// Without overrides, the data stands.
	assert.equal(buildRules([])[SHAMAN].dualWield, raw[SHAMAN].dualWield);
});

test("every override has a reason and still changes something", () => {
	const raw = rulesFromData();
	for (const o of OVERRIDES) {
		const what = `${o.classId} ${o.kind} ${"subclass" in o ? o.subclass : ""}`;
		assert.ok(o.reason.length > 20 && o.confirm.length > 10, `${what}: reason and confirm`);
		const cls = raw[o.classId];
		const now = o.kind === "dualWield" ? cls.dualWield : (o.kind === "armor" ? cls.armor : cls.weapons)[o.subclass];
		assert.notEqual(
			now ?? null,
			o.level,
			`${what}: the game data now says the same; remove the override (shared/proficiencies.ts)`,
		);
	}
});

test("every grant the generator flags as suspect has an override", () => {
	for (const skill of GENERATED_SKILLS) {
		for (const [classId, grant] of Object.entries(skill.classes)) {
			if (!grant.suspect) continue;
			const covered = OVERRIDES.some(
				(o) =>
					o.classId === Number(classId) &&
					(skill.dualWield
						? o.kind === "dualWield"
						: o.kind !== "dualWield" &&
							o.kind === (skill.armor !== undefined ? "armor" : "weapon") &&
							o.subclass === (skill.armor ?? skill.weapon)),
			);
			assert.ok(covered, `${skill.name} for class ${classId} is suspect: decide in OVERRIDES`);
		}
	}
});

test("every type the rules name can be shown", () => {
	for (const cls of Object.values(CLASS_RULES)) {
		for (const sub of Object.keys(cls.armor)) assert.ok(PROFICIENCY_BY_KEY.has(`armor:${sub}`), `armor ${sub}`);
		for (const sub of Object.keys(cls.weapons)) assert.ok(PROFICIENCY_BY_KEY.has(`weapon:${sub}`), `weapon ${sub}`);
	}
	assert.equal(new Set(PROFICIENCY_TYPES.map((t) => t.key)).size, PROFICIENCY_TYPES.length);
	const mage = proficienciesOf(8).map((p) => p.type.name);
	assert.deepEqual(mage, ["Cloth", "Daggers", "Swords", "Staves", "Wands"]);
});

test("audit: only skills the rules deny count", () => {
	// A level 30 shaman with Dual Wield: the override's suspect, contradicted.
	const shaman = contradictions({ classId: SHAMAN, level: 30, skills: ["Dual Wield", "Maces", "Leather"] });
	assert.equal(shaman.length, 1);
	assert.equal(shaman[0].skill, "Dual Wield");
	assert.equal(shaman[0].rule, undefined);
	assert.ok(shaman[0].override);
	// Mail at 30 for a shaman (rules: 40) is a contradiction too, without an override.
	const early = contradictions({ classId: SHAMAN, level: 30, skills: ["Mail"] });
	assert.equal(early[0]?.rule, 40);
	assert.equal(early[0]?.override, undefined);
	// A rogue without axes: normal (skills are trained).
	assert.deepEqual(contradictions({ classId: ROGUE, level: 40, skills: ["Daggers", "Swords"] }), []);
	// A rogue with axes: what the data says.
	assert.deepEqual(contradictions({ classId: ROGUE, level: 12, skills: ["Axes"] }), []);
	// Unknown names (other languages, Defense) are skipped.
	assert.deepEqual(contradictions({ classId: PRIEST, level: 10, skills: ["Defense", "Hachas"] }), []);
});

test("audit report: findings and evidence per override", () => {
	const report = auditReport([
		{ who: "a", classId: SHAMAN, level: 30, skills: ["Dual Wield", "Maces"] },
		{ who: "b", classId: SHAMAN, level: 40, skills: ["Maces", "Mail"] },
		{ who: "c", classId: ROGUE, level: 20, skills: ["Axes", "Dual Wield"] },
	]);
	assert.equal(report.observed, 3);
	assert.equal(report.findings.length, 1);
	assert.equal(report.findings[0].who, "a");
	assert.ok(report.findings[0].override);
	const dw = report.overrides.find((o) => o.classId === SHAMAN && o.type === "Dual Wield");
	assert.deepEqual(dw?.contradictedBy, ["a"]);
	assert.equal(dw?.consistentWith, 1);
	assert.equal(report.overrides.length, 2, "only removals are reported");
});
