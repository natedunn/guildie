import { Dialog } from "@base-ui/react/dialog";
import { api } from "@convex/_generated/api";
import { recipeCandidates } from "@convex/shared/recipeStatus";
import { kindRank, type VerdictKind } from "@convex/shared/upgrades";
import { CLASSES, type Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { useQueries, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { type ReactNode, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ClassText } from "@/components/class-name";
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
import { RequestButton } from "@/components/requests";
import { RetryingErrorPage } from "@/components/status-pages";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { UpgradeWhy } from "@/components/upgrade-why";
import { MARKER_LABELS, type MarkerKind, VerdictGlyph, VerdictMarker } from "@/components/verdict-marker";
import { cn } from "@/lib/utils";
import { VERDICT_HINTS, verdictLabel } from "@/lib/verdict";

// Three tabs, each a question: "Who can make" (the default), "Who can learn"
// (?view=learn) and "Upgrades" (?view=upgrades or ?view=craft, a toggle inside).
//
// "Who can make...": every recipe someone in the guild knows, searched on the
// client (recipe, item, item kind, tooltip text, reagents). The search and the
// profession filter live in the URL so a result can be shared in chat.
// Members also get Upgrades, two views by the gear-upgrade rules
// (shared/upgrades.ts) with each character's stat priority, for all of the
// viewer's characters or one (?char=):
// - "Crafts for me" (?view=upgrades): what the guild can craft (their own
//   recipes included) that would be an upgrade for the viewer's characters,
//   a card per character, each row marked upgrade / possible / empty slot;
// - "Crafts for others" (?view=craft): the viewer's recipes that would be
//   an upgrade for someone in the guild (their own other characters included).
// And "Who can learn" (?view=learn): every recipe item (pattern, plans,
// formula...) for the guild's professions, with who could learn it now or
// later, who already has one and who knows it: is it worth sending someone?

type View = "upgrades" | "craft" | "learn";
/** `char`: which of the viewer's characters the upgrade views are about (slug; default all of them). */
type Search = { q?: string; profession?: string; view?: View; char?: string };

export const Route = createFileRoute("/g/$region/$slug/crafting")({
	validateSearch: (search: Record<string, unknown>): Search => {
		const out: Search = {};
		// The router parses "?q=8" as a number; take it back as text.
		if (typeof search.q === "string" || typeof search.q === "number") out.q = String(search.q);
		if (typeof search.profession === "string") out.profession = search.profession;
		if (search.view === "upgrades" || search.view === "craft" || search.view === "learn") out.view = search.view;
		if (typeof search.char === "string") out.char = search.char;
		return out;
	},
	loader: async ({ context, params }) => {
		const args = { region: params.region as Region, slug: params.slug };
		const qc = context.queryClient;
		// The upgrade views are the slow part: start them now, not awaited, so
		// they're on their way while the page renders. Membership (cheap) is
		// awaited: the tabs show with the page.
		void qc.prefetchQuery(convexQuery(api.crafting.upgradesForMe, args));
		void qc.prefetchQuery(convexQuery(api.crafting.upgradesICanCraft, args));
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
	const view = search.view;

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

	// Null for non-members: no switch for them.
	const { data: upgrades } = useQuery(
		convexQuery(api.crafting.upgradesForMe, { region: params.region as Region, slug: params.slug }),
	);
	const { data: canCraft } = useQuery(
		convexQuery(api.crafting.upgradesICanCraft, { region: params.region as Region, slug: params.slug }),
	);
	const showUpgrades = view === "upgrades" && !!me;
	const showCraft = view === "craft" && !!me;
	const showLearn = view === "learn" && !!me;
	const { data: learnData } = useQuery({
		...convexQuery(api.crafting.guildRecipeLearners, { region: params.region as Region, slug: params.slug }),
		enabled: !!me,
	});
	const learnRows = useLearnRows(learnData);
	const learnIndex = useLearnIndex(learnRows, query.trim() !== "" && (showLearn || !view));
	const neededCount = useMemo(() => learnRows.filter((r) => r.needed).length, [learnRows]);
	const [showRemoved, setShowRemoved] = useState(false);
	// The upgrade views cover all of the viewer's characters, or one (?char=).
	const characters = upgrades?.characters ?? [];
	const char = characters.find((c) => c.slug === search.char);
	// Crafts for me: a row per item and character it helps.
	const forMe = useMemo(
		() =>
			(upgrades?.hits ?? []).flatMap((h) =>
				h.for.filter((x) => !char || x.slug === char.slug).map((f) => ({ ...h, for: [f] })),
			),
		[upgrades, char],
	);
	// Items the player removed from a character's suggestions: hidden unless "Show removed".
	const kept = useMemo(() => forMe.filter((h) => !h.for[0].removed), [forMe]);
	const removedCount = forMe.length - kept.length;
	// Crafts for others: what any of the viewer's characters can make, or one crafter's.
	const asChar = useMemo(
		() => (canCraft?.hits ?? []).filter((h) => !char || h.crafters.some((c) => c.slug === char.slug)),
		[canCraft, char],
	);
	const source: Row[] = showUpgrades ? (showRemoved ? forMe : kept) : showCraft ? asChar : (data ?? []);

	const index = useMemo(() => buildIndex(source), [source]);
	const words = useMemo(() => queryWords(deferred), [deferred]);
	const matches = useMemo(() => searchIndex(index, words), [index, words]);
	// Who can make, searching: recipe items nobody knows yet that match, and who could learn them.
	const couldLearn = useMemo(() => {
		if (view || words.length === 0) return [];
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

	// Remove (or put back) an item for the character in view: gone from the
	// list at once (optimistic), then from the item panel and, after the
	// app's next refresh, the addon's tooltips.
	const dismiss = useMutation(api.statPriority.dismissItem).withOptimisticUpdate((store, args) => {
		const key = { region: args.region, slug: params.slug };
		const current = store.getQuery(api.crafting.upgradesForMe, key);
		if (!current) return;
		store.setQuery(api.crafting.upgradesForMe, key, {
			...current,
			hits: current.hits.map((h) =>
				h.item?.itemId === args.itemId
					? { ...h, for: h.for.map((f) => (f.slug === args.slug ? { ...f, removed: args.removed } : f)) }
					: h,
			),
		});
	});
	const setRemoved = (row: Row, removed: boolean) => {
		const h = row.for?.[0];
		const itemId = row.item?.itemId;
		if (h && itemId !== undefined) void dismiss({ region: params.region as Region, slug: h.slug, itemId, removed });
	};
	// Remove asks first (unless the player said not to); Restore doesn't.
	const [confirming, setConfirming] = useState<Row | null>(null);
	const onRemove = (row: Row) => {
		const h = row.for?.[0];
		if (!h) return;
		if (h.removed) setRemoved(row, false);
		else if (skipRemoveConfirm()) setRemoved(row, true);
		else setConfirming(row);
	};

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
	const setChar = (slug: string) =>
		navigate({ search: (prev) => ({ ...prev, char: slug || undefined }), replace: true, resetScroll: false });
	const setView = (v?: View) =>
		navigate({ search: (prev) => ({ ...prev, view: v, profession: undefined }), replace: true, resetScroll: false });
	const loading = (showUpgrades && !upgrades) || (showCraft && !canCraft);

	return (
		// A container, so the row layout follows the content pane's width rather than the viewport.
		<div className="@container w-full space-y-4 pb-6">
			<div className="space-y-3">
				{me ? (
					<PageTabs>
						<PageTabButton
							active={!showUpgrades && !showCraft && !showLearn}
							onClick={() => setView(undefined)}
							count={data.length}
						>
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
						<PageTabButton active={showUpgrades || showCraft} onClick={() => setView(showCraft ? "craft" : "upgrades")}>
							Upgrades
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
				{/* One row: whose upgrades (upgrade views), the search, the profession, and
				    (Upgrades for me) Show removed on the right. Wraps on phones. Who can
				    learn has its own. */}
				<div className={cn("flex flex-wrap items-center gap-2", showLearn && "hidden")}>
					{showUpgrades || showCraft ? (
						<>
							{/* Which way: what guildmates can craft for your characters, or what yours can craft for them. */}
							<div
								role="group"
								aria-label="Which upgrades"
								className="flex h-10 gap-0.5 rounded-[7px] border border-input bg-well p-[3px] @max-md:order-first @max-md:basis-full"
							>
								<button
									type="button"
									className={SEGMENT}
									data-active={showUpgrades}
									aria-pressed={showUpgrades}
									title="What guildmates can craft that's an upgrade for your characters"
									onClick={() => setView("upgrades")}
								>
									Crafts for me
									{upgrades ? <span className="num text-xs text-muted-foreground">{kept.length}</span> : null}
								</button>
								<button
									type="button"
									className={SEGMENT}
									data-active={showCraft}
									aria-pressed={showCraft}
									title="What your characters can craft that's an upgrade for someone in the guild"
									onClick={() => setView("craft")}
								>
									Crafts for others
									{canCraft ? <span className="num text-xs text-muted-foreground">{asChar.length}</span> : null}
								</button>
							</div>
							{characters.length > 1 ? (
								<>
									<span aria-hidden className="mx-1 h-6 w-px bg-(--border-strong) @max-md:hidden" />
									<CharacterPicker
										label={showCraft ? "As" : "For"}
										allLabel={showCraft ? "All my crafters" : "All my characters"}
										characters={characters}
										value={char?.slug ?? ""}
										onChange={setChar}
									/>
								</>
							) : null}
						</>
					) : null}
					<Input
						ref={inputRef}
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Escape") setQuery("");
						}}
						placeholder={
							showUpgrades
								? "Search upgrades... (boots, Agility)"
								: showCraft
									? "Search what you can make... (gloves, Brisket)"
									: "Who can make... (bag, Mageweave, 8 slot bag)"
						}
						aria-label="Search recipes the guild can craft"
						// Phones: a row of its own, under the picker and the profession.
						className={cn(
							"h-10 min-w-0 flex-1 basis-64 text-[15px] @max-md:order-last @max-md:basis-full",
							(showUpgrades || showCraft) && "@3xl:max-w-80",
						)}
					/>
					<select
						aria-label="Profession"
						value={profession ?? ""}
						onChange={(e) => setProfession(e.target.value || undefined)}
						className="h-10 min-w-0 rounded-md border bg-well pl-3 text-sm @max-md:flex-1"
					>
						<option value="">All professions ({matches.length})</option>
						{professions.map((p) => (
							<option key={p} value={p}>
								{p} ({counts.get(p) ?? 0})
							</option>
						))}
					</select>
				</div>
			</div>

			{/* Crafts for me: the markers' key, and Show removed on the right (there even when everything is removed). */}
			{showUpgrades && forMe.length > 0 ? (
				<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
					<MarkerLegend />
					<label className="ml-auto flex cursor-pointer items-center gap-2 text-[0.8125rem] text-muted-foreground select-none hover:text-foreground">
						<Switch checked={showRemoved} onCheckedChange={setShowRemoved} />
						Show removed
						{removedCount ? <span className="num text-xs">{removedCount}</span> : null}
					</label>
				</div>
			) : null}
			{showLearn ? null : loading ? (
				<p className="py-10 text-center text-sm text-muted-foreground">
					{showCraft
						? "Checking your recipes against the guild's gear..."
						: "Checking what the guild can make for you..."}
				</p>
			) : showCraft && asChar.length === 0 ? (
				<p className={EMPTY}>
					{char
						? `None of ${char.name}'s recipes beats what anyone in the guild wears right now.`
						: "None of your characters' recipes beats what anyone in the guild wears right now."}
				</p>
			) : showCraft ? (
				results.length === 0 ? (
					<p className={EMPTY}>Nothing matches "{deferred.trim()}".</p>
				) : (
					<div className="space-y-3">
						{groupRows(results.slice(0, limit)).map(({ group, rows }) => (
							<GroupCard key={group.kind} title={group.title} hint={group.others} count={rows.length}>
								{rows.map((r) => (
									<CraftRow
										key={r.recipeId}
										recipe={r}
										region={params.region}
										guildSlug={params.slug}
										kind={group.kind}
									/>
								))}
							</GroupCard>
						))}
						{results.length > limit ? (
							<ShowAll count={results.length} onClick={() => setLimit(Number.POSITIVE_INFINITY)} />
						) : null}
						<Footnote region={params.region} characters={me?.characters} />
					</div>
				)
			) : showUpgrades && upgrades && source.length === 0 ? (
				<p className={EMPTY}>
					{char && upgrades.noGear.some((c) => c.slug === char.slug)
						? `Nothing to compare with until we've read ${char.name}'s gear.`
						: char
							? `Nothing the guild can craft beats what ${char.name} wears right now.`
							: "Nothing the guild can craft beats what your characters wear right now."}
					{!char && upgrades.noGear.length ? (
						<span className="mt-1 block text-xs">
							We haven't read {upgrades.noGear.map((c) => c.name).join(", ")}'s gear yet.
						</span>
					) : null}
					{removedCount ? (
						<span className="mt-1 block text-xs">
							{removedCount} removed; "Show removed" puts {removedCount === 1 ? "it" : "them"} back in view.
						</span>
					) : null}
					{upgrades.strict.some((c) => !char || c.slug === char.slug) ? (
						<span className="mt-1 block text-xs">
							"Only these" in {char ? `${char.name}'s` : "a character's"} Preferences leaves other armor or weapon types
							out.
						</span>
					) : null}
				</p>
			) : showUpgrades ? (
				results.length === 0 ? (
					<p className={EMPTY}>No upgrades match "{deferred.trim()}".</p>
				) : (
					<div className="space-y-3">
						{byCharacter(results, characters).map(({ character, rows }) => (
							<CharacterUpgrades
								key={character.slug}
								character={character}
								rows={rows}
								region={params.region}
								member={member}
								// All characters and no search: each card shows its best few until asked.
								collapse={!char && !deferred.trim()}
								onRemove={onRemove}
							/>
						))}
						<Footnote region={params.region} characters={me?.characters} />
					</div>
				)
			) : results.length === 0 ? (
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
			<RemoveDialog
				row={confirming}
				onCancel={() => setConfirming(null)}
				onConfirm={(dontAsk) => {
					if (dontAsk) setSkipRemoveConfirm();
					if (confirming) setRemoved(confirming, true);
					setConfirming(null);
				}}
			/>
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

type Member = {
	guild: { region: Region; slug: string };
	characters: { slug: string; name: string; classId: number }[];
};

type UpgradeHit = NonNullable<FunctionReturnType<typeof api.crafting.upgradesForMe>>["hits"][number];
type CraftHit = NonNullable<FunctionReturnType<typeof api.crafting.upgradesICanCraft>>["hits"][number];
type Help = UpgradeHit["for"][number] & { mine?: boolean };
/** A row of any view: a recipe, plus who it helps (upgrade views) and who asked for it (Upgrades I can craft). */
type Row = GuildRecipe & { for?: Help[] } & Partial<Pick<CraftHit, "requested">>;

/** Guildmates listed per row of "Upgrades I can craft" before "+N more". */
const RECIPIENTS = 3;

/** Where the upgrade views' picks come from, and where to change your stat priority. */
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

type GroupKind = VerdictKind | "removed";

/**
 * The upgrade views in cards, by each row's best verdict (`hint`: about the
 * viewer, Upgrades for me; `others`: about whoever it's for, Upgrades I can
 * craft), and the items the player removed (Show removed).
 */
const GROUPS: { kind: GroupKind; title: string; hint: string; others: string }[] = [
	{
		kind: "upgrade",
		title: "Upgrades",
		hint: "More of your stats, nothing lost",
		others: VERDICT_HINTS.upgrade,
	},
	{
		kind: "maybe",
		title: "Possible upgrades",
		hint: "Small gains, some of a stat you rank given up, your second spec, a few levels from now, or an armor type you don't want",
		others: VERDICT_HINTS.maybe,
	},
	{
		kind: "empty",
		title: "Empty slots",
		hint: "Plain armor with no stats, for a slot you have nothing in",
		others: VERDICT_HINTS.empty,
	},
	{
		kind: "removed",
		title: "Removed",
		hint: "Never suggested for this character, here or in the game's tooltips",
		others: "",
	},
];

function groupRows(rows: Row[]) {
	const kindOf = (r: Row): GroupKind | undefined => (r.for?.[0]?.removed ? "removed" : r.for?.[0]?.kind);
	return GROUPS.map((group) => ({ group, rows: rows.filter((r) => kindOf(r) === group.kind) })).filter(
		(g) => g.rows.length > 0,
	);
}

/** One group of Crafts for others: a card with its title, how many, what it means, column heads and the rows. */
function GroupCard({
	title,
	hint,
	count,
	children,
}: {
	title: string;
	hint: string;
	count: number;
	children: ReactNode;
}) {
	return (
		<section className="surface-card overflow-hidden">
			<header className="flex min-w-0 items-baseline gap-2 border-b border-border/60 px-4 py-2.5">
				<h3 className="text-[0.8125rem] font-semibold">{title}</h3>
				<span className="num text-xs text-muted-foreground">{count}</span>
				<span className="ml-1 truncate text-xs text-muted-foreground @max-md:hidden">{hint}</span>
			</header>
			<div className={cn(HEADS, "grid", CRAFT_COLS)}>
				<span>Item</span>
				<span>Who it's for</span>
				<span>You craft it as</span>
			</div>
			<ul className="divide-y divide-border/60">{children}</ul>
		</section>
	);
}

/** A row in a group card: stacked on a narrow pane (phones), columns on a wide one. */
const ROW = "grid grid-cols-1 gap-x-5 gap-y-2 px-4 py-3";
/** Crafts for me: item, why, crafters, Request and Remove (after the verdict marker). */
const FOR_ME_COLS = "items-start @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,0.8fr)_auto]";
/** Column heads over a card's rows: wide panes only (rows stack on phones). */
const HEADS = "gap-x-5 border-b border-border/60 px-4 pt-2 pb-1.5 text-xs text-muted-foreground @max-2xl:hidden";
/** One half of the Crafts for me / Crafts for others switch. */
const SEGMENT =
	"inline-flex items-center gap-1.5 rounded-[5px] px-3 text-[13px] whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground data-[active=true]:bg-(--selected) data-[active=true]:text-foreground data-[active=true]:shadow-[inset_0_0_0_1px_rgb(255_176_96/0.28)] @max-md:flex-1 @max-md:justify-center";
/** Upgrades I can craft: item, who it's for and why, your crafter and who asked. */
const CRAFT_COLS = "items-start @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,0.9fr)]";

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

/** The item and, under its name, the profession that makes it, beside an icon as tall as both lines. */
function ItemCell({ recipe }: { recipe: GuildRecipe }) {
	return <RecipeItem recipe={recipe} size={36} detail={recipe.profession} />;
}

type Character = { slug: string; name: string; classId: number; level?: number };

/**
 * Crafts for me, grouped by character in the viewer's order: removed items
 * last, then upgrades, possible upgrades and empty slots, biggest gain first.
 */
function byCharacter(rows: Row[], characters: Character[]) {
	const rank = (r: Row) => (r.for?.[0]?.removed ? 9 : kindRank(r.for?.[0]?.kind ?? "maybe"));
	return characters
		.map((character) => ({
			character,
			rows: rows
				.filter((r) => r.for?.[0]?.slug === character.slug)
				.sort(
					(a, b) =>
						rank(a) - rank(b) || (b.for?.[0]?.gain ?? 0) - (a.for?.[0]?.gain ?? 0) || a.name.localeCompare(b.name),
				),
		}))
		.filter((g) => g.rows.length > 0);
}

/** Rows a character's card shows (all characters, no search) before "Show N more". */
const COLLAPSED = 5;

/** One of the viewer's characters: who, level, how many, column heads, and their rows. */
function CharacterUpgrades({
	character,
	rows,
	region,
	member,
	collapse,
	onRemove,
}: {
	character: Character;
	rows: Row[];
	region: string;
	member?: Member;
	collapse: boolean;
	onRemove: (row: Row) => void;
}) {
	const [open, setOpen] = useState(false);
	const shown = collapse && !open ? rows.slice(0, COLLAPSED) : rows;
	const count = rows.filter((r) => !r.for?.[0]?.removed).length;
	return (
		<section className="surface-card overflow-hidden">
			<header className="flex min-w-0 items-baseline gap-2 border-b border-border/60 px-4 py-2.5">
				<Link
					to="/c/$region/$slug"
					params={{ region, slug: character.slug }}
					className="text-sm font-semibold hover:underline"
				>
					<ClassText classId={character.classId}>{character.name}</ClassText>
				</Link>
				{character.level ? (
					<span className="text-xs text-muted-foreground">
						level <span className="num">{character.level}</span>
					</span>
				) : null}
				<span className="ml-1 text-xs text-muted-foreground">
					<span className="num">{count}</span> {count === 1 ? "upgrade" : "upgrades"}
				</span>
			</header>
			<div className={cn(HEADS, "flex gap-3")}>
				<span className="w-6 flex-none" />
				<div className={cn("grid min-w-0 flex-1 gap-x-5", FOR_ME_COLS)}>
					<span>Item</span>
					<span>Why it's better</span>
					<span>Crafted by</span>
					<span />
				</div>
			</div>
			<ul className="divide-y divide-border/60">
				{shown.map((r) => (
					<UpgradeRow key={r.recipeId} recipe={r} region={region} member={member} onRemove={onRemove} />
				))}
			</ul>
			{rows.length > shown.length ? (
				<button
					type="button"
					onClick={() => setOpen(true)}
					className="w-full border-t border-border/60 px-4 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					Show <span className="num">{rows.length - shown.length}</span> more
				</button>
			) : null}
		</section>
	);
}

/** What each marker means, in Crafts for me's words (the hover says the same). */
const MARKER_HINTS: Record<MarkerKind, string> = {
	upgrade: "More of your stats, nothing lost",
	maybe:
		"A small gain, some of a stat you rank given up, your second spec, a few levels from now, or an armor type you don't want",
	empty: "Plain armor with no stats, for a slot you have nothing in",
	removed: "Never suggested for this character again, here or in the game's tooltips. Restore puts it back.",
};

/** The markers' key, above the cards. */
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

/**
 * Crafts for me: how good it is (the marker), the item, why it's better for
 * this character, who can make it, Request, and Remove (or Restore, under
 * Show removed).
 */
function UpgradeRow({
	recipe,
	region,
	member,
	onRemove,
}: {
	recipe: Row;
	region: string;
	member?: Member;
	onRemove: (row: Row) => void;
}) {
	const h = recipe.for?.[0];
	const kind: MarkerKind = h?.removed ? "removed" : (h?.kind ?? "maybe");
	return (
		<li className="flex gap-3 px-4 py-3">
			{/* Level with the item icon's top, a touch lower so it sits even with it. */}
			<VerdictMarker kind={kind} hint={MARKER_HINTS[kind]} className="mt-0.5 flex-none" />
			<div className={cn("grid min-w-0 flex-1 grid-cols-1 gap-x-5 gap-y-2", FOR_ME_COLS)}>
				<ItemCell recipe={recipe} />
				<div className="min-w-0 text-[13px]">
					<p>
						<UpgradeWhy text={h?.why} />
					</p>
					<p className="truncate text-xs text-muted-foreground">
						{h?.spec}
						{h?.at ? ` · from level ${h.at}` : null}
					</p>
				</div>
				<CrafterNames recipe={recipe} region={region} />
				<div className="flex items-center gap-1.5 @2xl:justify-end">
					<CraftRequest recipe={recipe} member={member} />
					{h && recipe.item ? (
						<Button
							variant="ghost"
							size="sm"
							className="text-muted-foreground"
							title={
								h.removed
									? "Suggest this for this character again"
									: "Never suggest this for this character again, here or in the game's tooltips"
							}
							onClick={() => onRemove(recipe)}
						>
							{h.removed ? "Restore" : "Remove"}
						</Button>
					) : null}
				</div>
			</div>
		</li>
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

/** Remove asks first: what goes, for whom, and how to get it back (Show removed). */
function RemoveDialog({
	row,
	onCancel,
	onConfirm,
}: {
	row: Row | null;
	onCancel: () => void;
	onConfirm: (dontAsk: boolean) => void;
}) {
	const [dontAsk, setDontAsk] = useState(false);
	// Keep the last row while the dialog fades out.
	const last = useRef(row);
	if (row) last.current = row;
	const r = row ?? last.current;
	const h = r?.for?.[0];
	const item = r?.item;
	return (
		<Dialog.Root
			open={!!row}
			onOpenChange={(next) => {
				if (!next) onCancel();
			}}
		>
			<Dialog.Portal>
				<Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
				<Dialog.Popup className="surface-card fixed top-1/2 left-1/2 z-50 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 bg-background p-5 text-[0.8125rem] shadow-[var(--popover-shadow)] transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0">
					<Dialog.Title className="text-[15px] font-semibold">Remove from {h?.name}'s upgrades?</Dialog.Title>
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
						<Button onClick={() => onConfirm(dontAsk)}>Remove</Button>
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

/**
 * Upgrades I can craft: the item, who in the guild it helps and why (their
 * verdict when it isn't the card's), the viewer's characters who know it,
 * and the guild's open requests for it.
 */
function CraftRow({
	recipe,
	region,
	guildSlug,
	kind,
}: {
	recipe: Row;
	region: string;
	guildSlug: string;
	/** The card it's in. */
	kind: GroupKind;
}) {
	const [expanded, setExpanded] = useState(false);
	const all = recipe.for ?? [];
	const shown = expanded ? all : all.slice(0, RECIPIENTS);
	const hidden = all.length - shown.length;
	return (
		<li className={cn(ROW, CRAFT_COLS)}>
			<ItemCell recipe={recipe} />
			<div className="min-w-0 space-y-1.5 text-[13px]">
				{shown.map((h) => (
					<div key={h.slug} className="min-w-0">
						<div className="flex min-w-0 items-baseline gap-2">
							<Link to="/c/$region/$slug" params={{ region, slug: h.slug }} className="font-medium hover:underline">
								<ClassText classId={h.classId}>{h.name}</ClassText>
							</Link>
							{h.mine ? <span className="text-xs text-muted-foreground">you</span> : null}
							<span className="truncate text-xs text-muted-foreground">
								{h.spec}
								{h.kind !== kind ? (
									<span title={VERDICT_HINTS[h.kind]}> · {verdictLabel(h.kind, h.at)}</span>
								) : h.at ? (
									` · from level ${h.at}`
								) : null}
							</span>
						</div>
						<p className="text-xs text-muted-foreground">
							<UpgradeWhy text={h.why} />
						</p>
					</div>
				))}
				{hidden > 0 ? (
					<button
						type="button"
						onClick={() => setExpanded(true)}
						className="text-xs text-muted-foreground hover:text-foreground"
					>
						+{hidden} more
					</button>
				) : null}
			</div>
			<div className="min-w-0 space-y-0.5 text-sm">
				<CrafterNames recipe={recipe} region={region} />
				{recipe.requested?.length ? (
					<Link
						to="/g/$region/$slug/requests"
						params={{ region, slug: guildSlug }}
						className="block text-xs text-muted-foreground hover:text-foreground"
					>
						Requested by{" "}
						{recipe.requested.map((r, i) => (
							<span key={`${r.name}-${i}`}>
								{i > 0 ? ", " : null}
								<ClassText classId={r.classId}>{r.name}</ClassText>
							</span>
						))}
					</Link>
				) : null}
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

/** Request for members (when someone else knows it), or why not: the item binds to its crafter. */
function CraftRequest({ recipe, member }: { recipe: GuildRecipe; member?: Member }) {
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

/**
 * Which of the viewer's characters the upgrade views are about: a dropdown
 * that looks like the page's selects ("For Todd"), names in class colors
 * (a native select can't color its options).
 */
function CharacterPicker({
	label,
	hideLabel,
	allLabel,
	characters,
	value,
	onChange,
}: {
	label: string;
	/** Only the name shows; the label is for screen readers. */
	hideLabel?: boolean;
	/** A first choice for all of them ("All my characters"), value "". */
	allLabel?: string;
	characters: { slug: string; name: string; classId: number }[];
	value: string;
	onChange: (slug: string) => void;
}) {
	const current = characters.find((c) => c.slug === value);
	// Inline color: the menu's highlight restyles descendants' text color through classes.
	const named = (c: { name: string; classId: number }) => (
		<span style={{ color: CLASSES[c.classId]?.color }}>{c.name}</span>
	);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label={`${label}: ${current?.name ?? allLabel ?? ""}`}
				className="h-10 min-w-0 whitespace-nowrap rounded-md border border-input bg-well bg-(image:--select-chevron) bg-size-[0.75rem] bg-position-[right_0.5rem_center] bg-no-repeat pr-7 pl-3 text-left text-sm @max-md:flex-1"
			>
				{/* Phones: the name alone, so it and the profession fit side by side. */}
				{hideLabel ? null : <span className="text-muted-foreground @max-md:hidden">{label} </span>}
				{current ? named(current) : allLabel}
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-auto min-w-(--anchor-width)">
				<DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(String(v))}>
					{allLabel ? <DropdownMenuRadioItem value="">{allLabel}</DropdownMenuRadioItem> : null}
					{characters.map((c) => (
						<DropdownMenuRadioItem key={c.slug} value={c.slug}>
							{named(c)}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
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
				<Input
					type="search"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Escape") setQuery("");
					}}
					placeholder="Who can learn... (Pattern: Red Linen Robe, Mageweave)"
					aria-label="Search recipe items"
					className="h-10 min-w-0 flex-1 basis-64 text-[15px] @max-md:order-last @max-md:basis-full"
				/>
				<select
					aria-label="Profession"
					value={profession ?? ""}
					onChange={(e) => setProfession(e.target.value || undefined)}
					className="h-10 min-w-0 rounded-md border bg-well pl-3 text-sm @max-md:flex-1"
				>
					<option value="">All professions ({matches.length})</option>
					{professions.map((p) => (
						<option key={p} value={p}>
							{p} ({counts.get(p) ?? 0})
						</option>
					))}
				</select>
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
