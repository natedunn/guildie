import { createFileRoute } from "@tanstack/react-router";
import { sourceNote, useCharacter } from "@/components/character-data";
import { PaperDoll } from "@/components/paper-doll";
import { CanUse } from "@/components/proficiencies";

// Gear: the paper doll, and what the class can wear and wield at their
// level. The layout route loads the character.
export const Route = createFileRoute("/c/$region/$slug/")({
	component: GearPage,
});

function GearPage() {
	const data = useCharacter();
	if (!data) return null;
	const c = data.character;
	const fromGame = data.sources.gear.kind === "addon";
	const canUse = <CanUse classId={c.classId} level={c.level} className="mt-6 max-w-2xl" />;
	if (c.profileMissing && !fromGame) {
		return (
			<>
				<p className="max-w-xl text-sm text-muted-foreground">
					Blizzard hasn't published this character's profile yet. That happens once they're level 10 and log out.
				</p>
				{canUse}
			</>
		);
	}
	return (
		<>
			<PaperDoll character={c} />
			<p className="mt-3 text-xs text-muted-foreground">{sourceNote(data.sources.gear)}</p>
			{canUse}
		</>
	);
}
