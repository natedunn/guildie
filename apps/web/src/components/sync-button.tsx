import { api } from "@convex/_generated/api";
import { AUTO_SYNC_INTERVAL_MS, MANUAL_SYNC_COOLDOWN_MS, type Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { Alert02Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// The sidebar's sync row: when a guild's roster last synced with Blizzard,
// as a row that syncs it again. Rosters sync by themselves every hour; by
// hand, at most every ten minutes. The hover says when it synced, when it
// next syncs by itself, when the row works again, and the last error.

/** Re-renders every 30 seconds, for "5 min ago" and countdowns. */
function useNow() {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const t = setInterval(() => setNow(Date.now()), 30_000);
		return () => clearInterval(t);
	}, []);
	return now;
}

const minutes = (ms: number) => {
	const m = Math.max(1, Math.ceil(ms / 60_000));
	return `${m} minute${m === 1 ? "" : "s"}`;
};

/** "just now", "39 min ago", "2 hr ago", "3 days ago": short enough for a sidebar row. */
function shortAgo(at: number, now: number) {
	const m = Math.floor((now - at) / 60_000);
	if (m < 1) return "just now";
	if (m < 60) return `${m} min ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h} hr ago`;
	const d = Math.floor(h / 24);
	return `${d} day${d === 1 ? "" : "s"} ago`;
}

/** The sync row for one guild (by its URL key); nothing while it loads or if you can't see it. */
export function SyncButton({ region, slug }: { region: string; slug: string }) {
	const { data: status } = useQuery(convexQuery(api.guilds.syncStatus, { region: region as Region, slug }));
	const requestSync = useMutation(api.guilds.requestSync);
	const now = useNow();
	const [error, setError] = useState<string | null>(null);
	if (!status) return null;
	const { syncedAt, requestedAt, lastSyncError } = status;
	const syncing = !!requestedAt && requestedAt > (syncedAt ?? 0) && now - requestedAt < 2 * 60_000;
	const cooldownLeft = syncedAt ? syncedAt + MANUAL_SYNC_COOLDOWN_MS - now : 0;
	const nextAuto = syncedAt ? syncedAt + AUTO_SYNC_INTERVAL_MS - now : 0;
	const canSync = !syncing && cooldownLeft <= 0;
	const failed = !syncing && (!!error || !!lastSyncError);
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<button
						type="button"
						aria-disabled={!canSync}
						className={cn("nav-item w-full text-left", !canSync && "cursor-default hover:bg-transparent")}
						onClick={async () => {
							if (!canSync) return;
							setError(null);
							try {
								await requestSync({ guildId: status._id });
							} catch (err) {
								setError(err instanceof ConvexError ? String(err.data) : "Couldn't start a sync.");
							}
						}}
					/>
				}
			>
				<HugeiconsIcon
					icon={RefreshIcon}
					size={15}
					strokeWidth={1.75}
					className={syncing ? "animate-spin" : undefined}
				/>
				<span className="min-w-0 flex-1 truncate">
					{syncing ? "Syncing…" : syncedAt ? `Synced ${shortAgo(syncedAt, now)}` : "Sync now"}
				</span>
				{failed && (
					<HugeiconsIcon
						icon={Alert02Icon}
						size={14}
						strokeWidth={1.75}
						className="text-destructive"
						aria-label="Sync failed"
					/>
				)}
			</TooltipTrigger>
			<TooltipContent side="right" align="end" sideOffset={10} className="block w-64 max-w-none space-y-1 text-left">
				<p className="font-medium">
					{syncing
						? `Syncing ${status.name}…`
						: syncedAt
							? `${status.name} synced ${shortAgo(syncedAt, now)}`
							: `${status.name} hasn't synced yet`}
				</p>
				{error && <p className="text-destructive">{error}</p>}
				{!syncing && lastSyncError && <p className="text-destructive">Last sync failed: {lastSyncError}</p>}
				<div className="space-y-0.5 text-muted-foreground">
					{syncing ? (
						<p>The roster updates first, then each member's details over the next few minutes.</p>
					) : (
						<>
							<p>
								{nextAuto > 0
									? `Syncs with Blizzard every hour; next in about ${minutes(nextAuto)}.`
									: "Syncs with Blizzard every hour; next any minute."}
							</p>
							<p>{canSync ? "Click to sync now." : `You can sync by hand again in ${minutes(cooldownLeft)}.`}</p>
						</>
					)}
				</div>
			</TooltipContent>
		</Tooltip>
	);
}
