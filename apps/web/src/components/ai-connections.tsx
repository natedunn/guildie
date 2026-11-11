import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Button } from "@/components/ui/button";
import { ago } from "@/lib/format";

/** The MCP server's address for this site; AI apps add it as a connector (docs/mcp.md). */
export const MCP_URL = "https://mcp.guildie.club/mcp";

/** Settings → Account: AI apps (Claude, ChatGPT...) that can read this player's guild data. */
export function AiConnections() {
	const connections = useQuery(api.mcp.connections);
	const disconnect = useMutation(api.mcp.disconnect);
	return (
		<div>
			<p className="mt-1 text-muted-foreground">
				Experimental. Ask Claude, ChatGPT or another AI app about your guild. Add{" "}
				<span className="num select-all text-foreground">{MCP_URL}</span> as a custom connector, then sign in with
				Guildie. Apps can read what you see here, never change it.
			</p>
			{connections && connections.length > 0 && (
				<ul className="mt-3 divide-y divide-border border-y border-border">
					{connections.map((c) => (
						<li key={c._id} className="flex h-9 items-center justify-between gap-4">
							<span className="truncate">
								{c.client}
								{c.redirectHost && <span className="text-muted-foreground"> · {c.redirectHost}</span>}
							</span>
							<span className="num flex shrink-0 items-center gap-4 text-muted-foreground">
								{c.lastUsedAt ? `used ${ago(c.lastUsedAt)}` : `connected ${ago(c.createdAt)}`}
								<Button
									variant="ghost"
									size="xs"
									className="hover:text-destructive"
									onClick={() => disconnect({ connectionId: c._id })}
								>
									Disconnect
								</Button>
							</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
