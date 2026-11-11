import { api } from "@convex/_generated/api";
import type { Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { type ReactNode, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ClassText } from "@/components/class-name";
import {
	buildIndex,
	compareProfessions,
	type GuildRecipe,
	queryWords,
	RecipeItem,
	searchIndex,
} from "@/components/recipe-row";
import { RequestButton } from "@/components/requests";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// "Who can make...": every recipe someone in the guild knows, searched on the
// client (recipe, item, item kind, tooltip text, reagents). The search and the
// profession filter live in the URL so a result can be shared in chat.
// Members also get "Upgrades for me" (?view=upgrades): what guildmates can
// craft that would be an upgrade for their characters (shared/upgrades.ts).

type Search = { q?: string; profession?: string; view?: "upgrades" };

export const Route = createFileRoute("/g/$region/$slug/crafting")({
	validateSearch: (search: Record<string, unknown>): Search => {
		const out: Search = {};
		// The router parses "?q=8" as a number; take it back as text.
		if (typeof search.q === "string" || typeof search.q === "number") out.q = String(search.q);
		if (typeof search.profession === "string") out.profession = search.profession;
		if (search.view === "upgrades") out.view = "upgrades";
		return out;
	},
	loader: async ({ context, params }) => {
		await context.queryClient.ensureQueryData(
			convexQuery(api.crafting.guildCrafting, { region: params.region as Region, slug: params.slug }),
		);
	},
	component: CraftingPage,
});

/** Rendering every row's tooltips at once is the slow part; show this many until asked. */
const PAGE = 150;
/** Crafters shown per recipe before "+N more". */
const CRAFTERS = 4;

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
	const { data: me } = useQuery(convexQuery(api.requests.me, { region: params.region as Region, slug: params.slug }));
	const member = me
		? { guild: { region: params.region as Region, slug: params.slug }, characters: me.characters }
		: undefined;

	// Null for non-members: no switch for them.
	const { data: upgrades } = useQuery(
		convexQuery(api.crafting.upgradesForMe, { region: params.region as Region, slug: params.slug }),
	);
	const showUpgrades = view === "upgrades" && upgrades !== null;
	const source: (GuildRecipe & { for?: UpgradeHit["for"] })[] = showUpgrades ? (upgrades?.hits ?? []) : (data ?? []);

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

	if (!data) {
		return <p className="py-10 text-sm text-muted-foreground">This guild's crafting is for members only.</p>;
	}
	if (data.length === 0) {
		return (
			<p className="py-10 text-sm text-muted-foreground">
				No known recipes yet. They appear once members' professions have synced from Blizzard.
			</p>
		);
	}

	const setProfession = (p?: string) =>
		navigate({ search: (prev) => ({ ...prev, profession: p }), replace: true, resetScroll: false });
	const setView = (v?: "upgrades") =>
		navigate({ search: (prev) => ({ ...prev, view: v, profession: undefined }), replace: true, resetScroll: false });
	const loadingUpgrades = showUpgrades && upgrades === undefined;

	return (
		// A container, so the row layout follows the content pane's width rather than the viewport.
		<div className="@container w-full space-y-4 pb-6">
			<div className="space-y-3">
				{upgrades ? (
					<div className="flex gap-1" role="group" aria-label="View">
						<Chip active={!showUpgrades} onClick={() => setView(undefined)} count={data.length}>
							All recipes
						</Chip>
						<Chip active={showUpgrades} onClick={() => setView("upgrades")} count={upgrades.hits.length}>
							Upgrades for me
						</Chip>
					</div>
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
						showUpgrades ? "Search your upgrades... (boots, Agility)" : "Who can make... (bag, Mageweave, 8 slot bag)"
					}
					aria-label="Search recipes the guild can craft"
					className="h-10 text-[15px]"
				/>
				<div className="flex flex-wrap gap-1" role="group" aria-label="Profession">
					<Chip active={!profession} onClick={() => setProfession(undefined)} count={matches.length}>
						All
					</Chip>
					{professions.map((p) => (
						<Chip
							key={p}
							active={profession === p}
							onClick={() => setProfession(profession === p ? undefined : p)}
							count={counts.get(p) ?? 0}
						>
							{p}
						</Chip>
					))}
				</div>
			</div>

			{showUpgrades && upgrades && upgrades.noGear.length > 0 ? (
				<p className="text-xs text-muted-foreground">
					No gear read yet for {names(upgrades.noGear)}, so they're left out. Gear comes from Blizzard after a logout,
					or from the Guildie app.
				</p>
			) : null}

			{loadingUpgrades ? (
				<p className="py-10 text-center text-sm text-muted-foreground">Checking what the guild can make for you...</p>
			) : showUpgrades && upgrades && upgrades.hits.length === 0 ? (
				<p className="py-10 text-center text-sm text-muted-foreground">
					{upgrades.noGear.length === upgrades.characters.length
						? "Nothing to compare with until we've read your gear."
						: "Nothing the guild can craft beats what you wear right now."}
				</p>
			) : showUpgrades ? (
				results.length === 0 ? (
					<p className="py-10 text-center text-sm text-muted-foreground">No upgrades match "{deferred.trim()}".</p>
				) : (
					<div>
						{/* Columns on a wide pane; stacked rows on a narrow one (phones). */}
						<div
							className={cn(
								UPGRADE_GRID,
								"hidden border-b border-border pb-1.5 text-xs text-muted-foreground @2xl:grid",
							)}
						>
							<span>Item</span>
							<span>For</span>
							<span>Crafters</span>
						</div>
						<ul>
							{results.slice(0, limit).map((r) => (
								<UpgradeRow key={r.recipeId} recipe={r} region={params.region} member={member} />
							))}
						</ul>
						{results.length > limit ? (
							<ShowAll count={results.length} onClick={() => setLimit(Number.POSITIVE_INFINITY)} />
						) : null}
						<p className="mt-3 text-xs text-muted-foreground">
							A best guess from stat weights and what you wear, not a sim.
						</p>
					</div>
				)
			) : results.length === 0 ? (
				<div className="py-10 text-center text-sm text-muted-foreground">
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

function Chip({
	active,
	count,
	onClick,
	children,
}: {
	active: boolean;
	count: number;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			aria-pressed={active}
			onClick={onClick}
			className={cn(
				"rounded-md border px-2.5 py-1 text-[13px] transition-colors",
				active
					? "border-border bg-accent text-foreground"
					: "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground",
				count === 0 && !active && "opacity-50",
			)}
		>
			{children} <span className="num text-xs text-muted-foreground">{count}</span>
		</button>
	);
}

type Member = {
	guild: { region: Region; slug: string };
	characters: { slug: string; name: string; classId: number }[];
};

type UpgradeHit = NonNullable<FunctionReturnType<typeof api.crafting.upgradesForMe>>["hits"][number];

const UPGRADE_GRID = "grid grid-cols-1 gap-x-4 @2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1fr)]";

/** "Brisket", "Brisket and Miller", "Brisket, Miller and Pip". */
function names(list: { name: string }[]) {
	const n = list.map((c) => c.name);
	return n.length > 1 ? `${n.slice(0, -1).join(", ")} and ${n.at(-1)}` : (n[0] ?? "");
}

function ShowAll({ count, onClick }: { count: number; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="mt-2 w-full rounded-md py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
			<Crafters recipe={recipe} region={region} member={member} />
		</li>
	);
}

/** An upgrade: the item, which of the viewer's characters it helps and why, and who can make it. */
function UpgradeRow({
	recipe,
	region,
	member,
}: {
	recipe: GuildRecipe & { for?: UpgradeHit["for"] };
	region: string;
	member?: Member;
}) {
	return (
		<li
			className={cn(
				UPGRADE_GRID,
				"items-start gap-y-2 border-b border-border/60 py-2.5 last:border-b-0 @2xl:gap-y-1 @2xl:py-2",
			)}
		>
			<div className="min-w-0">
				<RecipeItem recipe={recipe} />
				<div className="mt-0.5 pl-[38px] text-xs text-muted-foreground">{recipe.profession}</div>
			</div>
			<div className="min-w-0 space-y-1 text-[13px]">
				{(recipe.for ?? []).map((h) => (
					<div key={h.slug} className="min-w-0">
						<div className="flex items-baseline gap-2">
							<Link to="/c/$region/$slug" params={{ region, slug: h.slug }} className="font-medium hover:underline">
								<ClassText classId={h.classId}>{h.name}</ClassText>
							</Link>
							<span className="truncate text-xs text-muted-foreground">{h.spec}</span>
							<span className={cn("ml-auto shrink-0 text-xs", h.kind !== "upgrade" && "text-muted-foreground")}>
								{h.kind === "upgrade" ? "Upgrade" : h.at ? `Maybe, at ${h.at}` : "Maybe"}
							</span>
						</div>
						<p className="text-xs text-muted-foreground">{h.why}</p>
					</div>
				))}
			</div>
			<Crafters recipe={recipe} region={region} member={member} />
		</li>
	);
}

/**
 * Who knows the recipe (highest skill first, a few until "+N more"), and
 * Request for members, unless the item binds to its crafter.
 */
function Crafters({ recipe, region, member }: { recipe: GuildRecipe; region: string; member?: Member }) {
	const [expanded, setExpanded] = useState(false);
	const shown = expanded ? recipe.crafters : recipe.crafters.slice(0, CRAFTERS);
	const hidden = recipe.crafters.length - shown.length;
	return (
		<div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
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
			{recipe.item?.untradeable ? (
				// Binds to whoever crafts it: nothing to request.
				<span className="ml-auto text-xs whitespace-nowrap text-muted-foreground">{recipe.item.untradeable}</span>
			) : member && recipe.crafters.some((c) => !member.characters.some((m) => m.slug === c.slug)) ? (
				<RequestButton
					guild={member.guild}
					characters={member.characters}
					size="xs"
					variant="ghost"
					label="Request"
					className="ml-auto"
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
			) : null}
		</div>
	);
}
