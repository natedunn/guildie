import { api } from "@convex/_generated/api";
import { PRIORITY_STATS } from "@convex/shared/statPriority";
import { CLASSES, className, type Region, raceName } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import {
	ArrowDown01Icon,
	ArrowUp01Icon,
	CheckmarkBadge01Icon,
	GameController03Icon,
	HourglassIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { type ReactNode, useMemo, useState } from "react";
import { UNFETCHED_NOTE } from "@/components/character-avatar";
import { ClassText } from "@/components/class-name";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ago } from "@/lib/format";
import { cn } from "@/lib/utils";

// The roster has more to show than fits in one table, so it has views:
// Name and Level always, then each view's columns. The view lives in the URL
// (?view=stats) so a link opens on it.
const VIEWS = [
	{ key: "overview", label: "Overview" },
	{ key: "stats", label: "Stat priority" },
	{ key: "professions", label: "Professions" },
] as const;
type View = (typeof VIEWS)[number]["key"];

export const Route = createFileRoute("/g/$region/$slug/")({
	// The layout ($slug.tsx) loads the guild and draws its header.
	validateSearch: (search: Record<string, unknown>): { view?: Exclude<View, "overview"> } =>
		search.view === "stats" || search.view === "professions" ? { view: search.view } : {},
	component: GuildPage,
});

type SortKey = "name" | "level" | "class" | "ilvl" | "seen" | "profession";

function GuildPage() {
	const params = Route.useParams();
	const { data } = useSuspenseQuery(
		convexQuery(api.guilds.get, { region: params.region as Region, slug: params.slug }),
	);
	if (!data || data.hidden) return null;
	return <Roster members={data.members} />;
}

type GuildData = NonNullable<FunctionReturnType<typeof api.guilds.get>>;
type Member = Extract<GuildData, { hidden: false }>["members"][number];

function Roster({ members }: { members: Member[] }) {
	const view: View = Route.useSearch().view ?? "overview";
	const navigate = useNavigate({ from: Route.fullPath });
	const setView = (v: View) =>
		navigate({
			search: (prev) => ({ ...prev, view: v === "overview" ? undefined : v }),
			replace: true,
			resetScroll: false,
		});
	const [search, setSearch] = useState("");
	const [classFilter, setClassFilter] = useState<number | null>(null);
	const [maxOnly, setMaxOnly] = useState(false);
	const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "level", desc: true });

	const rows = useMemo(() => {
		// Every word must match somewhere: "night elf druid", "tailoring 60".
		const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
		const haystack = (m: Member) =>
			[
				m.name,
				m.surname,
				raceName(m.raceId),
				className(m.classId),
				...(m.professions ?? []).map((p) => p.name),
				...(m.talentTrees ?? []).map((t) => t.name),
				// "who wants intellect"
				...(m.statPriority?.stats ?? []).map((s) => PRIORITY_STATS[s]),
			]
				.filter(Boolean)
				.join(" ")
				.toLowerCase();
		const filtered = members.filter(
			(m) =>
				(words.length === 0 || ((text) => words.every((w) => text.includes(w)))(haystack(m))) &&
				(classFilter === null || m.classId === classFilter) &&
				(!maxOnly || m.level === 60),
		);
		const value = (m: Member): string | number => {
			switch (sort.key) {
				case "name":
					return m.name.toLowerCase();
				case "level":
					return m.level;
				case "class":
					return className(m.classId);
				case "ilvl":
					return m.averageItemLevel ?? -1;
				case "seen":
					return m.synced?.at ?? 0;
				case "profession":
					return primaryProfessions(m)[0]?.name ?? "~";
			}
		};
		return filtered.sort((a, b) => {
			const [x, y] = [value(a), value(b)];
			const cmp = x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name);
			return sort.desc ? -cmp : cmp;
		});
	}, [members, search, classFilter, maxOnly, sort]);

	const classCounts = useMemo(() => {
		const counts = new Map<number, number>();
		for (const m of members) counts.set(m.classId, (counts.get(m.classId) ?? 0) + 1);
		return counts;
	}, [members]);

	const header = (key: SortKey, label: ReactNode, align?: "right", className?: string) => (
		<TableHead
			className={cn(align === "right" && "text-right", className)}
			aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : undefined}
		>
			<button
				type="button"
				className={cn(
					"inline-flex items-center gap-1 hover:text-foreground",
					align === "right" && "flex-row-reverse",
					sort.key === key && "text-foreground",
				)}
				onClick={() =>
					setSort((s) => ({ key, desc: s.key === key ? !s.desc : key === "level" || key === "ilvl" || key === "seen" }))
				}
			>
				{label}
				<HugeiconsIcon
					icon={sort.key === key && sort.desc ? ArrowDown01Icon : ArrowUp01Icon}
					size={12}
					strokeWidth={2}
					className={cn(sort.key !== key && "invisible")}
				/>
			</button>
		</TableHead>
	);

	return (
		<section className="@container pb-10">
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
				<Input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search"
					className="w-full sm:w-64"
				/>
				<div className="flex flex-wrap gap-1">
					<button
						type="button"
						className="chip"
						data-active={classFilter === null}
						onClick={() => setClassFilter(null)}
					>
						All <span className="num text-muted-foreground">{members.length}</span>
					</button>
					{Object.entries(CLASSES)
						.filter(([id]) => classCounts.has(Number(id)))
						.map(([id, c]) => (
							<button
								key={id}
								type="button"
								onClick={() => setClassFilter(classFilter === Number(id) ? null : Number(id))}
								className="chip"
								data-active={classFilter === Number(id)}
							>
								<ClassText classId={Number(id)}>{c.name}</ClassText>
								<span className="num text-muted-foreground">{classCounts.get(Number(id))}</span>
							</button>
						))}
				</div>
				<label className="ml-auto flex items-center gap-2 text-[0.8125rem] text-muted-foreground select-none">
					<Switch size="sm" checked={maxOnly} onCheckedChange={setMaxOnly} />
					Level 60 only
				</label>
			</div>

			<Tabs value={view} onValueChange={(v) => setView(v as View)}>
				<TabsList>
					{VIEWS.map((v) => (
						<TabsTrigger key={v.key} value={v.key}>
							{v.label}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			<Table className="table-sticky roster-table w-max min-w-full">
				<TableHeader>
					<TableRow>
						{header("name", "Name")}
						{header("level", "Level", "right")}
						{/* Every column at every width: a narrow pane scrolls the table
						    sideways (.roster-table in app.css). */}
						{view === "overview" && (
							<>
								{header("class", "Race and class")}
								<TableHead>Talents</TableHead>
								{header("ilvl", "Item level", "right")}
								{header("seen", "Last synced", "right")}
							</>
						)}
						{view === "stats" && (
							<>
								<TableHead>Talents</TableHead>
								<TableHead>1st</TableHead>
								<TableHead>2nd</TableHead>
								<TableHead>3rd</TableHead>
							</>
						)}
						{view === "professions" && (
							<>
								{header("profession", "Professions")}
								<TableHead>Secondary</TableHead>
							</>
						)}
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((m) => (
						<TableRow key={m._id}>
							<TableCell>
								<Tooltip disabled={!m.battletag && !!m.synced}>
									<TooltipTrigger
										render={
											<Link
												to="/c/$region/$slug"
												params={(p) => ({ region: p.region ?? "us", slug: m.slug })}
												className="hover:underline underline-offset-4"
											/>
										}
									>
										<ClassText classId={m.classId} className="font-medium">
											{m.name}
										</ClassText>{" "}
										<span className="text-muted-foreground">{m.surname}</span>
									</TooltipTrigger>
									{/* Only guild members get BattleTags (guilds.get), and only from players who haven't hidden theirs. */}
									<TooltipContent side="right" className="block max-w-72 space-y-1">
										{m.battletag && <p>{m.battletag}</p>}
										{!m.synced && <p className={m.battletag ? "text-muted-foreground" : undefined}>{UNFETCHED_NOTE}</p>}
									</TooltipContent>
								</Tooltip>
								{!m.synced && (
									<span
										className="ml-1.5 inline-flex translate-y-[2px] text-muted-foreground/60"
										role="img"
										aria-label="Not published by Blizzard yet"
									>
										<HugeiconsIcon icon={HourglassIcon} size={13} strokeWidth={1.75} />
									</span>
								)}
								{m.claimed && (
									<span
										className="ml-1.5 inline-flex translate-y-[2px] text-muted-foreground/70"
										title="Claimed on Guildie"
										role="img"
										aria-label="Claimed on Guildie"
									>
										<HugeiconsIcon icon={CheckmarkBadge01Icon} size={14} strokeWidth={1.75} />
									</span>
								)}
							</TableCell>
							<TableCell className="num text-right">{m.level}</TableCell>
							{view === "overview" && (
								<>
									<TableCell>
										<span className="text-muted-foreground">{raceName(m.raceId)} </span>
										<ClassText classId={m.classId}>{className(m.classId)}</ClassText>
									</TableCell>
									<TalentsCell member={m} />
									<TableCell className="num text-right">{m.averageItemLevel ?? ""}</TableCell>
									<TableCell className="num text-right text-muted-foreground">
										<LastSynced synced={m.synced} />
									</TableCell>
								</>
							)}
							{view === "stats" && <StatCells member={m} />}
							{view === "professions" && (
								<>
									<TableCell className="num">
										{professionList(primaryProfessions(m)) || (m.profileMissing ? "–" : "")}
									</TableCell>
									<TableCell className="num text-muted-foreground">
										{professionList((m.professions ?? []).filter((p) => p.secondary))}
									</TableCell>
								</>
							)}
						</TableRow>
					))}
				</TableBody>
			</Table>
			{rows.length === 0 && <p className="py-6 text-center text-muted-foreground">Nobody matches.</p>}
			<p className="mt-4 text-xs text-muted-foreground">
				{view === "stats"
					? "What each character looks for on gear, from their main talent tree. A general guide; players can change their own on their character's page."
					: "Talents, professions, gear and last synced fill in once a character is level 10 and has logged out. Blizzard's API doesn't say who's online right now."}
			</p>
		</section>
	);
}

const primaryProfessions = (m: Member) => (m.professions ?? []).filter((p) => !p.secondary);
const professionList = (list: Member["professions"]) =>
	(list ?? []).map((p) => `${p.name}${p.skill ? ` ${p.skill}` : ""}`).join(", ");

/** Points per tree, main tree first: "Feral 21 · Restoration 5". */
function TalentsCell({ member: m }: { member: Member }) {
	return (
		<TableCell className="num">
			{m.talentTrees?.map((t, i) => (
				<span key={t.id} className={cn(i > 0 && "text-muted-foreground")}>
					{i > 0 && " · "}
					{t.name} {t.points}
				</span>
			))}
		</TableCell>
	);
}

/**
 * The stat priority view's cells: their talents, then first to third. A
 * player's own choice is marked, since it no longer follows the talents.
 */
function StatCells({ member: m }: { member: Member }) {
	const p = m.statPriority;
	return (
		<>
			<TalentsCell member={m} />
			{[0, 1, 2].map((i) => (
				<TableCell key={i} className={cn(i > 0 && "text-muted-foreground")}>
					{p ? PRIORITY_STATS[p.stats[i]] : ""}
					{i === 2 && p?.chosen && (
						<Tooltip>
							<TooltipTrigger render={<span className="ml-1.5 text-muted-foreground/70" />}>set</TooltipTrigger>
							<TooltipContent side="left">
								{p.tree ? `Chosen by the player: ${p.tree}'s priority` : "Chosen by the player"}, not from their talents
							</TooltipContent>
						</Tooltip>
					)}
				</TableCell>
			))}
		</>
	);
}

type Synced = { kind: "app"; at?: number } | { kind: "blizzard"; at: number; checkedAt?: number } | undefined;

const fullTime = (at: number) =>
	new Date(at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * How current a character's data is. A small controller icon when it came
 * from the game itself (the player's Guildie app synced it); otherwise
 * Blizzard's, as of their last logout. Hover says which.
 */
function LastSynced({ synced }: { synced: Synced }) {
	if (!synced?.at) return null;
	return (
		<Tooltip>
			<TooltipTrigger render={<span className="inline-flex items-center justify-end gap-1.5" />}>
				{synced.kind === "app" && (
					<HugeiconsIcon
						icon={GameController03Icon}
						size={14}
						strokeWidth={1.75}
						className="text-foreground/80"
						aria-label="Synced in game"
					/>
				)}
				{ago(synced.at)}
			</TooltipTrigger>
			<TooltipContent side="left">
				{synced.kind === "app" ? (
					<>Synced from the game with the Guildie app, {fullTime(synced.at)}</>
				) : (
					<>
						From Blizzard, as of their last logout ({fullTime(synced.at)})
						{synced.checkedAt ? `. Checked ${ago(synced.checkedAt)}.` : ""}
					</>
				)}
			</TooltipContent>
		</Tooltip>
	);
}
