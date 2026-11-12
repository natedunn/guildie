import { api } from "@convex/_generated/api";
import { dungeonArtUrl } from "@convex/shared/dungeons";
import type { Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { DoneMark, DungeonArt, MembersOnly, ViewAs, viewAsSearch, viewerKey } from "@/components/dungeon";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Dungeons: a card per dungeon, lowest level first: its loading-screen art,
// name, level range (its level up to its highest quest for the guild's
// side), how many members are level ready and quest ready, and a gold check
// (with a tooltip) when the guildmate picked in "View as" has turned in all
// its quests. The whole card opens the dungeon. Up
// top: a search by name, and "View as" with how many dungeons they've
// completed. `?as=` carries over to a dungeon's page. Members only
// (dungeons:guild).

export const Route = createFileRoute("/g/$region/$slug/dungeons/")({
	validateSearch: viewAsSearch,
	loader: async ({ context, params }) => {
		await context.queryClient.ensureQueryData(
			convexQuery(api.dungeons.guild, { region: params.region as Region, slug: params.slug }),
		);
	},
	component: DungeonsPage,
});

function DungeonsPage() {
	const params = Route.useParams();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const [q, setQ] = useState("");
	const { data } = useSuspenseQuery(
		convexQuery(api.dungeons.guild, { region: params.region as Region, slug: params.slug }),
	);
	if (!data) return null;
	if (data.hidden) return <MembersOnly />;
	const viewer = viewerKey(data.people, search.as);
	const person = data.people.find((p) => p.key === viewer);
	const shown = data.dungeons.filter((d) => d.name.toLowerCase().includes(q.trim().toLowerCase()));

	return (
		<div className="@container pb-12">
			<div className="mb-4 flex flex-wrap items-center gap-3">
				<div className="relative w-full @lg:w-64">
					<HugeiconsIcon
						icon={Search01Icon}
						size={14}
						strokeWidth={1.75}
						className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
					/>
					<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search dungeons" className="pl-8" />
				</div>
				<div className="ml-auto flex items-center gap-3">
					{person && (
						<span className="num text-xs text-muted-foreground">
							{person.known ? (
								<>
									<span className="text-foreground">{person.complete.length}</span> of {person.available.length}{" "}
									dungeons complete
								</>
							) : (
								"Turned-in quests not known yet"
							)}
						</span>
					)}
					<ViewAs
						people={data.people}
						value={viewer}
						onChange={(as) => navigate({ search: (s) => ({ ...s, as }), replace: true })}
					/>
				</div>
			</div>

			{shown.length === 0 ? (
				<p className="text-[0.8125rem] text-muted-foreground">No dungeon by that name.</p>
			) : (
				<div className="grid grid-cols-1 gap-3 @lg:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4">
					{shown.map((d) => {
						const complete = person?.complete.includes(d.key);
						return (
							<div key={d.key} className="relative">
								{/* The whole card opens the dungeon; hovering it underlines the name. */}
								<Link
									to="/g/$region/$slug/dungeons/$dungeon"
									params={{ region: params.region, slug: params.slug, dungeon: d.key }}
									search={{ as: viewer }}
									className="group block overflow-hidden rounded-md border border-border bg-card transition-colors hover:border-foreground/25"
								>
									<DungeonArt src={dungeonArtUrl(d.key)} className="aspect-[2/1]" />
									<div className="border-t border-border px-3 py-2.5">
										<div className="flex items-baseline gap-2">
											<span className="truncate text-base font-semibold underline-offset-4 group-hover:underline">
												{d.name}
											</span>
											<span className="num flex-none text-xs text-muted-foreground">
												Lvl {d.levelMax > d.level ? `${d.level}–${d.levelMax}` : d.level}
											</span>
										</div>
										<div className="mt-1.5 flex items-center justify-between gap-3">
											<p className="num truncate text-xs text-muted-foreground">
												<span className={d.counts.levelReady ? "text-foreground" : undefined}>
													{d.counts.levelReady}
												</span>{" "}
												level ready ·{" "}
												<span className={d.counts.questReady ? "text-foreground" : undefined}>
													{d.counts.questReady}
												</span>{" "}
												quest ready
											</p>
											<span className="inline-flex h-7 flex-none items-center rounded-md border border-input px-2.5 text-xs font-medium transition-colors hover:border-foreground/40 hover:bg-foreground/10">
												Details
											</span>
										</div>
									</div>
								</Link>
								{/* Outside the link, so hovering it shows its tooltip, not the card's hover. */}
								{complete && person && (
									<Tooltip>
										<TooltipTrigger
											render={<span className="absolute top-2 right-2 rounded-full bg-[rgb(19_17_14/0.7)]" />}
										>
											<DoneMark
												label={`${person.name} has completed this`}
												className="size-8 border-[1.5px]"
												iconSize={16}
											/>
										</TooltipTrigger>
										<TooltipContent>{person.name} has completed this</TooltipContent>
									</Tooltip>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
