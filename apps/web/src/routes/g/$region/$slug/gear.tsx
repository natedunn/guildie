import { api } from "@convex/_generated/api";
import {
	CLASS_IDS,
	PROFICIENCY_BY_KEY,
	PROFICIENCY_TYPES,
	type ProficiencyType,
	unlockLevel,
} from "@convex/shared/proficiencies";
import type { Region } from "@convex/shared/wow";
import { CLASSES } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { ClassText } from "@/components/class-name";
import { SectionTitle } from "@/components/page-header";
import { GROUPS, RulesSource } from "@/components/proficiencies";
import { cn } from "@/lib/utils";

// Gear: which class can wear and wield what (from the game's data, with the
// level it unlocks), and "Who can use...": pick a type, see the guildmates
// who can use it now and who will. The pick lives in the URL (?type=weapon:6)
// so it can be shared. The layout ($slug.tsx) loads the guild.

type Search = { type?: string };

export const Route = createFileRoute("/g/$region/$slug/gear")({
	validateSearch: (search: Record<string, unknown>): Search =>
		typeof search.type === "string" && PROFICIENCY_BY_KEY.has(search.type) ? { type: search.type } : {},
	component: GearPage,
});

function GearPage() {
	const params = Route.useParams();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const { data } = useSuspenseQuery(
		convexQuery(api.guilds.get, { region: params.region as Region, slug: params.slug }),
	);
	if (!data || data.hidden) return null;
	const selected = search.type ? PROFICIENCY_BY_KEY.get(search.type) : undefined;
	const select = (key?: string) =>
		navigate({
			search: (prev) => ({ ...prev, type: key === search.type ? undefined : key }),
			replace: true,
			resetScroll: false,
		});
	return (
		<div className="space-y-8 pb-12">
			<section>
				<SectionTitle>Who can use…</SectionTitle>
				<div className="mt-2 space-y-2">
					{GROUPS.map((g) => (
						<div key={g.key} className="flex gap-2" role="group" aria-label={g.label}>
							<span className="w-14 flex-none pt-1.5 text-xs text-muted-foreground">{g.label}</span>
							<div className="flex flex-wrap gap-1">
								{PROFICIENCY_TYPES.filter((t) => t.group === g.key).map((t) => (
									<button
										key={t.key}
										type="button"
										className="chip"
										data-active={selected?.key === t.key}
										aria-pressed={selected?.key === t.key}
										onClick={() => select(t.key)}
									>
										{t.name}
									</button>
								))}
							</div>
						</div>
					))}
				</div>
				{selected && <WhoCanUse type={selected} members={data.members} region={params.region} />}
			</section>

			<section>
				<SectionTitle>By class</SectionTitle>
				<ClassGrid selected={selected?.key} onSelect={select} />
				<RulesSource className="mt-3 max-w-2xl" />
			</section>
		</div>
	);
}

type Member = { slug: string; name: string; classId: number; level: number };

function WhoCanUse({ type, members, region }: { type: ProficiencyType; members: Member[]; region: string }) {
	const { now, later } = useMemo(() => {
		const now: Member[] = [];
		const later: (Member & { from: number })[] = [];
		for (const m of members) {
			const from = unlockLevel(m.classId, type);
			if (from === undefined) continue;
			if (from <= m.level) now.push(m);
			else later.push({ ...m, from });
		}
		const byLevel = (a: Member, b: Member) => b.level - a.level || a.name.localeCompare(b.name);
		return { now: now.sort(byLevel), later: later.sort(byLevel) };
	}, [members, type]);
	const classes = CLASS_IDS.filter((id) => unlockLevel(id, type) !== undefined);
	return (
		<div className="mt-4 max-w-3xl space-y-3 text-[0.8125rem]">
			<p className="text-muted-foreground">
				{type.name}:{" "}
				{classes.length ? (
					classes.map((id, i) => {
						const from = unlockLevel(id, type) ?? 1;
						return (
							<span key={id}>
								{i > 0 && ", "}
								<ClassText classId={id}>{CLASSES[id]?.name}</ClassText>
								{from > 1 && <span className="num"> at {from}</span>}
							</span>
						);
					})
				) : (
					<>no class.</>
				)}
			</p>
			<MemberList title="Now" members={now} region={region} empty="Nobody in the guild yet." />
			{later.length > 0 && <MemberList title="Later" members={later} region={region} />}
		</div>
	);
}

function MemberList({
	title,
	members,
	region,
	empty,
}: {
	title: string;
	members: (Member & { from?: number })[];
	region: string;
	empty?: string;
}) {
	return (
		<div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3">
			<div className="text-muted-foreground">
				{title} <span className="num text-xs">{members.length}</span>
			</div>
			<div className="flex flex-wrap gap-x-3 gap-y-0.5">
				{members.length === 0 && <span className="text-muted-foreground">{empty}</span>}
				{members.map((m) => (
					<Link
						key={m.slug}
						to="/c/$region/$slug"
						params={{ region, slug: m.slug }}
						className="whitespace-nowrap hover:underline"
					>
						<ClassText classId={m.classId}>{m.name}</ClassText>
						<span className="num ml-1 text-xs text-muted-foreground">
							{m.from !== undefined ? `${m.level} → ${m.from}` : m.level}
						</span>
					</Link>
				))}
			</div>
		</div>
	);
}

/** Types down, classes across: a check from level 1, else the level it unlocks. */
function ClassGrid({ selected, onSelect }: { selected?: string; onSelect: (key: string) => void }) {
	return (
		// The grid scrolls sideways on its own on narrow panes; the page doesn't.
		<div className="mt-2 max-w-4xl overflow-x-auto">
			<table className="w-full min-w-[40rem] border-collapse text-[0.8125rem]">
				<thead>
					<tr className="border-b border-border text-xs">
						<th className="py-1.5 pr-3 text-left font-normal text-muted-foreground">Type</th>
						{CLASS_IDS.map((id) => (
							<th key={id} className="px-1 py-1.5 text-center font-medium">
								<ClassText classId={id}>{CLASSES[id]?.name}</ClassText>
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{GROUPS.map((g) =>
						PROFICIENCY_TYPES.filter((t) => t.group === g.key).map((t, i) => (
							<tr
								key={t.key}
								className={cn(
									"border-b border-border/60 last:border-b-0",
									i === 0 && "border-t border-t-border",
									selected === t.key && "bg-selected",
								)}
							>
								<th scope="row" className="py-0 pr-3 text-left font-normal">
									<button
										type="button"
										onClick={() => onSelect(t.key)}
										className="w-full py-1 text-left hover:underline"
										aria-pressed={selected === t.key}
									>
										{t.name}
									</button>
								</th>
								{CLASS_IDS.map((id) => {
									const from = unlockLevel(id, t);
									return (
										<td key={id} className="px-1 py-1 text-center">
											{from === undefined ? (
												<span className="sr-only">No</span>
											) : from > 1 ? (
												<span className="num text-muted-foreground" title={`From level ${from}`}>
													{from}
												</span>
											) : (
												<HugeiconsIcon
													icon={Tick02Icon}
													size={14}
													strokeWidth={2}
													className="mx-auto text-muted-foreground"
													aria-label="Yes"
												/>
											)}
										</td>
									);
								})}
							</tr>
						)),
					)}
				</tbody>
			</table>
			<p className="mt-2 text-xs text-muted-foreground">A number: from that level.</p>
		</div>
	);
}
