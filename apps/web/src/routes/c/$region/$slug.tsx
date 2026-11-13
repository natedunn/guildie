import { className, raceName } from "@convex/shared/wow";
import { createFileRoute, Link, notFound, Outlet } from "@tanstack/react-router";
import { CharacterAvatar, UNFETCHED_NOTE } from "@/components/character-avatar";
import { characterQuery, sourceNote, useCharacter } from "@/components/character-data";
import { ClassText } from "@/components/class-name";
import { PageTab, PageTabs } from "@/components/page-tabs";
import { ago, rankLabel } from "@/lib/format";
import { shareMeta } from "@/lib/share";

// A character's pages: gear (index), talents, professions, the player's addons
// (if shared with the viewer) and, for the player who claimed them, preferences. The header and
// tabs live here so they stay put while the tabs switch.
export const Route = createFileRoute("/c/$region/$slug")({
	loader: async ({ context, params }) => {
		const data = await context.queryClient.ensureQueryData(characterQuery(params.region, params.slug));
		if (!data) throw notFound();
		const c = data.character;
		const name = `${c.name} ${c.surname ?? ""}`.trim();
		// What a shared link's preview says.
		const description = `Level ${c.level} ${raceName(c.raceId)} ${className(c.classId)} in ${data.guild.name}: gear, talents and professions on Guildie.`;
		return { name, guild: data.guild, description };
	},
	head: ({ loaderData }) => ({
		meta: [
			{ title: `${loaderData?.name ?? "Character"} · Guildie` },
			...(loaderData ? shareMeta(loaderData.name, loaderData.description) : []),
		],
	}),
	component: CharacterLayout,
});

function CharacterLayout() {
	const params = Route.useParams();
	const data = useCharacter();
	if (!data) return null;
	const { character: c, guild } = data;
	// Last synced: an in-game sync by the Guildie app when any of it is newer, else Blizzard's last logout.
	const seen = ago(data.synced?.at);
	const inGame = data.synced?.kind === "app";
	// Never published by Blizzard, and nothing from the game either.
	const unfetched = !data.synced;
	const ilvl = c.averageItemLevel;
	return (
		<div className="@container w-full max-w-5xl pb-5">
			{/* The character's own hero: their portrait in a lit frame, a faded
			    title, and the facts (and item level) beside it. */}
			<header className="flex items-center gap-4 pt-6 pb-1 @lg:gap-5">
				<div className="surface-card shrink-0 rounded-[10px] p-1">
					<CharacterAvatar url={c.avatarUrl} size={56} className="rounded-[6px] border-white/[0.06] @lg:hidden" />
					<CharacterAvatar url={c.avatarUrl} size={76} className="hidden rounded-[6px] border-white/[0.06] @lg:block" />
				</div>
				<div className="min-w-0 flex-1">
					<h1 className="heading-display text-fade truncate pb-0.5 text-[1.375rem] @lg:text-[1.75rem]">
						<ClassText classId={c.classId}>{c.name}</ClassText>
						{c.surname && <span className="font-medium"> {c.surname}</span>}
					</h1>
					<p className="mt-1 text-[0.8125rem] text-muted-foreground">
						<span className="num" title={sourceNote(data.sources.level)}>
							Level {c.level} {raceName(c.raceId)} {className(c.classId)}
						</span>
						{" · "}
						<Link
							to="/g/$region/$slug"
							params={{ region: guild.region, slug: guild.slug }}
							className="text-foreground underline-offset-4 hover:underline"
						>
							{guild.name}
						</Link>
						{`, ${rankLabel(c.rank)}`}
					</p>
					{(seen || ilvl !== undefined) && (
						<div className="mt-2 flex flex-wrap gap-1.5">
							{ilvl !== undefined && (
								<span className="pill num py-0.5 @xl:hidden" title={sourceNote(data.sources.gear)}>
									Item level <span className="text-foreground">{ilvl}</span>
								</span>
							)}
							{seen && (
								<span className="pill py-0.5">
									Synced {seen}
									{inGame ? " in game" : ""}
								</span>
							)}
						</div>
					)}
				</div>
				{ilvl !== undefined && (
					<div className="hidden shrink-0 self-start pt-1 text-right @xl:block">
						<div
							className="num heading-display text-fade text-[1.75rem] leading-none"
							title={sourceNote(data.sources.gear)}
						>
							{ilvl}
						</div>
						<div className="mt-1.5 text-xs text-muted-foreground">Item level</div>
					</div>
				)}
			</header>

			{unfetched ? (
				// Nothing to show yet: no tabs, no gear, just why.
				<div className="surface-card mt-8 flex flex-col items-center px-6 py-14 text-center select-none">
					<CharacterAvatar size={64} className="rounded-full" />
					<p className="mt-4 font-medium">No details yet</p>
					<p className="mt-1 max-w-md text-[0.8125rem] text-muted-foreground">{UNFETCHED_NOTE}</p>
				</div>
			) : (
				<>
					<PageTabs className="mt-5">
						<PageTab to="/c/$region/$slug" params={params}>
							Gear
						</PageTab>
						<PageTab to="/c/$region/$slug/talents" params={params}>
							Talents
						</PageTab>
						<PageTab to="/c/$region/$slug/professions" params={params}>
							Professions
						</PageTab>
						{data.addons && (
							<PageTab to="/c/$region/$slug/addons" params={params}>
								Addons
							</PageTab>
						)}
						{data.canEdit && (
							<PageTab to="/c/$region/$slug/preferences" params={params}>
								Preferences
							</PageTab>
						)}
					</PageTabs>

					<div className="pt-5">
						<Outlet />
					</div>
				</>
			)}
		</div>
	);
}
