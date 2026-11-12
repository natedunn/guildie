import { api } from "@convex/_generated/api";
import type { Region } from "@convex/shared/wow";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, Outlet, useMatch } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { shareMeta } from "@/lib/share";

// A guild's pages: the roster (index) and what the guild can craft
// (crafting), under one header with the guild's facts. The sidebar
// switches between them (no tabs here); its footer has the sync row
// (components/sync-button.tsx).
export const Route = createFileRoute("/g/$region/$slug")({
	loader: async ({ context, params }) => {
		const data = await context.queryClient.ensureQueryData(
			convexQuery(api.guilds.get, { region: params.region as Region, slug: params.slug }),
		);
		if (!data) throw notFound();
		// What a shared link's preview says (members-only guilds say nothing more).
		let description = `${data.guild.name} is a members-only guild on Guildie.`;
		if (!data.hidden) {
			const g = data.guild;
			const faction = g.faction && g.faction[0] + g.faction.slice(1).toLowerCase();
			description = `${[g.region.toUpperCase(), faction].filter(Boolean).join(" · ")} guild, ${g.memberCount} members: roster, gear, talents and crafters on Guildie.`;
		}
		return { name: data.guild.name, description };
	},
	head: ({ loaderData }) => ({
		meta: [
			{ title: `${loaderData?.name ?? "Guild"} · Guildie` },
			...(loaderData ? shareMeta(loaderData.name, loaderData.description) : []),
		],
	}),
	component: GuildLayout,
});

function GuildLayout() {
	const params = Route.useParams();
	const dungeonPage = useMatch({ from: "/g/$region/$slug/dungeons/$dungeon", shouldThrow: false });
	const { data } = useSuspenseQuery(
		convexQuery(api.guilds.get, { region: params.region as Region, slug: params.slug }),
	);
	if (!data) return null;
	if (data.hidden) {
		return (
			<PageHeader
				title={data.guild.name}
				description={
					<>
						This guild's roster is for members only.{" "}
						<Link to="/settings" className="text-foreground underline underline-offset-4">
							Claim your characters
						</Link>{" "}
						to see it.
					</>
				}
			/>
		);
	}
	const { guild } = data;
	// A dungeon's page has its own header (dungeons.$dungeon.tsx).
	if (dungeonPage) return <Outlet />;
	const faction = guild.faction && guild.faction[0] + guild.faction.slice(1).toLowerCase();
	return (
		<div className="flex min-h-full flex-col">
			<PageHeader
				title={guild.name}
				description={
					<span className="num">
						{[guild.region.toUpperCase(), faction, `${guild.memberCount} members`].filter(Boolean).join(" · ")}
					</span>
				}
			/>
			<Outlet />
		</div>
	);
}
