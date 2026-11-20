// What the game-data generators share: WoW: Forever's DB2 tables as
// wago.tools publishes them per build, and Biome formatting for the files
// they write. docs/game-data.md.

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PRODUCT = "wowf";
const USER_AGENT = "Guildie game-data check (https://github.com/natedunn/guildie)";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export async function get(url) {
	for (let attempt = 1; ; attempt++) {
		const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
		if (res.ok) return res;
		if (attempt >= 3 || res.status < 500) throw new Error(`${url}: HTTP ${res.status}`);
		await new Promise((r) => setTimeout(r, 2000 * attempt));
	}
}

/** RFC 4180-ish CSV (quoted fields may hold commas, quotes and newlines). */
export function parseCsv(text) {
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

/** One DB2 table of a build, as objects keyed by column name (all strings). */
export async function table(name, build) {
	const res = await get(`https://wago.tools/db2/${name}/csv?build=${encodeURIComponent(build)}`);
	return parseCsv(await res.text());
}

/** The newest Forever build: { version, created_at, ... }. */
export async function latestBuild() {
	const builds = await (await get("https://wago.tools/api/builds")).json();
	const list = builds[PRODUCT];
	if (!Array.isArray(list) || !list.length) throw new Error(`wago.tools lists no ${PRODUCT} builds`);
	return list[0];
}

/** A given Forever build (its date, when wago.tools still lists it). */
export async function buildInfo(version) {
	const builds = await (await get("https://wago.tools/api/builds")).json();
	return (builds[PRODUCT] ?? []).find((b) => b.version === version) ?? { version, created_at: "" };
}

/** Formats like the repo does (Biome), so a checked-in file passes lint as written. `path`: where it'll live. */
export function format(text, path) {
	const biome = resolve(ROOT, "node_modules/.bin/biome");
	const res = spawnSync(biome, ["format", `--stdin-file-path=${path}`], { cwd: ROOT, input: text, encoding: "utf8" });
	if (res.status !== 0) throw new Error(`biome format failed: ${res.stderr || res.error}`);
	return res.stdout;
}

/** The generated file minus the lines naming the build, to tell whether the data changed. */
export const withoutStamp = (text) =>
	text
		.split("\n")
		.filter((l) => !l.includes(" build ") && !/^export const \w*BUILD\b/.test(l))
		.join("\n");

/** `--name value` from the command line. */
export function arg(args, name) {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : undefined;
}
