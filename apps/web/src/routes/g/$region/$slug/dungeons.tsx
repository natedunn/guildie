import { api } from "@convex/_generated/api";
import { wowheadQuestUrl } from "@convex/shared/quests";
import type { Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ClassText } from "@/components/class-name";
import { SectionTitle } from "@/components/page-header";

// Dungeons: the dungeon and raid quests the guild's members have in
// progress, by dungeon ("The Deadmines: you (2 quests), Brisket, Miller"), so
// people can see who to group with. Members only (quests:guild). Your own
// quest logs, with every quest and its progress: Personal → Quests.

export const Route = createFileRoute("/g/$region/$slug/dungeons")({
	loader: async ({ context, params }) => {
		await context.queryClient.ensureQueryData(
			convexQuery(api.quests.guild, { region: params.region as Region, slug: params.slug }),
		);
	},
	component: DungeonsPage,
});

function DungeonsPage() {
	const params = Route.useParams();
	const { data } = useSuspenseQuery(
		convexQuery(api.quests.guild, { region: params.region as Region, slug: params.slug }),
	);
	if (!data) return null;
	if (data.hidden) {
		return (
			<p className="pb-12 text-[0.8125rem] text-muted-foreground">
				Only the guild's members see who's on which dungeon quest.{" "}
				<Link to="/settings" className="text-foreground underline underline-offset-4">
					Claim your characters
				</Link>{" "}
				if you're one of them.
			</p>
		);
	}
	return (
		<div className="max-w-4xl space-y-6 pb-12">
			<p className="text-[0.8125rem] text-muted-foreground">
				Dungeon and raid quests members have in progress, by dungeon: who to group with.{" "}
				<span className="num">
					{data.withLogs} of {data.members}
				</span>{" "}
				members' quest logs, from Blizzard (as of their last logout) or the Guildie addon.{" "}
				<Link to="/quests" className="text-foreground underline underline-offset-4">
					Your quests
				</Link>
			</p>
			{data.dungeons.length === 0 ? (
				<p className="text-[0.8125rem] text-muted-foreground">Nobody has a dungeon quest in progress.</p>
			) : (
				<div className="space-y-4">
					{data.dungeons.map((d) => {
						const title = new Map(d.quests.map((q) => [q.id, q.title]));
						return (
							<section key={d.area} className="@container rounded-md border border-border px-4 py-3">
								<div className="flex items-baseline justify-between gap-3">
									<SectionTitle className="truncate">{d.area}</SectionTitle>
									<span className="num flex-none text-xs text-muted-foreground">
										{d.type} · {d.people.length} {d.people.length === 1 ? "person" : "people"}
									</span>
								</div>
								<div className="mt-2 grid gap-x-8 gap-y-3 text-[0.8125rem] @2xl:grid-cols-2">
									<ul className="space-y-1">
										{d.people.map((p) => (
											<li key={p.key} className="flex items-baseline gap-2">
												<Link
													to="/c/$region/$slug"
													params={{ region: params.region, slug: p.key }}
													className="min-w-0 truncate hover:underline underline-offset-4"
												>
													<ClassText classId={p.classId}>{p.name}</ClassText>
												</Link>
												<span className="num text-xs text-muted-foreground">{p.level}</span>
												{p.mine && <span className="text-xs text-muted-foreground">you</span>}
												<span
													className="ml-auto min-w-0 truncate text-right text-xs text-muted-foreground"
													title={p.questIds.map((id) => title.get(id)).join(", ")}
												>
													{p.questIds.length === 1 ? title.get(p.questIds[0]) : `${p.questIds.length} quests`}
												</span>
											</li>
										))}
									</ul>
									<ul className="space-y-1">
										{d.quests.map((q) => (
											<li key={q.id} className="flex items-baseline gap-2">
												{q.level !== undefined && (
													<span className="num w-6 flex-none text-right text-xs text-muted-foreground">{q.level}</span>
												)}
												<a
													href={wowheadQuestUrl(q.id)}
													target="_blank"
													rel="noreferrer"
													className="min-w-0 flex-1 truncate hover:underline underline-offset-4"
													title="Open on Wowhead"
												>
													{q.title}
												</a>
												<span className="num flex-none text-xs text-muted-foreground">{q.holders}</span>
											</li>
										))}
									</ul>
								</div>
							</section>
						);
					})}
				</div>
			)}
		</div>
	);
}
