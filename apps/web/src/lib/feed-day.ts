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
