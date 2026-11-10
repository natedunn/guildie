import { api } from "@convex/_generated/api";
import type { Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useMemo } from "react";
import { RequestRow, type RequestView } from "@/components/requests";

// Guild requests: members ask for items and crafts, guildmates claim them,
// the requester marks them done (rules: convex/shared/requests.ts). Members
// only, even in a public guild. The view lives in the URL (?view=mine).

type View = "open" | "mine" | "help";
type Search = { view?: View };

export const Route = createFileRoute("/g/$region/$slug/requests")({
	validateSearch: (search: Record<string, unknown>): Search =>
		search.view === "mine" || search.view === "help" ? { view: search.view } : {},
	loader: async ({ context, params }) => {
		await context.queryClient.ensureQueryData(
			convexQuery(api.requests.list, { region: params.region as Region, slug: params.slug }),
		);
	},
	component: RequestsPage,
});

const VIEWS: { key: View; label: string }[] = [
	{ key: "open", label: "Open" },
	{ key: "mine", label: "Mine" },
	{ key: "help", label: "I can help" },
];

const isActive = (r: RequestView) => r.status === "open" || r.status === "claimed";

function RequestsPage() {
	const params = Route.useParams();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const { data } = useSuspenseQuery(
		convexQuery(api.requests.list, { region: params.region as Region, slug: params.slug }),
	);
	const view = search.view ?? "open";
	const lists = useMemo(() => {
		const all = data?.member ? data.requests : [];
		return {
			open: all.filter(isActive),
			mine: all.filter((r) => r.mine),
			// What you could fill, and what you claimed and still have to finish.
			help: all.filter((r) => isActive(r) && (r.canClaim || r.claim?.mine)),
		};
	}, [data]);

	if (!data) return null;
	if (!data.member) {
		return (
			<Empty>
				Requests are for this guild's members.{" "}
				<Link to="/settings" className="text-foreground underline underline-offset-4">
					Claim your character
				</Link>{" "}
				to see and post them.
			</Empty>
		);
	}
	const stale = lists.mine.filter((r) => r.stale).length;
	const shown = lists[view];
	return (
		<div className="max-w-3xl space-y-4 pb-12">
			<p className="text-[13px] text-muted-foreground">
				Ask the guild for reagents or a craft. Whoever claims it trades or mails it; you mark it done. Open requests
				also show on item tooltips in game (with the Guildie app). To request something, open an item (or a recipe on
				Crafting) and choose Request.
			</p>

			{stale > 0 && (
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2 text-[13px]">
					<span className="flex-1">
						{stale === 1 ? "1 of your requests is" : `${stale} of your requests are`} over a week old. Still need{" "}
						{stale === 1 ? "it" : "them"}? Requests close by themselves after 30 days without activity.
					</span>
					{view !== "mine" && (
						<Link to="." search={{ view: "mine" }} className="text-xs underline underline-offset-2">
							Review
						</Link>
					)}
				</div>
			)}

			<div className="flex flex-wrap gap-1" role="group" aria-label="Show">
				{VIEWS.map((v) => (
					<button
						key={v.key}
						type="button"
						className="chip"
						data-active={view === v.key}
						aria-pressed={view === v.key}
						onClick={() =>
							navigate({
								search: (prev) => ({ ...prev, view: v.key === "open" ? undefined : v.key }),
								replace: true,
								resetScroll: false,
							})
						}
					>
						{v.label} <span className="num text-xs text-muted-foreground">{lists[v.key].length}</span>
					</button>
				))}
			</div>

			{shown.length === 0 ? (
				<Empty>
					{view === "mine"
						? "You haven't asked for anything lately."
						: view === "help"
							? "Nothing you can help with right now. Crafts show here when one of your characters knows the recipe."
							: "No open requests. Open an item and choose Request to ask the guild for it."}
				</Empty>
			) : (
				<ul className="divide-y divide-border border-y border-border">
					{shown.map((r) => (
						<RequestRow key={r._id} request={r} />
					))}
				</ul>
			)}
		</div>
	);
}

function Empty({ children }: { children: ReactNode }) {
	return <p className="py-10 text-sm text-muted-foreground">{children}</p>;
}
