import type { api } from "@convex/_generated/api";
import { SUPPLY_TYPES, type SupplyType } from "@convex/shared/craftGroups";
import { Link } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { type ReactNode, type RefObject, useEffect, useMemo, useState } from "react";
import { ClassText } from "@/components/class-name";
import { CraftRequest, type Member, WhoPicker } from "@/components/crafting-upgrades";
import { FilterMenu } from "@/components/filter-menu";
import { buildIndex, compareProfessions, queryWords, Reagents, RecipeItem, searchIndex } from "@/components/recipe-row";
import { TrackButton } from "@/components/track-button";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { cn } from "@/lib/utils";

// Crafting's Enchants and Supplies tabs (and Gear for visitors): every recipe
// of that kind someone in the guild knows, with who makes it (the viewer's
// characters apart), who could learn it, the reagents and Request. Filtered
// by who makes it, the supply type and the profession; searched on the
// client like the rest of Crafting.

type GuildRecipe = NonNullable<FunctionReturnType<typeof api.crafting.guildCrafting>>[number];

/** Someone who knows a recipe; `mine`: one of the viewer's characters. */
export type Maker = GuildRecipe["crafters"][number] & { mine: boolean };
/** Someone who could learn it ("now": has the skill; "has": holds the pattern). */
export type Learner = GuildRecipe["learners"][number] & { mine: boolean };

/** A recipe as Crafting's lists show it: crafters and learners marked mine, and its supply type. */
export type ListRow = Omit<GuildRecipe, "crafters" | "learners"> & {
	crafters: Maker[];
	learners: Learner[];
	type?: SupplyType;
};

/** List filters as the page passes them on (the ones given change; none given clears them all). */
export type ListFilters = { by?: string; type?: SupplyType; profession?: string };

const PAGE = 50;
/** Guildmates listed per group before "+N more". */
const CRAFTERS = 3;
const LEARNERS = 2;
const EMPTY = "surface-card px-4 py-10 text-center text-[0.8125rem] text-muted-foreground";
/** Item, who makes it, reagents, actions (fixed, so the heads line up). Stacked on a narrow pane. */
const COLS =
	"grid grid-cols-1 items-start gap-x-5 gap-y-2 @2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.8fr)_10.5rem]";

const keeps = (who: string | undefined, c: { slug: string; mine: boolean }) =>
	!who || (who === "mine" ? c.mine : who === "guild" ? !c.mine : c.slug === who);

export function RecipeList({
	rows,
	region,
	member,
	query,
	deferred,
	setQuery,
	inputRef,
	by,
	type,
	profession,
	setFilters,
	placeholder,
	typeMenu,
	note,
	after,
}: {
	rows: ListRow[];
	region: string;
	member?: Member;
	query: string;
	deferred: string;
	setQuery: (q: string) => void;
	inputRef: RefObject<HTMLInputElement | null>;
	by?: string;
	type?: SupplyType;
	profession?: string;
	setFilters: (next: ListFilters) => void;
	placeholder: string;
	/** Supplies: filter by type. */
	typeMenu?: boolean;
	/** A line under the table (Enchants: done in a trade). */
	note?: ReactNode;
	/** Under the results (the search's recipes nobody knows yet). */
	after?: ReactNode;
}) {
	const [limit, setLimit] = useState(PAGE);
	const index = useMemo(() => buildIndex(rows), [rows]);
	const words = useMemo(() => queryWords(deferred), [deferred]);
	const matched = useMemo(() => searchIndex(index, words), [index, words]);

	const byOk = (r: ListRow, who?: string) => r.crafters.some((c) => keeps(who, c));
	const typeOk = (r: ListRow, t?: SupplyType) => !t || r.type === t;
	const profOk = (r: ListRow, p?: string) => !p || r.profession === p;
	const results = matched.filter((r) => byOk(r, by) && typeOk(r, type) && profOk(r, profession));
	// Each menu's counts, with the other filters on.
	const counts = {
		by: (who?: string) => matched.filter((r) => byOk(r, who) && typeOk(r, type) && profOk(r, profession)).length,
		type: (t?: SupplyType) => matched.filter((r) => byOk(r, by) && typeOk(r, t) && profOk(r, profession)).length,
		prof: (p?: string) => matched.filter((r) => byOk(r, by) && typeOk(r, type) && profOk(r, p)).length,
	};
	const professions = useMemo(() => [...new Set(rows.map((r) => r.profession))].sort(compareProfessions), [rows]);
	// The viewer's characters who make something here.
	const mine = useMemo(() => {
		const slugs = new Set(rows.flatMap((r) => r.crafters.filter((c) => c.mine).map((c) => c.slug)));
		return (member?.characters ?? []).filter((c) => slugs.has(c.slug));
	}, [rows, member]);
	useEffect(() => setLimit(PAGE), [deferred, by, type, profession]);
	const filtered = !!(by || type || profession);

	return (
		<div className="min-w-0 space-y-3">
			<SearchInput
				ref={inputRef}
				large
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Escape") setQuery("");
				}}
				placeholder={placeholder}
				aria-label={placeholder.replace(/\.\.\..*/, "")}
				className="h-10 text-[15px]"
			/>
			<div className="flex flex-wrap items-center gap-2 @max-md:grid @max-md:grid-cols-2">
				{member ? (
					<WhoPicker
						label="Made by"
						value={by}
						onChange={(v) => setFilters({ by: v })}
						count={counts.by}
						characters={mine}
					/>
				) : null}
				{typeMenu ? (
					<FilterMenu
						value={type ?? ""}
						onChange={(v) => setFilters({ type: (v || undefined) as SupplyType | undefined })}
						options={[
							{ value: "", label: "All supplies", count: counts.type() },
							...SUPPLY_TYPES.map((t, i) => ({
								value: t.type,
								label: t.label,
								count: counts.type(t.type),
								separate: i === 0 || t.type === "materials",
							})),
						]}
					/>
				) : null}
				<FilterMenu
					value={profession ?? ""}
					onChange={(v) => setFilters({ profession: v || undefined })}
					options={[
						{ value: "", label: "All professions", count: counts.prof() },
						...professions.map((p, i) => ({ value: p, label: p, count: counts.prof(p), separate: i === 0 })),
					]}
				/>
			</div>
			{results.length === 0 ? (
				<div className={EMPTY}>
					{deferred.trim() ? (
						<>Nobody in the guild makes "{deferred.trim()}" yet.</>
					) : (
						"Nothing here with these filters."
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
					<div
						className={cn(
							COLS,
							"border-b border-border/60 px-4 pt-2 pb-1.5 text-xs text-muted-foreground @max-2xl:hidden",
						)}
					>
						<span>Item</span>
						<span>Who makes it?</span>
						<span>Reagents</span>
						<span />
					</div>
					<ul className="divide-y divide-border/60">
						{results.slice(0, limit).map((r) => (
							<li key={r.recipeId} className={cn(COLS, "px-4 py-3")}>
								<RecipeItem
									recipe={r}
									size={36}
									wrap
									detail={r.item?.untradeable ? `${r.profession} · ${r.item.untradeable}` : r.profession}
								/>
								<MakersCell crafters={r.crafters} learners={r.learners} region={region} profession={r.profession} />
								<Reagents reagents={r.reagents} className="@max-2xl:hidden" />
								<div className="flex flex-wrap items-center gap-1 @2xl:justify-end">
									{r.crafters.some((c) => c.mine) ? null : <CraftRequest recipe={r} member={member} />}
									{member ? <TrackButton recipeId={r.recipeId} /> : null}
								</div>
							</li>
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
			{note ? <p className="px-1 text-xs text-muted-foreground">{note}</p> : null}
			{after}
		</div>
	);
}

/**
 * Who makes it: the viewer's characters, then guildmates (with skill), then
 * who could learn it, each a list on a guide line. "Nobody knows it yet"
 * when only learners. `onMore`: "+N more" opens something (Gear's dialog);
 * without it, the list grows in place.
 */
export function MakersCell({
	crafters,
	learners,
	region,
	profession,
	onMore,
	expanded,
	className,
	children,
}: {
	crafters: Maker[];
	learners: Learner[];
	region: string;
	profession: string;
	onMore?: () => void;
	/** Everyone, no "+N more" (the dialog). */
	expanded?: boolean;
	className?: string;
	/** Under the lists (who asked for it). */
	children?: ReactNode;
}) {
	const [grown, setOpen] = useState(false);
	const open = grown || expanded;
	const more = onMore ?? (() => setOpen(true));
	const yours = crafters.filter((c) => c.mine);
	const mates = crafters.filter((c) => !c.mine);
	const shownMates = open ? mates : mates.slice(0, CRAFTERS);
	const shownLearners = open ? learners : learners.slice(0, LEARNERS);
	const extra = mates.length - shownMates.length + learners.length - shownLearners.length;
	const name = (c: { slug: string; classId: number; name: string }) => (
		<Link
			to="/c/$region/$slug/professions"
			params={{ region, slug: c.slug }}
			search={{ profession }}
			className="hover:underline"
		>
			<ClassText classId={c.classId}>{c.name}</ClassText>
		</Link>
	);
	const maker = (c: Maker) => (
		<li key={c.slug} className="leading-5">
			{name(c)}
			{c.skill !== undefined ? <span className="num ml-1.5 text-xs text-muted-foreground">{c.skill}</span> : null}
		</li>
	);
	return (
		<div className={cn("min-w-0 text-[13px]", className)}>
			{crafters.length === 0 ? (
				<p className="mb-2.5 text-xs leading-5 text-muted-foreground">Nobody knows it yet</p>
			) : null}
			<ul className="who-list">
				{yours.length ? (
					<li>
						<span className="who-label">Yours</span>
						<ul>{yours.map(maker)}</ul>
					</li>
				) : null}
				{mates.length ? (
					<li>
						<span className="who-label">Guildmates</span>
						<ul>{shownMates.map(maker)}</ul>
					</li>
				) : null}
				{learners.length ? (
					<li>
						<span
							className="who-label"
							title="Has the profession and the skill, and doesn't know it yet; or already has the recipe in their bags"
						>
							Could learn
						</span>
						<ul>
							{shownLearners.map((l) => (
								<li key={l.slug} className="leading-5">
									<span className="opacity-70">{name(l)}</span>
									<span className="ml-1.5 text-xs text-muted-foreground">
										{l.state === "has" ? (
											"has the recipe"
										) : l.skill !== undefined ? (
											<span className="num">{l.skill}</span>
										) : null}
									</span>
								</li>
							))}
						</ul>
					</li>
				) : null}
			</ul>
			{extra > 0 ? (
				<button
					type="button"
					onClick={more}
					className="mt-2 text-xs leading-5 text-muted-foreground hover:text-foreground hover:underline"
				>
					+<span className="num">{extra}</span> more
				</button>
			) : null}
			{children}
		</div>
	);
}
