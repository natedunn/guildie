import { api } from "@convex/_generated/api";
import type { VerdictKind } from "@convex/shared/upgrades";
import { CLASSES, type Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
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
import { cn } from "@/lib/utils";
import { VERDICT_HINTS, verdictLabel } from "@/lib/verdict";

// "Who can make...": every recipe someone in the guild knows, searched on the
// client (recipe, item, item kind, tooltip text, reagents). The search and the
// profession filter live in the URL so a result can be shared in chat.
// Members also get two upgrade views, both by the gear-upgrade rules
// (shared/upgrades.ts) with each character's stat priority:
// - "Upgrades for me" (?view=upgrades): what the guild can craft (their own
//   recipes included) that would be an upgrade for the viewer's characters;
// - "Upgrades I can craft" (?view=craft): the viewer's recipes that would be
//   an upgrade for someone in the guild (their own other characters included).
// And "Who can learn" (?view=learn): every recipe item (pattern, plans,
// formula...) for the guild's professions, with who could learn it now or
// later, who already has one and who knows it: is it worth sending someone?

type View = "upgrades" | "craft" | "learn";
/** `char`: which of the viewer's characters the upgrade views are about (slug; default their first). */
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
		...convexQuery(api.crafting.guildRecipeItems, { region: params.region as Region, slug: params.slug }),
		enabled: showLearn,
	});
	const [showRemoved, setShowRemoved] = useState(false);
	// The upgrade views are about one of the viewer's characters at a time.
	const characters = upgrades?.characters ?? [];
	const char = characters.find((c) => c.slug === search.char) ?? characters[0];
	const forChar = useMemo(
		() =>
			(upgrades?.hits ?? [])
				.flatMap((h) => {
					const mine = h.for.filter((x) => x.slug === char?.slug);
					return mine.length ? [{ ...h, for: mine }] : [];
				})
				.sort((a, b) => b.for[0].gain - a.for[0].gain || a.name.localeCompare(b.name)),
		[upgrades, char],
	);
	// Items the player removed from this character's suggestions: hidden unless "Show removed".
	const kept = useMemo(() => forChar.filter((h) => !h.for[0].removed), [forChar]);
	const removedCount = forChar.length - kept.length;
	const asChar = useMemo(
		() => (canCraft?.hits ?? []).filter((h) => h.crafters.some((c) => c.slug === char?.slug)),
		[canCraft, char],
	);
	const source: Row[] = showUpgrades ? (showRemoved ? forChar : kept) : showCraft ? asChar : (data ?? []);

	const index = useMemo(() => buildIndex(source), [source]);
	const words = useMemo(() => queryWords(deferred), [deferred]);
	const matches = useMemo(() => searchIndex(index, words), [index, words]);

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
	const onDismiss = (itemId: number, removed: boolean) =>
		char && void dismiss({ region: params.region as Region, slug: char.slug, itemId, removed });

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
		navigate({ search: (prev) => ({ ...prev, char: slug }), replace: true, resetScroll: false });
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
							All recipes
						</PageTabButton>
						<PageTabButton
							active={showUpgrades}
							onClick={() => setView("upgrades")}
							count={upgrades ? kept.length : undefined}
						>
							{/* Short labels where the three don't fit on one line (phones). */}
							<span className="@max-md:hidden">Upgrades for me</span>
							<span className="@md:hidden">For me</span>
						</PageTabButton>
						<PageTabButton
							active={showCraft}
							onClick={() => setView("craft")}
							count={canCraft ? asChar.length : undefined}
						>
							<span className="@max-md:hidden">Upgrades I can craft</span>
							<span className="@md:hidden">I can craft</span>
						</PageTabButton>
						<PageTabButton active={showLearn} onClick={() => setView("learn")}>
							<span className="@max-md:hidden">Who can learn</span>
							<span className="@md:hidden">Learn</span>
						</PageTabButton>
					</PageTabs>
				) : null}
				{showLearn ? (
					<LearnView
						data={learnData}
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
					{(showUpgrades || showCraft) && char ? (
						<CharacterPicker
							label={showCraft ? "Crafting as" : "For"}
							characters={characters}
							value={char.slug}
							onChange={setChar}
						/>
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
					{showUpgrades && upgrades ? (
						<label className="ml-auto flex h-10 cursor-pointer @max-md:order-last items-center gap-2 pl-2 text-[0.8125rem] text-muted-foreground select-none hover:text-foreground">
							<Switch checked={showRemoved} onCheckedChange={setShowRemoved} />
							Show removed
							{removedCount ? <span className="num text-xs">{removedCount}</span> : null}
						</label>
					) : null}
				</div>
			</div>

			{showLearn ? null : loading ? (
				<p className="py-10 text-center text-sm text-muted-foreground">
					{showCraft
						? "Checking your recipes against the guild's gear..."
						: "Checking what the guild can make for you..."}
				</p>
			) : showCraft && asChar.length === 0 ? (
				<p className={EMPTY}>
					None of {char?.name ?? "your character"}'s recipes beats what anyone in the guild wears right now.
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
					{upgrades.noGear.some((c) => c.slug === char?.slug)
						? `Nothing to compare with until we've read ${char?.name}'s gear.`
						: `Nothing the guild can craft beats what ${char?.name} wears right now.`}
					{removedCount ? (
						<span className="mt-1 block text-xs">
							{removedCount} removed; "Show removed" puts {removedCount === 1 ? "it" : "them"} back in view.
						</span>
					) : null}
					{upgrades.strict.some((c) => c.slug === char?.slug) ? (
						<span className="mt-1 block text-xs">
							"Only these" in {char?.name}'s Preferences leaves other armor or weapon types out.
						</span>
					) : null}
				</p>
			) : showUpgrades ? (
				results.length === 0 ? (
					<p className={EMPTY}>No upgrades match "{deferred.trim()}".</p>
				) : (
					<div className="space-y-3">
						{groupRows(results.slice(0, limit)).map(({ group, rows }) => (
							<GroupCard key={group.kind} title={group.title} hint={group.hint} count={rows.length}>
								{rows.map((r) => (
									<UpgradeRow
										key={r.recipeId}
										recipe={r}
										region={params.region}
										member={member}
										onDismiss={onDismiss}
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
			) : results.length === 0 ? (
				<div className={EMPTY}>
					{deferred.trim() ? <>Nobody in the guild has a recipe matching "{deferred.trim()}".</> : "Nothing here."}
					<div className="mt-1">Try "bag" or "Mageweave".</div>
				</div>
			) : (
				<div>
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
				</div>
			)}
		</div>
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
		kind: "tradeoff",
		title: "Trade-offs",
		hint: "Give up some of one stat for more of another; worth it at your steepness",
		others: VERDICT_HINTS.tradeoff,
	},
	{
		kind: "maybe",
		title: "Maybe",
		hint: "Small gains, your second spec, a few levels from now, or an armor type you don't want",
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

/** One group of an upgrade view: a card with its title, how many, what it means, and the rows. */
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
			<ul className="divide-y divide-border/60">{children}</ul>
		</section>
	);
}

/** A row in a group card: stacked on a narrow pane (phones), columns on a wide one. */
const ROW = "grid grid-cols-1 gap-x-5 gap-y-2 px-4 py-3";
/** Upgrades for me: item, why, crafters, Request and Remove. */
const FOR_ME_COLS = "items-center @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.8fr)_auto]";
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

/**
 * Upgrades for me: the item, why it's better for the character in view (the
 * picker says who; the card says what kind), who can make it, Request, and
 * Remove (or Restore, under Show removed).
 */
function UpgradeRow({
	recipe,
	region,
	member,
	onDismiss,
}: {
	recipe: Row;
	region: string;
	member?: Member;
	onDismiss: (itemId: number, removed: boolean) => void;
}) {
	const h = recipe.for?.[0];
	const itemId = recipe.item?.itemId;
	return (
		<li className={cn(ROW, FOR_ME_COLS)}>
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
				{h && itemId !== undefined ? (
					<Button
						variant="ghost"
						size="sm"
						className="text-muted-foreground"
						title={
							h.removed
								? "Suggest this for this character again"
								: "Never suggest this for this character again, here or in the game's tooltips"
						}
						onClick={() => onDismiss(itemId, !h.removed)}
					>
						{h.removed ? "Restore" : "Remove"}
					</Button>
				) : null}
			</div>
		</li>
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
	characters,
	value,
	onChange,
}: {
	label: string;
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
				aria-label={`${label}: ${current?.name ?? ""}`}
				className="h-10 min-w-0 whitespace-nowrap rounded-md border border-input bg-well bg-(image:--select-chevron) bg-size-[0.75rem] bg-position-[right_0.5rem_center] bg-no-repeat pr-7 pl-3 text-left text-sm @max-md:flex-1"
			>
				<span className="text-muted-foreground">{label} </span>
				{current ? named(current) : null}
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-auto min-w-(--anchor-width)">
				<DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(String(v))}>
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

type LearnData = NonNullable<FunctionReturnType<typeof api.crafting.guildRecipeItems>>;

/**
 * Who can learn: recipe items for the guild's professions, searched by name,
 * each with who could use it. "Only ones someone needs" (on by default)
 * hides items everyone with the profession already knows or holds.
 */
function LearnView({
	data,
	region,
	query,
	deferred,
	setQuery,
	profession,
	setProfession,
}: {
	data: LearnData | null | undefined;
	region: string;
	query: string;
	deferred: string;
	setQuery: (q: string) => void;
	profession?: string;
	setProfession: (p?: string) => void;
}) {
	const [neededOnly, setNeededOnly] = useState(true);
	const [limit, setLimit] = useState(PAGE);
	const rows = useMemo(() => {
		if (!data) return [];
		return data.items.map((item) => ({
			...item,
			learners: item.who.map((w): Learner => ({ ...data.characters[w.i], state: w.state, skill: w.skill })),
			needed: item.who.some((w) => w.state === "now" || w.state === "later"),
		}));
	}, [data]);
	const words = useMemo(() => queryWords(deferred), [deferred]);
	const matches = useMemo(
		() =>
			rows.filter((r) => {
				if (neededOnly && !r.needed) return false;
				const text = `${r.name} ${r.profession}`.toLowerCase();
				return words.every((w) => text.includes(w));
			}),
		[rows, words, neededOnly],
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
