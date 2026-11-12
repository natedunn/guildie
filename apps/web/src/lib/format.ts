const units: [Intl.RelativeTimeFormatUnit, number][] = [
	["year", 365 * 24 * 3600_000],
	["month", 30 * 24 * 3600_000],
	["week", 7 * 24 * 3600_000],
	["day", 24 * 3600_000],
	["hour", 3600_000],
	["minute", 60_000],
];
const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function ago(timestamp: number | undefined, now = Date.now()) {
	if (!timestamp) return undefined;
	const diff = timestamp - now;
	for (const [unit, ms] of units) {
		if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
	}
	return "just now";
}

/** The API gives rank numbers only; 0 is always the guild master. */
export function rankLabel(rank: number) {
	return rank === 0 ? "Guild Master" : `Rank ${rank}`;
}

/** What's left of an ongoing request: "12 days left", "3 weeks left", "2 months left". */
export function timeLeft(until: number | undefined, now = Date.now()) {
	if (!until) return undefined;
	const days = Math.ceil((until - now) / (24 * 3600_000));
	if (days <= 1) return "Ends today";
	if (days < 14) return `${days} days left`;
	if (days < 28) return `${Math.round(days / 7)} weeks left`;
	const months = Math.max(1, Math.round(days / 30));
	return months === 1 ? "1 month left" : `${months} months left`;
}

/** A date in the near future, short: "Dec 12". */
export function shortDate(timestamp: number) {
	return new Date(timestamp).toLocaleDateString("en", { month: "short", day: "numeric" });
}
