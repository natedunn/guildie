import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { SectionTitle } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ago } from "@/lib/format";

/** The MCP server's address for this site; AI apps add it as a connector (docs/mcp.md). */
export const MCP_URL = "https://mcp.guildie.club/mcp";

/**
 * Settings → Account: AI apps (Claude, ChatGPT...) that can read this
 * player's guild data. Experimental and unannounced: the section only shows
 * once the player has connected one, so they can see and disconnect it.
 */
export function AiConnections() {
	const connections = useQuery(api.mcp.connections);
	const disconnect = useMutation(api.mcp.disconnect);
	if (!connections?.length) return null;
	return (
		<section className="mt-10">
			<SectionTitle>AI apps</SectionTitle>
			<p className="mt-1 text-muted-foreground">
				Experimental. AI apps connected with <span className="num select-all text-foreground">{MCP_URL}</span> can read
				what you see on Guildie, never change it.
			</p>
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
		</section>
	);
}
