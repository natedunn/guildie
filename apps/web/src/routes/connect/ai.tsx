import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { Page, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

// Step two of connecting an AI app (docs/mcp.md): the MCP server
// (mcp.guildie.club) already showed its consent page and sends the player here
// to confirm which Guildie account the app gets. Confirming hands the browser
// back to the MCP server with a one-time code (convex/mcp.ts startConnect).
// `client` and `host` are only shown, never trusted: the code is bound to
// `state`, which only the browser that started it can finish.
export const Route = createFileRoute("/connect/ai")({
	validateSearch: (search: Record<string, unknown>) => ({
		state: typeof search.state === "string" ? search.state : "",
		client: typeof search.client === "string" ? search.client.slice(0, 60) : "",
		host: typeof search.host === "string" ? search.host.slice(0, 120) : "",
		/** Only shown: what the app may do is in its OAuth grant (the MCP server's consent page). */
		access: search.access === "write" ? ("write" as const) : ("read" as const),
	}),
	head: () => ({ meta: [{ title: "Connect an AI app · Guildie" }] }),
	component: ConnectAi,
});

function ConnectAi() {
	const { state, client, host, access } = Route.useSearch();
	const { data: viewer } = useSuspenseQuery(convexQuery(api.users.viewer, {}));
	const start = useMutation(api.mcp.startConnect);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const name = client || "An AI app";
	const here = `/connect/ai?${new URLSearchParams({ state, client, host, access })}`;

	return (
		<Page width="narrow">
			<PageHeader title="Connect an AI app" />
			{!state ? (
				<p className="text-muted-foreground">This link is incomplete. Start connecting again from your AI app.</p>
			) : !viewer ? (
				<p>
					<Link to="/sign-in" search={{ next: here }} className="text-foreground underline underline-offset-4">
						Sign in
					</Link>{" "}
					first, then you'll come back here.
				</p>
			) : (
				<>
					<p className="text-muted-foreground">
						<span className="text-foreground">{name}</span> will read your Guildie data as{" "}
						<span className="text-foreground">{viewer.battletag ?? viewer.name}</span>: your guilds' rosters,
						characters, crafters, requests and activity, and your own bags and banks.{" "}
						{access === "write"
							? "It can also change your characters' stat priority and gear preferences, and nothing else."
							: "It can't change anything."}
					</p>
					{host && (
						<p className="mt-3 text-muted-foreground">
							Access goes to <span className="text-foreground">{host}</span>.
						</p>
					)}
					<p className="mt-3 text-muted-foreground">Disconnect it any time in Settings → Account.</p>
					<div className="mt-5 flex gap-2">
						<Button
							size="lg"
							disabled={pending}
							onClick={async () => {
								setError(null);
								setPending(true);
								try {
									const { redirect } = await start({ state, client, host });
									window.location.assign(redirect);
								} catch (err) {
									setPending(false);
									setError(err instanceof ConvexError ? String(err.data) : "Couldn't connect. Try again.");
								}
							}}
						>
							{pending ? "Connecting…" : "Connect"}
						</Button>
						<Button size="lg" variant="outline" render={<Link to="/settings" />}>
							Cancel
						</Button>
					</div>
					{error && <p className="mt-3 text-destructive">{error}</p>}
				</>
			)}
		</Page>
	);
}
