import { createFileRoute, Link } from "@tanstack/react-router";
import { type CharacterData, sourceNote, useCharacter } from "@/components/character-data";
import { GearPreferenceSection } from "@/components/gear-preference";
import { PANEL, Panel, panelAction } from "@/components/panel";
import { PaperDoll } from "@/components/paper-doll";
import { CanUse } from "@/components/proficiencies";
import { StatPrioritySection } from "@/components/stat-priority";
import { cn } from "@/lib/utils";

// Gear: the paper doll, with the character's facts beside it in panels: the
// stats to look for, their talents and what the class can wear and wield at
// their level. On wide panes the panels are a column to the right, so the
// whole page fits on one screen; narrower, they wrap under the gear. The
// layout route loads the character.
export const Route = createFileRoute("/c/$region/$slug/")({
	component: GearPage,
});

// The paper doll keeps its three columns (and the figure) from 42rem, so the
// side column only joins it from 42rem + the column + the gap.
const SIDE = "@min-[61rem]:grid-cols-[minmax(0,1fr)_17.5rem]";

function GearPage() {
	const params = Route.useParams();
	const data = useCharacter();
	if (!data) return null;
	const c = data.character;
	const fromGame = data.sources.gear.kind === "addon";
	const missing = c.profileMissing && !fromGame;
	return (
		<div className="@container">
			<div className={cn("grid items-start gap-5", SIDE)}>
				<div className="min-w-0">
					{missing ? (
						<p className="max-w-xl text-sm text-muted-foreground">
							Blizzard hasn't published this character's profile yet. That happens once they're level 10 and log out.
						</p>
					) : (
						<>
							<PaperDoll character={c} />
							<p className="mt-3 text-xs text-muted-foreground">{sourceNote(data.sources.gear)}</p>
						</>
					)}
				</div>
				<div className="grid gap-3 @2xl:grid-cols-2 @4xl:grid-cols-3 @min-[61rem]:grid-cols-1">
					<StatPrioritySection
						region={params.region}
						slug={params.slug}
						classId={c.classId}
						priority={data.statPriority}
						talentTrees={c.talentTrees}
						canEdit={data.canEdit}
					/>
					<GearPreferenceSection
						region={params.region}
						slug={params.slug}
						classId={c.classId}
						level={c.level}
						preference={data.gearPreference}
						canEdit={data.canEdit}
					/>
					<Talents data={data} />
					<CanUse classId={c.classId} level={c.level} className={cn(PANEL, "@2xl:col-span-2 @4xl:col-span-1")} />
				</div>
			</div>
		</div>
	);
}

/**
 * Points per tree, in the game's order, each with its share of the points
 * spent. The full trees are on the Talents tab.
 */
function Talents({ data }: { data: CharacterData }) {
	const params = Route.useParams();
	const { character: c, talentLayouts } = data;
	const spent = c.talentTrees ?? [];
	const trees = talentLayouts.length
		? talentLayouts.map((l) => ({
				name: l.name,
				points: spent.find((t) => t.id === l.specId)?.points ?? 0,
			}))
		: spent.map((t) => ({ name: t.name, points: t.points }));
	if (!trees.length) return null;
	const total = trees.reduce((sum, t) => sum + t.points, 0);
	const most = Math.max(...trees.map((t) => t.points));
	return (
		<Panel
			title="Talents"
			action={
				<Link to="/c/$region/$slug/talents" params={params} className={panelAction}>
					All talents
				</Link>
			}
		>
			<ul className="space-y-2">
				{trees.map((t) => {
					const main = t.points > 0 && t.points === most;
					return (
						<li key={t.name}>
							<div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
								<span className={cn("truncate", main ? "font-semibold" : "text-muted-foreground")}>{t.name}</span>
								<span className={cn("num", !main && "text-muted-foreground")}>{t.points}</span>
							</div>
							<div className="mt-1 h-1 overflow-hidden rounded-full bg-well">
								<div
									className={cn("h-full rounded-full", main ? "bg-foreground/70" : "bg-foreground/25")}
									style={{ width: `${total ? (t.points / total) * 100 : 0}%` }}
								/>
							</div>
						</li>
					);
				})}
			</ul>
			<p className="num mt-3 border-t border-border pt-2.5 text-xs text-muted-foreground">
				{total} {total === 1 ? "point" : "points"} spent
			</p>
		</Panel>
	);
}
