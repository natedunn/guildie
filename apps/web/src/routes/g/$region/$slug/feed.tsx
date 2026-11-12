import { api } from "@convex/_generated/api";
import { DUNGEON_BY_KEY, dungeonArtUrl } from "@convex/shared/dungeons";
import type { Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import {
	ArrowUpDoubleIcon,
	Castle01Icon,
	DeliveryBox01Icon,
	HandHelpingIcon,
	InboxIcon,
	ScrollTextIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { Fragment, type ReactNode, useState } from "react";
import { CharacterAvatar } from "@/components/character-avatar";
import { ClassText } from "@/components/class-name";
import { MembersOnly } from "@/components/dungeon";
import { ItemHover, ItemIcon, QUALITY_COLORS } from "@/components/item";
import { PageTabButton, PageTabs } from "@/components/page-tabs";
import { feedDayStart, feedDaysAgo } from "@/lib/feed-day";
import { cn } from "@/lib/utils";

// Feed: what the guild's members did, newest first, by day: level-ups,
// first dungeon clears, dungeon quests turned in, and requests made,
// claimed and fulfilled (convex/feed.ts). Filters live in the URL.
// Days only, never times: Blizzard tells us hours late. A day runs from 4am
// (lib/feed-day.ts), so a late night counts with its evening. Within a day, alike
// events share a row: everyone who cleared a dungeon, everyone who turned in
// its quests, everyone who reached the same level (a character's level-ups
// first merge into one).

type Show = "all" | "levels" | "dungeons" | "quests" | "requests";
type Search = { show?: Show };
const SHOWS: Show[] = ["all", "levels", "dungeons", "quests", "requests"];
const SHOW_LABEL: Record<Show, string> = {
	all: "All",
	levels: "Level-ups",
	dungeons: "Dungeons",
	quests: "Quests",
	requests: "Requests",
};
const PAGE = 100;

export const Route = createFileRoute("/g/$region/$slug/feed")({
	validateSearch: (search: Record<string, unknown>): Search => ({
		...(SHOWS.includes(search.show as Show) && search.show !== "all" ? { show: search.show as Show } : {}),
	}),
	loader: async ({ context, params }) => {
		await context.queryClient.ensureQueryData(
			convexQuery(api.feed.list, { region: params.region as Region, slug: params.slug, limit: PAGE }),
		);
	},
	head: () => ({ meta: [{ title: "Feed · Guildie" }] }),
	component: FeedPage,
});

function FeedPage() {
	const params = Route.useParams();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const [limit, setLimit] = useState(PAGE);
	const { data } = useQuery({
		...convexQuery(api.feed.list, { region: params.region as Region, slug: params.slug, limit }),
		placeholderData: keepPreviousData,
	});
	if (!data) return null;
	if (data.hidden) return <MembersOnly />;

	const show = search.show ?? "all";
	const setSearch = (next: Search) =>
		navigate({ search: (prev) => ({ ...prev, ...next }), replace: true, resetScroll: false });
	const events = data.events.filter((e) => {
		if (e.kind === "level") return show === "all" || show === "levels";
		if (e.kind === "dungeon") return show === "all" || show === "dungeons";
		if (e.kind === "quests") return show === "all" || show === "quests";
		return show === "all" || show === "requests";
	});
	const days = byDay(events);

	return (
		<div className="@container max-w-3xl space-y-5 pb-12">
			<div>
				{/* No gaps and a shorter label where the five don't fit on one line (phones). */}
				<PageTabs className="@max-sm:gap-0">
					{SHOWS.map((s) => (
						<PageTabButton key={s} active={show === s} onClick={() => setSearch({ show: s === "all" ? undefined : s })}>
							{s === "levels" ? (
								<>
									<span className="@max-sm:hidden">Level-ups</span>
									<span className="@sm:hidden">Levels</span>
								</>
							) : (
								SHOW_LABEL[s]
							)}
						</PageTabButton>
					))}
				</PageTabs>
			</div>

			{days.length === 0 ? (
				<p className="surface-card px-4 py-10 text-center text-[0.8125rem] text-muted-foreground">
					Nothing here yet. Level-ups, first dungeon clears, dungeon quests and requests show up as they happen.
				</p>
			) : (
				days.map(([day, list]) => (
					<section key={day}>
						{/* Over the cards' hairlines (z-index 2) as they scroll under it. */}
						<h2 className="sticky top-0 z-10 bg-background py-1.5 text-xs font-medium text-muted-foreground">{day}</h2>
						<ul className="surface-card divide-y divide-border">
							{groupDay(list).map((row) => (
								<EventRow key={row.id} row={row} />
							))}
						</ul>
					</section>
				))
			)}

			{data.more && (
				<button
					type="button"
					onClick={() => setLimit((n) => n + PAGE)}
					className="w-full rounded-md py-2 text-[0.8125rem] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					Show older
				</button>
			)}
		</div>
	);
}

type FeedData = Extract<NonNullable<FunctionReturnType<typeof api.feed.list>>, { hidden: false }>;
type Event = FeedData["events"][number];

/** "Today", "Yesterday", then "Monday, Nov 3"; days start at 4am. */
function byDay(events: Event[]): [string, Event[]][] {
	const out: [string, Event[]][] = [];
	const now = Date.now();
	for (const e of events) {
		const d = feedDayStart(e.at);
		const diff = feedDaysAgo(e.at, now);
		const label =
			diff === 0
				? "Today"
				: diff === 1
					? "Yesterday"
					: d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
		const last = out.at(-1);
		if (last && last[0] === label) last[1].push(e);
		else out.push([label, [e]]);
	}
	return out;
}

type Person = Event["character"];
/** One row: an event, and everyone it's about when alike events were grouped (`people`, first is the event's own). */
type Row = { id: string; event: Event; people: Person[] };

/**
 * A day's events as rows: a character's level-ups merge into one ("from"
 * the lowest), then rows of the same level, the same dungeon cleared, or
 * the same dungeon's quests share a row. Requests stay one per row.
 */
function groupDay(events: Event[]): Row[] {
	// A character's level-ups that day: the newest (highest), from the lowest.
	const levels = new Map<string, Event>();
	const merged: Event[] = [];
	for (const e of events) {
		if (e.kind !== "level") {
			merged.push(e);
			continue;
		}
		const seen = levels.get(e.character.slug);
		if (!seen) {
			const copy = { ...e };
			levels.set(e.character.slug, copy);
			merged.push(copy);
		} else if (e.fromLevel !== undefined && (seen.fromLevel === undefined || e.fromLevel < seen.fromLevel)) {
			seen.fromLevel = e.fromLevel;
		}
	}
	const rows: Row[] = [];
	const byKey = new Map<string, Row>();
	for (const e of merged) {
		const key =
			e.kind === "level"
				? `level:${e.level}`
				: e.kind === "dungeon" || e.kind === "quests"
					? `${e.kind}:${e.dungeon}`
					: undefined;
		const row = key ? byKey.get(key) : undefined;
		if (row) {
			if (!row.people.some((p) => p.slug === e.character.slug)) row.people.push(e.character);
			if (e.kind === "quests")
				row.event = { ...row.event, quests: [...new Set([...(row.event.quests ?? []), ...(e.quests ?? [])])] };
			continue;
		}
		const fresh = { id: e.id, event: e, people: [e.character] };
		rows.push(fresh);
		if (key) byKey.set(key, fresh);
	}
	return rows;
}

const KIND_ICON = {
	level: ArrowUpDoubleIcon,
	dungeon: Castle01Icon,
	quests: ScrollTextIcon,
	request: InboxIcon,
	claim: HandHelpingIcon,
	fulfilled: DeliveryBox01Icon,
} as const;

/** Names shown in a grouped row before "and N others". */
const NAMES = 4;

function EventRow({ row }: { row: Row }) {
	const { event: e, people } = row;
	const params = Route.useParams();
	const person = (c: NonNullable<Event["other"]>) => (
		<Link
			key={c.slug}
			to="/c/$region/$slug"
			params={{ region: params.region, slug: c.slug }}
			className="font-medium underline-offset-4 hover:underline"
		>
			<ClassText classId={c.classId}>{c.name}</ClassText>
		</Link>
	);
	// "Joren", "Joren and Maren", "Joren, Maren and Pell", "…and 3 others".
	const everyone = (() => {
		const shown = people.length > NAMES + 1 ? people.slice(0, NAMES) : people;
		const rest = people.slice(shown.length);
		const parts: ReactNode[] = shown.map(person);
		if (rest.length)
			parts.push(
				<span key="rest" title={rest.map((p) => p.name).join(", ")} className="font-medium">
					{rest.length} others
				</span>,
			);
		return parts.map((part, i) => (
			<Fragment key={i}>
				{i > 0 && (i === parts.length - 1 ? " and " : ", ")}
				{part}
			</Fragment>
		));
	})();
	const several = people.length > 1;
	const dungeon = e.dungeon ? DUNGEON_BY_KEY.get(e.dungeon) : undefined;
	const dungeonLink = dungeon && (
		<Link
			to="/g/$region/$slug/dungeons/$dungeon"
			params={{ region: params.region, slug: params.slug, dungeon: dungeon.key }}
			className="font-medium underline-offset-4 hover:underline"
		>
			{dungeon.name}
		</Link>
	);
	const item = e.item && (
		<ItemHover item={e.item} className="inline-flex items-center gap-1.5 align-middle">
			<ItemIcon icon={e.item.icon} quality={e.item.quality} size={18} />
			<span className="font-medium" style={{ color: QUALITY_COLORS[e.item.quality ?? "COMMON"] }}>
				{(e.quantity ?? 1) > 1 && <span className="num">{e.quantity}× </span>}
				{e.item.name}
			</span>
		</ItemHover>
	);
	const crafted = e.requestKind === "craft";

	let text: ReactNode;
	let detail: ReactNode = null;
	let aside: ReactNode = null;
	switch (e.kind) {
		case "level":
			text = (
				<>
					{everyone} reached level <span className="num font-semibold">{e.level}</span>
				</>
			);
			if (!several && e.fromLevel !== undefined && (e.level ?? 0) - e.fromLevel > 1)
				detail = <span className="num">from {e.fromLevel}</span>;
			break;
		case "dungeon":
			text = (
				<>
					{everyone} cleared {dungeonLink ?? "a dungeon"} for the first time
				</>
			);
			if (dungeon)
				aside = (
					<img
						src={dungeonArtUrl(dungeon.key)}
						alt=""
						loading="lazy"
						className="hidden h-10 w-24 flex-none rounded-[4px] border border-border object-cover sm:block"
					/>
				);
			break;
		case "quests": {
			const n = e.quests?.length ?? 0;
			text = several ? (
				<>
					{everyone} turned in {dungeonLink ?? "dungeon"} quests
				</>
			) : (
				<>
					{everyone} turned in {n === 1 ? "a" : <span className="num">{n}</span>} {dungeonLink ?? "dungeon"}{" "}
					{n === 1 ? "quest" : "quests"}
				</>
			);
			detail = e.quests?.join(" · ");
			break;
		}
		case "request":
			text = (
				<>
					{person(e.character)} {crafted ? "wants" : "requested"} {item}
					{crafted && " crafted"}
				</>
			);
			break;
		case "claim":
			text = e.other ? (
				<>
					{person(e.other)} {crafted ? "will craft" : "is getting"} {item} for {person(e.character)}
				</>
			) : (
				<>Someone claimed {person(e.character)}'s request</>
			);
			break;
		case "fulfilled":
			text = e.other ? (
				<>
					{person(e.other)} fulfilled {person(e.character)}'s request for {item}
				</>
			) : (
				<>
					{person(e.character)}'s request for {item} was fulfilled
				</>
			);
			break;
	}
	const avatars = (e.kind === "claim" || e.kind === "fulfilled") && e.other ? [e.other] : people.slice(0, 3);

	return (
		<li className="flex items-center gap-3 px-3 py-2.5">
			{/* One avatar, or up to three overlapping for a group; the kind's icon in the corner. */}
			{/* As wide as three overlapping, right-aligned, so every row's text starts in the same place. */}
			<div className="relative flex w-[68px] flex-none justify-end">
				{avatars.map((a, i) => (
					<CharacterAvatar
						key={a.slug}
						url={a.avatarUrl}
						size={32}
						className={cn("rounded-full", i > 0 && "-ml-3.5 ring-2 ring-surface")}
					/>
				))}
				<span className="absolute -right-1 -bottom-1 grid size-[18px] place-items-center rounded-full border border-border bg-background text-muted-foreground">
					<HugeiconsIcon icon={KIND_ICON[e.kind]} size={11} strokeWidth={2} />
				</span>
			</div>
			<div className="min-w-0 flex-1 text-[0.8125rem] leading-snug">
				<div>{text}</div>
				{detail && <div className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</div>}
			</div>
			{aside}
		</li>
	);
}
