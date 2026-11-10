import { api } from "@convex/_generated/api";
import type { Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ItemHover, ItemIcon, QUALITY_COLORS } from "@/components/item";
import { RequestButton, RequestRow, type RequestView } from "@/components/requests";
import { Input } from "@/components/ui/input";

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
				also show on item tooltips in game (with the Guildie app).
			</p>

			<NewRequest guild={{ region: params.region as Region, slug: params.slug }} characters={data.characters} />

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
							: "No open requests. Search above to ask the guild for something."}
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

/**
 * "What do you need?": search items by name, then request the item, or (when
 * someone else in the guild can make it) a craft.
 */
function NewRequest({
	guild,
	characters,
}: {
	guild: { region: Region; slug: string };
	characters: { slug: string; name: string; classId: number }[];
}) {
	const [q, setQ] = useState("");
	const [debounced, setDebounced] = useState("");
	useEffect(() => {
		const t = setTimeout(() => setDebounced(q.trim()), 200);
		return () => clearTimeout(t);
	}, [q]);
	const { data: results, isFetching } = useQuery({
		...convexQuery(api.requests.search, { ...guild, q: debounced }),
		enabled: debounced.length >= 2,
		placeholderData: (previous) => previous,
	});
	const shown = debounced.length >= 2 ? (results ?? []) : [];
	return (
		<section>
			<label htmlFor="request-search" className="text-[13px] font-medium">
				What do you need?
			</label>
			<Input
				id="request-search"
				className="mt-1.5"
				value={q}
				onChange={(e) => setQ(e.target.value)}
				placeholder="Search items: Silk Cloth, Mageweave Bag, Healing Potion…"
				autoComplete="off"
			/>
			{debounced.length >= 2 &&
				(shown.length === 0 ? (
					!isFetching && <p className="mt-2 text-[13px] text-muted-foreground">No item by that name on Guildie yet.</p>
				) : (
					<ul className="mt-2 divide-y divide-border rounded-md border border-border">
						{shown.map((item) => (
							<li key={item.itemId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 text-[13px]">
								<ItemHover
									item={{ itemId: item.itemId, name: item.name, quality: item.quality, icon: item.icon }}
									className="flex min-w-0 flex-1 items-center gap-2.5"
								>
									<ItemIcon icon={item.icon} quality={item.quality} size={28} />
									<span className="min-w-0">
										<span className="block truncate font-medium" style={{ color: QUALITY_COLORS[item.quality] }}>
											{item.name}
										</span>
										<span className="block truncate text-xs text-muted-foreground">
											{[
												item.kind,
												item.craft &&
													`${item.craft.profession}: ${item.craft.crafters.map((c) => c.name).join(", ")} can make it`,
											]
												.filter(Boolean)
												.join(" · ")}
										</span>
									</span>
								</ItemHover>
								<span className="flex gap-1.5">
									<RequestButton
										guild={guild}
										characters={characters}
										target={{
											kind: "item",
											itemId: item.itemId,
											name: item.name,
											quality: item.quality,
											icon: item.icon,
										}}
										label="Request item"
									/>
									{item.craft && (
										<RequestButton
											guild={guild}
											characters={characters}
											target={{
												kind: "craft",
												recipeId: item.craft.recipeId,
												name: item.craft.name,
												itemId: item.itemId,
												quality: item.quality,
												icon: item.icon,
												crafters: item.craft.crafters,
											}}
											label="Request a craft"
										/>
									)}
								</span>
							</li>
						))}
					</ul>
				))}
		</section>
	);
}
