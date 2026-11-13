import { api } from "@convex/_generated/api";
import type { Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { useDeferredValue, useMemo, useState } from "react";
import { ClassText } from "@/components/class-name";
import { SectionTitle } from "@/components/page-header";
import { Input } from "@/components/ui/input";

// Addons: what the guild's players run in game, most used first, from those
// who share their list (convex/addons.ts guild). Members see lists shared with
// the guild or publicly; anyone else, public ones only. The layout
// ($slug.tsx) loads the guild.

type Data = NonNullable<FunctionReturnType<typeof api.addons.guild>>;
type Person = Data["people"][number];

const addonsQuery = (region: string, slug: string) => convexQuery(api.addons.guild, { region: region as Region, slug });

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
	const q = useDeferredValue(query.trim().toLowerCase());
	const shown = useMemo(
		() =>
			data
				? data.addons.filter((a) => !q || a.name.toLowerCase().includes(q) || (a.title ?? "").toLowerCase().includes(q))
				: [],
		[data, q],
	);
	if (!data) return null;
	const { people, addons } = data;
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

			{people.length === 0 ? (
				<p className="surface-card px-5 py-10 text-center text-[0.8125rem] text-muted-foreground">
					Nobody here shares their addons{data.isMember ? "" : " publicly"} yet.
				</p>
			) : (
				<>
					<section>
						<SectionTitle>
							Sharing <span className="num ml-1 text-xs font-normal text-muted-foreground">{people.length}</span>
						</SectionTitle>
						<div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.8125rem]">
							{people.map((p) => (
								<PersonLink key={p.character.slug} person={p} region={params.region} count />
							))}
						</div>
					</section>

					<section>
						<div className="flex flex-wrap items-center justify-between gap-3">
							<SectionTitle>
								Addons <span className="num ml-1 text-xs font-normal text-muted-foreground">{addons.length}</span>
							</SectionTitle>
							<Input
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Filter addons"
								aria-label="Filter addons"
								className="h-8 w-full max-w-60"
							/>
						</div>
						{shown.length === 0 ? (
							<p className="mt-3 text-[0.8125rem] text-muted-foreground">No addon matches "{query.trim()}".</p>
						) : (
							<ul className="surface-card card-clip @container mt-2 divide-y divide-border text-[0.8125rem]">
								{shown.map((a) => (
									<li key={a.name} className="grid gap-x-4 gap-y-1 px-3.5 py-2.5 @xl:grid-cols-[minmax(0,16rem)_1fr]">
										<div className="min-w-0">
											<div className="flex items-baseline gap-2">
												<span className="truncate font-medium">{a.title ?? a.name}</span>
												<span className="num shrink-0 text-xs text-muted-foreground">
													{a.people.length}/{people.length}
												</span>
											</div>
											{(a.title || a.versions.length > 0) && (
												<div className="truncate text-xs text-muted-foreground">
													{[a.title ? a.name : undefined, a.versions.join(", ")].filter(Boolean).join(" · ")}
												</div>
											)}
										</div>
										<div className="flex flex-wrap content-start gap-x-3 gap-y-0.5">
											{a.people.map((i) => (
												<PersonLink key={people[i].character.slug} person={people[i]} region={params.region} />
											))}
										</div>
									</li>
								))}
							</ul>
						)}
					</section>
				</>
			)}
		</div>
	);
}

/** A player as their highest-level character here, linking to its Addons tab. */
function PersonLink({ person, region, count }: { person: Person; region: string; count?: boolean }) {
	const c = person.character;
	return (
		<Link
			to="/c/$region/$slug/addons"
			params={{ region, slug: c.slug }}
			className="whitespace-nowrap hover:underline"
			title={person.alts > 0 ? `And ${person.alts} more of their characters in this guild` : undefined}
		>
			<ClassText classId={c.classId}>{c.name}</ClassText>
			{count && <span className="num ml-1 text-xs text-muted-foreground">{person.count}</span>}
		</Link>
	);
}
