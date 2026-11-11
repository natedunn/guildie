// Writes apps/web/convex/shared/dungeons.generated.ts: WoW: Forever's
// dungeons (five-player instances, no raids), each with its level, bosses and
// loading-screen art, read from the game's own data (DB2 tables as published
// per build by wago.tools). Blizzard's web API has no dungeon journal for
// Forever.
//
//   node apps/web/scripts/gen-dungeons.mjs                 # latest Forever build
//   node apps/web/scripts/gen-dungeons.mjs --build 1.60.1.70888
//   node apps/web/scripts/gen-dungeons.mjs --check          # exit 1 if the file would change
//
// How it reads the tables:
// - LFGDungeons: the game's dungeon finder list (TypeID 0). Its MapID is 0 in
//   Forever, so DUNGEONS below names each finder entry's map by hand. Its
//   ContentTuningID -> ContentTuning.MinLevelSquish is the level the dungeon
//   is tuned for (Deadmines 16); a map with several entries (Dire Maul's
//   wings) takes the lowest.
// - Map: the name, InstanceType (1: dungeon) and LoadingScreenID.
// - DungeonEncounter: the bosses per map, in OrderIndex order, for the map's
//   most common difficulty (Sunken Temple lists some twice).
// - LoadingScreens: the art. Forever's own dungeons have MainImageFileDataID
//   (16:9); the original ones NarrowScreenFileDataID (4:3). The images
//   themselves are converted and uploaded to R2 by scripts/dungeon-art.py.
//
// Which quests belong to each dungeon comes from Blizzard's quest areas at
// run time (convex/dungeons.ts), matched by name.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../convex/shared/dungeons.generated.ts");
const PRODUCT = "wowf";
const USER_AGENT = "Guildie game-data check (https://github.com/natedunn/guildie)";

/**
 * Map id -> the dungeon finder entries (LFGDungeons.ID) for it, and the URL
 * key. Raids (Zul'Gurub, Onyxia, Molten Core, Blackwing Lair) are left out.
 */
const DUNGEONS = [
	[389, [3], "ragefire-chasm"],
	[36, [5], "deadmines"],
	[43, [1], "wailing-caverns"],
	[33, [7], "shadowfang-keep"],
	[48, [9], "blackfathom-deeps"],
	[34, [11], "stockade"],
	[90, [13], "gnomeregan"],
	[47, [15], "razorfen-kraul"],
	[189, [17], "scarlet-monastery"],
	[129, [19], "razorfen-downs"],
	[70, [21], "uldaman"],
	[209, [23], "zulfarrak"],
	[349, [25], "maraudon"],
	[109, [27], "sunken-temple"],
	[230, [29], "blackrock-depths"],
	[229, [31, 43], "blackrock-spire"],
	[429, [33, 35, 37], "dire-maul"],
	[329, [39], "stratholme"],
	[289, [2], "scholomance"],
	// Forever's own.
	[3065, [3273], "hall-of-thanes"],
	[2999, [3272], "ruins-of-lordaeron"],
	[2998, [3274], "excavation-site-wetlands"],
	[2959, [3271], "city-of-dalaran"],
	[2970, [3270], "drowned-city"],
	[3039, [3275], "kroldok-stronghold"],
	[2994, [3269], "alcaz-prison"],
	[2974, [3268], "blackmaw-hold"],
	[3001, [3267], "shapers-terrace"],
];

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

const table = async (name, build) =>
	parseCsv(await (await get(`https://wago.tools/db2/${name}/csv?build=${encodeURIComponent(build)}`)).text());

async function builds() {
	const all = await (await get("https://wago.tools/api/builds")).json();
	const list = all[PRODUCT];
	if (!Array.isArray(list) || !list.length) throw new Error(`wago.tools lists no ${PRODUCT} builds`);
	return list;
}

export function compute({ lfg, tuning, maps, encounters, screens }) {
	const lfgById = new Map(lfg.map((r) => [r.ID, r]));
	const tuningById = new Map(tuning.map((r) => [r.ID, r]));
	const mapById = new Map(maps.map((r) => [r.ID, r]));
	const screenById = new Map(screens.map((r) => [r.ID, r]));
	return DUNGEONS.map(([mapId, lfgIds, key]) => {
		const map = mapById.get(String(mapId));
		if (!map) throw new Error(`Map ${mapId} (${key}) is missing`);
		if (map.InstanceType !== "1")
			throw new Error(`Map ${mapId} (${key}) isn't a dungeon (InstanceType ${map.InstanceType})`);
		const levels = lfgIds.map((id) => {
			const entry = lfgById.get(String(id));
			if (!entry) throw new Error(`LFGDungeons ${id} (${key}) is missing`);
			return Number(tuningById.get(entry.ContentTuningID)?.MinLevelSquish ?? 0);
		});
		const level = Math.min(...levels.filter((l) => l > 0));
		// Bosses: the map's most common difficulty, in order, each name once.
		const rows = encounters.filter((e) => e.MapID === String(mapId));
		const count = new Map();
		for (const e of rows) count.set(e.DifficultyID, (count.get(e.DifficultyID) ?? 0) + 1);
		const difficulty = [...count.entries()].sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0]?.[0];
		const bosses = [];
		for (const e of rows
			.filter((e) => e.DifficultyID === difficulty)
			.sort((a, b) => Number(a.OrderIndex) - Number(b.OrderIndex) || Number(a.ID) - Number(b.ID))) {
			if (!bosses.includes(e.Name_lang)) bosses.push(e.Name_lang);
		}
		const screen = screenById.get(map.LoadingScreenID);
		const main = Number(screen?.MainImageFileDataID ?? 0);
		const narrow = Number(screen?.NarrowScreenFileDataID ?? 0);
		return {
			mapId,
			key,
			name: map.MapName_lang,
			level: Number.isFinite(level) ? level : 0,
			bosses,
			art: main ? { fileId: main, wide: true } : narrow ? { fileId: narrow, wide: false } : undefined,
		};
	});
}

function render(build, dungeons) {
	const date = (build.created_at || "").slice(0, 10);
	const out = [];
	out.push("// GENERATED by apps/web/scripts/gen-dungeons.mjs. Do not edit by hand: run the script.");
	out.push("//");
	out.push(
		`// WoW: Forever (${PRODUCT}) build ${build.version}${date ? ` of ${date}` : ""}: LFGDungeons, ContentTuning,`,
	);
	out.push("// Map, DungeonEncounter and LoadingScreens as published by wago.tools.");
	out.push("");
	out.push("export type GeneratedDungeon = {");
	out.push("\t/** Map.ID (the instance). */");
	out.push("\tmapId: number;");
	out.push("\t/** In URLs. */");
	out.push("\tkey: string;");
	out.push("\tname: string;");
	out.push("\t/** The level it's tuned for (ContentTuning). */");
	out.push("\tlevel: number;");
	out.push("\t/** In the game's order. */");
	out.push("\tbosses: string[];");
	out.push("\t/** Loading-screen art (file data id); `wide`: 16:9, else 4:3. On R2 as dungeons/<key>.jpg. */");
	out.push("\tart?: { fileId: number; wide: boolean };");
	out.push("};");
	out.push("");
	out.push(
		`export const DUNGEON_BUILD = { product: ${JSON.stringify(PRODUCT)}, version: ${JSON.stringify(build.version)}, date: ${JSON.stringify(date)} } as const;`,
	);
	out.push("");
	out.push(`export const GENERATED_DUNGEONS: GeneratedDungeon[] = ${JSON.stringify(dungeons)};`);
	out.push("");
	return out.join("\n");
}

function format(text) {
	const root = resolve(here, "../../..");
	const res = spawnSync(resolve(root, "node_modules/.bin/biome"), ["format", `--stdin-file-path=${OUT}`], {
		cwd: root,
		input: text,
		encoding: "utf8",
	});
	if (res.status !== 0) throw new Error(`biome format failed: ${res.stderr || res.error}`);
	return res.stdout;
}

const withoutStamp = (text) =>
	text
		.split("\n")
		.filter((l) => !l.includes(" build ") && !l.startsWith("export const DUNGEON_BUILD"))
		.join("\n");

async function main() {
	const args = process.argv.slice(2);
	const at = args.indexOf("--build");
	const list = await builds();
	const build = at >= 0 ? (list.find((b) => b.version === args[at + 1]) ?? { version: args[at + 1] }) : list[0];
	const [lfg, tuning, maps, encounters, screens] = await Promise.all(
		["LFGDungeons", "ContentTuning", "Map", "DungeonEncounter", "LoadingScreens"].map((t) => table(t, build.version)),
	);
	const dungeons = compute({ lfg, tuning, maps, encounters, screens });
	const text = format(render(build, dungeons));
	const old = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
	const changed = withoutStamp(old) !== withoutStamp(text);
	if (args.includes("--check")) {
		console.log(changed ? "dungeons: would change" : "dungeons: up to date");
		process.exit(changed ? 1 : 0);
	}
	if (changed || !old) writeFileSync(OUT, text);
	for (const d of dungeons)
		console.log(`${d.name} (${d.level}): ${d.bosses.length} bosses, art ${d.art ? d.art.fileId : "none"}`);
	console.log(changed ? `Wrote ${OUT}` : "No change");
}

await main();
