import { api } from "@convex/_generated/api";
import { DUNGEON_BY_KEY, dungeonArtUrl, type Readiness } from "@convex/shared/dungeons";
import { wowheadQuestUrl } from "@convex/shared/quests";
import { className as classNameOf, type Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { CharacterAvatar } from "@/components/character-avatar";
import { ClassText } from "@/components/class-name";
import { DungeonArt, MembersOnly } from "@/components/dungeon";
import { ItemHover, ItemIcon } from "@/components/item";
import { SectionTitle } from "@/components/page-header";
import { cn } from "@/lib/utils";

// A dungeon's page: its art, three tiles (ready, partly ready, completed)
// that pick whose list shows, each person with a square per quest (done, in
// their log, missing), the quests with the guild's progress and rewards, and
// the bosses. Members only (dungeons:detail).

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
/** Quests shown as one row: the same title more than once (one per side or class) is merged. */
type QuestGroup = Quest & { ids: number[] };

function useDetail() {
	const params = Route.useParams();
	return useSuspenseQuery(
		convexQuery(api.dungeons.detail, { region: params.region as Region, slug: params.slug, key: params.dungeon }),
	).data;
}

const TILES: { status: Exclude<Readiness, "under">; label: string; hint: string }[] = [
	{ status: "ready", label: "Ready", hint: "Level, and every quest picked up or done" },
	{ status: "partial", label: "Partly ready", hint: "Level only" },
	{ status: "completed", label: "Completed", hint: "Every quest done" },
];

function DungeonPage() {
	const data = useDetail();
	if (!data) return null;
	if (data.hidden) return <MembersOnly />;
	return <Dungeon data={data} />;
}

function Dungeon({ data }: { data: Detail }) {
	const { dungeon, quests, people } = data;
	const count = (s: Readiness) => people.filter((p) => p.status === s).length;
	const [selected, setSelected] = useState<Readiness>(
		() => TILES.find((t) => count(t.status) > 0)?.status ?? "partial",
	);
	const groups = mergeQuests(quests);
	const areas = DUNGEON_BY_KEY.get(dungeon.key)?.areas ?? [];
	const under = count("under");

	return (
		<div className="@container space-y-8 pb-12">
			<div>
				<DungeonArt src={dungeonArtUrl(dungeon.key)} className="aspect-[21/6] rounded-t-md border border-border" />
				<div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-b-md border border-t-0 border-border px-4 py-3">
					<h2 className="text-lg font-semibold">{dungeon.name}</h2>
					<div className="flex flex-wrap gap-1.5 text-xs">
						<Fact label="Level" value={dungeon.level} />
						<Fact label="Counts from" value={`Lvl ${dungeon.minLevel}`} />
						<Fact label="Bosses" value={dungeon.bosses.length} />
						<Fact label="Quests" value={groups.length} />
					</div>
				</div>
			</div>

			<section>
				<div className="grid grid-cols-3 gap-2">
					{TILES.map((t) => (
						<button
							key={t.status}
							type="button"
							onClick={() => setSelected(t.status)}
							aria-pressed={selected === t.status}
							className={cn(
								"rounded-md border px-4 py-3 text-left transition-colors",
								selected === t.status
									? "border-foreground/40 bg-[var(--selected)]"
									: "border-border hover:border-foreground/20",
							)}
						>
							<div className="num text-3xl leading-none font-semibold">{count(t.status)}</div>
							<div className="mt-1.5 text-[0.8125rem] font-medium">{t.label}</div>
							<div className="mt-0.5 hidden text-xs text-muted-foreground @lg:block">{t.hint}</div>
						</button>
					))}
				</div>
				<PeopleList people={people.filter((p) => p.status === selected)} groups={groups} status={selected} />
				{under > 0 && (
					<button
						type="button"
						onClick={() => setSelected("under")}
						className={cn(
							"mt-2 text-xs underline-offset-4 hover:underline",
							selected === "under" ? "text-foreground" : "text-muted-foreground",
						)}
					>
						<span className="num">{under}</span> below level {dungeon.minLevel}
					</button>
				)}
			</section>

			<div className="grid gap-8 @4xl:grid-cols-[minmax(0,1fr)_16rem]">
				<section>
					<SectionTitle>Quests</SectionTitle>
					{groups.length === 0 ? (
						<p className="mt-2 text-[0.8125rem] text-muted-foreground">
							Blizzard lists no dungeon quests here for your side.
						</p>
					) : (
						<div className="mt-2 overflow-x-auto rounded-md border border-border">
							<table className="w-full min-w-[34rem] text-[0.8125rem]">
								<thead>
									<tr className="border-b border-border text-left text-xs text-muted-foreground">
										<th className="px-3 py-2 font-medium">Quest</th>
										<th className="w-40 px-3 py-2 font-medium">Guild</th>
										<th className="w-36 px-3 py-2 font-medium">Rewards</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border">
									{groups.map((q) => (
										<QuestRow key={q.id} quest={q} members={people.length} />
									))}
								</tbody>
							</table>
						</div>
					)}
				</section>

				<section>
					<SectionTitle>Bosses</SectionTitle>
					<ol className="mt-2 space-y-px">
						{dungeon.bosses.map((b, i) => (
							<li key={b} className="flex items-center gap-2.5 rounded-md px-2 py-1 text-[0.8125rem]">
								<span className="num grid size-5 flex-none place-items-center rounded-full border border-border text-[10px] text-muted-foreground">
									{i + 1}
								</span>
								{b}
							</li>
						))}
					</ol>
					{areas[0] !== undefined && (
						<a
							href={`https://www.wowhead.com/forever/zone=${areas[0]}`}
							target="_blank"
							rel="noreferrer"
							className="mt-3 inline-block text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
						>
							Loot and map on Wowhead
						</a>
					)}
				</section>
			</div>
		</div>
	);
}

function Fact({ label, value }: { label: string; value: string | number }) {
	return (
		<span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1">
			<span className="text-muted-foreground">{label}</span>
			<span className="num font-medium">{value}</span>
		</span>
	);
}

/** One row per quest title; ids kept so a person's squares follow the table's order. */
function mergeQuests(quests: Quest[]): QuestGroup[] {
	const out: QuestGroup[] = [];
	for (const q of quests) {
		const same = out.find((o) => o.title === q.title && JSON.stringify(o.classes) === JSON.stringify(q.classes));
		if (same) {
			same.ids.push(q.id);
			same.done += q.done;
			same.inLog += q.inLog;
			for (const r of q.rewards) if (!same.rewards.some((x) => x.itemId === r.itemId)) same.rewards.push(r);
		} else out.push({ ...q, ids: [q.id], rewards: [...q.rewards] });
	}
	return out;
}

function PeopleList({ people, groups, status }: { people: Person[]; groups: QuestGroup[]; status: Readiness }) {
	const [all, setAll] = useState(false);
	const LIMIT = 18;
	const shown = all ? people : people.slice(0, LIMIT);
	if (people.length === 0) {
		return (
			<p className="mt-3 rounded-md border border-dashed border-border px-4 py-6 text-center text-[0.8125rem] text-muted-foreground">
				{status === "ready"
					? "Nobody is ready yet."
					: status === "completed"
						? "Nobody has finished it yet."
						: "Nobody here."}
			</p>
		);
	}
	return (
		<div className="mt-3">
			<ul className="grid gap-2 @3xl:grid-cols-2 @6xl:grid-cols-3">
				{shown.map((p) => (
					<PersonRow key={p.key} person={p} groups={groups} />
				))}
			</ul>
			<div className="mt-2 flex flex-wrap items-center justify-between gap-2">
				<Legend />
				{people.length > shown.length && (
					<button
						type="button"
						onClick={() => setAll(true)}
						className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
					>
						Show all {people.length}
					</button>
				)}
			</div>
		</div>
	);
}

type Mark = "done" | "log" | "missing";

function PersonRow({ person: p, groups }: { person: Person; groups: QuestGroup[] }) {
	const params = Route.useParams();
	const state = (id: number): Mark | undefined =>
		p.done.includes(id) ? "done" : p.inLog.includes(id) ? "log" : p.missing.includes(id) ? "missing" : undefined;
	// A square per quest of theirs, in the table's order.
	const marks = groups.flatMap((g) => {
		const states = g.ids.map(state).filter((s): s is Mark => s !== undefined);
		if (!states.length) return [];
		const best: Mark = states.includes("done") ? "done" : states.includes("log") ? "log" : "missing";
		return [{ title: g.title, mark: best }];
	});
	const done = marks.filter((m) => m.mark === "done").length;
	return (
		<li className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
			<CharacterAvatar url={p.avatarUrl} size={28} className="rounded-full" />
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline gap-2">
					<Link
						to="/c/$region/$slug"
						params={{ region: params.region, slug: p.key }}
						className="truncate text-[0.8125rem] font-medium underline-offset-4 hover:underline"
					>
						<ClassText classId={p.classId}>{p.name}</ClassText>
					</Link>
					{p.mine && (
						<span className="rounded-sm border border-border px-1 text-[10px] text-muted-foreground">You</span>
					)}
				</div>
				<div className="num text-xs text-muted-foreground">Lvl {p.level}</div>
			</div>
			{marks.length === 0 ? (
				<span className="text-xs text-muted-foreground">No quests for them</span>
			) : !p.known && !p.inLog.length ? (
				<span className="text-xs text-muted-foreground">Quests not known yet</span>
			) : (
				<div className="flex items-center gap-2.5">
					<div className="flex flex-wrap justify-end gap-1">
						{marks.map((m, i) => (
							<Square key={`${m.title}-${i}`} mark={m.mark} title={`${m.title}: ${MARK_LABEL[m.mark]}`} />
						))}
					</div>
					<span className="num w-9 text-right text-xs text-muted-foreground">
						{done}/{marks.length}
					</span>
				</div>
			)}
		</li>
	);
}

const MARK_LABEL: Record<Mark, string> = { done: "done", log: "in their quest log", missing: "not picked up" };

function Square({ mark, title }: { mark: Mark; title?: string }) {
	return (
		<span
			title={title}
			className={cn(
				"inline-block size-2.5 rounded-[2px] border",
				mark === "done" && "border-foreground/80 bg-foreground/80",
				mark === "log" && "border-foreground/60 bg-foreground/30",
				mark === "missing" && "border-foreground/30",
			)}
		/>
	);
}

function Legend({ className }: { className?: string }) {
	return (
		<div className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
			<span className="inline-flex items-center gap-1.5">
				<Square mark="done" /> Done
			</span>
			<span className="inline-flex items-center gap-1.5">
				<Square mark="log" /> In quest log
			</span>
			<span className="inline-flex items-center gap-1.5">
				<Square mark="missing" /> Not picked up
			</span>
		</div>
	);
}

function QuestRow({ quest: q, members }: { quest: QuestGroup; members: number }) {
	const pct = (n: number) => `${Math.min(100, (n / Math.max(members, 1)) * 100)}%`;
	return (
		<tr className="align-middle">
			<td className="px-3 py-2.5">
				<a
					href={wowheadQuestUrl(q.id)}
					target="_blank"
					rel="noreferrer"
					title="Open on Wowhead"
					className="underline-offset-4 hover:underline"
				>
					{q.title}
				</a>
				<div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
					{q.minLevel ? <span className="num">Lvl {q.minLevel}+</span> : null}
					{q.classes?.map((c) => (
						<span key={c}>
							<ClassText classId={c}>{classNameOf(c)}</ClassText> only
						</span>
					))}
				</div>
			</td>
			<td className="px-3 py-2.5">
				<div
					className="flex h-1.5 overflow-hidden rounded-full bg-muted"
					title={`${q.done} done, ${q.inLog} in their quest log, of ${members}`}
				>
					<div className="bg-foreground/80" style={{ width: pct(q.done) }} />
					<div className="bg-foreground/35" style={{ width: pct(q.inLog) }} />
				</div>
				<div className="num mt-1 text-xs text-muted-foreground">
					{q.done} done{q.inLog ? ` · ${q.inLog} in log` : ""}
				</div>
			</td>
			<td className="px-3 py-2.5">
				{q.rewards.length ? (
					<div className="flex flex-wrap gap-1">
						{q.rewards.map((r) => (
							<ItemHover
								key={r.itemId}
								item={{ itemId: r.itemId, name: r.name, quality: r.quality, icon: r.icon, tooltip: r.tooltip }}
							>
								<ItemIcon icon={r.icon} quality={r.quality} size={26} />
							</ItemHover>
						))}
					</div>
				) : (
					<span
						className="text-xs text-muted-foreground"
						title="Blizzard's data doesn't list item rewards for every quest, so this one may still have some. Wowhead has the full list."
					>
						Not listed
					</span>
				)}
			</td>
		</tr>
	);
}
