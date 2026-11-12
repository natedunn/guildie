// Omni search's matching (the ⌘K palette): how well a query matches a name,
// shared by the server (guild members, inventory, requests) and the browser
// (pages, settings, dungeons). No Convex imports, so `node --test` runs it.

/** Lowercase, accents off ("Zul'Farrak" and "zulfarrak" meet), apostrophes gone. */
export function fold(text: string) {
	return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’`]/g, "");
}

/**
 * How well `query` matches `text`, 0 for no match. Best: the whole text;
 * then a prefix; then a word's start; then anywhere; then every query word
 * somewhere ("dead mines", "mines dead"); last, the letters in order
 * ("bfd" for Blackfathom Deeps). Shorter texts win ties.
 */
export function matchScore(query: string, text: string): number {
	const q = fold(query).trim();
	const t = fold(text);
	if (!q) return 0;
	if (!t) return 0;
	const tie = 1 / (1 + t.length);
	if (t === q) return 100;
	if (t.startsWith(q)) return 80 + tie;
	const at = t.indexOf(q);
	if (at > 0) {
		for (let i = at; i >= 0; i = t.indexOf(q, i + 1)) if (/[^a-z0-9]/.test(t[i - 1])) return 60 + tie;
		return 40 + tie;
	}
	const words = q.split(/\s+/).filter(Boolean);
	if (words.length > 1 && words.every((w) => t.includes(w))) return 30 + tie;
	if (q.length >= 2 && !/\s/.test(q) && initialsOrInOrder(q, t)) return 10 + tie;
	return 0;
}

/** The best score over several names for one thing (a page's title and its other words). */
export function bestScore(query: string, texts: (string | undefined)[]) {
	let best = 0;
	for (const t of texts) if (t) best = Math.max(best, matchScore(query, t));
	return best;
}

/** "bfd" → Blackfathom Deeps (word initials), or every letter in order within a short-ish name. */
function initialsOrInOrder(q: string, t: string) {
	const initials = t
		.split(/[^a-z0-9]+/)
		.filter(Boolean)
		.map((w) => w[0])
		.join("");
	if (initials.startsWith(q)) return true;
	// Letters in order, but not so spread out that anything matches.
	let i = 0;
	let first = -1;
	for (let j = 0; j < t.length && i < q.length; j++) {
		if (t[j] === q[i]) {
			if (first < 0) first = j;
			i++;
			// Short abbreviations may skip a lot ("rfc": Ragefire Chasm); longer words barely
			// ("restores" isn't Soren Stormcrest).
			if (i === q.length) return j - first < (q.length <= 4 ? q.length * 4 : q.length + 2);
		}
	}
	return false;
}

/**
 * What an item does, for searching by description: its "Use:", "Equip:"
 * and "Chance on hit:" effects, a bag's size ("10 Slot Bag"), its set
 * (yellow) and its flavor text (in quotes). Not stats or enchants, though they're green too ("+2 Spirit",
 * "Flametongue 1"), nor binding or durability. One line each.
 */
export function itemDescription(tooltip: { left: string; color?: string }[]): string | undefined {
	const lines = tooltip
		.map((l) => ({ text: l.left.trim(), color: l.color?.toLowerCase() }))
		.filter(
			({ text, color }) =>
				/^(use|equip|chance on hit):/i.test(text) ||
				/^\d+ slot /i.test(text) ||
				/^["“].+["”]$/.test(text) ||
				(color === "#ffd100" && !!text),
		)
		.map(({ text }) => text.replace(/^["“]|["”]$/g, ""));
	return lines.length ? lines.join("\n") : undefined;
}

/** Whether every word of the query is somewhere in the text ("10 slot bag", not just "10"). */
export function hasAllWords(query: string, text: string) {
	const t = fold(text);
	return fold(query)
		.split(/\s+/)
		.filter(Boolean)
		.every((w) => t.includes(w));
}

/** The line of a description that best matches the query (the first, if none does word for word). */
export function bestLine(query: string, description: string) {
	const lines = description.split("\n");
	let best = lines[0];
	let score = 0;
	for (const line of lines) {
		const s = matchScore(query, line);
		if (s > score) {
			score = s;
			best = line;
		}
	}
	return best;
}
