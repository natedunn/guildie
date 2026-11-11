import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("sync guild rosters", { hours: 1 }, internal.sync.syncAll, {});
crons.weekly(
	"sync recipe catalog",
	{ dayOfWeek: "tuesday", hourUTC: 9, minuteUTC: 0 },
	internal.recipes.syncCatalog,
	{},
);

// Guild requests with no activity for 30 days close as expired (requests.ts).
crons.daily("expire stale requests", { hourUTC: 8, minuteUTC: 30 }, internal.requests.expireStale, {});

crons.daily("backfill item names and icons", { hourUTC: 10, minuteUTC: 30 }, internal.items.backfill, {});

crons.daily("backfill quest titles", { hourUTC: 11, minuteUTC: 0 }, internal.quests.backfill, {});

export default crons;
