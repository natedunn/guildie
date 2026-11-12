import { api } from "@convex/_generated/api";
import { REGIONS, type Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { Landing } from "@/components/landing/landing";
import { PaneHero } from "@/components/status-pages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// No home page for signed-in players: "/" opens your guild (the sidebar
// switches between guilds). It shows a page only to signed-out visitors (what
// Guildie is, and sign in), and to players whose guild Guildie hasn't found
// yet (characters under level 10, or not logged out since joining). The
// Windows app has no landing page: signed out, it opens the sign-in card.
export const Route = createFileRoute("/")({
	loader: async ({ context }) => {
		const viewer = await context.queryClient.ensureQueryData(convexQuery(api.users.viewer, {}));
		if (!viewer && context.desktop) throw redirect({ to: "/sign-in", replace: true });
		const first = viewer?.guilds[0];
		if (first)
			throw redirect({ to: "/g/$region/$slug", params: { region: first.region, slug: first.slug }, replace: true });
	},
	// Signed out, it's the landing page, without the app shell (lib/shell.ts).
	staticData: { shell: "landing" },
	component: Home,
});

function Home() {
	const { data: viewer } = useSuspenseQuery(convexQuery(api.users.viewer, {}));
	if (!viewer) return <Landing />;
	return (
		<PaneHero
			pill={<>Signed in as {viewer.battletag ?? viewer.name}</>}
			title="No guild found yet"
			description="Guildie finds your guild from your characters. A character shows up once it's level 10 and has logged out since joining the guild; then sign out and in again. Or add your guild."
		>
			<AddGuild />
		</PaneHero>
	);
}

// ---- Signed in, no guild yet --------------------------------------------------------

function AddGuild() {
	const add = useMutation(api.guilds.add);
	const navigate = useNavigate();
	const [name, setName] = useState("");
	const [region, setRegion] = useState<Region>("us");
	const [error, setError] = useState<string | null>(null);
	return (
		<form
			className="surface-card mt-8 w-full max-w-lg p-5 text-left"
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
			<span aria-hidden className="streak" />
			<label htmlFor="guild-name" className="text-sm font-semibold">
				Not on Guildie yet? Add it
			</label>
			<div className="mt-3 flex gap-2">
				<select
					aria-label="Region"
					value={region}
					onChange={(e) => setRegion(e.target.value as Region)}
					className="h-8 rounded-md border border-input bg-transparent px-1.5 text-[0.8125rem] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-highlight/12 pointer-coarse:h-10"
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
