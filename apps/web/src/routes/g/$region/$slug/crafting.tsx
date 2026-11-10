import { api } from "@convex/_generated/api";
import type { Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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

type Search = { q?: string; profession?: string };

export const Route = createFileRoute("/g/$region/$slug/crafting")({
	validateSearch: (search: Record<string, unknown>): Search => {
		const out: Search = {};
		// The router parses "?q=8" as a number; take it back as text.
		if (typeof search.q === "string" || typeof search.q === "number") out.q = String(search.q);
		if (typeof search.profession === "string") out.profession = search.profession;
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

	const index = useMemo(() => buildIndex(data ?? []), [data]);
	const words = useMemo(() => queryWords(deferred), [deferred]);
	const matches = useMemo(() => searchIndex(index, words), [index, words]);

	// Counts per profession reflect the current search, so the chips say where the hits are.
	const counts = useMemo(() => {
		const c = new Map<string, number>();
		for (const r of matches) c.set(r.profession, (c.get(r.profession) ?? 0) + 1);
		return c;
	}, [matches]);
	const professions = useMemo(
		() => [...new Set((data ?? []).map((r) => r.profession))].sort(compareProfessions),
		[data],
	);

	const results = useMemo(
		() => (profession ? matches.filter((r) => r.profession === profession) : matches),
		[matches, profession],
	);

	useEffect(() => setLimit(PAGE), [deferred, profession]);

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

	return (
		// A container, so the row layout follows the content pane's width rather than the viewport.
		<div className="@container w-full space-y-4 pb-6">
			<div className="space-y-3">
				<Input
					ref={inputRef}
					type="search"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Escape") setQuery("");
					}}
					placeholder="Who can make... (bag, Mageweave, 8 slot bag)"
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

			{results.length === 0 ? (
				<div className="py-10 text-center text-sm text-muted-foreground">
					{deferred.trim() ? <>Nobody in the guild has a recipe matching "{deferred.trim()}".</> : "Nothing here."}
					<div className="mt-1">Try "bag" or "Mageweave".</div>
				</div>
			) : (
				<div>
					<div className="hidden grid-cols-[minmax(0,1.3fr)_7.5rem_minmax(0,1fr)] gap-4 border-b border-border pb-1.5 text-xs text-muted-foreground @2xl:grid">
						<span>Item</span>
						<span>Profession</span>
						<span>Crafters</span>
					</div>
					<ul>
						{results.slice(0, limit).map((r) => (
							<ResultRow key={r.recipeId} recipe={r} region={params.region} member={member} />
						))}
					</ul>
					{results.length > limit ? (
						<button
							type="button"
							onClick={() => setLimit(Number.POSITIVE_INFINITY)}
							className="mt-2 w-full rounded-md py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						>
							Show all {results.length}
						</button>
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

function ResultRow({ recipe, region, member }: { recipe: GuildRecipe; region: string; member?: Member }) {
	const [expanded, setExpanded] = useState(false);
	const shown = expanded ? recipe.crafters : recipe.crafters.slice(0, CRAFTERS);
	const hidden = recipe.crafters.length - shown.length;
	return (
		<li className="grid gap-x-4 gap-y-1 border-b border-border/60 py-1.5 last:border-b-0 @2xl:grid-cols-[minmax(0,1.3fr)_7.5rem_minmax(0,1fr)] @2xl:items-center">
			<RecipeItem recipe={recipe} />
			<span className="hidden truncate text-sm text-muted-foreground @2xl:block">{recipe.profession}</span>
			<div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 pl-[38px] text-sm @2xl:pl-0">
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
				{member && recipe.crafters.some((c) => !member.characters.some((m) => m.slug === c.slug)) ? (
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
		</li>
	);
}
