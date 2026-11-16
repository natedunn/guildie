import { api } from "@convex/_generated/api";
import { CRAFT_GROUPS, type CraftGroup, craftGroup, type SupplyType, supplyType } from "@convex/shared/craftGroups";
import { recipeCandidates } from "@convex/shared/recipeStatus";
import type { Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { useQueries, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { type ListFilters, type ListRow, RecipeList } from "@/components/crafting-list";
import { type Filters, type GearKind, UpgradesView } from "@/components/crafting-upgrades";
import { ItemHover, ItemIcon, QUALITY_COLORS } from "@/components/item";
import { PageTabButton, PageTabs } from "@/components/page-tabs";
import { type Learner, LearnerSummary } from "@/components/recipe-learners";
import { buildIndex, indexEntry, queryWords, searchIndex } from "@/components/recipe-row";
import { RetryingErrorPage } from "@/components/status-pages";

// Three tabs, by what a recipe makes (shared/craftGroups.ts): Gear (the
// default), Enchants (?view=enchants) and Supplies (?view=supplies).
//
// Gear, for members (components/crafting-upgrades.tsx): one table of what
// the guild can craft for their characters and what theirs can craft for
// anyone, by the gear-upgrade rules (shared/upgrades.ts), filtered by who
// it's for (?for=), who crafts it (?by=) and the kind (?kind=, "all" for all
// gear). Enchants and Supplies, and Gear for visitors
// (components/crafting-list.tsx): every recipe of that kind someone knows,
// filtered by who makes it (?by=), the supply type (?type=) and profession.
// Every row says who could learn it; a search also lists recipes nobody
// knows yet and who could learn them. Searches and filters live in the URL
// so a result can be shared in chat. A link with a search or profession but
// no tab (omni search, Requests) opens the first tab with results.

type View = CraftGroup;
/**
 * `for` (who it's for, Gear) and `by` (who makes it): "mine" (the viewer's
 * characters), "guild" (guildmates) or a character's slug; anyone when missing.
 */
type Search = {
	q?: string;
	profession?: string;
	view?: View;
	for?: string;
	by?: string;
	kind?: GearKind;
	type?: SupplyType;
};

export const Route = createFileRoute("/g/$region/$slug/crafting")({
	validateSearch: (search: Record<string, unknown>): Search => {
		const out: Search = {};
		// The router parses "?q=8" as a number; take it back as text.
		if (typeof search.q === "string" || typeof search.q === "number") out.q = String(search.q);
		if (typeof search.profession === "string") out.profession = search.profession;
		if (CRAFT_GROUPS.includes(search.view as View)) out.view = search.view as View;
		if (typeof search.for === "string") out.for = search.for;
		if (typeof search.by === "string") out.by = search.by;
		if (["upgrade", "maybe", "empty", "all"].includes(search.kind as string)) out.kind = search.kind as GearKind;
		if (typeof search.type === "string") out.type = search.type as SupplyType;
		return out;
	},
	loader: async ({ context, params }) => {
		const args = { region: params.region as Region, slug: params.slug };
		const qc = context.queryClient;
		// Upgrades is the slow part: start it now, not awaited, so it's on its
		// way while the page renders. Membership (cheap) is awaited: the tabs
		// show with the page.
		void qc.prefetchQuery(convexQuery(api.crafting.upgrades, args));
		// Recipe items, for a search's "Nobody knows these yet". Not awaited either.
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

/** Nothing to list (members only, no recipes): a quiet card. */
const EMPTY = "surface-card px-4 py-10 text-center text-[0.8125rem] text-muted-foreground";

const TABS: { view: View; label: string }[] = [
	{ view: "gear", label: "Gear" },
	{ view: "enchants", label: "Enchants" },
	{ view: "supplies", label: "Supplies" },
];

function CraftingPage() {
	const params = Route.useParams();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const args = { region: params.region as Region, slug: params.slug };
	const { data } = useSuspenseQuery(convexQuery(api.crafting.guildCrafting, args));

	const [query, setQuery] = useState(search.q ?? "");
	const deferred = useDeferredValue(query);

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
	const { data: me } = useSuspenseQuery(convexQuery(api.requests.me, args));
	const member = me ? { guild: args, characters: me.characters } : undefined;

	// Every recipe, sorted into its tab, with the viewer's characters marked.
	const groups = useMemo(() => {
		const mine = new Set(me?.characters.map((c) => c.slug));
		const out: Record<View, ListRow[]> = { gear: [], enchants: [], supplies: [] };
		for (const r of data ?? []) {
			const group = craftGroup(r);
			if (!group) continue;
			out[group].push({
				...r,
				crafters: r.crafters.map((c) => ({ ...c, mine: mine.has(c.slug) })),
				learners: r.learners.map((c) => ({ ...c, mine: mine.has(c.slug) })),
				type: group === "supplies" ? supplyType(r) : undefined,
			});
		}
		return out;
	}, [data, me]);

	// No tab given: Gear, unless a search or profession (a link from omni
	// search or Requests) finds nothing there; then the first tab that has some.
	const words = useMemo(() => queryWords(deferred), [deferred]);
	const view: View = useMemo(() => {
		if (search.view) return search.view;
		if (!search.q && !search.profession) return "gear";
		const hits = (rows: ListRow[]) =>
			searchIndex(buildIndex(rows), queryWords(search.q ?? "")).some(
				(r) => !search.profession || r.profession === search.profession,
			);
		return CRAFT_GROUPS.find((g) => hits(groups[g])) ?? "gear";
	}, [search.view, search.q, search.profession, groups]);
	// Arriving with a search or profession: Gear lists all gear, not only upgrades.
	const kind: GearKind | undefined =
		search.kind ?? (!search.view && (search.q || search.profession) ? "all" : undefined);

	// A search's recipes nobody knows yet (recipe items), with who could learn them.
	const { data: learnData } = useQuery(convexQuery(api.crafting.guildRecipeLearners, args));
	const learnRows = useLearnRows(learnData);
	const learnIndex = useLearnIndex(learnRows, query.trim() !== "");
	const nobodyKnows = useMemo(() => {
		if (words.length === 0) return [];
		return searchIndex(learnIndex, words).filter(
			(r) => !r.known && r.needed && (!search.profession || r.profession === search.profession),
		);
	}, [learnIndex, words, search.profession]);

	if (!data) {
		return <p className={EMPTY}>This guild's crafting is for members only.</p>;
	}
	if (data.length === 0) {
		return (
			<p className={EMPTY}>No known recipes yet. They appear once members' professions have synced from Blizzard.</p>
		);
	}

	const setView = (v: View) =>
		navigate({
			// Gear is the default: no ?view= for it. Filters belong to the tab they were set on.
			search: (prev) => ({
				q: prev.q,
				view: v === "gear" ? undefined : v,
			}),
			replace: true,
			resetScroll: false,
		});
	// The filters given change, the others stay; none given clears them all.
	const setFilters = (next: Filters & ListFilters) =>
		navigate({
			search: (prev) => {
				const clear = Object.keys(next).length === 0;
				const pick = <K extends keyof (Filters & ListFilters)>(k: K) =>
					clear ? undefined : k in next ? next[k] : prev[k as keyof Search];
				return {
					...prev,
					// Pin the tab a link opened, so changing a filter doesn't move it.
					view: view === "gear" ? undefined : view,
					for: pick("for"),
					by: pick("by"),
					kind: (clear ? undefined : "kind" in next ? next.kind : kind) as GearKind | undefined,
					type: pick("type") as SupplyType | undefined,
					profession: pick("profession"),
				};
			},
			replace: true,
			resetScroll: false,
		});

	const after = <NobodyKnows rows={nobodyKnows} region={params.region} />;
	const list = {
		region: params.region,
		member,
		query,
		deferred,
		setQuery,
		inputRef,
		by: search.by,
		profession: search.profession,
		setFilters,
		after,
	};

	return (
		// A container, so the row layout follows the content pane's width rather than the viewport.
		<div className="@container w-full space-y-3 pb-6">
			<PageTabs>
				{TABS.map((t) => (
					<PageTabButton
						key={t.view}
						active={view === t.view}
						onClick={() => setView(t.view)}
						// Members' Gear lists upgrades, not every recipe: no count there.
						count={t.view === "gear" && me ? undefined : groups[t.view].length}
					>
						{t.label}
					</PageTabButton>
				))}
			</PageTabs>
			{view === "gear" && me ? (
				<UpgradesView
					region={params.region}
					guildSlug={params.slug}
					member={member}
					gear={groups.gear}
					query={query}
					deferred={deferred}
					setQuery={setQuery}
					inputRef={inputRef}
					forWho={search.for}
					byWho={search.by}
					kind={kind}
					profession={search.profession}
					setFilters={setFilters}
				/>
			) : null}
			{view === "gear" && me ? (
				after
			) : view === "gear" ? (
				<RecipeList {...list} rows={groups.gear} placeholder="Search gear... (boots, Agility, a name)" />
			) : view === "enchants" ? (
				<RecipeList
					{...list}
					rows={groups.enchants}
					placeholder="Search enchants... (bracer, Stamina, armor kit)"
					note="Enchants are done in a trade while you're both online. Armor kits, shield spikes and scopes are items: you apply them yourself."
				/>
			) : (
				<RecipeList
					{...list}
					rows={groups.supplies}
					type={search.type}
					typeMenu
					placeholder="Search supplies... (potion, bag, a name)"
				/>
			)}
		</div>
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

/** Recipes nobody knows shown under a search's results, until "Show all". */
const COULD_LEARN = 5;

/**
 * Under a search's results: recipes nobody in the guild knows yet that
 * match, and who could learn them. Turns "nobody can make it" into who to
 * send the pattern to.
 */
function NobodyKnows({ rows, region }: { rows: LearnRow[]; region: string }) {
	const [all, setAll] = useState(false);
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
				{rows.slice(0, all ? undefined : COULD_LEARN).map((r) => (
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
			{rows.length > COULD_LEARN && !all ? (
				<button
					type="button"
					onClick={() => setAll(true)}
					className="w-full border-t border-border/60 px-4 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					Show all <span className="num">{rows.length}</span>
				</button>
			) : null}
		</section>
	);
}

type LearnData = NonNullable<FunctionReturnType<typeof api.crafting.guildRecipeLearners>>;
