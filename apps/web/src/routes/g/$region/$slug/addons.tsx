import { api } from "@convex/_generated/api";
import type { AddonRow } from "@convex/shared/addons";
import type { Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { useDeferredValue, useMemo, useState } from "react";
import { AddonDialog, AddonDialogTitle, AddonIcon, AddonLine, CurseForgeLink } from "@/components/addon-list";
import { ClassText } from "@/components/class-name";
import { SectionTitle } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Addons: what the guild's players run in game, most used first, from those
// who share their list (convex/addons.ts guild), with CurseForge's icon,
// summary and categories where it has the addon. Rows show how many run it;
// who and which version open in a popup. Members see lists shared with the
// guild or publicly; anyone else, public ones only. The layout ($slug.tsx)
// loads the guild.

type Data = NonNullable<FunctionReturnType<typeof api.addons.guild>>;
type Person = Data["people"][number];

const addonsQuery = (region: string, slug: string) => convexQuery(api.addons.guild, { region: region as Region, slug });

/** Category chips: the most common ones, so the row stays one or two lines. */
const MAX_CATEGORIES = 8;
/** Sections only once there are enough players for "most" to mean something. */
const MIN_FOR_SECTIONS = 3;

export const Route = createFileRoute("/g/$region/$slug/addons")({
	loader: async ({ context, params }) => {
		await context.queryClient.ensureQueryData(addonsQuery(params.region, params.slug));
	},
	component: AddonsPage,
});

function AddonsPage() {
	const params = Route.useParams();
	const { data } = useSuspenseQuery(addonsQuery(params.region, params.slug));
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState<string | null>(null);
	const [open, setOpen] = useState<AddonRow | null>(null);
	const [peopleOpen, setPeopleOpen] = useState(false);
	const q = useDeferredValue(query.trim().toLowerCase());
	const addons = data?.addons ?? [];
	const categories = useMemo(() => {
		const counts = new Map<string, number>();
		for (const a of addons) for (const c of a.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
		return [...counts.entries()]
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.slice(0, MAX_CATEGORIES)
			.map(([name]) => name);
	}, [addons]);
	const shown = useMemo(
		() =>
			addons.filter(
				(a) =>
					(!category || a.categories.includes(category)) &&
					(!q ||
						a.title.toLowerCase().includes(q) ||
						a.folders.some((f) => f.toLowerCase().includes(q)) ||
						(a.summary ?? "").toLowerCase().includes(q)),
			),
		[addons, category, q],
	);
	if (!data) return null;
	const { people } = data;
	const total = people.length;
	const sections =
		total >= MIN_FOR_SECTIONS
			? [
					{
						title: "Most of the guild",
						rows: shown.filter((a) => a.users.length >= 2 && a.users.length >= total * 0.6),
					},
					{
						title: "Common",
						rows: shown.filter((a) => a.users.length >= 2 && a.users.length < total * 0.6),
					},
					{ title: "Just one person", rows: shown.filter((a) => a.users.length === 1), compact: true },
				]
			: [{ title: undefined, rows: shown }];
	return (
		<div className="max-w-4xl space-y-6 pb-12">
			<p className="max-w-2xl text-[0.8125rem] text-muted-foreground">
				The addons players run in game, from those who share their list (with the Guildie addon and app).
				{data.isMember ? " Lists shared with the guild or publicly." : " Public lists only; members see more."}{" "}
				{data.viewerShares === "none" && (
					<Link to="/settings" hash="privacy" className="text-foreground underline-offset-4 hover:underline">
						Share yours
					</Link>
				)}
			</p>

			{total === 0 ? (
				<p className="surface-card px-5 py-10 text-center text-[0.8125rem] text-muted-foreground">
					Nobody here shares their addons{data.isMember ? "" : " publicly"} yet.
				</p>
			) : (
				<>
					<div className="space-y-3">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<button
								type="button"
								onClick={() => setPeopleOpen(true)}
								className="text-[0.8125rem] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
							>
								<span className="num text-foreground">{addons.length}</span> addons from{" "}
								<span className="num text-foreground">{total}</span> {total === 1 ? "player" : "players"}
							</button>
							<Input
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Filter addons"
								aria-label="Filter addons"
								className="h-8 w-full max-w-60"
							/>
						</div>
						{categories.length > 1 && (
							<div className="flex flex-wrap gap-1" role="group" aria-label="Categories">
								<button
									type="button"
									className="chip"
									data-active={category === null}
									onClick={() => setCategory(null)}
								>
									All
								</button>
								{categories.map((c) => (
									<button
										key={c}
										type="button"
										className="chip"
										data-active={category === c}
										aria-pressed={category === c}
										onClick={() => setCategory(category === c ? null : c)}
									>
										{c}
									</button>
								))}
							</div>
						)}
					</div>

					{shown.length === 0 ? (
						<p className="text-[0.8125rem] text-muted-foreground">
							No addon matches{q ? ` "${query.trim()}"` : ""}
							{category ? ` in ${category}` : ""}.
						</p>
					) : (
						sections.map(
							(section) =>
								section.rows.length > 0 && (
									<section key={section.title ?? "all"}>
										{section.title && (
											<SectionTitle className="mb-2">
												{section.title}{" "}
												<span className="num ml-1 text-xs font-normal text-muted-foreground">
													{section.rows.length}
												</span>
											</SectionTitle>
										)}
										{"compact" in section && section.compact ? (
											<ul className="surface-card card-clip @container grid text-[0.8125rem] @xl:grid-cols-2">
												{section.rows.map((a) => (
													<li key={a.key} className="border-b border-border last:border-b-0 @xl:odd:border-r">
														<button
															type="button"
															onClick={() => setOpen(a)}
															className="w-full px-3.5 text-left hover:bg-hover"
														>
															<AddonLine addon={a} compact />
														</button>
													</li>
												))}
											</ul>
										) : (
											<ul className="surface-card card-clip divide-y divide-border text-[0.8125rem]">
												{section.rows.map((a) => (
													<li key={a.key}>
														<button
															type="button"
															onClick={() => setOpen(a)}
															className="w-full px-3.5 text-left hover:bg-hover"
														>
															<AddonLine addon={a} aside={<Usage count={a.users.length} total={total} />} />
														</button>
													</li>
												))}
											</ul>
										)}
									</section>
								),
						)
					)}
				</>
			)}

			<AddonDialog
				open={open !== null}
				onOpenChange={(o) => !o && setOpen(null)}
				header={open && <AddonHeader addon={open} total={total} />}
			>
				{open && <WhoRunsIt addon={open} people={people} region={params.region} />}
			</AddonDialog>

			<AddonDialog
				open={peopleOpen}
				onOpenChange={setPeopleOpen}
				header={
					<>
						<AddonDialogTitle className="text-[15px] font-semibold">Sharing their addons</AddonDialogTitle>
						<p className="mt-0.5 text-xs text-muted-foreground">
							Each player as their highest-level character here, with how many addons they run.
						</p>
					</>
				}
			>
				<ul className="space-y-1.5">
					{people.map((p) => (
						<li key={p.character.slug} className="flex items-baseline justify-between gap-3">
							<PersonLink person={p} region={params.region} />
							<span className="num text-xs text-muted-foreground">{p.count}</span>
						</li>
					))}
				</ul>
			</AddonDialog>
		</div>
	);
}

/** "12 of 14" over a thin bar. */
function Usage({ count, total }: { count: number; total: number }) {
	return (
		<div className="flex w-20 flex-none flex-col items-end gap-1" title={`${count} of ${total} players run it`}>
			<span className="num text-xs text-muted-foreground">
				<span className="text-foreground">{count}</span> of {total}
			</span>
			<span className="h-0.5 w-full overflow-hidden rounded-full bg-border">
				<span
					className="block h-full rounded-full bg-muted-foreground"
					style={{ width: `${(count / total) * 100}%` }}
				/>
			</span>
		</div>
	);
}

function AddonHeader({ addon, total }: { addon: AddonRow; total: number }) {
	return (
		<div className="flex items-start gap-3">
			<AddonIcon addon={addon} size={40} />
			<div className="min-w-0 flex-1">
				<AddonDialogTitle className="text-[15px] leading-snug font-semibold">{addon.title}</AddonDialogTitle>
				{addon.summary && <p className="mt-0.5 text-xs text-pretty text-muted-foreground">{addon.summary}</p>}
				<div className="mt-2 flex flex-wrap items-center gap-2">
					{addon.url && <CurseForgeLink url={addon.url} />}
					<span className="num text-xs text-muted-foreground">
						{addon.users.length} of {total} {total === 1 ? "player" : "players"}
					</span>
				</div>
			</div>
		</div>
	);
}

/** Who runs an addon and which version, newest version first. */
function WhoRunsIt({ addon, people, region }: { addon: AddonRow; people: Person[]; region: string }) {
	const users = [...addon.users].sort(
		(a, b) =>
			(b.version ?? "").localeCompare(a.version ?? "", undefined, { numeric: true }) ||
			people[a.person].character.name.localeCompare(people[b.person].character.name),
	);
	return (
		<>
			<ul className="space-y-1.5">
				{users.map((u) => (
					<li key={people[u.person].character.slug} className="flex items-baseline justify-between gap-3">
						<PersonLink person={people[u.person]} region={region} />
						<span className={cn("num max-w-[50%] truncate text-xs text-muted-foreground", !u.version && "italic")}>
							{u.version ?? "no version"}
						</span>
					</li>
				))}
			</ul>
			{addon.folders.length > 1 && (
				<p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
					Includes {addon.folders.join(", ")}
				</p>
			)}
		</>
	);
}

/** A player as their highest-level character here, linking to its Addons tab. */
function PersonLink({ person, region }: { person: Person; region: string }) {
	const c = person.character;
	return (
		<Link
			to="/c/$region/$slug/addons"
			params={{ region, slug: c.slug }}
			className="truncate hover:underline"
			title={person.alts > 0 ? `And ${person.alts} more of their characters in this guild` : undefined}
		>
			<ClassText classId={c.classId}>{c.name}</ClassText>
		</Link>
	);
}
