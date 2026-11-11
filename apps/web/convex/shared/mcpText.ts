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
