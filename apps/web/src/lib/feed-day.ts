// The feed's days start at 4am, not midnight: a late night's level-ups
// belong to the evening they started in. Local time, like the page.

/** The hour a feed day starts. */
export const FEED_DAY_START_HOUR = 4;

/** When the feed day holding `at` started (4am local, that day or the day before). */
export function feedDayStart(at: number): Date {
	const d = new Date(at);
	if (d.getHours() < FEED_DAY_START_HOUR) d.setDate(d.getDate() - 1);
	d.setHours(FEED_DAY_START_HOUR, 0, 0, 0);
	return d;
}

/** How many feed days before today `at` is: 0 today, 1 yesterday. */
export function feedDaysAgo(at: number, now = Date.now()): number {
	return Math.round((feedDayStart(now).getTime() - feedDayStart(at).getTime()) / 86_400_000);
}

/** `at` moved by whole days on the local calendar (so 4am stays 4am across DST). */
export function addDays(at: number, days: number): number {
	const d = new Date(at);
	d.setDate(d.getDate() + days);
	return d.getTime();
}

/** A feed day in the URL: its local date, "2026-11-13". */
export function feedDayKey(start: number): string {
	const d = new Date(start);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** When the feed day in the URL starts (4am local), or undefined for a malformed one. */
export function feedDayFromKey(key: string): number | undefined {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
	if (!m) return undefined;
	const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), FEED_DAY_START_HOUR);
	return Number.isNaN(d.getTime()) ? undefined : d.getTime();
}

/** "Today", "Yesterday", then "Monday, Nov 3". */
export function feedDayLabel(start: number, now = Date.now()): string {
	const ago = feedDaysAgo(start, now);
	if (ago === 0) return "Today";
	if (ago === 1) return "Yesterday";
	return new Date(start).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}
