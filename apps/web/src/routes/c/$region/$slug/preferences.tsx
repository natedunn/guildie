import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useCharacter } from "@/components/character-data";
import { GearPreferenceEditor } from "@/components/gear-preference";
import { StatPriorityEditor } from "@/components/stat-priority";

// Preferences: where the player who claimed this character sets what gear
// suggestions look for (stats, and armor and weapon types). The Gear tab shows
// them in its side column; all editing happens here. The layout route loads
// the character.
export const Route = createFileRoute("/c/$region/$slug/preferences")({
	component: PreferencesPage,
});

function PreferencesPage() {
	const params = Route.useParams();
	const data = useCharacter();
	if (!data) return null;
	const c = data.character;
	if (!data.canEdit) {
		return (
			<p className="text-sm text-muted-foreground">
				Only the player who claimed {c.name} can change their preferences. They show on the{" "}
				<Link to="/c/$region/$slug" params={params} className="text-foreground underline underline-offset-4">
					Gear
				</Link>{" "}
				tab.
			</p>
		);
	}
	return (
		<div className="@container max-w-4xl space-y-10 pb-12">
			<Section
				title="Stats to look for"
				description={
					<>
						What {c.name} wants on gear, most important first. Follow their talents, pick a tree's, or choose your own
						and how much each counts. Pages show the first three.
					</>
				}
			>
				{data.statPriority ? (
					<StatPriorityEditor
						region={params.region}
						slug={params.slug}
						classId={c.classId}
						priority={data.statPriority}
						talentTrees={c.talentTrees}
					/>
				) : (
					<p className="text-sm text-muted-foreground">No stat priority for this class yet.</p>
				)}
			</Section>
			<Section
				title="Gear types"
				description={
					<>
						The armor and weapon type {c.name} prefers. Other types count less in suggestions, or with "Only this type",
						don't show at all.
					</>
				}
			>
				<GearPreferenceEditor
					region={params.region}
					slug={params.slug}
					classId={c.classId}
					level={c.level}
					preference={data.gearPreference}
				/>
			</Section>
		</div>
	);
}

/** A settings block: title and what it does on the left, the controls on the right (stacked when narrow). */
function Section({ title, description, children }: { title: string; description: ReactNode; children: ReactNode }) {
	return (
		<section className="grid gap-4 border-t border-border pt-6 first:border-t-0 first:pt-0 @3xl:grid-cols-[14rem_minmax(0,1fr)] @3xl:gap-8">
			<div>
				<h2 className="text-sm font-semibold">{title}</h2>
				<p className="mt-1 text-[0.8125rem] text-muted-foreground">{description}</p>
			</div>
			<div className="@container min-w-0">{children}</div>
		</section>
	);
}
