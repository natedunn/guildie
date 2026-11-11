import { api } from "@convex/_generated/api";
import { DUNGEON_BY_KEY, dungeonArtUrl, type Readiness } from "@convex/shared/dungeons";
import { wowheadQuestUrl } from "@convex/shared/quests";
import { className as classNameOf, type Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { ClassText } from "@/components/class-name";
import { DungeonArt, MembersOnly, READINESS_LABEL } from "@/components/dungeon";
import { ItemHover, ItemIcon } from "@/components/item";
import { SectionTitle } from "@/components/page-header";

// A dungeon's page: its art, who in the guild is ready, partly ready or done
// (and what each is missing), its quests (class-only ones marked, with their
// rewards) and its bosses. Members only (dungeons:detail).

export const Route = createFileRoute("/g/$region/$slug/dungeons/$dungeon")({
	loader: async ({ context, params }) => {
		if (!DUNGEON_BY_KEY.has(params.dungeon)) throw notFound();
		await context.queryClient.ensureQueryData(
			convexQuery(api.dungeons.detail, {
				region: params.region as Region,
				slug: params.slug,
				key: params.dungeon,
			}),
		);
		return { name: DUNGEON_BY_KEY.get(params.dungeon)?.name };
	},
	head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.name ?? "Dungeon"} · Guildie` }] }),
	component: DungeonPage,
});

type Detail = NonNullable<Extract<ReturnType<typeof useDetail>, { hidden: false }>>;
type Person = Detail["people"][number];
type Quest = Detail["quests"][number];

function useDetail() {
	const params = Route.useParams();
	return useSuspenseQuery(
		convexQuery(api.dungeons.detail, { region: params.region as Region, slug: params.slug, key: params.dungeon }),
	).data;
}

function DungeonPage() {
	const data = useDetail();
	if (!data) return null;
	if (data.hidden) return <MembersOnly />;
	const { dungeon, quests, people } = data;
	const title = new Map(quests.map((q) => [q.id, q.title]));
	const by = (s: Readiness) => people.filter((p) => p.status === s);
	const under = by("under");
	const areas = DUNGEON_BY_KEY.get(dungeon.key)?.areas ?? [];
	return (
		<div className="@container space-y-6 pb-12">
			<DungeonArt src={dungeonArtUrl(dungeon.key)} className="aspect-[16/5] rounded-md border border-border" />
			<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<h2 className="text-lg font-semibold">{dungeon.name}</h2>
				<span className="num text-[0.8125rem] text-muted-foreground">
					Level {dungeon.level} · counts from level {dungeon.minLevel}
				</span>
			</div>

			<div className="grid gap-8 @4xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
				<section className="space-y-5">
					<Group label="Ready" people={by("ready")} questTitle={title} empty="Nobody is ready yet." />
					<Group label="Partly ready" people={by("partial")} questTitle={title} empty="Nobody." />
					<Group label="Completed" people={by("completed")} questTitle={title} empty="Nobody has finished it yet." />
					{under.length > 0 && (
						<p className="text-xs text-muted-foreground">
							<span className="num">{under.length}</span> more below level {dungeon.minLevel}.
						</p>
					)}
				</section>

				<div className="space-y-8">
					<section>
						<SectionTitle>Quests</SectionTitle>
						{quests.length === 0 ? (
							<p className="mt-2 text-[0.8125rem] text-muted-foreground">
								Blizzard lists no dungeon quests here for your side yet.
							</p>
						) : (
							<ul className="mt-2 divide-y divide-border rounded-md border border-border">
								{quests.map((q) => (
									<QuestRow key={q.id} quest={q} />
								))}
							</ul>
						)}
					</section>

					<section>
						<SectionTitle>Bosses</SectionTitle>
						<ol className="mt-2 grid gap-x-6 gap-y-1 text-[0.8125rem] @lg:grid-cols-2">
							{dungeon.bosses.map((b, i) => (
								<li key={b} className="flex items-baseline gap-2">
									<span className="num w-5 flex-none text-right text-xs text-muted-foreground">{i + 1}</span>
									{b}
								</li>
							))}
						</ol>
					</section>

					{areas[0] !== undefined && (
						<p className="text-xs text-muted-foreground">
							Loot tables and maps aren't in WoW: Forever's data.{" "}
							<a
								href={`https://www.wowhead.com/forever/zone=${areas[0]}`}
								target="_blank"
								rel="noreferrer"
								className="text-foreground underline underline-offset-4"
							>
								{dungeon.name} on Wowhead
							</a>
						</p>
					)}
				</div>
			</div>
		</div>
	);
}

function Group({
	label,
	people,
	questTitle,
	empty,
}: {
	label: string;
	people: Person[];
	questTitle: Map<number, string>;
	empty: string;
}) {
	const [all, setAll] = useState(false);
	const LIMIT = 12;
	const shown = all ? people : people.slice(0, LIMIT);
	return (
		<div>
			<div className="flex items-baseline gap-2">
				<SectionTitle>{label}</SectionTitle>
				<span className="num text-xs text-muted-foreground">{people.length}</span>
			</div>
			{people.length === 0 ? (
				<p className="mt-1.5 text-[0.8125rem] text-muted-foreground">{empty}</p>
			) : (
				<ul className="mt-1.5 divide-y divide-border rounded-md border border-border text-[0.8125rem]">
					{shown.map((p) => (
						<PersonRow key={p.key} person={p} questTitle={questTitle} />
					))}
					{people.length > shown.length && (
						<li>
							<button
								type="button"
								onClick={() => setAll(true)}
								className="w-full px-3 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
							>
								Show all {people.length}
							</button>
						</li>
					)}
				</ul>
			)}
		</div>
	);
}

function PersonRow({ person: p, questTitle }: { person: Person; questTitle: Map<number, string> }) {
	const params = Route.useParams();
	const names = (ids: number[]) => ids.map((id) => questTitle.get(id) ?? `Quest ${id}`).join(", ");
	let progress: ReactNode;
	if (p.total === 0) progress = "No quests for them";
	else if (p.status === "completed") progress = `All ${p.total} done`;
	else if (!p.known && p.inLog.length === 0) progress = "Quests not known yet";
	else {
		const parts = [];
		if (p.inLog.length) parts.push(`${p.inLog.length} in log`);
		if (p.done.length) parts.push(`${p.done.length} done`);
		if (p.missing.length) parts.push(`${p.missing.length} missing`);
		progress = parts.join(" · ");
	}
	const tip = [
		p.inLog.length ? `In log: ${names(p.inLog)}` : "",
		p.done.length ? `Done: ${names(p.done)}` : "",
		p.missing.length ? `Missing: ${names(p.missing)}` : "",
	]
		.filter(Boolean)
		.join("\n");
	return (
		<li className="flex items-baseline gap-2 px-3 py-1.5">
			<Link
				to="/c/$region/$slug"
				params={{ region: params.region, slug: p.key }}
				className="min-w-0 truncate underline-offset-4 hover:underline"
			>
				<ClassText classId={p.classId}>{p.name}</ClassText>
			</Link>
			<span className="num text-xs text-muted-foreground">{p.level}</span>
			{p.mine && <span className="text-xs text-muted-foreground">you</span>}
			<span className="num ml-auto truncate text-right text-xs text-muted-foreground" title={tip || undefined}>
				{progress}
			</span>
		</li>
	);
}

function QuestRow({ quest: q }: { quest: Quest }) {
	return (
		<li className="space-y-1.5 px-3 py-2 text-[0.8125rem]">
			<div className="flex items-baseline gap-2">
				<a
					href={wowheadQuestUrl(q.id)}
					target="_blank"
					rel="noreferrer"
					title="Open on Wowhead"
					className="min-w-0 truncate underline-offset-4 hover:underline"
				>
					{q.title}
				</a>
				{q.classes?.map((c) => (
					<span key={c} className="flex-none text-xs">
						<ClassText classId={c}>{classNameOf(c)}</ClassText>
						<span className="text-muted-foreground"> only</span>
					</span>
				))}
				<span className="num ml-auto flex-none text-xs text-muted-foreground">
					{[
						q.minLevel ? `Level ${q.minLevel}+` : "",
						q.inLog ? `${q.inLog} in log` : "",
						q.done ? `${q.done} done` : "",
					]
						.filter(Boolean)
						.join(" · ")}
				</span>
			</div>
			{q.rewards.length > 0 && (
				<div className="flex flex-wrap items-center gap-1.5">
					{q.rewards.map((r) => (
						<ItemHover
							key={r.itemId}
							item={{ itemId: r.itemId, name: r.name, quality: r.quality, icon: r.icon, tooltip: r.tooltip }}
						>
							<ItemIcon icon={r.icon} quality={r.quality} size={28} />
						</ItemHover>
					))}
				</div>
			)}
		</li>
	);
}
