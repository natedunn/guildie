import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { PageTab, PageTabs } from "@/components/page-tabs";
import { isAuthReturn } from "@/lib/auth-return";

// Settings: Account (you, your characters, privacy, sign out), Guilds (yours;
// owners choose who can see them), Addon (the
// Guildie addon in WoW and its sync, through the app), App (the desktop app:
// its version and updates, and the computers connected to your account).
export const Route = createFileRoute("/settings")({
	beforeLoad: ({ context, location }) => {
		// Not while a sign-in is finishing on this page (see isAuthReturn).
		if (!context.token && !isAuthReturn(location.searchStr)) throw redirect({ to: "/sign-in" });
	},
	head: () => ({ meta: [{ title: "Settings · Guildie" }] }),
	component: SettingsLayout,
});

function SettingsLayout() {
	const { data: viewer } = useSuspenseQuery(convexQuery(api.users.viewer, {}));
	if (!viewer) return null;
	return (
		<div className="flex min-h-full flex-col">
			<PageHeader
				title="Settings"
				description={
					<>
						<span className="text-foreground">{viewer.battletag ?? viewer.name}</span>
						{viewer.guilds.length > 0 && " · "}
						{viewer.guilds.map((g, i) => (
							<span key={g._id}>
								{i > 0 && ", "}
								<Link
									to="/g/$region/$slug"
									params={{ region: g.region, slug: g.slug }}
									className="text-foreground hover:underline underline-offset-4"
								>
									{g.name}
								</Link>
							</span>
						))}
					</>
				}
				className="pb-0"
			>
				<PageTabs className="mt-4">
					<PageTab to="/settings">Account</PageTab>
					<PageTab to="/settings/guilds">Guilds</PageTab>
					<PageTab to="/settings/addon">Addon</PageTab>
					<PageTab to="/settings/app" activeOptions={{ includeSearch: false }}>
						App
					</PageTab>
				</PageTabs>
			</PageHeader>
			<div className="pt-6">
				<Outlet />
			</div>
		</div>
	);
}
