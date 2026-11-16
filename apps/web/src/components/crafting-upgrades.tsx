import { Dialog } from "@base-ui/react/dialog";
import { api } from "@convex/_generated/api";
import { kindRank, type VerdictKind } from "@convex/shared/upgrades";
import { CLASSES, type Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { ClassText } from "@/components/class-name";
import { type ListRow, MakersCell } from "@/components/crafting-list";
import { FilterMenu, type FilterOption } from "@/components/filter-menu";
import { ItemIcon, QUALITY_COLORS } from "@/components/item";
import { compareProfessions, indexEntry, queryWords, RecipeItem, searchIndex } from "@/components/recipe-row";
import { RequestButton } from "@/components/requests";
import { TrackButton } from "@/components/track-button";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Switch } from "@/components/ui/switch";
import { UpgradeWhy } from "@/components/upgrade-why";
import { MARKER_LABELS, type MarkerKind, VerdictGlyph, VerdictMarker } from "@/components/verdict-marker";
import { cn } from "@/lib/utils";
import { verdictLabel } from "@/lib/verdict";

// Crafting's Gear tab for members: one table, a row per item, of what the
// guild can craft (or could learn to) for the viewer's characters and what
// theirs can craft for anyone in the guild (crafting.upgrades). Each row says
// who it's for and who crafts it, the viewer's characters ("Yours") apart
// from guildmates, and who could learn it. Filters on both (anyone, your
// characters, one of them, guildmates), the kind (upgrade, possible upgrade,
// empty slot, or all gear the guild makes) and the profession sit in menus
// above it.

export type Member = {
	guild: { region: Region; slug: string };
	characters: { slug: string; name: string; classId: number }[];
};

type Data = NonNullable<FunctionReturnType<typeof api.crafting.upgrades>>;
type Hit = Data["hits"][number];
type Help = Hit["for"][number];
/** A row: the item, and who it's for as the "Show removed" switch has it. */
type Row = Hit & { shown: Help[] };
/** Gear's kind filter: a verdict, all of them (undefined), or every piece of gear the guild makes ("all"). */
export type GearKind = VerdictKind | "all";

/**
 * Whom a filter keeps: anyone (undefined), the viewer's characters
 * ("mine"), guildmates ("guild") or one character (their slug).
 */
export type Who = string | undefined;
const keeps = (who: Who, x: { slug: string; mine: boolean }) =>
	!who || (who === "mine" ? x.mine : who === "guild" ? !x.mine : x.slug === who);

/** Rows shown before "Show all": each renders item tooltips. */
const PAGE = 30;
/** Guildmates listed under "Who's it for?" before "+N more". */
const MATES = 2;
const EMPTY = "surface-card px-4 py-10 text-center text-[0.8125rem] text-muted-foreground";
/** The table's columns: marker, item, who it's for, who crafts it, actions (a fixed width, so the heads line up). Stacked on a narrow pane. */
const COLS =
	"grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 @2xl:grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,0.9fr)_12rem] @2xl:gap-x-5";
/** Cells after the item: under it on a narrow pane. */
const CELL = "col-start-2 @2xl:col-start-auto";

/** What each marker means (the hover says the same). */
const MARKER_HINTS: Record<MarkerKind, string> = {
	upgrade: "More of their stats, nothing lost",
	maybe:
		"A small gain, some of a stat they rank given up, their second spec, a few levels from now, or an armor type they don't want",
	empty: "Plain armor with no stats, for a slot they have nothing in",
	removed: "Never suggested for your character again, here or in the game's tooltips. Restore puts it back.",
};

export function UpgradesView({
	region,
	guildSlug,
	member,
	query,
	deferred,
	setQuery,
	inputRef,
	forWho,
	byWho,
	kind,
	profession,
	setFilters,
	gear,
}: {
	region: string;
	guildSlug: string;
	member?: Member;
	/** All gear the guild makes (guildCrafting), for "All gear": rows for items that aren't anyone's upgrade. */
	gear: ListRow[];
	query: string;
	deferred: string;
	setQuery: (q: string) => void;
	inputRef: RefObject<HTMLInputElement | null>;
	forWho: Who;
	byWho: Who;
	/** Only upgrades, possible upgrades or empty slots (for whom `forWho` keeps), or all gear. */
	kind?: GearKind;
	profession?: string;
	setFilters: (next: Filters) => void;
}) {
	const args = { region: region as Region, slug: guildSlug };
	const { data } = useQuery(convexQuery(api.crafting.upgrades, args));
	const [showRemoved, setShowRemoved] = useState(false);
	const [limit, setLimit] = useState(PAGE);
	const words = useMemo(() => queryWords(deferred), [deferred]);

	// Every row: the upgrades, then the rest of the guild's gear (for "All gear").
	const rows = useMemo<Row[]>(() => {
		const hits = (data?.hits ?? []).map((h) => ({
			...h,
			shown: showRemoved ? h.for : h.for.filter((x) => !x.removed),
		}));
		const listed = new Set(hits.map((h) => h.recipeId));
		const rest = gear
			.filter((g) => !listed.has(g.recipeId))
			.map((g): Row => ({ ...g, for: [], shown: [], others: 0, requested: [] }));
		return [...hits, ...rest];
	}, [data, gear, showRemoved]);
	const removedCount = useMemo(
		() => (data?.hits ?? []).reduce((n, h) => n + h.for.filter((x) => x.removed).length, 0),
		[data],
	);
	// Search by the item (name, kind, tooltip, reagents) and by who's in the row.
	const index = useMemo(
		() =>
			rows.map((r) =>
				indexEntry(r, [
					`${r.name} ${r.item?.name ?? ""}`,
					`${r.item?.kind ?? ""} ${r.profession}`,
					[...r.shown, ...r.crafters, ...r.requested].map((x) => x.name).join(" "),
					`${(r.item?.tooltip ?? []).map((l) => `${l.left} ${l.right ?? ""}`).join(" ")} ${r.reagents.map((x) => x.name).join(" ")}`,
				]),
			),
		[rows],
	);
	const matched = useMemo(() => searchIndex(index, words), [index, words]);

	// Who it's for and the kind go together: someone the filter keeps, with that
	// verdict. All gear: every row, or the ones for whom the filter keeps.
	const forOk = (r: Row, who: Who, k?: GearKind) =>
		k === "all"
			? !who || r.shown.some((x) => keeps(who, x))
			: r.shown.some((x) => keeps(who, x) && (!k || (x.kind === k && !x.removed)));
	const byOk = (r: Row, who: Who) => !who || r.crafters.some((c) => keeps(who, c));
	const profOk = (r: Row, p?: string) => !p || r.profession === p;
	const results = matched.filter((r) => forOk(r, forWho, kind) && byOk(r, byWho) && profOk(r, profession));
	// Each filter's counts, with the other filters on.
	const forRows = matched.filter((r) => byOk(r, byWho) && profOk(r, profession));
	const byRows = matched.filter((r) => forOk(r, forWho, kind) && profOk(r, profession));
	const profRows = matched.filter((r) => forOk(r, forWho, kind) && byOk(r, byWho));
	const counts = {
		for: (who: Who) => forRows.filter((r) => forOk(r, who, kind)).length,
		kind: (k?: GearKind) => forRows.filter((r) => forOk(r, forWho, k)).length,
		by: (who: Who) => byRows.filter((r) => byOk(r, who)).length,
		prof: (p?: string) => profRows.filter((r) => profOk(r, p)).length,
	};

	const characters = data?.characters ?? [];
	// The viewer's crafters, with their skill when they craft in one profession only.
	const crafters = useMemo(() => {
		const skills = new Map<string, Map<string, number | undefined>>();
		for (const h of data?.hits ?? [])
			for (const c of h.crafters) {
				if (!c.mine) continue;
				const m = skills.get(c.slug) ?? new Map();
				m.set(h.profession, c.skill);
				skills.set(c.slug, m);
			}
		return characters
			.filter((c) => skills.has(c.slug))
			.map((c) => {
				const by = skills.get(c.slug);
				return { ...c, skill: by?.size === 1 ? [...by.values()][0] : undefined };
			});
	}, [data, characters]);
	const professions = useMemo(() => [...new Set(rows.map((r) => r.profession))].sort(compareProfessions), [rows]);

	useEffect(() => setLimit(PAGE), [deferred, forWho, byWho, kind, profession, showRemoved]);

	// Remove (or put back) an item for one of the viewer's characters: gone
	// from the list at once (optimistic), then from the item panel and, after
	// the app's next refresh, the addon's tooltips.
	const dismiss = useMutation(api.statPriority.dismissItem).withOptimisticUpdate((store, a) => {
		const current = store.getQuery(api.crafting.upgrades, args);
		if (!current) return;
		store.setQuery(api.crafting.upgrades, args, {
			...current,
			hits: current.hits.map((h) =>
				h.item?.itemId === a.itemId
					? { ...h, for: h.for.map((f) => (f.mine && f.slug === a.slug ? { ...f, removed: a.removed } : f)) }
					: h,
			),
		});
	});
	const setRemoved = (row: Row, slug: string, removed: boolean) => {
		const itemId = row.item?.itemId;
		if (itemId !== undefined) void dismiss({ region: region as Region, slug, itemId, removed });
	};
	// Remove asks first (unless the player said not to), and which character when it's for several of theirs.
	const [confirming, setConfirming] = useState<{ row: Row; who: Help[] } | null>(null);
	// "+N more": everyone the row's item is for and who crafts it.
	const [people, setPeople] = useState<Row | null>(null);
	const onRemove = (row: Row) => {
		const who = row.shown.filter((x) => x.mine && !x.removed && keeps(forWho, x));
		if (who.length === 0) return;
		if (who.length === 1 && skipRemoveConfirm()) setRemoved(row, who[0].slug, true);
		else setConfirming({ row, who });
	};

	const named = (who: Who) =>
		who && who !== "mine" && who !== "guild"
			? (characters.find((c) => c.slug === who) ?? crafters.find((c) => c.slug === who))
			: undefined;
	const filtered = !!(forWho || byWho || kind || profession);
	const menus = {
		for: (
			<WhoPicker
				label="For"
				value={forWho}
				onChange={(v) => setFilters({ for: v })}
				count={counts.for}
				characters={characters}
			/>
		),
		by: (
			<WhoPicker
				label="Crafted by"
				value={byWho}
				onChange={(v) => setFilters({ by: v })}
				count={counts.by}
				characters={crafters}
			/>
		),
		kind: (
			<FilterMenu
				value={kind ?? ""}
				onChange={(v) => setFilters({ kind: (v || undefined) as GearKind | undefined })}
				options={[
					{ value: "", label: "Upgrades", count: counts.kind() },
					...KINDS.map((k, i) => ({
						value: k,
						label: (
							<span className="inline-flex items-center gap-2">
								<VerdictGlyph kind={k} size={16} />
								{MARKER_LABELS[k]}
							</span>
						),
						count: counts.kind(k),
						indent: true,
						separate: i === 0,
					})),
					{ value: "all", label: "All gear", count: counts.kind("all"), separate: true },
				]}
			/>
		),
		prof: (
			<FilterMenu
				value={profession ?? ""}
				onChange={(v) => setFilters({ profession: v || undefined })}
				options={[
					{ value: "", label: "All professions", count: counts.prof() },
					...professions.map((p, i) => ({ value: p, label: p, count: counts.prof(p), separate: i === 0 })),
				]}
			/>
		),
	};

	const search = (
		<SearchInput
			ref={inputRef}
			large
			value={query}
			onChange={(e) => setQuery(e.target.value)}
			onKeyDown={(e) => {
				if (e.key === "Escape") setQuery("");
			}}
			placeholder="Search gear... (boots, Agility, a name)"
			aria-label="Search gear"
			className="h-10 text-[15px]"
			wrapperClassName="flex-1 basis-64"
		/>
	);

	return (
		<div>
			<div className="min-w-0 space-y-3">
				{search}
				{/* The filters as menus; a 2x2 grid on phones. */}
				<div className="flex flex-wrap items-center gap-2 @max-md:grid @max-md:grid-cols-2">
					{menus.for}
					{menus.by}
					{menus.kind}
					{menus.prof}
					<RemovedSwitch
						checked={showRemoved}
						onChange={setShowRemoved}
						count={removedCount}
						className="ml-auto pl-2 @max-md:col-span-2 @max-md:ml-0"
					/>
				</div>
				<MarkerLegend />
				{!data ? (
					<p className="py-10 text-center text-sm text-muted-foreground">
						{data === null ? "Members only." : "Checking what the guild can craft against everyone's gear..."}
					</p>
				) : data.hits.length === 0 && kind !== "all" ? (
					<NothingYet data={data} />
				) : results.length === 0 ? (
					<div className={EMPTY}>
						{deferred.trim() ? (
							<>
								No {kind === "all" ? "gear" : "upgrades"} match "{deferred.trim()}".
							</>
						) : (
							`No ${kind === "all" ? "gear" : "upgrades"} with these filters.`
						)}
						{filtered ? (
							<div className="mt-3">
								<Button variant="outline" size="sm" onClick={() => setFilters({})}>
									Clear filters
								</Button>
							</div>
						) : null}
					</div>
				) : (
					<section className="surface-card overflow-hidden">
						<header className="flex min-w-0 items-center gap-2 border-b border-border/60 px-4 py-2.5">
							<h3 className="truncate text-[0.8125rem] font-semibold">
								<Title forWho={forWho} byWho={byWho} name={named} all={kind === "all"} />
							</h3>
							<span className="num text-xs text-muted-foreground">{results.length}</span>
							<span className="ml-1 truncate text-xs text-muted-foreground @max-2xl:hidden">
								{kind === "all" ? "Everything the guild can craft to wear" : hintFor(forWho, byWho, named)}
							</span>
							{filtered ? (
								<Button variant="outline" size="xs" className="ml-auto flex-none" onClick={() => setFilters({})}>
									Clear
								</Button>
							) : null}
						</header>
						<div
							className={cn(
								COLS,
								"border-b border-border/60 px-4 pt-2 pb-1.5 text-xs text-muted-foreground @max-2xl:hidden",
							)}
						>
							<span />
							<span>Item</span>
							<span>Who's it for?</span>
							<span>Who crafts it?</span>
							<span />
						</div>
						<ul className="divide-y divide-border/60">
							{results.slice(0, limit).map((r) => (
								<UpgradeRow
									key={r.recipeId}
									row={r}
									region={region}
									guildSlug={guildSlug}
									member={member}
									forWho={forWho}
									onRemove={onRemove}
									onRestore={(slug) => setRemoved(r, slug, false)}
									onMore={setPeople}
								/>
							))}
						</ul>
						{results.length > limit ? (
							<button
								type="button"
								onClick={() => setLimit(Number.POSITIVE_INFINITY)}
								className="w-full border-t border-border/60 px-4 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							>
								Show all <span className="num">{results.length}</span>
							</button>
						) : null}
					</section>
				)}
				<Footnote region={region} characters={member?.characters} />
			</div>
			<PeopleDialog
				row={people}
				region={region}
				guildSlug={guildSlug}
				onRestore={(slug) => people && setRemoved(people, slug, false)}
				onClose={() => setPeople(null)}
			/>
			<RemoveDialog
				target={confirming}
				onCancel={() => setConfirming(null)}
				onConfirm={(slug, dontAsk) => {
					if (dontAsk) setSkipRemoveConfirm();
					if (confirming) setRemoved(confirming.row, slug, true);
					setConfirming(null);
				}}
			/>
		</div>
	);
}

type Named = (who: Who) => { name: string; classId: number } | undefined;

/** "Upgrades for Corwin that Ivar can craft": the table's title, from the filters. */
function Title({ forWho, byWho, name, all }: { forWho: Who; byWho: Who; name: Named; all?: boolean }) {
	const who = (w: Who, mine: string, guild: string) => {
		if (w === "mine") return mine;
		if (w === "guild") return guild;
		const c = name(w);
		return c ? <ClassText classId={c.classId}>{c.name}</ClassText> : null;
	};
	const target = forWho ? who(forWho, "your characters", "guildmates") : null;
	const crafter = byWho ? who(byWho, "your characters", "guildmates") : null;
	return (
		<>
			{all ? "Gear" : "Upgrades"}
			{target ? <> for {target}</> : null}
			{crafter ? (
				<>
					{target ? " that " : " "}
					{crafter} can craft
				</>
			) : null}
		</>
	);
}

function hintFor(forWho: Who, byWho: Who, name: Named) {
	if (!forWho && !byWho) return "What the guild can craft for your characters, and what yours can craft for guildmates";
	const target = name(forWho);
	const crafter = name(byWho);
	if (target && !byWho) return `What someone in the guild can craft that beats what ${target.name} wears`;
	if (crafter && !forWho) return `What ${crafter.name} can make that beats what someone wears`;
	return "";
}

/** No rows at all: why (no gear read, everything removed, strict gear types). */
function NothingYet({ data }: { data: Data }) {
	return (
		<p className={EMPTY}>
			Nothing the guild can craft beats what your characters wear right now, and nothing yours can craft beats what
			anyone else wears.
			{data.noGear.length ? (
				<span className="mt-1 block text-xs">
					We haven't read {data.noGear.map((c) => c.name).join(", ")}'s gear yet.
				</span>
			) : null}
			{data.strict.length ? (
				<span className="mt-1 block text-xs">
					"Only these" in {data.strict.map((c) => c.name).join(", ")}'s Preferences leaves other armor or weapon types
					out.
				</span>
			) : null}
		</p>
	);
}

/**
 * The row's marker: the best verdict among whom the filter keeps, "removed"
 * when all of those are removed, or none when it's nobody's upgrade (All gear).
 */
function rowKind(row: Row, forWho: Who): MarkerKind | null {
	if (row.shown.filter((x) => keeps(forWho, x)).length === 0 && !row.for.some((x) => x.removed)) return null;
	const live = row.shown.filter((x) => keeps(forWho, x) && !x.removed);
	if (live.length === 0) return "removed";
	return live.reduce<VerdictKind>((best, x) => (kindRank(x.kind) < kindRank(best) ? x.kind : best), live[0].kind);
}

function UpgradeRow({
	row,
	region,
	guildSlug,
	member,
	forWho,
	onRemove,
	onRestore,
	onMore,
}: {
	row: Row;
	region: string;
	guildSlug: string;
	member?: Member;
	forWho: Who;
	onRemove: (row: Row) => void;
	onRestore: (slug: string) => void;
	/** "+N more": everyone, in a dialog. */
	onMore: (row: Row) => void;
}) {
	const kind = rowKind(row, forWho);
	const more = () => onMore(row);
	// One character picked: their line alone, and who else it helps as a note.
	const solo = forWho && forWho !== "mine" && forWho !== "guild" ? forWho : undefined;
	const canRemove = row.shown.some((x) => x.mine && !x.removed && keeps(forWho, x));
	// No Request when one of yours can make it, or when it binds to its crafter (the item's line says so).
	const canRequest = !row.item?.untradeable && !row.crafters.some((c) => c.mine);
	return (
		<li className={cn(COLS, "px-4 py-3")}>
			{/* Level with the item icon's top, a touch lower so it sits even with it. */}
			{kind ? <VerdictMarker kind={kind} hint={MARKER_HINTS[kind]} className="mt-0.5" /> : <span />}
			<RecipeItem
				recipe={row}
				size={36}
				wrap
				detail={row.item?.untradeable ? `${row.profession} · ${row.item.untradeable}` : row.profession}
			/>
			<div className={cn(CELL, "min-w-0")}>
				<CellHead>Who's it for?</CellHead>
				{row.shown.length === 0 ? (
					<p className="text-xs leading-5 text-muted-foreground">Not an upgrade for anyone right now</p>
				) : solo ? (
					<SoloFor row={row} slug={solo} region={region} rowKind={kind} onRestore={onRestore} onMore={more} />
				) : (
					<ForCell row={row} region={region} rowKind={kind} onRestore={onRestore} onMore={more} />
				)}
			</div>
			<div className={cn(CELL, "min-w-0 @max-2xl:mt-1")}>
				<CellHead>Who crafts it?</CellHead>
				<MakersCell
					crafters={row.crafters}
					learners={row.learners}
					region={region}
					profession={row.profession}
					onMore={more}
				>
					<Requested row={row} region={region} guildSlug={guildSlug} />
				</MakersCell>
			</div>
			<div className={cn(CELL, "flex flex-wrap items-center gap-1 @2xl:justify-end")}>
				{canRequest ? <CraftRequest recipe={row} member={member} /> : null}
				{member ? <TrackButton recipeId={row.recipeId} /> : null}
				{canRemove ? (
					<Button
						variant="ghost"
						size="sm"
						className="text-muted-foreground"
						title="Never suggest this for your character again, here or in the game's tooltips"
						onClick={() => onRemove(row)}
					>
						Remove
					</Button>
				) : null}
			</div>
		</li>
	);
}

/** A narrow pane's stand-in for the column heads: the question over its cell. */
function CellHead({ children }: { children: ReactNode }) {
	return <p className="mb-1.5 text-xs text-muted-foreground @2xl:hidden">{children}</p>;
}

/** One person it's for: name, spec (and the verdict when it isn't the row's), why, and Restore when removed. */
function Person({
	h,
	region,
	rowKind,
	onRestore,
}: {
	h: Help;
	region: string;
	rowKind: MarkerKind | null;
	onRestore: (slug: string) => void;
}) {
	return (
		<>
			<div className="flex min-w-0 items-baseline gap-2 leading-5">
				<Link to="/c/$region/$slug" params={{ region, slug: h.slug }} className="font-medium hover:underline">
					<ClassText classId={h.classId}>{h.name}</ClassText>
				</Link>
				<span className="truncate text-xs text-muted-foreground">
					{h.spec}
					{h.kind !== rowKind && !h.removed
						? ` · ${verdictLabel(h.kind, h.at)}`
						: h.at
							? ` · from level ${h.at}`
							: null}
					{h.removed ? " · Removed" : null}
				</span>
				{h.removed ? (
					<button
						type="button"
						onClick={() => onRestore(h.slug)}
						className="text-xs text-muted-foreground underline hover:text-foreground"
						title="Suggest this for this character again"
					>
						Restore
					</button>
				) : null}
			</div>
			<p className={cn("mt-px text-[12.5px] leading-snug", h.removed && "opacity-60")}>
				<UpgradeWhy text={h.why} />
			</p>
		</>
	);
}

/** "Who's it for?": yours, then guildmates, each a list on a guide line. */
function ForCell({
	row,
	region,
	rowKind,
	onRestore,
	onMore,
}: {
	row: Row;
	region: string;
	rowKind: MarkerKind | null;
	onRestore: (slug: string) => void;
	onMore: () => void;
}) {
	const yours = row.shown.filter((x) => x.mine);
	const mates = row.shown.filter((x) => !x.mine);
	const listed = mates.slice(0, MATES);
	// Guildmates past the listed few (the server counts them all).
	const more = row.others - listed.length;
	return (
		<ul className="who-list people text-[13px]">
			{yours.length ? (
				<li>
					<span className="who-label">Yours</span>
					<ul>
						{yours.map((h) => (
							<li key={h.slug}>
								<Person h={h} region={region} rowKind={rowKind} onRestore={onRestore} />
							</li>
						))}
					</ul>
				</li>
			) : null}
			{mates.length ? (
				<li>
					<span className="who-label">Guildmates</span>
					<ul>
						{listed.map((h) => (
							<li key={h.slug}>
								<Person h={h} region={region} rowKind={rowKind} onRestore={onRestore} />
							</li>
						))}
						{more > 0 ? (
							<li>
								<MoreButton count={more} onClick={onMore} />
							</li>
						) : null}
					</ul>
				</li>
			) : null}
		</ul>
	);
}

/** "Who's it for?" with one character picked: theirs, and who else it would help. */
function SoloFor({
	row,
	slug,
	region,
	rowKind,
	onRestore,
	onMore,
}: {
	row: Row;
	slug: string;
	region: string;
	rowKind: MarkerKind | null;
	onRestore: (slug: string) => void;
	onMore: () => void;
}) {
	const h = row.shown.find((x) => x.slug === slug);
	if (!h) return null;
	const rest = row.shown.filter((x) => x.slug !== slug);
	const extra = row.others - row.shown.filter((x) => !x.mine).length;
	const more = rest.length - 1 + extra;
	return (
		<div className="text-[13px]">
			<Person h={h} region={region} rowKind={rowKind} onRestore={onRestore} />
			{rest.length ? (
				<p className="mt-1.5 text-xs text-muted-foreground">
					Also helps <ClassText classId={rest[0].classId}>{rest[0].name}</ClassText>
					{more > 0 ? (
						<>
							{" "}
							and{" "}
							<button type="button" onClick={onMore} className="underline hover:text-foreground">
								<span className="num">{more}</span> more
							</button>
						</>
					) : null}
				</p>
			) : null}
		</div>
	);
}

function MoreButton({ count, onClick }: { count: number; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="text-xs leading-5 text-muted-foreground hover:text-foreground hover:underline"
		>
			+<span className="num">{count}</span> more
		</button>
	);
}

/** "Requested by Hollis": the guild's open requests for it, under the crafters. */
function Requested({ row, region, guildSlug }: { row: Row; region: string; guildSlug: string }) {
	return (
		<>
			{row.requested.length ? (
				<Link
					to="/g/$region/$slug/requests"
					params={{ region, slug: guildSlug }}
					className="mt-2.5 block text-xs text-muted-foreground hover:text-foreground"
				>
					Requested by{" "}
					{row.requested.map((r, i) => (
						<span key={`${r.name}-${i}`}>
							{i > 0 ? ", " : null}
							<ClassText classId={r.classId}>{r.name}</ClassText>
						</span>
					))}
				</Link>
			) : null}
		</>
	);
}

/** Request for members (when someone else knows it), or why not: the item binds to its crafter. */
export function CraftRequest({
	recipe,
	member,
}: {
	recipe: {
		recipeId: number;
		name: string;
		item: { itemId: number; quality?: string; icon?: string; name: string; untradeable?: string | null } | null;
		crafters: { name: string; slug: string; classId: number; skill?: number }[];
	};
	member?: Member;
}) {
	if (recipe.item?.untradeable) {
		return <span className="flex-none text-xs whitespace-nowrap text-muted-foreground">{recipe.item.untradeable}</span>;
	}
	if (!member || !recipe.crafters.some((c) => !member.characters.some((m) => m.slug === c.slug))) return null;
	return (
		<RequestButton
			guild={member.guild}
			characters={member.characters}
			size="sm"
			label="Request"
			className="flex-none"
			target={{
				kind: "craft",
				recipeId: recipe.recipeId,
				name: recipe.item?.name ?? recipe.name,
				itemId: recipe.item?.itemId,
				quality: recipe.item?.quality,
				icon: recipe.item?.icon,
				crafters: recipe.crafters,
			}}
		/>
	);
}

const KINDS = ["upgrade", "maybe", "empty"] as const satisfies VerdictKind[];

/** Upgrades' filters as the page passes them on (the ones given change; none given clears them all). */
export type Filters = { for?: Who; by?: Who; kind?: GearKind; profession?: string };

/** Who it's for or who crafts it, as a menu ("For Ivar"): Anyone, My characters, each of them, Guildmates. */
export function WhoPicker({
	label,
	value,
	onChange,
	count,
	characters,
}: {
	label: string;
	value: Who;
	onChange: (v: Who) => void;
	count: (who: Who) => number;
	characters: { slug: string; name: string; classId: number }[];
}) {
	const options: FilterOption[] = [{ value: "", label: "Anyone", count: count(undefined) }];
	if (characters.length) {
		options.push({ value: "mine", label: "My characters", count: count("mine"), separate: true });
		for (const c of characters)
			options.push({
				value: c.slug,
				// Inline color: the menu's highlight restyles text color through classes.
				label: <span style={{ color: CLASSES[c.classId]?.color }}>{c.name}</span>,
				count: count(c.slug),
				indent: true,
			});
	}
	options.push({ value: "guild", label: "Guildmates", count: count("guild"), separate: true });
	return (
		<FilterMenu
			label={label}
			value={value ?? ""}
			onChange={(v) => onChange(v || undefined)}
			options={options}
			className="@max-md:min-w-0"
		/>
	);
}

function RemovedSwitch({
	checked,
	onChange,
	count,
	className,
}: {
	checked: boolean;
	onChange: (v: boolean) => void;
	count: number;
	className?: string;
}) {
	return (
		<label
			className={cn(
				"flex cursor-pointer items-center gap-2 text-[0.8125rem] text-muted-foreground select-none hover:text-foreground",
				className,
			)}
		>
			<Switch checked={checked} onCheckedChange={onChange} />
			Show removed
			{count ? <span className="num text-xs">{count}</span> : null}
		</label>
	);
}

/** The markers' key, above the table. */
function MarkerLegend() {
	return (
		<div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
			{(["upgrade", "maybe", "empty"] as const).map((k) => (
				<span key={k} className="inline-flex items-center gap-1.5" title={MARKER_HINTS[k]}>
					<VerdictGlyph kind={k} size={18} />
					{MARKER_LABELS[k]}
				</span>
			))}
		</div>
	);
}

/** Where the picks come from, and where to change your stat priority. */
function Footnote({ region, characters }: { region: string; characters?: { slug: string; name: string }[] }) {
	const first = characters?.[0];
	return (
		<p className="px-1 text-xs text-muted-foreground">
			A best guess from stat weights, what each character wears, their stat priority and gear types, not a sim.
			{first ? (
				<>
					{" "}
					Change yours on your character's page (
					<Link to="/c/$region/$slug" params={{ region, slug: first.slug }} className="underline hover:text-foreground">
						{first.name}
					</Link>
					); the game's tooltips follow after the Guildie app's next refresh.
				</>
			) : null}
		</p>
	);
}

/**
 * Everyone a row's item is for (all guildmates, loaded on open: the row has
 * the best few) and everyone who crafts it, in a dialog.
 */
function PeopleDialog({
	row,
	region,
	guildSlug,
	onRestore,
	onClose,
}: {
	row: Row | null;
	region: string;
	guildSlug: string;
	onRestore: (slug: string) => void;
	onClose: () => void;
}) {
	// Keep the last row while the dialog fades out.
	const last = useRef(row);
	if (row) last.current = row;
	const r = row ?? last.current;
	const { data: everyone } = useQuery({
		...convexQuery(api.crafting.upgradeRecipients, {
			region: region as Region,
			slug: guildSlug,
			recipeId: r?.recipeId ?? 0,
		}),
		enabled: !!row,
	});
	if (!r) return null;
	const kind = rowKind(r, undefined);
	const yours = r.shown.filter((x) => x.mine);
	const mates = everyone ?? r.shown.filter((x) => !x.mine);
	const person = (h: Help) => (
		<li key={h.slug}>
			<Person h={h} region={region} rowKind={kind} onRestore={onRestore} />
		</li>
	);
	return (
		<Dialog.Root
			open={!!row}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
		>
			<Dialog.Portal>
				<Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
				<Dialog.Popup className="surface-card fixed top-1/2 left-1/2 z-50 flex max-h-[min(80vh,720px)] w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col bg-background text-[0.8125rem] shadow-[var(--popover-shadow)] transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0">
					<div className="flex items-start gap-3 border-b border-border/60 px-5 py-4">
						<Dialog.Title className="min-w-0 flex-1 text-[0.8125rem] font-normal">
							<RecipeItem recipe={r} size={36} wrap detail={r.profession} />
						</Dialog.Title>
						<Dialog.Close render={<Button variant="ghost" size="sm" className="text-muted-foreground" />}>
							Close
						</Dialog.Close>
					</div>
					<div className="grid min-h-0 gap-x-8 gap-y-6 overflow-y-auto px-5 py-4 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
						<section className="min-w-0">
							<h3 className="mb-2 text-xs text-muted-foreground">Who's it for?</h3>
							<ul className="who-list people text-[13px]">
								{yours.length ? (
									<li>
										<span className="who-label">Yours</span>
										<ul>{yours.map(person)}</ul>
									</li>
								) : null}
								{mates.length ? (
									<li>
										<span className="who-label">
											Guildmates <span className="num font-normal">{everyone ? mates.length : r.others}</span>
										</span>
										<ul>
											{mates.map(person)}
											{everyone ? null : (
												<li>
													<span className="text-xs leading-5 text-muted-foreground">Loading the rest...</span>
												</li>
											)}
										</ul>
									</li>
								) : null}
							</ul>
						</section>
						{/* Phones: the short list first, so it isn't under a long one. */}
						<section className="min-w-0 max-sm:order-first">
							<h3 className="mb-2 text-xs text-muted-foreground">Who crafts it?</h3>
							<MakersCell
								crafters={r.crafters}
								learners={r.learners}
								region={region}
								profession={r.profession}
								expanded
							/>
							<Requested row={r} region={region} guildSlug={guildSlug} />
						</section>
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

/** "Don't ask again" on the Remove dialog, per browser. */
const SKIP_REMOVE_CONFIRM = "guildie:skip-remove-confirm";

function skipRemoveConfirm() {
	try {
		return localStorage.getItem(SKIP_REMOVE_CONFIRM) === "1";
	} catch {
		return false;
	}
}

function setSkipRemoveConfirm() {
	try {
		localStorage.setItem(SKIP_REMOVE_CONFIRM, "1");
	} catch {
		// Private windows and blocked storage: it asks again next time.
	}
}

/**
 * Remove asks first: what goes, for which of your characters (a choice when
 * it's for several), and how to get it back (Show removed).
 */
function RemoveDialog({
	target,
	onCancel,
	onConfirm,
}: {
	target: { row: Row; who: Help[] } | null;
	onCancel: () => void;
	onConfirm: (slug: string, dontAsk: boolean) => void;
}) {
	const [dontAsk, setDontAsk] = useState(false);
	const [pick, setPick] = useState<string>();
	// Keep the last one while the dialog fades out.
	const last = useRef(target);
	if (target) last.current = target;
	const t = target ?? last.current;
	useEffect(() => {
		if (target) setPick(target.who[0]?.slug);
	}, [target]);
	const h = t?.who.find((x) => x.slug === pick) ?? t?.who[0];
	const item = t?.row.item;
	const several = (t?.who.length ?? 0) > 1;
	return (
		<Dialog.Root
			open={!!target}
			onOpenChange={(next) => {
				if (!next) onCancel();
			}}
		>
			<Dialog.Portal>
				<Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
				<Dialog.Popup className="surface-card fixed top-1/2 left-1/2 z-50 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 bg-background p-5 text-[0.8125rem] shadow-[var(--popover-shadow)] transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0">
					<Dialog.Title className="text-[15px] font-semibold">
						{several ? "Remove from whose upgrades?" : `Remove from ${h?.name}'s upgrades?`}
					</Dialog.Title>
					{item ? (
						<div className="mt-3 flex items-center gap-2.5 rounded-md border border-border bg-well px-3 py-2.5">
							<ItemIcon icon={item.icon} quality={item.quality} size={28} />
							<span className="min-w-0">
								<span className="block truncate" style={{ color: QUALITY_COLORS[item.quality ?? "COMMON"] }}>
									{item.name}
								</span>
								<span className="block truncate text-xs text-muted-foreground">
									{h ? `${MARKER_LABELS[h.kind]} for ${h.name} · ${h.spec}` : null}
								</span>
							</span>
						</div>
					) : null}
					{several ? (
						<fieldset className="mt-3 space-y-1">
							<legend className="sr-only">Which character</legend>
							{t?.who.map((x) => (
								<label
									key={x.slug}
									className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 hover:bg-accent"
								>
									<input
										type="radio"
										name="remove-for"
										checked={pick === x.slug}
										onChange={() => setPick(x.slug)}
										className="size-4 accent-(--highlight)"
									/>
									<ClassText classId={x.classId}>{x.name}</ClassText>
									<span className="text-xs text-muted-foreground">{x.spec}</span>
								</label>
							))}
						</fieldset>
					) : null}
					<Dialog.Description className="mt-3 text-pretty text-muted-foreground">
						It won't be suggested for {h?.name} again, here or in the game's tooltips. To see it again, turn on{" "}
						<span className="text-foreground">Show removed</span>, where you can put it back.
					</Dialog.Description>
					<label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-muted-foreground select-none hover:text-foreground">
						<input
							type="checkbox"
							checked={dontAsk}
							onChange={(e) => setDontAsk(e.target.checked)}
							className="size-4 accent-(--highlight)"
						/>
						Don't ask again
					</label>
					<div className="mt-5 flex justify-end gap-2">
						<Button variant="outline" onClick={onCancel}>
							Cancel
						</Button>
						<Button onClick={() => h && onConfirm(h.slug, dontAsk)}>Remove</Button>
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
