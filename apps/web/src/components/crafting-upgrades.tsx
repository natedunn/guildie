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
import { ItemIcon, QUALITY_COLORS } from "@/components/item";
import { compareProfessions, indexEntry, queryWords, RecipeItem, searchIndex } from "@/components/recipe-row";
import { RequestButton } from "@/components/requests";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { UpgradeWhy } from "@/components/upgrade-why";
import { MARKER_LABELS, type MarkerKind, VerdictGlyph, VerdictMarker } from "@/components/verdict-marker";
import { cn } from "@/lib/utils";
import { verdictLabel } from "@/lib/verdict";

// Crafting's Upgrades tab: one table, a row per item, of what the guild can
// craft for the viewer's characters and what theirs can craft for anyone in
// the guild (crafting.upgrades). Each row says who it's for and who crafts
// it, the viewer's characters ("Yours") apart from guildmates. Filters on
// both (anyone, your characters, one of them, guildmates) and the profession
// sit in a sidebar on a wide pane and in menus above the table on a narrow one.

export type Member = {
	guild: { region: Region; slug: string };
	characters: { slug: string; name: string; classId: number }[];
};

type Data = NonNullable<FunctionReturnType<typeof api.crafting.upgrades>>;
type Hit = Data["hits"][number];
type Help = Hit["for"][number];
/** A row: the item, and who it's for as the "Show removed" switch has it. */
type Row = Hit & { shown: Help[] };

/**
 * Whom a filter keeps: anyone (undefined), the viewer's characters
 * ("mine"), guildmates ("guild") or one character (their slug).
 */
export type Who = string | undefined;
const keeps = (who: Who, x: { slug: string; mine: boolean }) =>
	!who || (who === "mine" ? x.mine : who === "guild" ? !x.mine : x.slug === who);

/** Rows shown before "Show all": each renders item tooltips. */
const PAGE = 30;
/** Guildmates listed under "Who's it for?" and "Who crafts it?" before "+N more". */
const MATES = 2;
const CRAFTERS = 3;
const EMPTY = "surface-card px-4 py-10 text-center text-[0.8125rem] text-muted-foreground";
/** The table's columns: marker, item, who it's for, who crafts it, actions (a fixed width, so the heads line up). Stacked on a narrow pane. */
const COLS =
	"grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 @2xl:grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,0.9fr)_9.5rem] @2xl:gap-x-5";
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
	profession,
	setFilters,
}: {
	region: string;
	guildSlug: string;
	member?: Member;
	query: string;
	deferred: string;
	setQuery: (q: string) => void;
	inputRef: RefObject<HTMLInputElement | null>;
	forWho: Who;
	byWho: Who;
	profession?: string;
	setFilters: (next: { for?: Who; by?: Who; profession?: string }) => void;
}) {
	const args = { region: region as Region, slug: guildSlug };
	const { data } = useQuery(convexQuery(api.crafting.upgrades, args));
	const [showRemoved, setShowRemoved] = useState(false);
	const [limit, setLimit] = useState(PAGE);
	const words = useMemo(() => queryWords(deferred), [deferred]);

	const rows = useMemo<Row[]>(
		() =>
			(data?.hits ?? [])
				.map((h) => ({ ...h, shown: showRemoved ? h.for : h.for.filter((x) => !x.removed) }))
				.filter((r) => r.shown.length > 0),
		[data, showRemoved],
	);
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

	const forOk = (r: Row, who: Who) => r.shown.some((x) => keeps(who, x));
	const byOk = (r: Row, who: Who) => r.crafters.some((c) => keeps(who, c));
	const profOk = (r: Row, p?: string) => !p || r.profession === p;
	const results = matched.filter((r) => forOk(r, forWho) && byOk(r, byWho) && profOk(r, profession));
	// Each filter's counts, with the other filters on.
	const forRows = matched.filter((r) => byOk(r, byWho) && profOk(r, profession));
	const byRows = matched.filter((r) => forOk(r, forWho) && profOk(r, profession));
	const profRows = matched.filter((r) => forOk(r, forWho) && byOk(r, byWho));
	const counts = {
		for: (who: Who) => forRows.filter((r) => forOk(r, who)).length,
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

	useEffect(() => setLimit(PAGE), [deferred, forWho, byWho, profession, showRemoved]);

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
	const filtered = !!(forWho || byWho || profession);

	const sidebar = (
		<aside className="space-y-5 @max-5xl:hidden">
			<FilterTree
				title="Who's it for?"
				value={forWho}
				onChange={(v) => setFilters({ for: v })}
				count={counts.for}
				characters={characters.map((c) => ({ ...c, meta: undefined }))}
			/>
			<FilterTree
				title="Who crafts it?"
				value={byWho}
				onChange={(v) => setFilters({ by: v })}
				count={counts.by}
				characters={crafters.map((c) => ({ ...c, meta: c.skill }))}
			/>
			<div>
				<h3 className={TREE_TITLE}>Professions</h3>
				<ul className="filter-tree">
					<li>
						<TreeItem active={!profession} onClick={() => setFilters({ profession: undefined })} count={counts.prof()}>
							All
						</TreeItem>
						<ul>
							{professions
								.filter((p) => p === profession || counts.prof(p) > 0)
								.map((p) => (
									<li key={p}>
										<TreeItem
											active={profession === p}
											onClick={() => setFilters({ profession: p })}
											count={counts.prof(p)}
										>
											{p}
										</TreeItem>
									</li>
								))}
						</ul>
					</li>
				</ul>
			</div>
			<RemovedSwitch checked={showRemoved} onChange={setShowRemoved} count={removedCount} className="px-2.5" />
		</aside>
	);

	return (
		<div className="@5xl:grid @5xl:grid-cols-[13.5rem_minmax(0,1fr)] @5xl:items-start @5xl:gap-6">
			{sidebar}
			<div className="min-w-0 space-y-3">
				<div className="flex flex-wrap items-center gap-2">
					<Input
						ref={inputRef}
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Escape") setQuery("");
						}}
						placeholder="Search upgrades... (boots, Agility, a name)"
						aria-label="Search upgrades"
						className="h-10 min-w-0 flex-1 basis-64 text-[15px] @max-md:order-last @max-md:basis-full"
					/>
					{/* Narrow panes: the sidebar's filters as menus. */}
					<div className="flex min-w-0 flex-wrap items-center gap-2 @5xl:hidden @max-md:grid @max-md:basis-full @max-md:grid-cols-2">
						<WhoPicker
							label="For"
							value={forWho}
							onChange={(v) => setFilters({ for: v })}
							count={counts.for}
							characters={characters}
						/>
						<WhoPicker
							label="Crafted by"
							value={byWho}
							onChange={(v) => setFilters({ by: v })}
							count={counts.by}
							characters={crafters}
						/>
						<select
							aria-label="Profession"
							value={profession ?? ""}
							onChange={(e) => setFilters({ profession: e.target.value || undefined })}
							className="h-10 min-w-0 rounded-md border bg-well pl-3 text-sm @max-md:col-span-2"
						>
							<option value="">All professions ({counts.prof()})</option>
							{professions.map((p) => (
								<option key={p} value={p}>
									{p} ({counts.prof(p)})
								</option>
							))}
						</select>
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
					<MarkerLegend />
					<RemovedSwitch
						checked={showRemoved}
						onChange={setShowRemoved}
						count={removedCount}
						className="ml-auto @5xl:hidden"
					/>
				</div>
				{!data ? (
					<p className="py-10 text-center text-sm text-muted-foreground">
						{data === null ? "Members only." : "Checking what the guild can craft against everyone's gear..."}
					</p>
				) : data.hits.length === 0 ? (
					<NothingYet data={data} />
				) : results.length === 0 ? (
					<div className={EMPTY}>
						{deferred.trim() ? <>No upgrades match "{deferred.trim()}".</> : "No upgrades with these filters."}
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
								<Title forWho={forWho} byWho={byWho} name={named} />
							</h3>
							<span className="num text-xs text-muted-foreground">{results.length}</span>
							<span className="ml-1 truncate text-xs text-muted-foreground @max-2xl:hidden">
								{hintFor(forWho, byWho, named)}
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
function Title({ forWho, byWho, name }: { forWho: Who; byWho: Who; name: Named }) {
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
			Upgrades
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

/** The row's marker: the best verdict among whom the filter keeps, or "removed" when all of those are removed. */
function rowKind(row: Row, forWho: Who): MarkerKind {
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
			<VerdictMarker kind={kind} hint={MARKER_HINTS[kind]} className="mt-0.5" />
			<RecipeItem
				recipe={row}
				size={36}
				wrap
				detail={row.item?.untradeable ? `${row.profession} · ${row.item.untradeable}` : row.profession}
			/>
			<div className={cn(CELL, "min-w-0")}>
				<CellHead>Who's it for?</CellHead>
				{solo ? (
					<SoloFor row={row} slug={solo} region={region} rowKind={kind} onRestore={onRestore} onMore={more} />
				) : (
					<ForCell row={row} region={region} rowKind={kind} onRestore={onRestore} onMore={more} />
				)}
			</div>
			<div className={cn(CELL, "min-w-0 @max-2xl:mt-1")}>
				<CellHead>Who crafts it?</CellHead>
				<ByCell row={row} region={region} guildSlug={guildSlug} onMore={more} />
			</div>
			<div className={cn(CELL, "flex items-center gap-1.5 @2xl:justify-end")}>
				{canRequest ? <CraftRequest recipe={row} member={member} /> : null}
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
	rowKind: MarkerKind;
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
	rowKind: MarkerKind;
	onRestore: (slug: string) => void;
	onMore: () => void;
}) {
	const yours = row.shown.filter((x) => x.mine);
	const mates = row.shown.filter((x) => !x.mine);
	const listed = mates.slice(0, MATES);
	// Guildmates past the listed few (the server counts them all).
	const more = row.others - listed.length;
	return (
		<ul className="who-list text-[13px]">
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
	rowKind: MarkerKind;
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

/** "Who crafts it?": yours, then guildmates, with skill; then who asked for it. */
function ByCell({
	row,
	region,
	guildSlug,
	onMore,
}: {
	row: Row;
	region: string;
	guildSlug: string;
	onMore: () => void;
}) {
	const yours = row.crafters.filter((c) => c.mine);
	const mates = row.crafters.filter((c) => !c.mine);
	const listed = mates.slice(0, CRAFTERS);
	const crafter = (c: Crafter) => <CrafterItem key={c.slug} c={c} region={region} profession={row.profession} />;
	return (
		<div className="text-[13px]">
			<ul className="who-list">
				{yours.length ? (
					<li>
						<span className="who-label">Yours</span>
						<ul>{yours.map(crafter)}</ul>
					</li>
				) : null}
				{mates.length ? (
					<li>
						<span className="who-label">Guildmates</span>
						<ul>
							{listed.map(crafter)}
							{mates.length > listed.length ? (
								<li>
									<MoreButton count={mates.length - listed.length} onClick={onMore} />
								</li>
							) : null}
						</ul>
					</li>
				) : null}
			</ul>
			<Requested row={row} region={region} guildSlug={guildSlug} />
		</div>
	);
}

type Crafter = Hit["crafters"][number];

function CrafterItem({ c, region, profession }: { c: Crafter; region: string; profession: string }) {
	return (
		<li className="leading-5">
			<Link
				to="/c/$region/$slug/professions"
				params={{ region, slug: c.slug }}
				search={{ profession }}
				className="hover:underline"
			>
				<ClassText classId={c.classId}>{c.name}</ClassText>
			</Link>
			{c.skill !== undefined ? <span className="num ml-1.5 text-xs text-muted-foreground">{c.skill}</span> : null}
		</li>
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

const TREE_TITLE = "px-2.5 pb-1.5 text-xs font-semibold text-muted-foreground";

function TreeItem({
	active,
	onClick,
	count,
	strong,
	children,
}: {
	active: boolean;
	onClick: () => void;
	count: number;
	/** A group ("My characters"): full-strength text. */
	strong?: boolean;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			aria-pressed={active}
			onClick={onClick}
			className={cn(
				"flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2.5 text-left text-[13px] transition-colors hover:bg-accent hover:text-foreground",
				strong ? "text-foreground" : "text-muted-foreground",
				active && "bg-(--selected) text-foreground shadow-[inset_0_0_0_1px_rgb(255_176_96/0.2)]",
				count === 0 && !active && "opacity-60",
			)}
		>
			<span className="flex min-w-0 items-baseline gap-2 truncate">{children}</span>
			<span className="num ml-auto text-xs text-muted-foreground">{count}</span>
		</button>
	);
}

/** A sidebar filter: Anyone > My characters > each of them, and Guildmates. */
function FilterTree({
	title,
	value,
	onChange,
	count,
	characters,
}: {
	title: string;
	value: Who;
	onChange: (v: Who) => void;
	count: (who: Who) => number;
	characters: { slug: string; name: string; classId: number; meta?: number }[];
}) {
	return (
		<div>
			<h3 className={TREE_TITLE}>{title}</h3>
			<ul className="filter-tree">
				<li>
					<TreeItem active={!value} onClick={() => onChange(undefined)} count={count(undefined)}>
						Anyone
					</TreeItem>
					<ul>
						{characters.length ? (
							<li>
								<TreeItem active={value === "mine"} onClick={() => onChange("mine")} count={count("mine")} strong>
									My characters
								</TreeItem>
								{characters.length ? (
									<ul>
										{characters.map((c) => (
											<li key={c.slug}>
												<TreeItem active={value === c.slug} onClick={() => onChange(c.slug)} count={count(c.slug)}>
													<ClassText classId={c.classId}>{c.name}</ClassText>
													{c.meta !== undefined ? (
														<span className="num text-xs text-muted-foreground">{c.meta}</span>
													) : null}
												</TreeItem>
											</li>
										))}
									</ul>
								) : null}
							</li>
						) : null}
						<li>
							<TreeItem active={value === "guild"} onClick={() => onChange("guild")} count={count("guild")} strong>
								Guildmates
							</TreeItem>
						</li>
					</ul>
				</li>
			</ul>
		</div>
	);
}

/** The sidebar filter as a menu, for narrow panes ("For: Ivar"). */
function WhoPicker({
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
	const current = characters.find((c) => c.slug === value);
	// Inline color: the menu's highlight restyles descendants' text color through classes.
	const named = (c: { name: string; classId: number }) => (
		<span style={{ color: CLASSES[c.classId]?.color }}>{c.name}</span>
	);
	const text = current
		? named(current)
		: value === "mine"
			? "My characters"
			: value === "guild"
				? "Guildmates"
				: "Anyone";
	const item = (v: string, children: ReactNode, n: number) => (
		<DropdownMenuRadioItem key={v} value={v}>
			<span className="flex w-full items-baseline gap-3">
				{children}
				<span className="num ml-auto text-xs text-muted-foreground">{n}</span>
			</span>
		</DropdownMenuRadioItem>
	);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger className="h-10 min-w-0 whitespace-nowrap rounded-md border border-input bg-well bg-(image:--select-chevron) bg-size-[0.75rem] bg-position-[right_0.5rem_center] bg-no-repeat pr-7 pl-3 text-left text-sm truncate @max-md:flex-1">
				<span className="text-muted-foreground">{label} </span>
				{text}
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-auto min-w-(--anchor-width)">
				<DropdownMenuRadioGroup value={value ?? ""} onValueChange={(v) => onChange(String(v) || undefined)}>
					{item("", "Anyone", count(undefined))}
					{characters.length ? item("mine", "My characters", count("mine")) : null}
					{characters.length > 1 ? (
						<>
							<DropdownMenuSeparator />
							{characters.map((c) => item(c.slug, <span className="pl-3">{named(c)}</span>, count(c.slug)))}
						</>
					) : null}
					<DropdownMenuSeparator />
					{item("guild", "Guildmates", count("guild"))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
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
	const myCrafters = r.crafters.filter((c) => c.mine);
	const mateCrafters = r.crafters.filter((c) => !c.mine);
	const person = (h: Help) => (
		<li key={h.slug}>
			<Person h={h} region={region} rowKind={kind} onRestore={onRestore} />
		</li>
	);
	const crafter = (c: Crafter) => <CrafterItem key={c.slug} c={c} region={region} profession={r.profession} />;
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
							<ul className="who-list text-[13px]">
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
							<ul className="who-list text-[13px]">
								{myCrafters.length ? (
									<li>
										<span className="who-label">Yours</span>
										<ul>{myCrafters.map(crafter)}</ul>
									</li>
								) : null}
								{mateCrafters.length ? (
									<li>
										<span className="who-label">
											Guildmates <span className="num font-normal">{mateCrafters.length}</span>
										</span>
										<ul>{mateCrafters.map(crafter)}</ul>
									</li>
								) : null}
							</ul>
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
