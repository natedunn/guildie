import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { AUTO_SYNC_INTERVAL_MS, MANUAL_SYNC_COOLDOWN_MS, type Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, Outlet } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ago } from "@/lib/format";
import { shareMeta } from "@/lib/share";

// A guild's pages: the roster (index) and what the guild can craft
// (crafting), under one header with the guild's facts and the owner's
// controls. The sidebar switches between them (no tabs here).
export const Route = createFileRoute("/g/$region/$slug")({
	loader: async ({ context, params }) => {
		const data = await context.queryClient.ensureQueryData(
			convexQuery(api.guilds.get, { region: params.region as Region, slug: params.slug }),
		);
		if (!data) throw notFound();
		// What a shared link's preview says (members-only guilds say nothing more).
		let description = `${data.guild.name} is a members-only guild on Guildie.`;
		if (!data.hidden) {
			const g = data.guild;
			const faction = g.faction && g.faction[0] + g.faction.slice(1).toLowerCase();
			description = `${[g.region.toUpperCase(), faction].filter(Boolean).join(" · ")} guild, ${g.memberCount} members: roster, gear, talents and crafters on Guildie.`;
		}
		return { name: data.guild.name, description };
	},
	head: ({ loaderData }) => ({
		meta: [
			{ title: `${loaderData?.name ?? "Guild"} · Guildie` },
			...(loaderData ? shareMeta(loaderData.name, loaderData.description) : []),
		],
	}),
	component: GuildLayout,
});

function GuildLayout() {
	const params = Route.useParams();
	const { data } = useSuspenseQuery(
		convexQuery(api.guilds.get, { region: params.region as Region, slug: params.slug }),
	);
	if (!data) return null;
	if (data.hidden) {
		return (
			<PageHeader
				title={data.guild.name}
				description={
					<>
						This guild's roster is for members only.{" "}
						<Link to="/settings" className="text-foreground underline underline-offset-4">
							Claim your characters
						</Link>{" "}
						to see it.
					</>
				}
			/>
		);
	}
	const { guild } = data;
	const faction = guild.faction && guild.faction[0] + guild.faction.slice(1).toLowerCase();
	return (
		<div className="flex min-h-full flex-col">
			<PageHeader
				title={guild.name}
				description={
					<span className="num">
						{[guild.region.toUpperCase(), faction, `${guild.memberCount} members`].filter(Boolean).join(" · ")}
					</span>
				}
				actions={
					<GuildActions guildId={guild._id} syncedAt={guild.rosterSyncedAt} requestedAt={guild.syncRequestedAt} />
				}
			>
				{guild.lastSyncError && <p className="mt-2 text-[0.8125rem] text-destructive">{guild.lastSyncError}</p>}
			</PageHeader>
			<Outlet />
		</div>
	);
}

function GuildActions({
	guildId,
	syncedAt,
	requestedAt,
}: {
	guildId: Id<"guilds">;
	syncedAt?: number;
	requestedAt?: number;
}) {
	return (
		<>
			<SyncButton guildId={guildId} syncedAt={syncedAt} requestedAt={requestedAt} />
		</>
	);
}

/** Re-renders every 30 seconds, for "5 minutes ago" and countdowns. */
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

/**
 * When the roster last synced with Blizzard, as a button that syncs it again.
 * Rosters sync by themselves every hour; by hand, at most every ten minutes.
 * The hover says when it synced, when it next syncs by itself, and when the
 * button works again.
 */
function SyncButton({
	guildId,
	syncedAt,
	requestedAt,
}: {
	guildId: Id<"guilds">;
	syncedAt?: number;
	requestedAt?: number;
}) {
	const requestSync = useMutation(api.guilds.requestSync);
	const now = useNow();
	const [error, setError] = useState<string | null>(null);
	const syncing = !!requestedAt && requestedAt > (syncedAt ?? 0) && now - requestedAt < 2 * 60_000;
	const cooldownLeft = syncedAt ? syncedAt + MANUAL_SYNC_COOLDOWN_MS - now : 0;
	const nextAuto = syncedAt ? syncedAt + AUTO_SYNC_INTERVAL_MS - now : 0;
	const canSync = !syncing && cooldownLeft <= 0;
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						variant="outline"
						size="sm"
						aria-disabled={!canSync}
						className={canSync ? undefined : "cursor-default opacity-70 hover:bg-transparent"}
						onClick={async () => {
							if (!canSync) return;
							setError(null);
							try {
								await requestSync({ guildId });
							} catch (err) {
								setError(err instanceof ConvexError ? String(err.data) : "Couldn't start a sync.");
							}
						}}
					/>
				}
			>
				<HugeiconsIcon
					icon={RefreshIcon}
					size={14}
					strokeWidth={1.75}
					className={syncing ? "animate-spin" : undefined}
				/>
				{syncing ? "Syncing…" : syncedAt ? `Synced ${ago(syncedAt)}` : "Sync now"}
			</TooltipTrigger>
			<TooltipContent side="bottom" align="end" className="block max-w-72 space-y-1 text-left">
				{error && <p className="text-destructive">{error}</p>}
				{syncing ? (
					<p>
						Syncing with Blizzard. The roster updates by itself, then each member's details over the next few minutes.
					</p>
				) : (
					<>
						<p>{syncedAt ? `Synced with Blizzard ${ago(syncedAt)}.` : "Not synced with Blizzard yet."}</p>
						<p>
							{nextAuto > 0
								? `Syncs by itself every hour; next in about ${minutes(nextAuto)}.`
								: "Syncs by itself every hour; next any minute."}
						</p>
						<p>{canSync ? "Click to sync now." : `You can sync again in ${minutes(cooldownLeft)}.`}</p>
					</>
				)}
			</TooltipContent>
		</Tooltip>
	);
}
