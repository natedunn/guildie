import { createFileRoute, Link } from "@tanstack/react-router";
import { AddonList, AddonShareControl } from "@/components/addon-list";
import { useCharacter } from "@/components/character-data";
import { ago } from "@/lib/format";

// Addons: what the character's player runs in game (account-wide, so the same
// on each of their characters), if they share it with the viewer. The player
// sees their own list and picks who else can. The tab shows only when there's
// something to show (guilds.character `addons`).
export const Route = createFileRoute("/c/$region/$slug/addons")({
	component: AddonsPage,
});

function AddonsPage() {
	const data = useCharacter();
	if (!data) return null;
	const addons = data.addons;
	if (!addons) {
		return (
			<p className="surface-card px-5 py-10 text-center text-[0.8125rem] text-muted-foreground">
				This player doesn't share their addons with you.
			</p>
		);
	}
	const asOf = ago(addons.capturedAt);
	return (
		<div className="max-w-3xl">
			{addons.mine && (
				<section className="surface-card mb-6 p-4 text-[0.8125rem]">
					<p className="font-medium">Who can see your addons</p>
					<p className="mt-0.5 text-muted-foreground">
						The addons you have turned on in game, from the Guildie addon. The same on all your characters. Disabled
						addons aren't included.
					</p>
					<AddonShareControl share={addons.share} className="mt-3" />
				</section>
			)}
			{addons.list.length > 0 ? (
				<>
					<div className="mb-2 flex items-baseline justify-between gap-4">
						<span className="text-sm font-semibold">
							<span className="num">{addons.list.length}</span> addons
						</span>
						{asOf && <span className="text-xs text-muted-foreground">From the game, {asOf}</span>}
					</div>
					<AddonList list={addons.list} />
					<p className="mt-3 text-xs text-muted-foreground">
						Account-wide: the same list shows on each of this player's characters.
					</p>
				</>
			) : (
				addons.mine &&
				addons.share !== "none" && (
					<p className="text-[0.8125rem] text-muted-foreground">
						Your addons show up here after the Guildie app's next sync: <span className="text-foreground">/reload</span>{" "}
						or log out in game. It needs the{" "}
						<Link to="/settings/addon" className="text-foreground underline-offset-4 hover:underline">
							Guildie addon
						</Link>
						.
					</p>
				)
			)}
		</div>
	);
}
