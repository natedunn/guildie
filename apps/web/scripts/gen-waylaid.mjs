// Writes apps/web/convex/shared/waylaid.generated.ts: what each Waylaid
// Crate and Waylaid Supplies item takes to fill, read from WoW: Forever's
// own game data (its DB2 tables, as published per build by wago.tools).
// Blizzard's web API has none of this. For the addon's item tooltips: who in
// the guild makes or gathers what a crate takes.
//
//   node apps/web/scripts/gen-waylaid.mjs                 # latest Forever build
//   node apps/web/scripts/gen-waylaid.mjs --build 1.60.1.71037
//   node apps/web/scripts/gen-waylaid.mjs --summary out.md # also write what changed (markdown)
//   node apps/web/scripts/gen-waylaid.mjs --check          # exit 1 if the file would change
//
// How it reads the tables:
// - ItemSparse: the items named "Waylaid Crate: …" and "Waylaid Supplies: …",
//   their required level, and every item's name (to find a crate's bundles).
// - ItemXItemEffect + ItemEffect: the spell each one's "Use:" casts.
// - Waylaid Supplies: the spell's SpellReagents row is what it takes, one
//   item and its count ("Use: Add 12 Bronze Bars to complete the shipment.").
//   Five (Dusky Belts, Gnomish Rocket Boots, Goblin Mortars, Lesser
//   Stoneshield Potions, Shadowskin Gloves) take 20 Copper Bars in the game,
//   whatever their names say; their tooltips say so too, so that's kept.
// - Waylaid Crates take one bundle of several: the spell's description
//   lists them ("- $M3 Stranglekelp"; $Mn is effect n-1's base points, the
//   count), and SpellEffect has the counts. Names become item ids through
//   ItemSparse; a name that's more than one item needs an entry in
//   SAME_NAME below, else the script fails.
//
// Output is deterministic (sorted; stamped with the build's own date), so an
// unchanged build writes an identical file. .github/workflows/game-data.yml
// runs this daily and opens a PR on change.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { arg as argOf, buildInfo, format, latestBuild, PRODUCT, table, withoutStamp } from "./lib/wago.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../convex/shared/waylaid.generated.ts");

const args = process.argv.slice(2);
const arg = (name) => argOf(args, name);

/**
 * Names the game has more than one item for: which one a crate means.
 * Dark Iron Ore: 11370 drops from the veins (Classic's ore); 11099 is an
 * unused copy with the same name and icon.
 */
const SAME_NAME = { "Dark Iron Ore": 11370 };

/** Strips UI escapes: "|cnIQ1:" colors, "|r" resets. */
const plain = (s) => s.replace(/\|c[^:|]*:/g, "").replace(/\|r/g, "");

/** [{ id, name, kind, level, takes: [{ itemId, name, count }] }], sorted by kind, then name. */
export function compute({ itemSparse, itemXItemEffect, itemEffect, spells, spellReagents, spellEffects }) {
	const items = new Map(itemSparse.map((r) => [r.ID, r]));
	const byName = new Map();
	for (const r of itemSparse) {
		const list = byName.get(r.Display_lang) ?? [];
		list.push(Number(r.ID));
		byName.set(r.Display_lang, list);
	}
	const itemIdOf = (name) => {
		if (SAME_NAME[name]) return SAME_NAME[name];
		const ids = byName.get(name) ?? [];
		if (ids.length !== 1) throw new Error(`"${name}": ${ids.length} items have this name (add it to SAME_NAME)`);
		return ids[0];
	};
	const effects = new Map(itemEffect.map((r) => [r.ID, r]));
	const spellsOf = new Map();
	for (const r of itemXItemEffect) {
		const e = effects.get(r.ItemEffectID);
		if (!e) continue;
		const list = spellsOf.get(r.ItemID) ?? [];
		list.push(e.SpellID);
		spellsOf.set(r.ItemID, list);
	}
	const descriptions = new Map(spells.map((r) => [r.ID, r.Description_lang]));
	const reagents = new Map(spellReagents.map((r) => [r.SpellID, r]));
	const points = new Map();
	for (const r of spellEffects) points.set(`${r.SpellID}:${r.EffectIndex}`, Number(r.EffectBasePointsF));

	const out = [];
	for (const r of itemSparse) {
		const name = r.Display_lang;
		const kind = name.startsWith("Waylaid Crate:")
			? "crate"
			: name.startsWith("Waylaid Supplies:")
				? "supplies"
				: undefined;
		if (!kind) continue;
		const takes = [];
		for (const spell of spellsOf.get(r.ID) ?? []) {
			if (kind === "supplies") {
				const row = reagents.get(spell);
				for (let i = 0; i < 8 && row; i++) {
					const itemId = row[`Reagent_${i}`];
					if (!itemId || itemId === "0") continue;
					takes.push({
						itemId: Number(itemId),
						name: items.get(itemId)?.Display_lang ?? "",
						count: Number(row[`ReagentCount_${i}`]),
					});
				}
			} else {
				for (const [, n, bundle] of plain(descriptions.get(spell) ?? "").matchAll(/\$M(\d) ([^\n]+)/g)) {
					const count = points.get(`${spell}:${Number(n) - 1}`);
					const bundleName = bundle.trim();
					if (!count) throw new Error(`${name}: no count for ${bundleName}`);
					takes.push({ itemId: itemIdOf(bundleName), name: bundleName, count });
				}
			}
		}
		if (!takes.length) throw new Error(`${name} (${r.ID}): found nothing it takes`);
		out.push({ id: Number(r.ID), name, kind, level: Number(r.RequiredLevel || 0), takes });
	}
	return out.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name) || a.id - b.id);
}

function render(build, list) {
	const date = (build.created_at || "").slice(0, 10);
	const out = [];
	out.push("// GENERATED by apps/web/scripts/gen-waylaid.mjs. Do not edit by hand:");
	out.push("// run the script (or let .github/workflows/game-data.yml do it).");
	out.push("//");
	out.push(`// WoW: Forever (${PRODUCT}) build ${build.version}${date ? ` of ${date}` : ""}, from the game's`);
	out.push("// ItemSparse, ItemEffect, Spell, SpellReagents and SpellEffect tables as published by wago.tools.");
	out.push("// Every Waylaid Crate and Waylaid Supplies item and what it takes to fill:");
	out.push("// a crate takes any one of its bundles, a Supplies item its one.");
	out.push("");
	out.push("export type WaylaidBundle = { itemId: number; name: string; count: number };");
	out.push(
		'export type GeneratedWaylaid = { id: number; name: string; kind: "crate" | "supplies"; level: number; takes: WaylaidBundle[] };',
	);
	out.push("");
	out.push(
		`export const WAYLAID_BUILD = { product: ${JSON.stringify(PRODUCT)}, version: ${JSON.stringify(build.version)}, date: ${JSON.stringify(date)} } as const;`,
	);
	out.push("");
	out.push("export const GENERATED_WAYLAID: GeneratedWaylaid[] = [");
	for (const w of list) {
		const takes = w.takes
			.map((t) => `{ itemId: ${t.itemId}, name: ${JSON.stringify(t.name)}, count: ${t.count} }`)
			.join(", ");
		out.push(
			`\t{ id: ${w.id}, name: ${JSON.stringify(w.name)}, kind: ${JSON.stringify(w.kind)}, level: ${w.level}, takes: [${takes}] },`,
		);
	}
	out.push("];");
	out.push("");
	return out.join("\n");
}

const takesText = (w) => w.takes.map((t) => `${t.count} ${t.name}`).join(" or ");

/** Markdown: crates and Supplies added, removed or changed between two versions of the data. */
export function summarize(before, after) {
	const lines = [];
	lines.push(
		before
			? `Build ${before.build.version} → **${after.build.version}**${after.build.date ? ` (${after.build.date})` : ""}.`
			: `Build **${after.build.version}**.`,
	);
	lines.push("");
	const a = new Map((before?.list ?? []).map((w) => [w.id, w]));
	const b = new Map(after.list.map((w) => [w.id, w]));
	const diffs = [];
	for (const [id, w] of b) {
		const old = a.get(id);
		if (!old) diffs.push(`+ ${w.name}: ${takesText(w)}`);
		else if (takesText(old) !== takesText(w) || old.level !== w.level)
			diffs.push(`~ ${w.name}: ${takesText(old)} → ${takesText(w)}`);
	}
	for (const [id, w] of a) if (!b.has(id)) diffs.push(`- ${w.name}`);
	// A first run lists everything; keep the summary readable.
	const shown = before ? diffs : diffs.slice(0, 10);
	for (const d of shown) lines.push(`- \`${d}\``);
	if (shown.length < diffs.length) lines.push(`- …and ${diffs.length - shown.length} more`);
	if (!diffs.length) lines.push("No crate's contents changed (only names).");
	return lines.join("\n");
}

async function main() {
	const wanted = arg("--build");
	const build = wanted ? await buildInfo(wanted) : await latestBuild();
	const [itemSparse, itemXItemEffect, itemEffect, spells, spellReagents, spellEffects] = await Promise.all([
		table("ItemSparse", build.version),
		table("ItemXItemEffect", build.version),
		table("ItemEffect", build.version),
		table("Spell", build.version),
		table("SpellReagents", build.version),
		table("SpellEffect", build.version),
	]);
	const list = compute({ itemSparse, itemXItemEffect, itemEffect, spells, spellReagents, spellEffects });
	const crates = list.filter((w) => w.kind === "crate").length;
	if (crates < 20 || list.length - crates < 80)
		throw new Error(`only ${crates} crates and ${list.length - crates} Supplies in build ${build.version}`);
	const text = format(render(build, list), OUT);
	const old = existsSync(OUT) ? readFileSync(OUT, "utf8") : undefined;
	// A new build with the same data leaves the file (and its stamp) alone.
	const changed = !old || withoutStamp(old) !== withoutStamp(text);

	const summaryPath = arg("--summary");
	if (summaryPath) {
		let before;
		if (old) {
			const mod = await import(`${pathToFileURL(OUT).href}?t=${Date.now()}`);
			before = { build: mod.WAYLAID_BUILD, list: mod.GENERATED_WAYLAID };
		}
		const after = { build: { version: build.version, date: (build.created_at || "").slice(0, 10) }, list };
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
