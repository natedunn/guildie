import { className, raceName } from "@convex/shared/wow";
import { createFileRoute, Link, notFound, Outlet } from "@tanstack/react-router";
import { CharacterAvatar, UNFETCHED_NOTE } from "@/components/character-avatar";
import { characterQuery, sourceNote, useCharacter } from "@/components/character-data";
import { ClassText } from "@/components/class-name";
import { PageTab, PageTabs } from "@/components/page-tabs";
import { ago, rankLabel } from "@/lib/format";
import { shareMeta } from "@/lib/share";

// A character's pages: gear (index), talents and professions. The header and
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
	return (
		<div className="w-full max-w-5xl py-5">
			<header className="flex items-center gap-3">
				<CharacterAvatar url={c.avatarUrl} size={48} className="rounded-md" />
				<div className="min-w-0 flex-1">
					<h1 className="truncate text-lg font-semibold leading-tight">
						<ClassText classId={c.classId}>{c.name}</ClassText>
						{c.surname && <span className="font-normal text-muted-foreground"> {c.surname}</span>}
					</h1>
					<p className="mt-0.5 text-[13px] text-muted-foreground">
						<span className="num" title={sourceNote(data.sources.level)}>
							Level {c.level} {raceName(c.raceId)} {className(c.classId)}
						</span>
						{" · "}
						<Link
							to="/g/$region/$slug"
							params={{ region: guild.region, slug: guild.slug }}
							className="text-foreground hover:underline underline-offset-4"
						>
							{guild.name}
						</Link>
						{`, ${rankLabel(c.rank)}`}
						{seen && ` · last synced ${seen}${inGame ? " in game" : ""}`}
					</p>
				</div>
				{c.averageItemLevel !== undefined && (
					<div className="shrink-0 text-right leading-tight">
						<div className="num text-lg font-semibold" title={sourceNote(data.sources.gear)}>
							{c.averageItemLevel}
						</div>
						<div className="text-xs text-muted-foreground">Item level</div>
					</div>
				)}
			</header>

			{unfetched ? (
				// Nothing to show yet: no tabs, no gear, just why.
				<div className="mt-8 flex flex-col items-center rounded-md border border-border px-6 py-14 text-center select-none">
					<CharacterAvatar size={64} className="rounded-full" />
					<p className="mt-4 font-medium">No details yet</p>
					<p className="mt-1 max-w-md text-[0.8125rem] text-muted-foreground">{UNFETCHED_NOTE}</p>
				</div>
			) : (
				<>
					<PageTabs className="mt-4">
						<PageTab to="/c/$region/$slug" params={params}>
							Gear
						</PageTab>
						<PageTab to="/c/$region/$slug/talents" params={params}>
							Talents
						</PageTab>
						<PageTab to="/c/$region/$slug/professions" params={params}>
							Professions
						</PageTab>
					</PageTabs>

					<div className="pt-5">
						<Outlet />
					</div>
				</>
			)}
		</div>
	);
}
