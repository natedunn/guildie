import { api } from "@convex/_generated/api";
import { questDifficulty, wowheadQuestUrl } from "@convex/shared/quests";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { Fragment, useMemo } from "react";
import { CharacterAvatar } from "@/components/character-avatar";
import { ClassText } from "@/components/class-name";
import { DoneMark, ViewAs } from "@/components/dungeon";
import { Page, PageHeader, SectionTitle } from "@/components/page-header";
import { Switch } from "@/components/ui/switch";
import { ago } from "@/lib/format";
import { cn } from "@/lib/utils";

// Personal → Quests: one of your characters' quest log at a time (?character=,
// default your highest), as a list or grouped by zone (?view=zone), and on
// each quest the guildmates who have it too ("Also on it"), to group up with.
// From Blizzard (as of each character's last logout) or, with the Guildie
// addon, the game's quest log as of the last /reload or logout. Dungeon
// quests across a guild: its Dungeons page.

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
	// Highest level first (quests.mine sorts them).
	const c = characters.find((x) => x.slug === search.character) ?? characters[0];
	const byZone = search.view === "zone";
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
				{!c ? (
					<p className="text-[0.8125rem] text-muted-foreground">
						No characters yet.{" "}
						<Link to="/settings" className="text-foreground underline underline-offset-4">
							Claim your characters
						</Link>{" "}
						to see their quests here.
					</p>
				) : (
					<>
						<section>
							<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
								<div className="flex min-w-0 flex-1 items-center gap-2.5">
									<CharacterAvatar url={c.avatarUrl} size={32} className="rounded-full" />
									<div className="min-w-0">
										<SectionTitle className="truncate">
											<Link
												to="/c/$region/$slug"
												params={{ region: c.region, slug: c.slug }}
												className="underline-offset-4 hover:underline"
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
								<div className="flex items-center gap-3">
									{(c.quests?.length ?? 0) > 0 && (
										<label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
											<Switch
												size="sm"
												checked={byZone}
												onCheckedChange={(on) => set({ view: on ? "zone" : undefined })}
											/>
											Group by zone
										</label>
									)}
									{characters.length > 1 && (
										<ViewAs
											label="Character"
											placeholder="Search your characters"
											people={characters.map((x) => ({ ...x, key: x.slug, mine: false }))}
											value={c.slug}
											onChange={(slug) => set({ character: slug })}
										/>
									)}
								</div>
							</div>
							{c.quests && c.quests.length > 0 ? (
								<QuestList quests={c.quests} level={c.level} byZone={byZone} />
							) : c.quests ? (
								<p className="surface-card mt-3 px-5 py-6 text-center text-[0.8125rem] text-muted-foreground">
									No quests.
								</p>
							) : null}
						</section>
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

/** The quests in one card, in log order or under their zones' headings. */
function QuestList({ quests, level, byZone }: { quests: Quest[]; level: number; byZone: boolean }) {
	const zones = useMemo(() => {
		if (!byZone) return null;
		const map = new Map<string, Quest[]>();
		for (const q of quests) {
			const area = q.area ?? "Other";
			map.set(area, [...(map.get(area) ?? []), q]);
		}
		return [...map.entries()].sort(([a], [b]) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));
	}, [quests, byZone]);
	if (!zones) {
		return (
			<ul className="surface-card mt-3 divide-y divide-border">
				{quests.map((q) => (
					<QuestRow key={q.id} quest={q} level={level} />
				))}
			</ul>
		);
	}
	return (
		<div className="mt-3 space-y-5">
			{zones.map(([area, list]) => (
				<section key={area}>
					<h3 className="px-1 text-xs font-medium text-muted-foreground">
						{area} <span className="num font-normal">{list.length}</span>
					</h3>
					<ul className="surface-card mt-1.5 divide-y divide-border">
						{list.map((q) => (
							<QuestRow key={q.id} quest={q} level={level} hideArea />
						))}
					</ul>
				</section>
			))}
		</div>
	);
}

/**
 * One quest, like a dungeon's quest list: its level in brackets in the color
 * the game's quest log gives it, the title (to Wowhead), its state on the
 * right; under it the zone and kind, objectives, and guildmates on it too.
 */
function QuestRow({
	quest: q,
	level,
	hideArea,
}: {
	quest: Quest;
	/** The character's level, for the game's level colors. */
	level: number;
	hideArea?: boolean;
}) {
	const meta = [hideArea ? undefined : q.area, q.type].filter(Boolean).join(" · ");
	const objectives = !q.complete && q.objectives?.length ? q.objectives : undefined;
	return (
		<li className="px-3 py-2">
			<div className="flex items-center gap-2">
				<span
					className={cn(
						"num w-8 flex-none text-right text-xs",
						q.level !== undefined ? `qd-${questDifficulty(q.level, level)}` : "text-muted-foreground",
					)}
				>
					{q.level !== undefined ? `[${q.level}]` : ""}
				</span>
				<a
					href={wowheadQuestUrl(q.id)}
					target="_blank"
					rel="noreferrer"
					title="Open on Wowhead"
					className="min-w-0 flex-1 truncate text-[0.8125rem] underline-offset-4 hover:underline"
				>
					{q.title}
				</a>
				{q.failed ? (
					<span className="flex-none text-xs text-muted-foreground/70">Failed</span>
				) : q.complete ? (
					<DoneMark label="Complete: ready to turn in" />
				) : null}
			</div>
			{(meta || objectives || q.others.length > 0) && (
				<div className="mt-0.5 space-y-0.5 pl-10 text-xs text-muted-foreground">
					{meta && <p className="text-[10px] font-medium tracking-wider uppercase">{meta}</p>}
					{objectives && (
						<ul>
							{objectives.map((o) => (
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
										className="underline-offset-4 hover:underline"
									>
										<ClassText classId={o.classId}>{o.name}</ClassText>
									</Link>
									<span className="num"> {o.level}</span>
								</Fragment>
							))}
						</p>
					)}
				</div>
			)}
		</li>
	);
}
