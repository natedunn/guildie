import { Popover } from "@base-ui/react/popover";
import { api } from "@convex/_generated/api";
import { DUNGEON_BY_KEY, dungeonArtUrl } from "@convex/shared/dungeons";
import { gameIconUrl, REACTION_GAME_ICON, REACTION_LABEL, REACTIONS, type Reaction } from "@convex/shared/reactions";
import type { Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import {
	ArrowUpDoubleIcon,
	Castle01Icon,
	DeliveryBox01Icon,
	FavouriteIcon,
	HandHelpingIcon,
	InboxIcon,
	ScrollTextIcon,
	SmilePlusIcon,
	ThumbsUpIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
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
// Members react to rows (convex/feedReactions.ts); a grouped row's reactions
// are its events' together, each player counted once per reaction.

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
	// Reacting shows at once; the server's answer replaces it.
	const toggle = useMutation(api.feedReactions.toggle).withOptimisticUpdate((store, { eventIds, reaction }) => {
		const key = { region: params.region as Region, slug: params.slug, limit };
		const current = store.getQuery(api.feed.list, key);
		if (!current || current.hidden) return;
		const ids = new Set<string>(eventIds);
		const had = current.events.some((e) => ids.has(e.id) && e.reactions.some((r) => r.mine && r.reaction === reaction));
		const me = current.events.flatMap((e) => e.reactions).find((r) => r.mine)?.character ?? {
			slug: "",
			name: "You",
			classId: 0,
		};
		store.setQuery(api.feed.list, key, {
			...current,
			events: current.events.map((e) => {
				if (had && ids.has(e.id))
					return { ...e, reactions: e.reactions.filter((r) => !(r.mine && r.reaction === reaction)) };
				if (!had && e.id === eventIds[0])
					return { ...e, reactions: [...e.reactions, { reaction, character: me, mine: true }] };
				return e;
			}),
		});
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
								<EventRow
									key={row.id}
									row={row}
									onReact={(reaction) => void toggle({ eventIds: row.ids, reaction }).catch(() => {})}
								/>
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
/**
 * One row: an event, and everyone it's about when alike events were grouped
 * (`people`, first is the event's own); `ids`: all its events, first the row's own.
 */
type Row = { id: string; ids: Event["id"][]; event: Event; people: Person[]; reactions: Event["reactions"] };

/**
 * A day's events as rows: a character's level-ups merge into one ("from"
 * the lowest), then rows of the same level, the same dungeon cleared, or
 * the same dungeon's quests share a row. Requests stay one per row.
 */
function groupDay(events: Event[]): Row[] {
	// A character's level-ups that day: the newest (highest), from the lowest.
	const levels = new Map<string, Event>();
	const merged: Event[] = [];
	/** A merged level-up's events (the newest first). */
	const mergedIds = new Map<Event, Event["id"][]>();
	for (const e of events) {
		if (e.kind !== "level") {
			merged.push(e);
			continue;
		}
		const seen = levels.get(e.character.slug);
		if (!seen) {
			const copy = { ...e, reactions: [...e.reactions] };
			levels.set(e.character.slug, copy);
			merged.push(copy);
			mergedIds.set(copy, [e.id]);
			continue;
		}
		mergedIds.get(seen)?.push(e.id);
		seen.reactions.push(...e.reactions);
		if (e.fromLevel !== undefined && (seen.fromLevel === undefined || e.fromLevel < seen.fromLevel)) {
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
			row.ids.push(...(mergedIds.get(e) ?? [e.id]));
			row.reactions.push(...e.reactions);
			if (!row.people.some((p) => p.slug === e.character.slug)) row.people.push(e.character);
			if (e.kind === "quests")
				row.event = { ...row.event, quests: [...new Set([...(row.event.quests ?? []), ...(e.quests ?? [])])] };
			continue;
		}
		const fresh = {
			id: e.id,
			ids: mergedIds.get(e) ?? [e.id],
			event: e,
			people: [e.character],
			reactions: [...e.reactions],
		};
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
	delivery: DeliveryBox01Icon,
} as const;

/** The grey line's words when a row has nothing else to say there. */
const KIND_LABEL = {
	level: "Level-up",
	dungeon: "First clear",
	quests: "Dungeon quests",
	request: "Request",
	claim: "Request claimed",
	fulfilled: "Request fulfilled",
	delivery: "Delivery",
} as const;

/** Names shown in a grouped row before "and N others". */
const NAMES = 4;

function EventRow({ row, onReact }: { row: Row; onReact: (reaction: Reaction) => void }) {
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
		<ItemHover item={e.item} className="inline align-baseline">
			<span className="mr-1.5 inline-block align-middle">
				<ItemIcon icon={e.item.icon} quality={e.item.quality} size={22} />
			</span>
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
			text = e.ongoing ? (
				<>
					{person(e.character)} is collecting {item}
				</>
			) : (
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
		case "delivery":
			text = (
				<>
					{person(e.character)} {e.deliveryMethod === "mail" ? "collected" : "received"} {item} from{" "}
					{e.other ? person(e.other) : <span className="font-medium">{e.otherName ?? "an unknown sender"}</span>}{" "}
					{e.deliveryMethod === "mail" ? "by mail" : "in trade"}
				</>
			);
			detail = e.requestCompleted ? "Request completed" : "Contribution toward their request";
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
	const avatars = (e.kind === "claim" || e.kind === "fulfilled") && e.other ? [e.other] : people;

	return (
		<li className="group/row relative flex items-center gap-3.5 px-4 py-3.5">
			<Portraits people={avatars} />
			<div className="min-w-0 flex-1 text-base leading-snug">
				<div>{text}</div>
				{/* The kind's icon leads the grey line (on the portraits it would cover a group). */}
				<div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
					<HugeiconsIcon icon={KIND_ICON[e.kind]} size={14} strokeWidth={2} className="flex-none" />
					<span className="truncate">{detail || KIND_LABEL[e.kind]}</span>
				</div>
			</div>
			<Reactions reactions={row.reactions} onReact={onReact} />
			{aside}
		</li>
	);
}

/**
 * Who a row is about, in one 36px spot so every row's text starts in the
 * same place: one portrait, two on a diagonal, three in a triangle, or two
 * and a count ("+12") for more.
 */
function Portraits({ people }: { people: Person[] }) {
	if (people.length <= 1) return <CharacterAvatar url={people[0]?.avatarUrl} size={36} className="rounded-full" />;
	const ring = "absolute rounded-full ring-2 ring-surface";
	if (people.length === 2)
		return (
			<div className="relative size-9 flex-none">
				<CharacterAvatar url={people[0].avatarUrl} size={25} className={cn(ring, "top-0 left-0")} />
				<CharacterAvatar url={people[1].avatarUrl} size={25} className={cn(ring, "right-0 bottom-0")} />
			</div>
		);
	const rest = people.length - 2;
	return (
		<div className="relative size-9 flex-none">
			<CharacterAvatar url={people[0].avatarUrl} size={21} className={cn(ring, "top-0 left-[7.5px]")} />
			<CharacterAvatar url={people[1].avatarUrl} size={21} className={cn(ring, "bottom-0 left-0")} />
			{rest === 1 ? (
				<CharacterAvatar url={people[2].avatarUrl} size={21} className={cn(ring, "right-0 bottom-0")} />
			) : (
				<span
					className={cn(
						ring,
						"num right-0 bottom-0 grid size-[21px] place-items-center border border-border bg-secondary text-[9px] font-semibold tracking-tight text-foreground",
					)}
				>
					+{Math.min(rest, 99)}
				</span>
			)}
		</div>
	);
}

/** A reaction's mark: line icons for the basics, the game's icons for the rest. */
function ReactionMark({ reaction, size }: { reaction: Reaction; size: number }) {
	const game = REACTION_GAME_ICON[reaction];
	if (game)
		return (
			<img
				src={gameIconUrl(game)}
				alt=""
				loading="lazy"
				draggable={false}
				className="flex-none rounded-[3px] border border-white/10"
				style={{ width: size, height: size }}
			/>
		);
	return <HugeiconsIcon icon={reaction === "like" ? ThumbsUpIcon : FavouriteIcon} size={size - 2} strokeWidth={2} />;
}

/** "You, Sela and 3 others". */
function reactors(list: Event["reactions"]) {
	const names = [
		...(list.some((r) => r.mine) ? ["You"] : []),
		...list.filter((r) => !r.mine).map((r) => r.character.name),
	];
	if (names.length <= 4) return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
	return `${names.slice(0, 3).join(", ")} and ${names.length - 3} others`;
}

/**
 * A row's reactions, in their own column at the right: one summary (the
 * three most used as tiles, then the total; outlined in the accent when
 * one is yours) that opens a panel to react and see who did. Rows without
 * reactions show an add tile there on hover (always on touch).
 */
function Reactions({ reactions, onReact }: { reactions: Event["reactions"]; onReact: (reaction: Reaction) => void }) {
	// Each player once per reaction (a group's events can each carry theirs).
	const by = new Map<Reaction, Event["reactions"]>();
	for (const r of reactions) {
		const list = by.get(r.reaction) ?? [];
		if (!list.some((x) => (r.mine ? x.mine : !x.mine && x.character.slug === r.character.slug))) list.push(r);
		by.set(r.reaction, list);
	}
	// Most used first; ties in the picker's order.
	const shown = REACTIONS.filter((r) => by.get(r)?.length).sort(
		(a, b) => (by.get(b)?.length ?? 0) - (by.get(a)?.length ?? 0),
	);
	const total = shown.reduce((n, r) => n + (by.get(r)?.length ?? 0), 0);
	const mine = reactions.some((r) => r.mine);
	return (
		<Popover.Root>
			<Popover.Trigger
				aria-label={total ? `${total} reactions` : "React"}
				className={cn(
					"num flex h-7 flex-none items-center gap-[7px] rounded-md border text-xs transition-[color,background-color,border-color,opacity]",
					!total
						? "w-7 justify-center border-dashed border-(--border-strong) text-muted-foreground hover:text-foreground focus-visible:opacity-100 data-popup-open:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100"
						: mine
							? "border-highlight/45 bg-highlight/8 pr-2.5 pl-1 text-foreground"
							: "border-border bg-muted pr-2.5 pl-1 text-muted-foreground hover:border-(--border-strong) hover:text-foreground",
				)}
			>
				{total ? (
					<>
						<span className="flex gap-[3px]">
							{shown.slice(0, 3).map((r) => (
								<ReactionTile key={r} reaction={r} size={20} />
							))}
						</span>
						{total}
					</>
				) : (
					<HugeiconsIcon icon={SmilePlusIcon} size={15} strokeWidth={2} />
				)}
			</Popover.Trigger>
			<Popover.Portal>
				<Popover.Positioner side="bottom" align="end" sideOffset={6} className="isolate z-50">
					<Popover.Popup className="w-64 origin-(--transform-origin) rounded-lg border border-(--border-strong) bg-popover bg-(image:--card-sheen) p-1.5 text-[0.8125rem] text-popover-foreground shadow-(--popover-shadow) outline-none duration-100 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0">
						<div className={cn("flex gap-0.5", total > 0 && "mb-1 border-b border-border pb-1.5")}>
							{REACTIONS.map((r) => {
								const on = !!by.get(r)?.some((x) => x.mine);
								return (
									<button
										key={r}
										type="button"
										aria-label={REACTION_LABEL[r]}
										aria-pressed={on}
										title={REACTION_LABEL[r]}
										onClick={() => onReact(r)}
										className={cn(
											"grid h-8 w-[34px] place-items-center rounded-md text-foreground transition-colors",
											on ? "bg-highlight/10 ring-1 ring-highlight/45 ring-inset" : "hover:bg-selected",
										)}
									>
										<ReactionMark reaction={r} size={22} />
									</button>
								);
							})}
						</div>
						{shown.map((r) => {
							const list = by.get(r) ?? [];
							return (
								<div key={r} className="flex items-center gap-2 px-1.5 py-1 text-muted-foreground">
									<span className="grid size-[18px] flex-none place-items-center text-foreground">
										<ReactionMark reaction={r} size={18} />
									</span>
									<span className="min-w-0 flex-1 truncate">{reactors(list)}</span>
									<span className="num">{list.length}</span>
								</div>
							);
						})}
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
}

/** A reaction as a small square tile (the summary): the game's icon, or the line icon on a faint fill. */
function ReactionTile({ reaction, size }: { reaction: Reaction; size: number }) {
	if (REACTION_GAME_ICON[reaction]) return <ReactionMark reaction={reaction} size={size} />;
	return (
		<span
			className="grid flex-none place-items-center rounded-[4px] bg-secondary text-foreground"
			style={{ width: size, height: size }}
		>
			<ReactionMark reaction={reaction} size={14} />
		</span>
	);
}
