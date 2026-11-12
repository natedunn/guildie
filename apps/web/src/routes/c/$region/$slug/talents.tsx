import { createFileRoute } from "@tanstack/react-router";
import { sourceNote, useCharacter } from "@/components/character-data";
import { TalentList, TalentTree } from "@/components/talent-tree";

// Talents: the class's three trees side by side, as in the game.
export const Route = createFileRoute("/c/$region/$slug/talents")({
	component: TalentsPage,
});

function TalentsPage() {
	const data = useCharacter();
	if (!data) return null;
	const { character: c, talentLayouts, talentSource } = data;
	const trees = c.talentTrees ?? [];
	const treeFor = (specId: number) => trees.find((t) => t.id === specId);
	// Layouts carry every tree (empty ones too) in game order; without them,
	// all we know is the trees with points in them.
	const summary = talentLayouts.length
		? talentLayouts.map((l) => treeFor(l.specId)?.points ?? 0)
		: trees.map((t) => t.points);
	const source = sourceNote(talentSource);

	if (!talentLayouts.length && !trees.length) {
		return (
			<p className="surface-card px-5 py-10 text-center text-[0.8125rem] text-muted-foreground">
				No talent points spent yet.
			</p>
		);
	}
	return (
		<div className="@container w-full">
			<div className="mb-3 flex items-baseline justify-between gap-4">
				<span className="num text-sm font-semibold">{summary.join(" / ")}</span>
				<span className="num text-xs text-muted-foreground">{summary.reduce((a, b) => a + b, 0)} points</span>
			</div>
			{/* Three 224px trees side by side need 688px; below that they stack. */}
			<div className="grid gap-2 @[43rem]:grid-cols-3">
				{talentLayouts.length
					? talentLayouts.map((layout) => (
							<TalentTree key={layout.specId} layout={layout} tree={treeFor(layout.specId)} />
						))
					: trees.map((tree) => <TalentList key={tree.id} tree={tree} />)}
			</div>
			<p className="mt-3 text-xs text-muted-foreground">{source}</p>
		</div>
	);
}
