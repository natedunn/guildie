import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Players' preferences (characterPreferences: stat priority, gear types,
// removed items) are theirs: no sync, claim or cleanup may delete or
// overwrite them. Only preferences.ts writes that table, only to apply the
// player's own change, and never deletes from it. These checks read the code,
// so a new writer anywhere fails here first.

const dir = new URL(".", import.meta.url).pathname;
const files = readdirSync(dir)
	.filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
	.map((name) => ({ name, text: readFileSync(join(dir, name), "utf8") }));
const PREFERENCE_FIELDS = /\b(statPriority|gearPreference|dismissedItems)\b/;

/** Every ctx.db write call: its method and the text up to its closing parenthesis. */
function writes(text: string) {
	const out: { method: string; call: string }[] = [];
	const re = /ctx\.db\.(insert|patch|replace|delete)\(/g;
	for (let m = re.exec(text); m; m = re.exec(text)) {
		let depth = 1;
		let i = m.index + m[0].length;
		for (; i < text.length && depth > 0; i++) {
			if (text[i] === "(") depth++;
			else if (text[i] === ")") depth--;
		}
		out.push({ method: m[1], call: text.slice(m.index, i) });
	}
	return out;
}

test("only preferences.ts writes characterPreferences", () => {
	for (const { name, text } of files) {
		if (name === "preferences.ts" || name === "schema.ts") continue;
		assert.doesNotMatch(text, /["']characterPreferences["']/, `${name} touches characterPreferences`);
	}
});

test("nothing deletes or replaces preferences", () => {
	const prefs = files.find((f) => f.name === "preferences.ts");
	assert.ok(prefs);
	for (const { method } of writes(prefs.text)) {
		assert.ok(method === "insert" || method === "patch", `preferences.ts calls ctx.db.${method}`);
	}
});

test("no other code sets preference fields", () => {
	for (const { name, text } of files) {
		if (name === "preferences.ts") continue;
		for (const { method, call } of writes(text)) {
			assert.doesNotMatch(call, PREFERENCE_FIELDS, `${name}: ctx.db.${method} sets a preference field: ${call}`);
		}
	}
});

test("claims never replace a claim row (a patch keeps the rest of it)", () => {
	for (const { name, text } of files) {
		for (const { call } of writes(text)) {
			if (!call.startsWith("ctx.db.replace(")) continue;
			assert.doesNotMatch(call, /claim|owned/i, `${name}: ${call}`);
		}
	}
});

test("claims.save saves legacy preferences before deleting a claim", () => {
	const claims = files.find((f) => f.name === "claims.ts")?.text ?? "";
	const start = claims.indexOf("export const save");
	assert.ok(start >= 0);
	const save = claims.slice(start, claims.indexOf("export const", start + 1));
	const lines = save.split("\n");
	let deletes = 0;
	lines.forEach((line, i) => {
		const deleted = /ctx\.db\.delete\((\w+)\._id\)/.exec(line)?.[1];
		if (!deleted) return;
		deletes++;
		assert.match(lines[i - 1] ?? "", new RegExp(`moveLegacy\\(ctx, ${deleted}\\)`), line.trim());
	});
	assert.ok(deletes > 0, "found claims.save's deletes");
});
