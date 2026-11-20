import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/components/page-header";
import { ago } from "@/lib/format";

// Learn levels: the skill a trainer asks for to learn each recipe, read by
// the addon whenever a player opens a profession trainer, shared by every
// guild (docs/game-data.md, "Learn levels"). How far each profession has
// come; a recipe without one only counts for those who already know it.
export const Route = createFileRoute("/admin/")({
	loader: ({ context }) => context.queryClient.ensureQueryData(convexQuery(api.learnLevels.report, {})),
	component: LearnLevels,
});

const when = (at?: number) => (at ? (ago(at) ?? "just now") : "never");
const percent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");

function LearnLevels() {
	const { data } = useSuspenseQuery(convexQuery(api.learnLevels.report, {}));
	if (!data) return null;
	const total = data.professions.reduce(
		(sum, p) => ({
			recipes: sum.recipes + p.recipes,
			learnLevels: sum.learnLevels + p.learnLevels,
			stale: sum.stale + p.stale,
		}),
		{ recipes: 0, learnLevels: 0, stale: 0 },
	);
	return (
		<Page width="medium">
			<p className="text-[0.8125rem] text-muted-foreground">
				The skill a trainer asks for to learn each recipe, recorded when anyone with the addon opens a profession
				trainer. A recipe without one counts only for people who already know it; stale ones wait for a new visit after
				a game update changed the recipe.
			</p>
			<p className="mt-3 text-[0.8125rem] text-muted-foreground">
				<span className="num text-foreground">{data.reads}</span> trainer visits from{" "}
				<span className="num text-foreground">{data.players}</span> {data.players === 1 ? "player" : "players"}, latest{" "}
				{when(data.lastReadAt)} · recipe colors from build <span className="num">{data.colors.version}</span> (
				{data.colors.date})
			</p>
			<div className="surface-card mt-4 overflow-x-auto">
				<table className="num w-full text-left text-[0.8125rem]">
					<thead className="text-muted-foreground">
						<tr>
							<th className="px-3.5 py-2 font-medium">Profession</th>
							<th className="px-3.5 py-2 text-right font-medium">Recipes</th>
							<th className="px-3.5 py-2 text-right font-medium">Learn levels</th>
							<th className="px-3.5 py-2 text-right font-medium">Covered</th>
							<th className="px-3.5 py-2 text-right font-medium">Stale</th>
							<th className="px-3.5 py-2 font-medium">Last visit</th>
						</tr>
					</thead>
					<tbody>
						{data.professions.map((p) => (
							<tr key={p.name} className="border-t border-border/60">
								<td className="px-3.5 py-1.5">{p.name}</td>
								<td className="px-3.5 py-1.5 text-right text-muted-foreground">{p.recipes}</td>
								<td className="px-3.5 py-1.5 text-right">{p.learnLevels || "—"}</td>
								<td className="px-3.5 py-1.5 text-right">{percent(p.learnLevels, p.recipes)}</td>
								<td className="px-3.5 py-1.5 text-right text-muted-foreground">{p.stale || "—"}</td>
								<td className="px-3.5 py-1.5 text-muted-foreground">{when(p.lastReadAt)}</td>
							</tr>
						))}
						<tr className="border-t border-border font-medium">
							<td className="px-3.5 py-2">All</td>
							<td className="px-3.5 py-2 text-right text-muted-foreground">{total.recipes}</td>
							<td className="px-3.5 py-2 text-right">{total.learnLevels}</td>
							<td className="px-3.5 py-2 text-right">{percent(total.learnLevels, total.recipes)}</td>
							<td className="px-3.5 py-2 text-right text-muted-foreground">{total.stale || "—"}</td>
							<td />
						</tr>
					</tbody>
				</table>
			</div>
			<p className="mt-3 text-xs text-muted-foreground">
				Recipes taught only by patterns, plans or formulas never get one, so no profession reaches 100%.
			</p>
		</Page>
	);
}
