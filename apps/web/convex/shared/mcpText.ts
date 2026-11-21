// Text helpers for the MCP tools (convex/mcp.ts): what an AI app reads back.
// Short lines, names instead of ids, no nesting: every character costs the
// player tokens. No Convex imports, so `node --test` can run it.

const UNITS: [string, number][] = [
	["y", 365 * 86_400_000],
	["mo", 30 * 86_400_000],
	["w", 7 * 86_400_000],
	["d", 86_400_000],
	["h", 3_600_000],
	["m", 60_000],
];

/** "3d ago", "just now", or "" for no time at all. */
export function ago(at: number | undefined, now: number) {
	if (!at) return "";
	const diff = Math.max(0, now - at);
	for (const [unit, ms] of UNITS) if (diff >= ms) return `${Math.floor(diff / ms)}${unit} ago`;
	return "just now";
}

/** Lowercase, accents and punctuation gone, so "Brisket", "brisket-smith" and "Brísket" compare alike. */
export function fold(text: string) {
	return text
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/** Every word of the search appears somewhere in the haystack (both folded). */
export function matches(search: string, ...haystack: (string | undefined)[]) {
	const words = fold(search).split(" ").filter(Boolean);
	if (!words.length) return true;
	const text = ` ${haystack
		.filter(Boolean)
		.map((h) => fold(h as string))
		.join(" ")} `;
	return words.every((w) => text.includes(w));
}

/** At most `max` lines, then how many more there were and how to narrow it. */
export function capped(lines: string[], max: number, narrow: string) {
	if (lines.length <= max) return lines;
	return [...lines.slice(0, max), `…and ${lines.length - max} more. ${narrow}`];
}

/** Names in a sentence, at most `max`: "Miller, Brisket and 4 more". */
export function listed(names: string[], max: number) {
	if (names.length <= max) return names.join(", ");
	return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}

/**
 * One page of a long list (`page` from 1), then where it stands: "Page 1 of 3;
 * ask for page 2 for more." A page past the end gets the last one.
 */
export function paged(lines: string[], page: number | undefined, size: number) {
	const pages = Math.max(1, Math.ceil(lines.length / size));
	const at = Math.min(Math.max(1, Math.floor(page ?? 1)), pages);
	const out = lines.slice((at - 1) * size, at * size);
	if (pages > 1) out.push(`Page ${at} of ${pages}${at < pages ? `; ask for page ${at + 1} for more` : ""}.`);
	return out;
}

/** Copper as the game shows money: "12g 3s 40c", "0c". */
export function gold(copper: number | undefined) {
	if (copper === undefined) return "";
	const g = Math.floor(copper / 10_000);
	const s = Math.floor((copper % 10_000) / 100);
	const c = copper % 100;
	const parts = [g ? `${g}g` : "", s ? `${s}s` : "", c || (!g && !s) ? `${c}c` : ""];
	return parts.filter(Boolean).join(" ");
}

/** Item quality as players say it ("RARE" → "Rare"). */
export function quality(q: string | undefined) {
	if (!q) return "";
	return q.charAt(0) + q.slice(1).toLowerCase();
}

/** "HEAD" → "Head", "MAIN_HAND" → "Main hand". */
export function slotName(slot: string) {
	const s = slot.toLowerCase().replace(/_/g, " ");
	return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---- Names a model writes → Guildie's keys (the write tools) ----------------------

/** Words people use for the priority stats, folded (PRIORITY_STATS labels and keys match too). */
const STAT_ALIASES: Record<string, string> = {
	str: "STRENGTH",
	agi: "AGILITY",
	stam: "STAMINA",
	sta: "STAMINA",
	int: "INTELLECT",
	spi: "SPIRIT",
	ap: "ATTACK_POWER",
	sp: "SPELL_DAMAGE_DONE",
	"spell power": "SPELL_DAMAGE_DONE",
	"spell damage": "SPELL_DAMAGE_DONE",
	"healing power": "SPELL_HEALING_DONE",
	"bonus healing": "SPELL_HEALING_DONE",
	"critical strike": "CRIT_RATING",
	"crit chance": "CRIT_RATING",
	"hit chance": "HIT_RATING",
	"defense skill": "DEFENSE_SKILL_RATING",
	mp5: "MANA_REGENERATION",
	"mana regen": "MANA_REGENERATION",
	"mana regeneration": "MANA_REGENERATION",
};

/** A stat's key from what someone called it, or undefined. `labels`: PRIORITY_STATS. */
export function statKey(name: string, labels: Record<string, string>) {
	const f = fold(name);
	for (const [key, label] of Object.entries(labels)) {
		if (f === fold(key) || f === fold(label)) return key;
	}
	return STAT_ALIASES[f];
}

/** "2h swords", "two-hand sword", "staff" → the folded form PROFICIENCY_TYPES names compare in. */
function gearWords(name: string) {
	return fold(name)
		.replace(/\b(2h|2 h|two hand|two handed|2 handed)\b/g, "two handed")
		.replace(/\bstaff\b/g, "staves")
		.split(" ")
		.map((w) => (w.length > 3 && !w.endsWith("s") && w !== "thrown" && w !== "two" && w !== "handed" ? `${w}s` : w))
		.join(" ")
		.replace(/\bmails\b/g, "mail")
		.replace(/\bleathers\b/g, "leather")
		.replace(/\bplates\b/g, "plate")
		.replace(/\bcloths\b/g, "cloth");
}

/** The type someone named, among `types` (one kind's PROFICIENCY_TYPES), or undefined. */
export function gearType<T extends { name: string }>(name: string, types: T[]) {
	const want = gearWords(name);
	return types.find((t) => gearWords(t.name) === want);
}
