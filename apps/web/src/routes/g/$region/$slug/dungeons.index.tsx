import { api } from "@convex/_generated/api";
import { dungeonArtUrl } from "@convex/shared/dungeons";
import type { Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DungeonArt, MembersOnly, READINESS_LABEL } from "@/components/dungeon";
import { cn } from "@/lib/utils";

// Dungeons: a card per dungeon (art from the game's loading screens), lowest
// level first, with how many members have completed it, are ready (level and
// every quest for them in their log or done) and partly ready (level only).
// A card opens the dungeon's page. Members only (dungeons:guild).

export const Route = createFileRoute("/g/$region/$slug/dungeons/")({
	loader: async ({ context, params }) => {
		await context.queryClient.ensureQueryData(
			convexQuery(api.dungeons.guild, { region: params.region as Region, slug: params.slug }),
		);
	},
	component: DungeonsPage,
});

function DungeonsPage() {
	const params = Route.useParams();
	const { data } = useSuspenseQuery(
		convexQuery(api.dungeons.guild, { region: params.region as Region, slug: params.slug }),
	);
	if (!data) return null;
	if (data.hidden) return <MembersOnly />;
	return (
		<div className="@container space-y-4 pb-12">
			<p className="max-w-3xl text-[0.8125rem] text-muted-foreground">
				Who's ready for each dungeon: <span className="text-foreground">ready</span> means the level and every dungeon
				quest for their class in their log or done, <span className="text-foreground">partly</span> just the level.
				Turned-in quests come from Blizzard as of each member's last logout (
				<span className="num">
					{data.withCompleted} of {data.members}
				</span>{" "}
				so far).
			</p>
			<div className="grid gap-3 @xl:grid-cols-2 @5xl:grid-cols-3">
				{data.dungeons.map((d) => (
					<Link
						key={d.key}
						to="/g/$region/$slug/dungeons/$dungeon"
						params={{ region: params.region, slug: params.slug, dungeon: d.key }}
						className="group overflow-hidden rounded-md border border-border bg-card transition-colors hover:border-foreground/25"
					>
						<DungeonArt src={dungeonArtUrl(d.key)} className="aspect-[12/5]" />
						<div className="space-y-3 px-3.5 py-3">
							<div>
								<div className="flex items-baseline justify-between gap-3">
									<h3 className="truncate font-semibold">{d.name}</h3>
									<span className="num flex-none text-xs text-muted-foreground">Level {d.level}</span>
								</div>
								<p className="num mt-0.5 text-xs text-muted-foreground">
									{d.bosses} {d.bosses === 1 ? "boss" : "bosses"} · {d.quests} {d.quests === 1 ? "quest" : "quests"}
									{d.classQuests > 0 && ` (${d.classQuests} for one class)`}
								</p>
							</div>
							<dl className="grid grid-cols-3 divide-x divide-border rounded-md border border-border">
								<Stat label="Ready" value={d.counts.ready} strong />
								<Stat label="Partly" value={d.counts.partial} />
								<Stat label="Completed" value={d.counts.completed} />
							</dl>
							{d.mine.length > 0 && (
								<p className="truncate text-xs text-muted-foreground">
									{d.mine.map((m, i) => (
										<span key={m.name}>
											{i > 0 && " · "}
											{m.name}: <span className="text-foreground">{READINESS_LABEL[m.status].toLowerCase()}</span>
										</span>
									))}
								</p>
							)}
						</div>
					</Link>
				))}
			</div>
		</div>
	);
}

function Stat({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
	return (
		<div className="px-2.5 py-1.5">
			<dt className="text-[11px] text-muted-foreground">{label}</dt>
			<dd
				className={cn("num text-base leading-tight", strong ? "font-semibold" : value === 0 && "text-muted-foreground")}
			>
				{value}
			</dd>
		</div>
	);
}
