import { api } from "@convex/_generated/api";
import type { Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ClassText } from "@/components/class-name";
import { ItemHover, ItemIcon, QUALITY_COLORS } from "@/components/item";
import { type ExistingRequest, RequestButton, RequestRow, type RequestView, useNow } from "@/components/requests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { shortDate, timeLeft } from "@/lib/format";

// Guild requests: members ask for items and crafts. Items: guildmates send
// some, and the requester's addon counts what arrives. Crafts: asked of one
// crafter, who accepts or declines; the crafted item arriving closes it (rules: convex/shared/requests.ts). Items can
// also be asked for as ongoing ("send me any you have"): their own tab, never
// claimed. Members only, even in a public guild. The tab and the filter live
// in the URL (?type=ongoing&view=mine), independent of each other.

type Type = "fixed" | "ongoing";
type View = "open" | "mine" | "help";
type Search = { type?: "ongoing"; view?: View };

export const Route = createFileRoute("/g/$region/$slug/requests")({
	validateSearch: (search: Record<string, unknown>): Search => ({
		...(search.type === "ongoing" ? { type: "ongoing" as const } : {}),
		...(search.view === "mine" || search.view === "help" ? { view: search.view } : {}),
	}),
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

const asExisting = (r: RequestView): ExistingRequest => ({
	requestId: r._id,
	status: r.status,
	ongoing: r.ongoing,
	quantity: r.quantity,
	until: r.until,
	note: r.note,
});

function RequestsPage() {
	const params = Route.useParams();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const { data } = useSuspenseQuery(
		convexQuery(api.requests.list, { region: params.region as Region, slug: params.slug }),
	);
	const view = search.view ?? "open";
	const type: Type = search.type ?? "fixed";
	const requests = useStableOrder(data?.member ? data.requests : []);
	const lists = useMemo(() => {
		const all = requests;
		const fixed = all.filter((r) => !r.ongoing);
		// Ongoing: active ones only (stopped and ended ones just go away).
		const ongoing = all.filter((r) => r.ongoing && isActive(r));
		return {
			fixed: {
				open: fixed.filter(isActive),
				mine: fixed.filter((r) => r.mine),
				// Only full requests covered by the viewer’s latest inventory scans.
				help: fixed.filter((r) => r.canHelp),
			},
			ongoing: {
				open: ongoing,
				mine: ongoing.filter((r) => r.mine),
				// Someone else wants it and the viewer's bags or bank have some.
				help: ongoing.filter((r) => r.canHelp),
			},
		};
	}, [requests]);
	// Ongoing lists show one row per item (everyone who wants it together), so count items.
	const count = (t: Type, v: View) =>
		t === "ongoing" && v !== "mine" ? new Set(lists.ongoing[v].map((r) => r.item?.itemId)).size : lists[t][v].length;
	const go = (next: Search) =>
		navigate({ search: (prev) => ({ ...prev, ...next }), replace: true, resetScroll: false });

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
	const stale = lists.fixed.mine.filter((r) => r.stale).length;
	const shown = lists[type][view];
	const guild = { region: params.region as Region, slug: params.slug };
	return (
		<div className="max-w-3xl space-y-4 pb-12">
			<p className="text-[13px] text-muted-foreground">
				Ask the guild for a fixed amount of something: guildmates trade or mail what they have, and with the Guildie app
				it closes by itself once it all arrives. Ask a guildmate who knows the recipe to craft something: they accept or
				decline, the mats you send them show as they arrive, and it closes when the crafted item (or the enchant)
				reaches you. Or ask for an item as ongoing, and guildmates send any they have. Requests also show on item
				tooltips in game (with the Guildie app).
			</p>

			<NewRequest guild={guild} characters={data.characters} ongoing={type === "ongoing"} />

			{stale > 0 && (
				<div className="surface-card flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5 text-[13px]">
					<span className="flex-1">
						{stale === 1 ? "1 of your requests is" : `${stale} of your requests are`} over a week old. Still need{" "}
						{stale === 1 ? "it" : "them"}? Requests close by themselves after 30 days without activity.
					</span>
					{(view !== "mine" || type !== "fixed") && (
						<Link to="." search={{ view: "mine" }} className="pill">
							Review
						</Link>
					)}
				</div>
			)}

			{/* Fixed amount / Ongoing on the left, the filter on the right (under them on phones). */}
			<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:border-b sm:border-border">
				<Tabs value={type} onValueChange={(v) => go({ type: v === "ongoing" ? "ongoing" : undefined })}>
					<TabsList className="max-sm:w-full sm:border-b-0">
						<TabsTrigger value="fixed">
							Fixed amount <span className="num text-xs text-muted-foreground">{lists.fixed.open.length}</span>
						</TabsTrigger>
						<TabsTrigger value="ongoing">
							Ongoing <span className="num text-xs text-muted-foreground">{count("ongoing", "open")}</span>
						</TabsTrigger>
					</TabsList>
				</Tabs>
				<div className="flex flex-wrap gap-1 sm:pb-1.5" role="group" aria-label="Show">
					{VIEWS.map((v) => (
						<button
							key={v.key}
							type="button"
							className="chip"
							data-active={view === v.key}
							aria-pressed={view === v.key}
							onClick={() => go({ view: v.key === "open" ? undefined : v.key })}
						>
							{v.label} <span className="num text-xs text-muted-foreground">{count(type, v.key)}</span>
						</button>
					))}
				</div>
			</div>

			{view === "help" && (
				<p className="text-xs text-muted-foreground">
					{type === "ongoing"
						? "Things guildmates want that your characters’ last synced bags and banks have some of."
						: "Crafts guildmates asked you to make, and requests your characters’ last synced bags and banks cover."}
				</p>
			)}

			{shown.length === 0 ? (
				<Empty>
					{type === "ongoing"
						? view === "mine"
							? "You have no ongoing requests. Search above and pick Ongoing to keep asking for something."
							: view === "help"
								? "Nothing anyone wants is in your bags or bank right now."
								: "No ongoing requests. Search above to ask the guild for any of something they have."
						: view === "mine"
							? "You haven't asked for anything lately."
							: view === "help"
								? "No matching requests right now."
								: "No open requests. Search above to ask the guild for something."}
				</Empty>
			) : type === "ongoing" ? (
				view === "mine" ? (
					<MyOngoing requests={shown} guild={guild} characters={data.characters} />
				) : (
					<OngoingList requests={shown} />
				)
			) : (
				<ul className="surface-card divide-y divide-border [&>li]:px-3.5">
					{shown.map((r) => (
						<RequestRow key={r._id} request={r} />
					))}
				</ul>
			)}
		</div>
	);
}

/**
 * The server's order (crafts you can make first, then latest activity) as it
 * was when the page opened: claiming or updating a request leaves it where it
 * is instead of jumping it to the top. Requests posted meanwhile go on top.
 */
function useStableOrder<T extends { _id: string }>(rows: T[]): T[] {
	const rank = useRef(new Map<string, number>());
	return useMemo(() => {
		const seen = rank.current;
		const fresh = rows.filter((r) => !seen.has(r._id));
		const start = seen.size === 0 ? 0 : Math.min(0, ...seen.values()) - fresh.length;
		for (const [i, r] of fresh.entries()) seen.set(r._id, start + i);
		return [...rows].sort((a, b) => (seen.get(a._id) ?? 0) - (seen.get(b._id) ?? 0));
	}, [rows]);
}

/** Item and icon, hover for the tooltip. */
function ItemCell({ r, sub }: { r: RequestView; sub: ReactNode }) {
	const item = r.item;
	return (
		<span className="flex min-w-0 flex-1 items-center gap-2.5">
			{item ? (
				<ItemHover item={item} className="shrink-0">
					<ItemIcon icon={item.icon} quality={item.quality} size={28} className="block" />
				</ItemHover>
			) : (
				<ItemIcon size={28} empty className="block" />
			)}
			<span className="min-w-0">
				<span className="block truncate" style={{ color: QUALITY_COLORS[item?.quality ?? "COMMON"] }}>
					{item?.name ?? "Item"}
				</span>
				<span className="block truncate text-xs text-muted-foreground">{sub}</span>
			</span>
		</span>
	);
}

/**
 * Ongoing requests, one row per item with everyone who wants it (several
 * tailors after Silk is the usual case). "I can help" adds how many you have.
 */
function OngoingList({ requests }: { requests: RequestView[] }) {
	useNow();
	const groups = useMemo(() => {
		const byItem = new Map<number, RequestView[]>();
		for (const r of requests) {
			const key = r.item?.itemId ?? 0;
			byItem.set(key, [...(byItem.get(key) ?? []), r]);
		}
		return [...byItem.values()].sort((a, b) => b.length - a.length || b[0].createdAt - a[0].createdAt);
	}, [requests]);
	return (
		<ul className="surface-card divide-y divide-border">
			{groups.map((rows) => {
				const have = rows.find((r) => r.have)?.have;
				return (
					<li key={rows[0]._id} className="flex items-center gap-3 px-3.5 py-2 text-[13px]">
						<ItemCell
							r={rows[0]}
							sub={
								<>
									{rows.map((r, i) => (
										<span key={r._id}>
											{i > 0 && ", "}
											{r.mine ? (
												<span className="text-foreground">You</span>
											) : (
												<ClassText classId={r.requester.classId}>{r.requester.name}</ClassText>
											)}
										</span>
									))}
									{rows.length === 1 && !rows[0].mine ? " wants it" : " want it"}
									{rows.length === 1 && ` · ${timeLeft(rows[0].until)}`}
									{rows.length === 1 && rows[0].note && ` · “${rows[0].note}”`}
								</>
							}
						/>
						{have ? (
							<span className="shrink-0 text-xs">
								You have <span className="num">{have}</span>
							</span>
						) : null}
					</li>
				);
			})}
		</ul>
	);
}

/** The viewer's own ongoing requests: when each ends, change or stop it. */
function MyOngoing({
	requests,
	guild,
	characters,
}: {
	requests: RequestView[];
	guild: { region: Region; slug: string };
	characters: { slug: string; name: string; classId: number }[];
}) {
	useNow();
	return (
		<ul className="surface-card divide-y divide-border">
			{requests.map((r) => (
				<li key={r._id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2 text-[13px]">
					<ItemCell
						r={r}
						sub={
							<>
								<span title={r.until ? `Ends ${shortDate(r.until)}` : undefined}>{timeLeft(r.until)}</span>
								{r.note && ` · “${r.note}”`}
							</>
						}
					/>
					{r.item && (
						<RequestButton
							guild={guild}
							characters={characters}
							size="xs"
							label="Change"
							existing={asExisting(r)}
							target={{
								kind: "item",
								itemId: r.item.itemId,
								name: r.item.name,
								quality: r.item.quality,
								icon: r.item.icon,
							}}
						/>
					)}
					<StopButton request={r} />
				</li>
			))}
		</ul>
	);
}

function StopButton({ request }: { request: RequestView }) {
	const act = useMutation(api.requests.act);
	const [busy, setBusy] = useState(false);
	return (
		<Button
			size="xs"
			variant="ghost"
			disabled={busy}
			onClick={async () => {
				setBusy(true);
				try {
					await act({ requestId: request._id, action: "cancel" });
				} finally {
					setBusy(false);
				}
			}}
		>
			Stop
		</Button>
	);
}

function Empty({ children }: { children: ReactNode }) {
	return <p className="surface-card px-4 py-10 text-center text-[0.8125rem] text-muted-foreground">{children}</p>;
}

/**
 * "What do you need?": search items by name, then request the item, or (when
 * someone else in the guild can make it) a craft.
 */
function NewRequest({
	guild,
	characters,
	ongoing,
}: {
	guild: { region: Region; slug: string };
	characters: { slug: string; name: string; classId: number }[];
	/** The page is on Ongoing: new item requests open on that tab. */
	ongoing: boolean;
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
					<ul className="surface-card mt-2 divide-y divide-border">
						{shown.map((item) => (
							<li key={item.itemId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 text-[13px]">
								<ItemHover
									item={{ itemId: item.itemId, name: item.name, quality: item.quality, icon: item.icon }}
									// Room for the name; the buttons wrap below it on phones.
									className="flex min-w-0 flex-[1_1_14rem] items-center gap-2.5"
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
											{item.mine && (
												<span className="text-foreground">
													{" · "}
													{item.mine.ongoing
														? `you want this, ongoing until ${shortDate(item.mine.until ?? 0)}`
														: `you asked for ${item.mine.quantity}`}
												</span>
											)}
										</span>
									</span>
								</ItemHover>
								{item.untradeable ? (
									<span className="shrink-0 text-xs text-muted-foreground">{item.untradeable}</span>
								) : (
									<span className="flex gap-1.5">
										<RequestButton
											guild={guild}
											characters={characters}
											ongoing={ongoing}
											existing={item.mine}
											target={{
												kind: "item",
												itemId: item.itemId,
												name: item.name,
												quality: item.quality,
												icon: item.icon,
											}}
											label={item.mine ? "Change request" : "Request item"}
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
								)}
							</li>
						))}
					</ul>
				))}
		</section>
	);
}
