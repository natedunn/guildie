import { api } from "@convex/_generated/api";
import { recipeCandidates } from "@convex/shared/recipeStatus";
import type { VerdictKind } from "@convex/shared/upgrades";
import type { Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { useQueries, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ClassText } from "@/components/class-name";
import { CraftRequest, type Filters, type Member, UpgradesView } from "@/components/crafting-upgrades";
import { FilterMenu } from "@/components/filter-menu";
import { ItemHover, ItemIcon, QUALITY_COLORS } from "@/components/item";
import { PageTabButton, PageTabs } from "@/components/page-tabs";
import { type Learner, LearnerSummary } from "@/components/recipe-learners";
import {
	buildIndex,
	compareProfessions,
	type GuildRecipe,
	type Indexed,
	indexEntry,
	queryWords,
	RecipeItem,
	searchIndex,
} from "@/components/recipe-row";
import { RetryingErrorPage } from "@/components/status-pages";
import { SearchInput } from "@/components/ui/search-input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

// Three tabs: "Upgrades" (the default, members only), "Who can make"
// (?view=make; the default for anyone else) and "Who can learn" (?view=learn).
//
// "Who can make...": every recipe someone in the guild knows, searched on the
// client (recipe, item, item kind, tooltip text, reagents). The search and the
// profession filter live in the URL so a result can be shared in chat.
// Members also get Upgrades (components/crafting-upgrades.tsx): one table of
// what the guild can craft for their characters and what theirs can craft
// for anyone, by the gear-upgrade rules (shared/upgrades.ts), filtered by
// who it's for (?for=) and who crafts it (?by=).
// And "Who can learn" (?view=learn): every recipe item (pattern, plans,
// formula...) for the guild's professions, with who could learn it now or
// later, who already has one and who knows it: is it worth sending someone?

type View = "upgrades" | "make" | "learn";
/**
 * Upgrades' filters, `for` (who it's for) and `by` (who crafts it): "mine"
 * (the viewer's characters), "guild" (guildmates) or a character's slug;
 * anyone when missing.
 */
type Search = { q?: string; profession?: string; view?: View; for?: string; by?: string; kind?: VerdictKind };

export const Route = createFileRoute("/g/$region/$slug/crafting")({
	validateSearch: (search: Record<string, unknown>): Search => {
		const out: Search = {};
		// The router parses "?q=8" as a number; take it back as text.
		if (typeof search.q === "string" || typeof search.q === "number") out.q = String(search.q);
		if (typeof search.profession === "string") out.profession = search.profession;
		// "craft" was Upgrades' old Crafts for others.
		if (search.view === "upgrades" || search.view === "craft") out.view = "upgrades";
		if (search.view === "make" || search.view === "learn") out.view = search.view;
		if (typeof search.for === "string") out.for = search.for;
		if (typeof search.by === "string") out.by = search.by;
		if (search.kind === "upgrade" || search.kind === "maybe" || search.kind === "empty") out.kind = search.kind;
		// Old links: ?char= was who it's for (Crafts for me) or who crafts it (Crafts for others).
		if (typeof search.char === "string") {
			if (search.view === "craft") out.by ??= search.char;
			else out.for ??= search.char;
		}
		return out;
	},
	loader: async ({ context, params }) => {
		const args = { region: params.region as Region, slug: params.slug };
		const qc = context.queryClient;
		// Upgrades is the slow part: start it now, not awaited, so it's on its
		// way while the page renders. Membership (cheap) is awaited: the tabs
		// show with the page.
		void qc.prefetchQuery(convexQuery(api.crafting.upgrades, args));
		// Recipe items: the Who can learn count and Who can make's "Nobody knows
		// these yet". Also not awaited; the page doesn't wait for them.
		void qc.prefetchQuery(convexQuery(api.crafting.guildRecipeLearners, args));
		await Promise.all([
			qc.ensureQueryData(convexQuery(api.crafting.guildCrafting, args)),
			qc.ensureQueryData(convexQuery(api.requests.me, args)),
		]);
	},
	component: CraftingPage,
	pendingComponent: CraftingLoading,
	errorComponent: (props) => <RetryingErrorPage {...props} loading={<CraftingLoading />} />,
});

function CraftingLoading() {
	return <p className="py-10 text-center text-sm text-muted-foreground">Loading the guild's recipes...</p>;
}

/** Rendering every row's tooltips at once is the slow part; show this many until asked. */
const PAGE = 150;
/** Crafters shown per recipe before "+N more". */
const CRAFTERS = 4;
/** Nothing to list (members only, no recipes, no matches): a quiet card. */
const EMPTY = "surface-card px-4 py-10 text-center text-[0.8125rem] text-muted-foreground";

function CraftingPage() {
	const params = Route.useParams();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const { data } = useSuspenseQuery(
		convexQuery(api.crafting.guildCrafting, { region: params.region as Region, slug: params.slug }),
	);

	const [query, setQuery] = useState(search.q ?? "");
	const deferred = useDeferredValue(query);
	const [limit, setLimit] = useState(PAGE);
	const profession = search.profession;

	// Typing stays local (instant); the URL follows a beat later, replacing
	// the history entry so Back doesn't step through every keystroke.
	const pushedQ = useRef(search.q);
	useEffect(() => {
		const q = query.trim() || undefined;
		if (q === pushedQ.current) return;
		const t = setTimeout(() => {
			pushedQ.current = q;
			navigate({ search: (prev) => ({ ...prev, q }), replace: true, resetScroll: false });
		}, 250);
		return () => clearTimeout(t);
	}, [query, navigate]);

	// Back/forward or a pasted link changed ?q= under us (not our own push); follow it.
	useEffect(() => {
		if (search.q !== pushedQ.current) {
			pushedQ.current = search.q;
			setQuery(search.q ?? "");
		}
	}, [search.q]);

	// Focus the search on desktop, where it's the point of the page; on phones
	// it would pop the keyboard over the results.
	const inputRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (window.matchMedia("(min-width: 768px) and (pointer: fine)").matches) inputRef.current?.focus();
	}, []);

	// Members can request a craft from a row.
	const { data: me } = useSuspenseQuery(
		convexQuery(api.requests.me, { region: params.region as Region, slug: params.slug }),
	);
	const member = me
		? { guild: { region: params.region as Region, slug: params.slug }, characters: me.characters }
		: undefined;

	// Upgrades and Who can learn are for members; Upgrades is their default.
	const view: View = !me ? "make" : (search.view ?? "upgrades");
	const showUpgrades = view === "upgrades";
	const showLearn = view === "learn";
	const { data: learnData } = useQuery({
		...convexQuery(api.crafting.guildRecipeLearners, { region: params.region as Region, slug: params.slug }),
		enabled: !!me,
	});
	const learnRows = useLearnRows(learnData);
	const learnIndex = useLearnIndex(learnRows, query.trim() !== "" && view !== "upgrades");
	const neededCount = useMemo(() => learnRows.filter((r) => r.needed).length, [learnRows]);
	const source: GuildRecipe[] = data ?? [];

	const index = useMemo(() => buildIndex(source), [source]);
	const words = useMemo(() => queryWords(deferred), [deferred]);
	const matches = useMemo(() => searchIndex(index, words), [index, words]);
	// Who can make, searching: recipe items nobody knows yet that match, and who could learn them.
	const couldLearn = useMemo(() => {
		if (view !== "make" || words.length === 0) return [];
		return searchIndex(learnIndex, words).filter(
			(r) => !r.known && r.needed && (!profession || r.profession === profession),
		);
	}, [learnIndex, words, view, profession]);

	// Counts per profession reflect the current search, so the chips say where the hits are.
	const counts = useMemo(() => {
		const c = new Map<string, number>();
		for (const r of matches) c.set(r.profession, (c.get(r.profession) ?? 0) + 1);
		return c;
	}, [matches]);
	const professions = useMemo(() => [...new Set(source.map((r) => r.profession))].sort(compareProfessions), [source]);

	const results = useMemo(
		() => (profession ? matches.filter((r) => r.profession === profession) : matches),
		[matches, profession],
	);

	useEffect(() => setLimit(PAGE), [deferred, profession, view]);

	if (!data) {
		return <p className={EMPTY}>This guild's crafting is for members only.</p>;
	}
	if (data.length === 0) {
		return (
			<p className={EMPTY}>No known recipes yet. They appear once members' professions have synced from Blizzard.</p>
		);
	}

	const setProfession = (p?: string) =>
		navigate({ search: (prev) => ({ ...prev, profession: p }), replace: true, resetScroll: false });
	const setView = (v: View) =>
		navigate({
			// Upgrades is the default: no ?view= for it. Filters belong to the tab they were set on.
			search: (prev) => ({
				...prev,
				view: v === "upgrades" ? undefined : v,
				profession: undefined,
				for: undefined,
				by: undefined,
				kind: undefined,
			}),
			replace: true,
			resetScroll: false,
		});
	// Upgrades' filters: the ones given change, the others stay; none given clears them all.
	const setFilters = (next: Filters) =>
		navigate({
			search: (prev) => {
				const clear = Object.keys(next).length === 0;
				const pick = <K extends keyof Filters>(k: K) => (clear ? undefined : k in next ? next[k] : prev[k]);
				return { ...prev, for: pick("for"), by: pick("by"), kind: pick("kind"), profession: pick("profession") };
			},
			replace: true,
			resetScroll: false,
		});

	return (
		// A container, so the row layout follows the content pane's width rather than the viewport.
		<div className="@container w-full space-y-4 pb-6">
			<div className="space-y-3">
				{me ? (
					<PageTabs>
						<PageTabButton active={showUpgrades} onClick={() => setView("upgrades")}>
							Upgrades
						</PageTabButton>
						<PageTabButton active={view === "make"} onClick={() => setView("make")} count={data.length}>
							<span className="@max-md:hidden">Who can make</span>
							<span className="@md:hidden">Make</span>
						</PageTabButton>
						<PageTabButton
							active={showLearn}
							onClick={() => setView("learn")}
							count={learnData ? neededCount : undefined}
						>
							<span className="@max-md:hidden">Who can learn</span>
							<span className="@md:hidden">Learn</span>
						</PageTabButton>
					</PageTabs>
				) : null}
				{showLearn ? (
					<LearnView
						data={learnData}
						rows={learnRows}
						index={learnIndex}
						region={params.region}
						query={query}
						deferred={deferred}
						setQuery={setQuery}
						profession={profession}
						setProfession={setProfession}
					/>
				) : null}
				{showUpgrades ? (
					<UpgradesView
						region={params.region}
						guildSlug={params.slug}
						member={member}
						query={query}
						deferred={deferred}
						setQuery={setQuery}
						inputRef={inputRef}
						forWho={search.for}
						byWho={search.by}
						kind={search.kind}
						profession={profession}
						setFilters={setFilters}
					/>
				) : null}
				{/* One row: the search and the profession. Wraps on phones. Who can learn and Upgrades have their own. */}
				<div className={cn("flex flex-wrap items-center gap-2", (showLearn || showUpgrades) && "hidden")}>
					<SearchInput
						ref={inputRef}
						large
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Escape") setQuery("");
						}}
						placeholder="Who can make... (bag, Mageweave, 8 slot bag)"
						aria-label="Search recipes the guild can craft"
						className="h-10 text-[15px]"
						// Phones: a row of its own, under the profession.
						wrapperClassName="flex-1 basis-64 @max-md:order-last @max-md:basis-full"
					/>
					<ProfessionMenu
						value={profession}
						onChange={setProfession}
						total={matches.length}
						professions={professions.map((p) => [p, counts.get(p) ?? 0])}
						className="@max-md:flex-1"
					/>
				</div>
			</div>

			{showLearn || showUpgrades ? null : results.length === 0 ? (
				<div className="space-y-3">
					<div className={EMPTY}>
						{deferred.trim() ? <>Nobody in the guild can make "{deferred.trim()}" yet.</> : "Nothing here."}
						{couldLearn.length === 0 ? <div className="mt-1">Try "bag" or "Mageweave".</div> : null}
					</div>
					<CouldLearn rows={couldLearn} region={params.region} onSeeAll={() => setView("learn")} />
				</div>
			) : (
				<div className="space-y-4">
					{/* Every column at every width: a narrow pane scrolls the list sideways. */}
					<div className="overflow-x-auto">
						<div className="min-w-[40rem]">
							<div className="grid grid-cols-[minmax(0,1.3fr)_7.5rem_minmax(0,1fr)] gap-4 border-b border-border pb-1.5 text-xs text-muted-foreground">
								<span>Item</span>
								<span>Profession</span>
								<span>Crafters</span>
							</div>
							<ul>
								{results.slice(0, limit).map((r) => (
									<ResultRow key={r.recipeId} recipe={r} region={params.region} member={member} />
								))}
							</ul>
						</div>
					</div>
					{results.length > limit ? (
						<ShowAll count={results.length} onClick={() => setLimit(Number.POSITIVE_INFINITY)} />
					) : null}
					<CouldLearn rows={couldLearn} region={params.region} onSeeAll={() => setView("learn")} />
				</div>
			)}
		</div>
	);
}

/** "All professions (341)" or one of them, as a menu like Upgrades' filters. */
function ProfessionMenu({
	value,
	onChange,
	total,
	professions,
	className,
}: {
	value?: string;
	onChange: (p?: string) => void;
	total: number;
	professions: [name: string, count: number][];
	className?: string;
}) {
	return (
		<FilterMenu
			value={value ?? ""}
			onChange={(v) => onChange(v || undefined)}
			options={[
				{ value: "", label: "All professions", count: total },
				...professions.map(([p, n], i) => ({ value: p, label: p, count: n, separate: i === 0 })),
			]}
			className={className}
		/>
	);
}

type LearnRow = ReturnType<typeof useLearnRows>[number];

/**
 * Recipe items with who in the guild could use each (recipeCandidates, the
 * rule the addon's tooltips use too), whether anyone could still learn one,
 * and whether someone knows it.
 */
function useLearnRows(data: LearnData | null | undefined) {
	return useMemo(() => {
		if (!data) return [];
		const characters = data.characters.map((c) => ({ ...c, holding: new Set(c.holding) }));
		return data.items.map((item) => {
			const learners: Learner[] = recipeCandidates(item.itemId, item, characters);
			return {
				...item,
				learners,
				needed: learners.some((w) => w.state === "now" || w.state === "later"),
				known: learners.some((w) => w.state === "knows"),
			};
		});
	}, [data]);
}

/**
 * Recipe items searchable like recipes: their name, and (once loaded) what
 * they make: the crafted item's name, kind and tooltip, and the reagents. So
 * "8 slot bag" finds the pattern. The crafted-item text is per profession and
 * the same for every guild; it loads only once `searching`, and until it's in,
 * names alone match.
 */
function useLearnIndex(rows: LearnRow[], searching: boolean) {
	const [wanted, setWanted] = useState(false);
	useEffect(() => {
		if (searching) setWanted(true);
	}, [searching]);
	const professionIds = useMemo(() => [...new Set(rows.map((r) => r.professionId))].sort((a, b) => a - b), [rows]);
	const texts = useQueries({
		queries: professionIds.map((professionId) => ({
			...convexQuery(api.crafting.recipeItemSearch, { professionId }),
			enabled: wanted,
		})),
		combine: (results) => results.map((r) => r.data),
	});
	return useMemo(() => {
		const made = new Map<number, [string, string, string, string]>();
		for (const list of texts) for (const [itemId, ...rest] of list ?? []) made.set(itemId, rest);
		return rows.map((r) => {
			const m = made.get(r.itemId);
			return indexEntry(r, [
				`${r.name} ${m?.[0] ?? ""}`,
				`${m?.[1] ?? ""} ${r.profession}`,
				m?.[2] ?? "",
				m?.[3] ?? "",
			]);
		});
	}, [rows, texts]);
}

/** "Could learn" hints shown under Who can make's results. */
const COULD_LEARN = 5;

/**
 * Under Who can make's results: recipes nobody knows yet that match the
 * search, and who could learn them. Turns "nobody can make it" into who to
 * send the pattern to.
 */
function CouldLearn({ rows, region, onSeeAll }: { rows: LearnRow[]; region: string; onSeeAll: () => void }) {
	if (rows.length === 0) return null;
	return (
		<section className="surface-card overflow-hidden">
			<header className="flex min-w-0 items-baseline gap-2 border-b border-border/60 px-4 py-2.5">
				<h3 className="text-[0.8125rem] font-semibold">Nobody knows these yet</h3>
				<span className="num text-xs text-muted-foreground">{rows.length}</span>
				<span className="ml-1 truncate text-xs text-muted-foreground @max-md:hidden">
					Who could learn them, if someone finds the recipe
				</span>
			</header>
			<ul className="divide-y divide-border/60">
				{rows.slice(0, COULD_LEARN).map((r) => (
					<li
						key={r.itemId}
						className="grid grid-cols-1 items-center gap-x-4 gap-y-1 px-4 py-2 text-sm @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]"
					>
						<ItemHover
							item={{ itemId: r.itemId, name: r.name, quality: r.quality, icon: r.icon }}
							className="flex min-w-0 items-center gap-2.5"
						>
							<ItemIcon icon={r.icon} quality={r.quality} size={28} className="block flex-none" />
							<span className="min-w-0">
								<span className="block truncate hover:underline" style={{ color: QUALITY_COLORS[r.quality] }}>
									{r.name}
								</span>
								<span className="block truncate text-xs text-muted-foreground">
									{r.profession}
									{r.skill ? <span className="num"> {r.skill}</span> : null}
								</span>
							</span>
						</ItemHover>
						<LearnerSummary who={r.learners} region={region} profession={r.profession} />
					</li>
				))}
			</ul>
			{rows.length > COULD_LEARN ? (
				<button
					type="button"
					onClick={onSeeAll}
					className="w-full border-t border-border/60 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					See all {rows.length} in Who can learn
				</button>
			) : null}
		</section>
	);
}

function ShowAll({ count, onClick }: { count: number; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="w-full rounded-md py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
		>
			Show all {count}
		</button>
	);
}

function ResultRow({ recipe, region, member }: { recipe: GuildRecipe; region: string; member?: Member }) {
	return (
		<li className="grid grid-cols-[minmax(0,1.3fr)_7.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-1 border-b border-border/60 py-1.5 last:border-b-0">
			<RecipeItem recipe={recipe} />
			<span className="truncate text-sm text-muted-foreground">{recipe.profession}</span>
			<div className="flex items-center gap-3">
				<CrafterNames recipe={recipe} region={region} className="flex-1" />
				<CraftRequest recipe={recipe} member={member} />
			</div>
		</li>
	);
}

/** Who knows the recipe, highest skill first, a few until "+N more". */
function CrafterNames({ recipe, region, className }: { recipe: GuildRecipe; region: string; className?: string }) {
	const [expanded, setExpanded] = useState(false);
	const shown = expanded ? recipe.crafters : recipe.crafters.slice(0, CRAFTERS);
	const hidden = recipe.crafters.length - shown.length;
	return (
		<div className={cn("flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm", className)}>
			{shown.map((c) => (
				<Link
					key={c.slug}
					to="/c/$region/$slug/professions"
					params={{ region, slug: c.slug }}
					search={{ profession: recipe.profession }}
					className="whitespace-nowrap hover:underline"
				>
					<ClassText classId={c.classId}>{c.name}</ClassText>
					{c.skill !== undefined ? <span className="num ml-1 text-xs text-muted-foreground">{c.skill}</span> : null}
				</Link>
			))}
			{hidden > 0 ? (
				<button
					type="button"
					onClick={() => setExpanded(true)}
					className="text-xs whitespace-nowrap text-muted-foreground hover:text-foreground"
				>
					+{hidden} more
				</button>
			) : null}
		</div>
	);
}

type LearnData = NonNullable<FunctionReturnType<typeof api.crafting.guildRecipeLearners>>;

/**
 * Who can learn: recipe items for the guild's professions, searched by name,
 * each with who could use it. "Only ones someone needs" (on by default)
 * hides items everyone with the profession already knows or holds.
 */
function LearnView({
	data,
	rows,
	index,
	region,
	query,
	deferred,
	setQuery,
	profession,
	setProfession,
}: {
	data: LearnData | null | undefined;
	rows: LearnRow[];
	index: Indexed<LearnRow>[];
	region: string;
	query: string;
	deferred: string;
	setQuery: (q: string) => void;
	profession?: string;
	setProfession: (p?: string) => void;
}) {
	const [neededOnly, setNeededOnly] = useState(true);
	const [limit, setLimit] = useState(PAGE);
	const words = useMemo(() => queryWords(deferred), [deferred]);
	// Same matching as Who can make: word starts, best matches first.
	const matches = useMemo(
		() => searchIndex(index, words).filter((r) => !neededOnly || r.needed),
		[index, words, neededOnly],
	);
	const counts = useMemo(() => {
		const c = new Map<string, number>();
		for (const r of matches) c.set(r.profession, (c.get(r.profession) ?? 0) + 1);
		return c;
	}, [matches]);
	const professions = useMemo(() => [...new Set(rows.map((r) => r.profession))].sort(compareProfessions), [rows]);
	const results = profession ? matches.filter((r) => r.profession === profession) : matches;
	useEffect(() => setLimit(PAGE), [deferred, profession, neededOnly]);

	return (
		<>
			<div className="flex flex-wrap items-center gap-2">
				<SearchInput
					large
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Escape") setQuery("");
					}}
					placeholder="Who can learn... (Pattern: Red Linen Robe, Mageweave)"
					aria-label="Search recipe items"
					className="h-10 text-[15px]"
					wrapperClassName="flex-1 basis-64 @max-md:order-last @max-md:basis-full"
				/>
				<ProfessionMenu
					value={profession}
					onChange={setProfession}
					total={matches.length}
					professions={professions.map((p) => [p, counts.get(p) ?? 0])}
					className="@max-md:flex-1"
				/>
				<label
					className="ml-auto flex h-10 cursor-pointer items-center gap-2 pl-2 text-[0.8125rem] text-muted-foreground select-none hover:text-foreground"
					title="Hide recipe items that everyone with the profession already knows or has"
				>
					<Switch checked={neededOnly} onCheckedChange={setNeededOnly} />
					Only ones someone needs
				</label>
			</div>
			{!data ? (
				<p className="py-10 text-center text-sm text-muted-foreground">
					{data === null ? "Members only." : "Checking the guild's professions..."}
				</p>
			) : rows.length === 0 ? (
				<p className={EMPTY}>No recipe items for the guild's professions yet.</p>
			) : results.length === 0 ? (
				<p className={EMPTY}>
					{deferred.trim() ? <>No recipe items match "{deferred.trim()}".</> : "Nobody needs any of these right now."}
				</p>
			) : (
				<div>
					<div className="overflow-x-auto">
						<div className="min-w-[40rem]">
							<div className="grid grid-cols-[minmax(0,1.1fr)_7.5rem_minmax(0,1.4fr)] gap-4 border-b border-border pb-1.5 text-xs text-muted-foreground">
								<span>Recipe item</span>
								<span>Needs</span>
								<span>In the guild</span>
							</div>
							<ul>
								{results.slice(0, limit).map((r) => (
									<li
										key={r.itemId}
										className="grid grid-cols-[minmax(0,1.1fr)_7.5rem_minmax(0,1.4fr)] items-center gap-x-4 border-b border-border/60 py-1.5 text-sm last:border-b-0"
									>
										<ItemHover
											item={{ itemId: r.itemId, name: r.name, quality: r.quality, icon: r.icon }}
											className="flex min-w-0 items-center gap-2.5"
										>
											<ItemIcon icon={r.icon} quality={r.quality} size={28} className="block flex-none" />
											<span className="truncate hover:underline" style={{ color: QUALITY_COLORS[r.quality] }}>
												{r.name}
											</span>
										</ItemHover>
										<span className="truncate text-muted-foreground">
											{r.profession}
											{r.skill ? <span className="num"> {r.skill}</span> : null}
										</span>
										<LearnerSummary who={r.learners} region={region} profession={r.profession} />
									</li>
								))}
							</ul>
						</div>
					</div>
					{results.length > limit ? (
						<ShowAll count={results.length} onClick={() => setLimit(Number.POSITIVE_INFINITY)} />
					) : null}
				</div>
			)}
		</>
	);
}
