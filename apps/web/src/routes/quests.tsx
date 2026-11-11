import { api } from "@convex/_generated/api";
import { questDifficulty, wowheadQuestUrl } from "@convex/shared/quests";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { Fragment, useMemo } from "react";
import { CharacterAvatar } from "@/components/character-avatar";
import { ClassText } from "@/components/class-name";
import { Page, PageHeader, SectionTitle } from "@/components/page-header";
import { ago } from "@/lib/format";
import { cn } from "@/lib/utils";

// Personal → Quests: your characters' quest logs, by character or by zone,
// and on each quest the guildmates who have it too ("Also on it"), to group
// up with. From Blizzard (as of each character's last logout) or, with the
// Guildie addon, the game's quest log as of the last /reload or logout.
// Dungeon quests across a guild: its Dungeons page.

type Search = { view?: "zone"; character?: string };

export const Route = createFileRoute("/quests")({
	validateSearch: (search: Record<string, unknown>): Search => ({
		...(search.view === "zone" ? { view: "zone" as const } : {}),
		...(typeof search.character === "string" && search.character ? { character: search.character } : {}),
	}),
	beforeLoad: ({ context }) => {
		if (!context.token) throw redirect({ to: "/sign-in", search: { next: "/quests" } });
	},
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(convexQuery(api.quests.mine, {}));
	},
	head: () => ({ meta: [{ title: "Quests · Guildie" }] }),
	component: QuestsPage,
});

type Data = NonNullable<FunctionReturnType<typeof api.quests.mine>>;
type Character = Data["characters"][number];
type Quest = NonNullable<Character["quests"]>[number];

function QuestsPage() {
	const { data } = useSuspenseQuery(convexQuery(api.quests.mine, {}));
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const characters = data?.characters ?? [];
	const selected = characters.find((c) => c.slug === search.character);
	const listed = selected ? [selected] : characters;
	const set = (patch: Search) =>
		navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true, resetScroll: false });
	if (!data) return null;

	return (
		<>
			<PageHeader
				title="Quests"
				description={
					<>
						Your characters' quest logs, and who in your guild is on the same quests.
						{data.guilds.map((g) => (
							<Fragment key={`${g.region}/${g.slug}`}>
								{" "}
								<Link
									to="/g/$region/$slug/dungeons"
									params={{ region: g.region, slug: g.slug }}
									className="text-foreground underline underline-offset-4"
								>
									Dungeon quests in {g.name}
								</Link>
							</Fragment>
						))}
					</>
				}
			/>
			<Page width="medium" className="space-y-6">
				{characters.length === 0 ? (
					<p className="text-[0.8125rem] text-muted-foreground">
						No characters yet.{" "}
						<Link to="/settings" className="text-foreground underline underline-offset-4">
							Claim your characters
						</Link>{" "}
						to see their quests here.
					</p>
				) : (
					<>
						<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
							<div className="flex gap-1" role="group" aria-label="Group by">
								<button
									type="button"
									className="chip"
									data-active={search.view !== "zone"}
									aria-pressed={search.view !== "zone"}
									onClick={() => set({ view: undefined })}
								>
									By character
								</button>
								<button
									type="button"
									className="chip"
									data-active={search.view === "zone"}
									aria-pressed={search.view === "zone"}
									onClick={() => set({ view: "zone" })}
								>
									By zone
								</button>
							</div>
							{characters.length > 1 && (
								<div className="flex flex-wrap gap-1" role="group" aria-label="Character">
									<button
										type="button"
										className="chip"
										data-active={!selected}
										aria-pressed={!selected}
										onClick={() => set({ character: undefined })}
									>
										All
									</button>
									{characters.map((c) => (
										<button
											key={c.key}
											type="button"
											className="chip"
											data-active={selected?.key === c.key}
											aria-pressed={selected?.key === c.key}
											onClick={() => set({ character: selected?.key === c.key ? undefined : c.slug })}
										>
											<ClassText classId={c.classId}>{c.name}</ClassText>
										</button>
									))}
								</div>
							)}
						</div>
						{search.view === "zone" ? <ByZone characters={listed} /> : <ByCharacter characters={listed} />}
						<p className="text-xs text-muted-foreground">
							Blizzard updates a character's quests when they log out. With the Guildie app running, the addon sends
							your quest log (with progress) on every /reload and logout. Your progress is only shown to you; guildmates
							see which quests you're on.
						</p>
					</>
				)}
			</Page>
		</>
	);
}

/** Where a character's quest list came from, and how old it is. */
function sourceLine(c: Character) {
	if (!c.source) return "Not synced yet. Blizzard lists quests from level 10, after you log out.";
	if (c.source.kind === "addon") return `From the game ${ago(c.source.at)}`;
	return `From Blizzard, as of the last logout ${c.source.at ? ago(c.source.at) : ""}`.trim();
}

function ByCharacter({ characters }: { characters: Character[] }) {
	return (
		<div className="space-y-8">
			{characters.map((c) => (
				<section key={c.key}>
					<div className="flex items-center gap-2.5">
						<CharacterAvatar url={c.avatarUrl} size={28} className="rounded-full" />
						<div className="min-w-0 flex-1">
							<SectionTitle className="truncate">
								<Link
									to="/c/$region/$slug"
									params={{ region: c.region, slug: c.slug }}
									className="hover:underline underline-offset-4"
								>
									<ClassText classId={c.classId}>{c.name}</ClassText>
								</Link>
								<span className="num font-normal text-muted-foreground"> {c.level}</span>
							</SectionTitle>
							<p className="truncate text-xs text-muted-foreground">
								{c.quests ? `${c.quests.length} ${c.quests.length === 1 ? "quest" : "quests"} · ` : ""}
								{sourceLine(c)}
							</p>
						</div>
					</div>
					{c.quests && c.quests.length > 0 && (
						<ul className="mt-2">
							{c.quests.map((q) => (
								<QuestRow key={q.id} quest={q} level={c.level} />
							))}
						</ul>
					)}
					{c.quests?.length === 0 && <p className="mt-2 text-[0.8125rem] text-muted-foreground">No quests.</p>}
				</section>
			))}
		</div>
	);
}

function ByZone({ characters }: { characters: Character[] }) {
	const zones = useMemo(() => {
		const byZone = new Map<string, { quest: Quest; holders: Character[] }[]>();
		for (const c of characters) {
			for (const q of c.quests ?? []) {
				const area = q.area ?? "Other";
				const list = byZone.get(area) ?? [];
				const entry = list.find((e) => e.quest.id === q.id);
				if (entry) entry.holders.push(c);
				else list.push({ quest: q, holders: [c] });
				byZone.set(area, list);
			}
		}
		return [...byZone.entries()].sort(([a], [b]) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));
	}, [characters]);
	if (!zones.length) return <p className="text-[0.8125rem] text-muted-foreground">No quests.</p>;
	const several = characters.length > 1;
	return (
		<div className="space-y-6">
			{zones.map(([area, entries]) => (
				<section key={area}>
					<SectionTitle>
						{area} <span className="num font-normal text-muted-foreground">{entries.length}</span>
					</SectionTitle>
					<ul className="mt-1">
						{entries.map(({ quest, holders }) => (
							<QuestRow
								key={quest.id}
								quest={quest}
								level={Math.max(...holders.map((h) => h.level))}
								holders={several ? holders : undefined}
								hideArea
							/>
						))}
					</ul>
				</section>
			))}
		</div>
	);
}

function QuestRow({
	quest: q,
	level,
	holders,
	hideArea,
}: {
	quest: Quest;
	/** The character's level, for the game's level colors. */
	level: number;
	/** By zone: which of your characters have it. */
	holders?: Character[];
	hideArea?: boolean;
}) {
	const meta = [hideArea ? undefined : q.area, q.type].filter(Boolean).join(" · ");
	const state = q.failed ? "Failed" : q.complete ? "Complete" : undefined;
	return (
		<li className="border-b border-border py-2 text-[0.8125rem]">
			<div className="flex items-baseline gap-2">
				{q.level !== undefined && (
					<span className={cn("num w-6 flex-none text-right text-xs", `qd-${questDifficulty(q.level, level)}`)}>
						{q.level}
					</span>
				)}
				<a
					href={wowheadQuestUrl(q.id)}
					target="_blank"
					rel="noreferrer"
					className="min-w-0 flex-1 hover:underline underline-offset-4"
					title="Open on Wowhead"
				>
					{q.title}
				</a>
				{state && <span className="flex-none text-xs font-medium">{state}</span>}
			</div>
			<div className={cn("mt-0.5 space-y-0.5 text-xs text-muted-foreground", q.level !== undefined && "pl-8")}>
				{(meta || holders) && (
					<p>
						{holders && (
							<>
								{holders.map((h, i) => (
									<Fragment key={h.key}>
										{i > 0 && ", "}
										<ClassText classId={h.classId}>{h.name}</ClassText>
									</Fragment>
								))}
								{meta && " · "}
							</>
						)}
						{meta}
					</p>
				)}
				{!q.complete && q.objectives && q.objectives.length > 0 && (
					<ul>
						{q.objectives.map((o) => (
							<li key={o.text} className={cn(o.done && "line-through decoration-muted-foreground/50")}>
								{o.text}
							</li>
						))}
					</ul>
				)}
				{q.others.length > 0 && (
					<p>
						Also on it:{" "}
						{q.others.map((o, i) => (
							<Fragment key={o.key}>
								{i > 0 && ", "}
								<Link
									to="/c/$region/$slug"
									params={{ region: o.region, slug: o.slug }}
									className="hover:underline underline-offset-4"
								>
									<ClassText classId={o.classId}>{o.name}</ClassText>
								</Link>
								<span className="num"> {o.level}</span>
							</Fragment>
						))}
					</p>
				)}
			</div>
		</li>
	);
}
