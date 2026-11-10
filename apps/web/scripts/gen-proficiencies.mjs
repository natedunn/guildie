// Writes apps/web/convex/shared/proficiencies.generated.ts: which armor and
// weapon types each class can learn, and from which level, read from WoW:
// Forever's own game data (its DB2 tables, as published per build by
// wago.tools). Blizzard's web API has none of this.
//
//   node apps/web/scripts/gen-proficiencies.mjs                 # latest Forever build
//   node apps/web/scripts/gen-proficiencies.mjs --build 1.60.1.70888
//   node apps/web/scripts/gen-proficiencies.mjs --summary out.md # also write what changed (markdown)
//   node apps/web/scripts/gen-proficiencies.mjs --check          # exit 1 if the file would change
//
// How it reads the tables:
// - SkillLine: the skill lines; CategoryID 6 is weapon skills (plus Defense,
//   Unarmed, Dual Wield, Feral Combat), 8 armor skills.
// - SkillRaceClassInfo: who can learn a skill. One skill has several rows that
//   differ by race (starting skills) or class; a class can learn the skill if
//   any row's ClassMask has its bit (bit = class id - 1; 0 or -1: everyone).
//   MinLevel is when it can be trained (0: from the start). Races are ignored:
//   every race of a class can train the class's weapons at a weapon master.
// - ChrClasses: only to check our class ids still mean the same classes.
//
// Output is deterministic (sorted; stamped with the build's own date, not
// today's), so an unchanged build writes an identical file. The reviewed rules
// the app uses are in shared/proficiencies.ts (this data plus overrides).
// .github/workflows/game-data.yml runs this daily and opens a PR on change.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../convex/shared/proficiencies.generated.ts");
const PRODUCT = "wowf";
const USER_AGENT = "Guildie game-data check (https://github.com/natedunn/guildie)";

/** Class ids (ChrClasses.ID) to the game's class tokens (ChrClasses.Filename). */
const CLASSES = {
	1: "WARRIOR",
	2: "PALADIN",
	3: "HUNTER",
	4: "ROGUE",
	5: "PRIEST",
	7: "SHAMAN",
	8: "MAGE",
	9: "WARLOCK",
	11: "DRUID",
};

/** Armor skill lines to item subclass ids (item class 4). */
const ARMOR = { 415: 1, 414: 2, 413: 3, 293: 4, 433: 6 };
/** Weapon skill lines to item subclass ids (item class 2). */
const WEAPONS = {
	44: 0,
	172: 1,
	45: 2,
	46: 3,
	54: 4,
	160: 5,
	229: 6,
	43: 7,
	55: 8,
	136: 10,
	473: 13,
	173: 15,
	176: 16,
	226: 18,
	228: 19,
};
const DUAL_WIELD = 118;

/**
 * SkillRaceClassInfo rows known to be doubtful: present in the data but
 * probably not in Forever's game. Still written (marked), so a reviewer sees
 * them; shared/proficiencies.ts decides.
 */
const SUSPECT_ROWS = {
	2455: "Shaman Dual Wield: a Season of Discovery rune in Classic Era's data; no known Forever source",
	2483: "Druid Polearms: also in Classic Era's data (Season of Discovery), where druids can't train them",
};

const args = process.argv.slice(2);
const arg = (name) => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : undefined;
};

async function get(url) {
	for (let attempt = 1; ; attempt++) {
		const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
		if (res.ok) return res;
		if (attempt >= 3 || res.status < 500) throw new Error(`${url}: HTTP ${res.status}`);
		await new Promise((r) => setTimeout(r, 2000 * attempt));
	}
}

/** RFC 4180-ish CSV (quoted fields may hold commas, quotes and newlines). */
function parseCsv(text) {
	const rows = [];
	let row = [];
	let field = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (c === '"') quoted = false;
			else field += c;
		} else if (c === '"') quoted = true;
		else if (c === ",") {
			row.push(field);
			field = "";
		} else if (c === "\n" || c === "\r") {
			if (c === "\r" && text[i + 1] === "\n") i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else field += c;
	}
	if (field || row.length) {
		row.push(field);
		rows.push(row);
	}
	const [header, ...body] = rows;
	return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

async function table(name, build) {
	const res = await get(`https://wago.tools/db2/${name}/csv?build=${encodeURIComponent(build)}`);
	return parseCsv(await res.text());
}

async function latestBuild() {
	const builds = await (await get("https://wago.tools/api/builds")).json();
	const list = builds[PRODUCT];
	if (!Array.isArray(list) || !list.length) throw new Error(`wago.tools lists no ${PRODUCT} builds`);
	return list[0];
}

async function buildInfo(version) {
	const builds = await (await get("https://wago.tools/api/builds")).json();
	return (builds[PRODUCT] ?? []).find((b) => b.version === version) ?? { version, created_at: "" };
}

/** Everything the generated file holds, from the three tables. */
export function compute({ skillLines, skillRaceClassInfo, chrClasses }) {
	for (const [id, token] of Object.entries(CLASSES)) {
		const row = chrClasses.find((c) => c.ID === id);
		if (row?.Filename !== token) throw new Error(`ChrClasses ${id} is ${row?.Filename}, expected ${token}`);
	}
	const lines = new Map(
		skillLines
			.filter((s) => s.CategoryID === "6" || s.CategoryID === "8")
			.map((s) => [Number(s.ID), { name: s.DisplayName_lang, category: Number(s.CategoryID) }]),
	);
	/** skill id -> class id -> { level, rows } */
	const grants = new Map();
	for (const r of skillRaceClassInfo) {
		const skillId = Number(r.SkillID);
		if (!lines.has(skillId)) continue;
		const mask = Number(r.ClassMask);
		const level = Math.max(1, Number(r.MinLevel) || 0);
		for (const classId of Object.keys(CLASSES).map(Number)) {
			if (mask !== 0 && mask !== -1 && !(mask & (1 << (classId - 1)))) continue;
			const byClass = grants.get(skillId) ?? new Map();
			grants.set(skillId, byClass);
			const g = byClass.get(classId) ?? { level: Infinity, rows: [] };
			g.level = Math.min(g.level, level);
			g.rows.push(Number(r.ID));
			byClass.set(classId, g);
		}
	}
	const skills = [...lines.entries()]
		.sort(([a], [b]) => a - b)
		.map(([id, line]) => {
			const classes = {};
			for (const [classId, g] of [...(grants.get(id) ?? new Map()).entries()].sort(([a], [b]) => a - b)) {
				const rows = g.rows.sort((a, b) => a - b);
				const suspects = rows.filter((row) => SUSPECT_ROWS[row]);
				// Suspect only when every row granting it is.
				const suspect =
					suspects.length === rows.length ? suspects.map((row) => SUSPECT_ROWS[row]).join("; ") : undefined;
				classes[classId] = { level: g.level, rows, ...(suspect ? { suspect } : {}) };
			}
			const kind =
				id in ARMOR
					? { armor: ARMOR[id] }
					: id in WEAPONS
						? { weapon: WEAPONS[id] }
						: id === DUAL_WIELD
							? { dualWield: true }
							: {};
			return { id, name: line.name, category: line.category, ...kind, classes };
		});
	return skills;
}

function render(build, skills) {
	const date = (build.created_at || "").slice(0, 10);
	const out = [];
	out.push("// GENERATED by apps/web/scripts/gen-proficiencies.mjs. Do not edit by hand:");
	out.push("// run the script (or let .github/workflows/game-data.yml do it) and review");
	out.push("// what changed in shared/proficiencies.ts, where the overrides live.");
	out.push("//");
	out.push(`// WoW: Forever (${PRODUCT}) build ${build.version}${date ? ` of ${date}` : ""}, from the game's`);
	out.push("// SkillLine and SkillRaceClassInfo tables as published by wago.tools.");
	out.push("// Every weapon (category 6) and armor (category 8) skill line, and per class");
	out.push("// the level it can be trained from (1: from the start) and the");
	out.push("// SkillRaceClassInfo rows that grant it. `suspect`: every granting row is one");
	out.push("// the script flags as doubtful (see SUSPECT_ROWS there).");
	out.push("");
	out.push("export type GeneratedGrant = { level: number; rows: number[]; suspect?: string };");
	out.push("export type GeneratedSkill = {");
	out.push("\tid: number;");
	out.push("\tname: string;");
	out.push("\t/** SkillLine.CategoryID: 6 weapon skills, 8 armor skills. */");
	out.push("\tcategory: number;");
	out.push("\t/** Item subclass (item class 4) the skill lets one wear. */");
	out.push("\tarmor?: number;");
	out.push("\t/** Item subclass (item class 2) the skill lets one wield. */");
	out.push("\tweapon?: number;");
	out.push("\tdualWield?: boolean;");
	out.push("\t/** Class id -> grant. */");
	out.push("\tclasses: Record<number, GeneratedGrant>;");
	out.push("};");
	out.push("");
	out.push(
		`export const GAME_BUILD = { product: ${JSON.stringify(PRODUCT)}, version: ${JSON.stringify(build.version)}, date: ${JSON.stringify(date)} } as const;`,
	);
	out.push("");
	out.push("export const GENERATED_SKILLS: GeneratedSkill[] = [");
	for (const s of skills) {
		const kind =
			s.armor !== undefined
				? `armor: ${s.armor}, `
				: s.weapon !== undefined
					? `weapon: ${s.weapon}, `
					: s.dualWield
						? "dualWield: true, "
						: "";
		out.push("\t{");
		out.push(`\t\tid: ${s.id},`);
		out.push(`\t\tname: ${JSON.stringify(s.name)},`);
		out.push(`\t\tcategory: ${s.category},`);
		if (kind) out.push(`\t\t${kind.trim()}`);
		const entries = Object.entries(s.classes);
		if (!entries.length) out.push("\t\tclasses: {},");
		else {
			out.push("\t\tclasses: {");
			for (const [classId, g] of entries) {
				const suspect = g.suspect ? `, suspect: ${JSON.stringify(g.suspect)}` : "";
				out.push(
					`\t\t\t${classId}: { level: ${g.level}, rows: [${g.rows.join(", ")}]${suspect} }, // ${CLASSES[classId]}`,
				);
			}
			out.push("\t\t},");
		}
		out.push("\t},");
	}
	out.push("];");
	out.push("");
	return out.join("\n");
}

/** The file minus the lines naming the build, to tell whether the data changed. */
const withoutStamp = (text) =>
	text
		.split("\n")
		.filter((l) => !l.includes(" build ") && !l.startsWith("export const GAME_BUILD"))
		.join("\n");

/** Formats like the repo does (Biome), so the checked-in file passes lint as written. */
function format(text) {
	const root = resolve(here, "../../..");
	const biome = resolve(root, "node_modules/.bin/biome");
	const res = spawnSync(biome, ["format", `--stdin-file-path=${OUT}`], { cwd: root, input: text, encoding: "utf8" });
	if (res.status !== 0) throw new Error(`biome format failed: ${res.stderr || res.error}`);
	return res.stdout;
}

const title = (token) => token[0] + token.slice(1).toLowerCase();

/** Per class, "Mail (40)" style lines, for comparing two versions. */
function perClass(skills) {
	const out = {};
	for (const token of Object.values(CLASSES)) out[token] = new Map();
	for (const s of skills) {
		for (const [classId, g] of Object.entries(s.classes)) {
			out[CLASSES[classId]].set(s.name, `${g.level}${g.suspect ? " (suspect)" : ""}`);
		}
	}
	return out;
}

/** Markdown: what changed per class between two versions of the data. */
export function summarize(before, after) {
	const lines = [];
	const prev = before ? perClass(before.skills) : undefined;
	const next = perClass(after.skills);
	lines.push(
		before
			? `Build ${before.build.version} → **${after.build.version}**${after.build.date ? ` (${after.build.date})` : ""}.`
			: `Build **${after.build.version}**.`,
	);
	lines.push("");
	let changes = 0;
	for (const token of Object.values(CLASSES)) {
		const a = prev?.[token] ?? new Map();
		const b = next[token];
		const diffs = [];
		for (const [name, level] of b) {
			if (!a.has(name)) diffs.push(`+ ${name} from level ${level}`);
			else if (a.get(name) !== level) diffs.push(`~ ${name}: level ${a.get(name)} → ${level}`);
		}
		for (const name of a.keys()) if (!b.has(name)) diffs.push(`- ${name} (was from level ${a.get(name)})`);
		if (!diffs.length) continue;
		changes += diffs.length;
		lines.push(`**${title(token)}**`);
		lines.push("");
		for (const d of diffs.sort()) lines.push(`- \`${d}\``);
		lines.push("");
	}
	const names = (list) => new Set((list ?? []).map((s) => s.name));
	const newLines = [...names(after.skills)].filter((n) => before && !names(before.skills).has(n));
	if (newLines.length) {
		lines.push(`New skill lines: ${newLines.join(", ")}.`);
		lines.push("");
	}
	const unmapped = after.skills.filter(
		(s) =>
			s.armor === undefined &&
			s.weapon === undefined &&
			!s.dualWield &&
			Object.keys(s.classes).length &&
			!["Defense", "Unarmed", "Feral Combat"].includes(s.name),
	);
	if (unmapped.length) {
		lines.push(
			`Skill lines with no item type in the script (map them in gen-proficiencies.mjs if they matter): ${unmapped.map((s) => s.name).join(", ")}.`,
		);
		lines.push("");
	}
	if (!changes) lines.push("No class gained or lost a skill (only rows or names changed).");
	return lines.join("\n");
}

async function main() {
	const wanted = arg("--build");
	const build = wanted ? await buildInfo(wanted) : await latestBuild();
	const [skillLines, skillRaceClassInfo, chrClasses] = await Promise.all([
		table("SkillLine", build.version),
		table("SkillRaceClassInfo", build.version),
		table("ChrClasses", build.version),
	]);
	if (!skillLines.length || !skillRaceClassInfo.length) throw new Error(`empty tables for build ${build.version}`);
	const skills = compute({ skillLines, skillRaceClassInfo, chrClasses });
	const text = format(render(build, skills));
	const old = existsSync(OUT) ? readFileSync(OUT, "utf8") : undefined;
	// A new build with the same data leaves the file (and its stamp) alone:
	// GAME_BUILD is the build the data was last read from that changed it.
	const changed = !old || withoutStamp(old) !== withoutStamp(text);

	const summaryPath = arg("--summary");
	if (summaryPath) {
		let before;
		if (old) {
			const mod = await import(`${pathToFileURL(OUT).href}?t=${Date.now()}`);
			before = { build: mod.GAME_BUILD, skills: mod.GENERATED_SKILLS };
		}
		const after = { build: { version: build.version, date: (build.created_at || "").slice(0, 10) }, skills };
		writeFileSync(summaryPath, `${summarize(before, after)}\n`);
	}
	if (args.includes("--check")) {
		console.log(changed ? `would change (build ${build.version})` : `up to date (build ${build.version})`);
		process.exit(changed ? 1 : 0);
	}
	if (changed) writeFileSync(OUT, text);
	console.log(`${changed ? "wrote" : "unchanged:"} ${OUT} (build ${build.version})`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}
