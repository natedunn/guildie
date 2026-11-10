import { api } from "@convex/_generated/api";
import { REGIONS, type Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useState } from "react";
import { Page, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// No home page for signed-in players: "/" opens your guild (the sidebar
// switches between guilds). It shows a page only to signed-out visitors (sign
// in, or look a guild up), and to players whose guild Guildie hasn't found
// yet (characters under level 10, or not logged out since joining).
export const Route = createFileRoute("/")({
	loader: async ({ context }) => {
		const viewer = await context.queryClient.ensureQueryData(convexQuery(api.users.viewer, {}));
		const first = viewer?.guilds[0];
		if (first)
			throw redirect({ to: "/g/$region/$slug", params: { region: first.region, slug: first.slug }, replace: true });
	},
	component: Home,
});

function Home() {
	const { data: viewer } = useSuspenseQuery(convexQuery(api.users.viewer, {}));
	if (!viewer) {
		return (
			<Page width="medium">
				<PageHeader
					title="Guildie"
					description="Your guild's roster, gear, talents and crafters, from Blizzard's API. Built for WoW: Forever, and open source."
				/>
				<Button size="lg" render={<Link to="/sign-in" />}>
					Sign in with Battle.net to see your guilds
				</Button>
				<GuildSearch className="mt-10" />
			</Page>
		);
	}
	return (
		<Page width="medium">
			<PageHeader
				title="No guild found yet"
				description="Guildie finds your guild from your characters. A character shows up once it's level 10 and has logged out since joining the guild; then sign out and in again. Or look your guild up, or add it."
			/>
			<GuildSearch />
			<AddGuild />
		</Page>
	);
}

/** Live search for a guild by name (public guilds only). */
function GuildSearch({ className }: { className?: string }) {
	const [q, setQ] = useState("");
	const [debounced, setDebounced] = useState("");
	useEffect(() => {
		const t = setTimeout(() => setDebounced(q.trim()), 150);
		return () => clearTimeout(t);
	}, [q]);
	const { data: results, isFetching } = useQuery({
		...convexQuery(api.guilds.search, { q: debounced }),
		enabled: debounced.length >= 2,
		placeholderData: (previous) => previous,
	});
	const shown = debounced.length >= 2 ? (results ?? []) : [];
	return (
		<div className={className}>
			<label htmlFor="guild-search" className="text-[0.8125rem] font-medium">
				Find a guild
			</label>
			<Input
				id="guild-search"
				className="mt-1.5"
				value={q}
				onChange={(e) => setQ(e.target.value)}
				placeholder="Guild name"
				autoComplete="off"
			/>
			{debounced.length >= 2 && (
				<div className="mt-2">
					{shown.length === 0 ? (
						!isFetching && (
							<p className="text-[0.8125rem] text-muted-foreground">No public guild by that name on Guildie.</p>
						)
					) : (
						<ul className="divide-y divide-border rounded-md border border-border">
							{shown.map((g) => (
								<li key={g._id}>
									<Link
										to="/g/$region/$slug"
										params={{ region: g.region, slug: g.slug }}
										className="flex items-center justify-between gap-3 px-3 py-2 text-[0.8125rem] hover:bg-accent"
									>
										<span className="font-medium">{g.name}</span>
										<span className="num text-muted-foreground">
											{g.region.toUpperCase()} · {g.memberCount} members
										</span>
									</Link>
								</li>
							))}
						</ul>
					)}
				</div>
			)}
		</div>
	);
}

function AddGuild() {
	const add = useMutation(api.guilds.add);
	const navigate = useNavigate();
	const [name, setName] = useState("");
	const [region, setRegion] = useState<Region>("us");
	const [error, setError] = useState<string | null>(null);
	return (
		<form
			className="mt-8"
			onSubmit={async (e) => {
				e.preventDefault();
				setError(null);
				try {
					const params = await add({ name, region });
					await navigate({ to: "/g/$region/$slug", params });
				} catch (err) {
					setError(err instanceof ConvexError ? String(err.data) : "Couldn't add that guild.");
				}
			}}
		>
			<label htmlFor="guild-name" className="text-[0.8125rem] font-medium">
				Not on Guildie yet? Add it
			</label>
			<div className="mt-1.5 flex gap-2">
				<select
					aria-label="Region"
					value={region}
					onChange={(e) => setRegion(e.target.value as Region)}
					className="h-8 rounded-md border px-1.5 text-[0.8125rem] pointer-coarse:h-10"
				>
					{REGIONS.map((r) => (
						<option key={r} value={r}>
							{r.toUpperCase()}
						</option>
					))}
				</select>
				<Input
					id="guild-name"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="Guild name, exactly as in game"
				/>
				<Button type="submit" disabled={!name.trim()}>
					Add
				</Button>
			</div>
			{error && <p className="mt-2 text-sm text-destructive">{error}</p>}
		</form>
	);
}
