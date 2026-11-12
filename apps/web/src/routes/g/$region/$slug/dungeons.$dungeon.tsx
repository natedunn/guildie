import { api } from "@convex/_generated/api";
import { DUNGEON_RESOURCES } from "@convex/shared/dungeonResources";
import { DUNGEON_BY_KEY, dungeonArtUrl } from "@convex/shared/dungeons";
import { questDifficulty, wowheadQuestUrl } from "@convex/shared/quests";
import { className as classNameOf, type Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { Fragment, type ReactNode, useState } from "react";
import { CharacterAvatar } from "@/components/character-avatar";
import { ClassText } from "@/components/class-name";
import { DoneMark, DungeonArt, MembersOnly, ViewAs, viewAsSearch, viewerKey } from "@/components/dungeon";
import { SectionTitle } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// A dungeon's page: a header (small art, name, level, how the guild stands),
// the roster with a column each for level, quests picked up and quests
// turned in, and the dungeon's quests for the guild's side, on their own or
// as whole chains, colored by level and ticked for one guildmate ("View
// as"), then links to read up on it. It replaces the guild's header
// ($slug.tsx). Members only
// (dungeons:detail).

export const Route = createFileRoute("/g/$region/$slug/dungeons/$dungeon")({
	validateSearch: viewAsSearch,
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

function useDetail() {
	const params = Route.useParams();
	return useSuspenseQuery(
		convexQuery(api.dungeons.detail, { region: params.region as Region, slug: params.slug, key: params.dungeon }),
	).data;
}

function DungeonPage() {
	const data = useDetail();
	if (!data) return null;
	if (data.hidden) {
		return (
			<div className="pt-6">
				<MembersOnly />
			</div>
		);
	}
	return <Dungeon data={data} />;
}

function Dungeon({ data }: { data: Detail }) {
	const { dungeon, quests, items, people, side } = data;
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const viewer = viewerKey(people, search.as);
	const setViewer = (as: string) => navigate({ search: (s) => ({ ...s, as }), replace: true });
	const viewing = people.find((p) => p.key === viewer);
	const count = (f: (p: Person) => boolean | undefined) => people.filter((p) => f(p)).length;
	const sideName = side === "horde" ? "Horde" : side === "alliance" ? "Alliance" : undefined;

	return (
		<div className="@container pb-12">
			<header className="flex items-center gap-5 pt-6 pb-6">
				<DungeonArt
					src={dungeonArtUrl(dungeon.key)}
					className="hidden h-32 w-60 flex-none rounded-md border border-border @md:block"
				/>
				<div className="min-w-0">
					<h1 className="truncate text-xl font-semibold tracking-tight">{dungeon.name}</h1>
					<p className="num mt-1 text-[0.8125rem] text-muted-foreground">
						Level {dungeon.level} · {quests} {quests === 1 ? "quest" : "quests"}
						{sideName && ` for the ${sideName}`}
					</p>
					<p className="num mt-0.5 text-[0.8125rem] text-muted-foreground">
						<span className="text-foreground">{count((p) => p.levelReady)}</span> of {people.length} level ready ·{" "}
						<span className="text-foreground">{count((p) => p.questReady)}</span> quest ready ·{" "}
						<span className="text-foreground">{count((p) => p.questsCompleted)}</span> done with its quests
					</p>
				</div>
			</header>

			<div className="grid gap-8 @5xl:grid-cols-[minmax(0,1fr)_32rem]">
				<section>
					<SectionTitle>Roster</SectionTitle>
					<Roster people={people} level={dungeon.level} />
				</section>
				<section className="order-first @5xl:order-none">
					<div className="flex items-center justify-between gap-3">
						<SectionTitle>Quests</SectionTitle>
						<ViewAs people={people} value={viewer} onChange={setViewer} />
					</div>
					{viewing && !viewing.questsDone && (
						<p className="mt-2 text-xs text-muted-foreground">
							{viewing.name}'s turned-in quests aren't known yet (Blizzard publishes them at logout), so only the ones
							in their log are marked.
						</p>
					)}
					<QuestList items={items} viewer={viewing} />
					<Resources dungeonKey={dungeon.key} name={dungeon.name} />
				</section>
			</div>
		</div>
	);
}

// ---- Roster ---------------------------------------------------------------------------

function Roster({ people, level }: { people: Person[]; level: number }) {
	const params = Route.useParams();
	if (people.length === 0) {
		return <p className="mt-2 text-[0.8125rem] text-muted-foreground">Nobody in the roster yet.</p>;
	}
	return (
		<Table className="mt-2">
			<TableHeader>
				<TableRow>
					<TableHead>Name</TableHead>
					<TableHead className="w-24 text-right">Level</TableHead>
					<TableHead className="w-28 text-right">Picked up</TableHead>
					<TableHead className="w-28 text-right">Completed</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{people.map((p) => (
					<TableRow key={p.key}>
						<TableCell>
							<span className="flex items-center gap-2.5">
								<CharacterAvatar url={p.avatarUrl} size={22} className="rounded-full" />
								<Link
									to="/c/$region/$slug"
									params={{ region: params.region, slug: p.key }}
									className="truncate font-medium underline-offset-4 hover:underline"
								>
									<ClassText classId={p.classId}>{p.name}</ClassText>
								</Link>
							</span>
						</TableCell>
						<TableCell className="text-right">
							<Check ok={p.levelReady} title={p.levelReady ? undefined : `Under level ${level}`}>
								{p.level}
							</Check>
						</TableCell>
						<TableCell className="text-right">
							{p.toPickUp === 0 ? (
								<None title="No quests here for them" />
							) : (
								<Check
									ok={p.questReady}
									title={p.missing.length ? `Not picked up: ${p.missing.join(", ")}` : undefined}
								>
									{p.pickedUp}/{p.toPickUp}
								</Check>
							)}
						</TableCell>
						<TableCell className="text-right">
							{p.total === 0 ? (
								<None title="No quests here for them" />
							) : !p.known ? (
								<None title="Turned-in quests not known yet (Blizzard publishes them at logout)" />
							) : (
								<Check ok={!!p.questsCompleted}>
									{p.done}/{p.total}
								</Check>
							)}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

/** A value with the done mark when it's met; muted when it isn't. */
function Check({ ok, title, children }: { ok: boolean; title?: string; children: ReactNode }) {
	return (
		<span title={title} className={cn("num inline-flex items-center gap-1.5", !ok && "text-muted-foreground")}>
			{children}
			<span className="inline-flex w-4 justify-center">{ok && <DoneMark label="Yes" />}</span>
		</span>
	);
}

function None({ title }: { title: string }) {
	return (
		<span title={title} className="inline-flex items-center gap-1.5 text-muted-foreground">
			–<span className="inline-block w-4" />
		</span>
	);
}

// ---- Quests ---------------------------------------------------------------------------

type Item = Detail["items"][number];
type Step = Extract<Item, { kind: "chain" }>["steps"][number];
type Here = NonNullable<Step["here"]>;

function QuestList({ items, viewer }: { items: Item[]; viewer?: Person }) {
	if (items.length === 0) {
		return (
			<p className="mt-2 text-[0.8125rem] text-muted-foreground">
				Blizzard lists no dungeon quests here for your side.
			</p>
		);
	}
	return (
		<ul className="mt-2 divide-y divide-border rounded-md border border-border bg-card">
			{items.map((item) =>
				item.kind === "quest" ? (
					<li key={item.key} className="px-3 py-2">
						<QuestLine ids={item.ids} id={item.id} title={item.title} level={item.level} here={item} viewer={viewer} />
					</li>
				) : (
					<li key={item.steps[0].id} className="px-3 py-2">
						<Chain steps={item.steps} viewer={viewer} />
					</li>
				),
			)}
		</ul>
	);
}

/** Very long chains show the dungeon's steps, the ones next to them, and the first and last; the rest on demand. */
const SHOW_ALL_UP_TO = 12;

function Chain({ steps, viewer }: { steps: Step[]; viewer?: Person }) {
	const [all, setAll] = useState(false);
	const near = (i: number) =>
		i === 0 || i === steps.length - 1 || steps.slice(Math.max(0, i - 1), i + 2).some((s) => s.here);
	const shown = all || steps.length <= SHOW_ALL_UP_TO ? steps.map(() => true) : steps.map((_, i) => near(i));
	return (
		<div>
			<p className="text-xs font-medium text-muted-foreground">Chain</p>
			<ol className="mt-1">
				{steps.map((s, i) => {
					if (shown[i]) {
						return (
							<li key={`${s.id}-${i}`} className="flex items-center gap-2.5 py-0.5">
								<span className="num grid size-4 flex-none place-items-center rounded-full border border-border text-[9px] text-muted-foreground">
									{s.step}
								</span>
								<div className="min-w-0 flex-1">
									<QuestLine
										ids={s.ids}
										id={s.id}
										title={s.title}
										level={s.level}
										here={s.here}
										viewer={viewer}
										badge={!!s.here}
									/>
								</div>
							</li>
						);
					}
					// A run of hidden steps: one button where it starts.
					if (i > 0 && !shown[i - 1]) return null;
					let n = 0;
					while (i + n < steps.length && !shown[i + n]) n++;
					return (
						<li key={`more-${s.id}-${i}`} className="py-0.5 pl-[1.625rem]">
							<button
								type="button"
								onClick={() => setAll(true)}
								className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
							>
								{n} more {n === 1 ? "step" : "steps"}
							</button>
						</li>
					);
				})}
			</ol>
		</div>
	);
}

/**
 * One quest: its level in brackets, in the color the game's quest log would
 * give it for the viewer, its title, a Wowhead link, and on the right where
 * the viewer stands: turned in (the done mark), in their log, not picked up,
 * or another class's quest.
 */
function QuestLine({
	ids,
	id,
	title,
	level,
	here,
	viewer,
	badge,
}: {
	ids: number[];
	id: number;
	title: string;
	level?: number;
	here?: Here;
	viewer?: Person;
	/** Mark it as done in this dungeon (a chain's steps here). */
	badge?: boolean;
}) {
	const done = viewer?.questsDone?.some((q) => ids.includes(q));
	const inLog = !done && viewer?.questsInLog.some((q) => ids.includes(q));
	// Another class's quest isn't theirs to pick up; "not picked up" only when their turned-in quests are known.
	const otherClass = !!viewer && !!here?.classes && !here.classes.includes(viewer.classId);
	const notPickedUp = !done && !inLog && !otherClass && !!viewer?.questsDone;
	const color = level && viewer ? `qd-${questDifficulty(level, viewer.level)}` : undefined;
	return (
		<div>
			<div className="flex items-center gap-2">
				<span className={cn("num w-8 flex-none text-right text-xs", color ?? "text-muted-foreground")}>
					{level ? `[${level}]` : ""}
				</span>
				<span className="flex min-w-0 flex-1 items-center gap-2">
					<a
						href={wowheadQuestUrl(id)}
						target="_blank"
						rel="noreferrer"
						title="Open on Wowhead"
						className="min-w-0 truncate text-[0.8125rem] underline-offset-4 hover:underline"
					>
						{title}
					</a>
					{badge && (
						<span className="flex-none rounded-sm border border-border px-1 py-px text-[10px] leading-none text-muted-foreground">
							In Dungeon
						</span>
					)}
				</span>
				{done ? (
					<DoneMark label={`${viewer?.name} turned it in`} />
				) : inLog ? (
					<span className="flex-none text-xs text-muted-foreground">In log</span>
				) : notPickedUp ? (
					<span className="flex-none text-xs text-muted-foreground/70">Not picked up</span>
				) : otherClass ? (
					<span className="flex-none text-xs text-muted-foreground/70">Not their class</span>
				) : null}
			</div>
			{here?.classes?.length ? (
				<p className="mt-0.5 pl-10 text-xs text-muted-foreground">
					Class quest:{" "}
					{here.classes.map((c, i) => (
						<Fragment key={c}>
							{i > 0 && ", "}
							<ClassText classId={c}>{classNameOf(c)}</ClassText>
						</Fragment>
					))}
				</p>
			) : null}
		</div>
	);
}

// ---- Resources ------------------------------------------------------------------------

/** Wowhead's guide (one per wing), the entrance on its world map, and the dungeon map where the guide has one. */
function Resources({ dungeonKey, name }: { dungeonKey: string; name: string }) {
	const r = DUNGEON_RESOURCES[dungeonKey];
	const links = [
		...(r?.guides ?? []).map((g) => ({
			label: g.wing ? `${g.wing} guide` : "Dungeon guide",
			url: g.url,
		})),
		...(r?.dungeonMap ? [{ label: "Dungeon map", url: r.dungeonMap }] : []),
		...(r?.entrance ? [{ label: "Entrance on the world map", url: r.entrance }] : []),
	];
	return (
		<div className="mt-8">
			<SectionTitle>Resources</SectionTitle>
			{links.length === 0 ? (
				<p className="mt-2 text-[0.8125rem] text-muted-foreground">Wowhead has no guide for {name} yet.</p>
			) : (
				<ul className="mt-2 divide-y divide-border rounded-md border border-border bg-card">
					{links.map((l) => (
						<li key={l.url}>
							<a
								href={l.url}
								target="_blank"
								rel="noreferrer"
								className="flex items-center gap-2 px-3 py-2 text-[0.8125rem] transition-colors hover:bg-hover"
							>
								<span className="min-w-0 flex-1 truncate">{l.label}</span>
								<span className="flex-none text-xs text-muted-foreground">Wowhead</span>
								<HugeiconsIcon
									icon={LinkSquare02Icon}
									size={13}
									strokeWidth={1.75}
									className="flex-none text-muted-foreground"
								/>
							</a>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
