import { api } from "@convex/_generated/api";
import type { Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { type ReactNode, useDeferredValue, useMemo, useState } from "react";
import { sourceNote } from "@/components/character-data";
import { buildIndex, compareProfessions, queryWords, Reagents, RecipeItem, searchIndex } from "@/components/recipe-row";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// A character's professions: the list on the left, the selected one's known
// recipes on the right. The selection lives in the URL (?profession=) so it
// survives reloads and the guild crafting search can link straight to it.

export const Route = createFileRoute("/c/$region/$slug/professions")({
	// Accepts a skill line id ("197") or a name ("Tailoring"); the guild search
	// links by name because guildCrafting only carries the profession's name.
	validateSearch: (search: Record<string, unknown>): { profession?: string } => {
		const p = search.profession;
		return typeof p === "string" || typeof p === "number" ? { profession: String(p) } : {};
	},
	loader: async ({ context, params }) => {
		await context.queryClient.ensureQueryData(
			convexQuery(api.crafting.characterProfessions, { region: params.region as Region, slug: params.slug }),
		);
	},
	component: ProfessionsPage,
});

function ProfessionsPage() {
	const params = Route.useParams();
	const search = Route.useSearch();
	const { data } = useSuspenseQuery(
		convexQuery(api.crafting.characterProfessions, { region: params.region as Region, slug: params.slug }),
	);

	const professions = useMemo(
		() =>
			[...(data ?? [])].sort(
				(a, b) => Number(Boolean(a.secondary)) - Number(Boolean(b.secondary)) || compareProfessions(a.name, b.name),
			),
		[data],
	);

	if (!data) return <Empty>This character's professions aren't visible to you.</Empty>;
	if (professions.length === 0) {
		return (
			<Empty>No professions reported. Blizzard shares them once the character has logged in since the last sync.</Empty>
		);
	}

	const wanted = search.profession?.toLowerCase();
	const selected =
		professions.find((p) => String(p.id) === wanted || p.name.toLowerCase() === wanted) ?? professions[0];
	const firstSecondary = professions.findIndex((p) => p.secondary);

	return (
		// A container, so the two-pane layout follows the content pane's width
		// (sidebar open or not, desktop window size) rather than the viewport.
		<div className="@container w-full pb-6">
			<div className="grid gap-6 @2xl:grid-cols-[13rem_minmax(0,1fr)]">
				<nav className="flex flex-col gap-px self-start" aria-label="Professions">
					{professions.map((p, i) => (
						<div key={p.id}>
							{i === firstSecondary && i > 0 ? <div className="mx-2.5 my-2 border-t border-border" /> : null}
							<Link
								from={Route.fullPath}
								search={{ profession: p.name }}
								replace
								resetScroll={false}
								className={cn(
									"block rounded-md px-2.5 py-2 transition-colors hover:bg-hover",
									// Like the sidebar's active row: warm light from the left, a lit edge.
									p.id === selected.id &&
										"bg-[linear-gradient(90deg,rgb(255_176_96/0.11),rgb(255_176_96/0.035))] shadow-[inset_0_0_0_1px_rgb(255_200_140/0.07)] hover:bg-transparent",
								)}
							>
								<div className="flex items-baseline justify-between gap-2 text-sm">
									<span className={cn(p.id === selected.id ? "font-medium text-foreground" : "text-foreground/85")}>
										{p.name}
									</span>
									<span className="num text-xs text-muted-foreground">
										{p.skill ?? "?"} / {p.maxSkill ?? "?"}
									</span>
								</div>
								<SkillBar skill={p.skill} max={p.maxSkill} active={p.id === selected.id} />
							</Link>
						</div>
					))}
				</nav>
				<RecipeList key={selected.id} profession={selected} />
			</div>
		</div>
	);
}

type Profession = NonNullable<FunctionReturnType<typeof api.crafting.characterProfessions>>[number];

function SkillBar({ skill, max, active }: { skill?: number; max?: number; active?: boolean }) {
	const pct = skill && max ? Math.min(100, (skill / max) * 100) : 0;
	return (
		<div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-well">
			<div
				className={cn("h-full rounded-full", active ? "bg-highlight/70" : "bg-foreground/35")}
				style={{ width: `${pct}%` }}
			/>
		</div>
	);
}

function RecipeList({ profession }: { profession: Profession }) {
	const [filter, setFilter] = useState("");
	const deferred = useDeferredValue(filter);
	const index = useMemo(() => buildIndex(profession.recipes), [profession.recipes]);
	// Within one profession the alphabetical order reads better than relevance.
	const recipes = useMemo(() => {
		const hits = new Set(searchIndex(index, queryWords(deferred)));
		return profession.recipes.filter((r) => hits.has(r));
	}, [index, deferred, profession.recipes]);
	const total = profession.recipes.length;

	return (
		<section className="min-w-0">
			<div className="flex flex-wrap items-center justify-between gap-3 pb-3">
				<h2 className="text-sm font-semibold">
					{profession.name}{" "}
					<span className="num text-sm font-normal text-muted-foreground">
						{deferred ? `${recipes.length} of ${total}` : total} {total === 1 ? "recipe" : "recipes"}
					</span>
				</h2>
				{total > 0 ? (
					<Input
						type="search"
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
						placeholder="Filter recipes"
						aria-label={`Filter ${profession.name} recipes`}
						className="h-8 w-full @lg:w-56"
					/>
				) : null}
			</div>
			{total === 0 && profession.recipesSource.kind === "blizzard" && profession.source.kind === "addon" ? (
				// Learned or seen in game since Blizzard's profile: its recipes come
				// from the game too, once its window has been open.
				<p className="surface-card px-5 py-10 text-center text-[0.8125rem] text-muted-foreground text-balance">
					No recipes from the game yet. They're sent once {profession.name}'s window has been open in game.
				</p>
			) : total === 0 ? (
				<p className="surface-card px-5 py-10 text-center text-[0.8125rem] text-muted-foreground text-balance">
					Blizzard reports {profession.skill ? `skill ${profession.skill} in ${profession.name}` : profession.name} but
					no known recipes.
					{profession.secondary ? "" : " Some professions (gathering ones especially) have none to list."}
				</p>
			) : recipes.length === 0 ? (
				<p className="surface-card px-5 py-10 text-center text-[0.8125rem] text-muted-foreground">
					No recipes match "{deferred}".
				</p>
			) : (
				<ul className="surface-card card-clip">
					{recipes.map((r) => (
						<li
							key={r.recipeId}
							className="flex items-center justify-between gap-4 border-b border-border px-3 py-1.5 transition-colors last:border-b-0 hover:bg-[var(--row-hover)]"
						>
							<RecipeItem recipe={r} className="flex-1" />
							<Reagents reagents={r.reagents} className="justify-end" />
						</li>
					))}
				</ul>
			)}
			<p className="mt-3 text-xs text-muted-foreground">
				{profession.source.kind === profession.recipesSource.kind
					? sourceNote(profession.recipesSource)
					: `${sourceNote(profession.source, "Skill from")} ${sourceNote(profession.recipesSource, "Recipes from")}`}
			</p>
		</section>
	);
}

function Empty({ children }: { children: ReactNode }) {
	return (
		<p className="surface-card px-5 py-10 text-center text-[0.8125rem] text-muted-foreground text-balance">
			{children}
		</p>
	);
}
