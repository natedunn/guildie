import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { SectionTitle } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ago } from "@/lib/format";

/** The MCP server's address; AI apps add it as a connector (docs/mcp.md). */
export const MCP_URL = "https://mcp.guildie.club/connect";

/**
 * Settings → Account: connect Claude, ChatGPT or another AI app to read this
 * player's guild data (experimental), and the apps already connected.
 */
export function AiConnections() {
	const connections = useQuery(api.mcp.connections);
	const disconnect = useMutation(api.mcp.disconnect);
	const [copied, setCopied] = useState(false);
	return (
		<section id="ai-apps" className="mt-10 scroll-mt-4">
			<SectionTitle className="flex items-center gap-2">
				AI apps <span className="pill px-2 py-0 font-normal">Experimental</span>
			</SectionTitle>
			<p className="mt-1 text-[0.8125rem] text-muted-foreground">
				Ask Claude, ChatGPT or another AI app about your guild: who can craft something, what someone's wearing, what's
				open in requests, what's in your bank. It reads what you see on Guildie. If you allow it when connecting, it can
				also set your characters' stat priority and gear preferences, and nothing else.
			</p>
			<div className="mt-3 flex items-center gap-2">
				<code className="num flex h-8 min-w-0 flex-1 items-center truncate rounded-md border border-border bg-well px-3 text-[0.8125rem] select-all pointer-coarse:h-10">
					{MCP_URL}
				</code>
				<Button
					variant="outline"
					onClick={async () => {
						await navigator.clipboard?.writeText(MCP_URL).catch(() => {});
						setCopied(true);
						setTimeout(() => setCopied(false), 1500);
					}}
				>
					{copied ? "Copied" : "Copy"}
				</Button>
			</div>
			<ul className="mt-3 space-y-1 text-[0.8125rem] text-muted-foreground">
				<li>
					<span className="text-foreground">Claude:</span> add a custom connector (in Settings → Connectors) with this
					address.
				</li>
				<li>
					<span className="text-foreground">ChatGPT:</span> turn on developer mode (in Settings → Apps), then add an app
					with this address.
				</li>
				<li>Then sign in with Guildie when it asks, and confirm on guildie.club.</li>
			</ul>
			{connections && connections.length > 0 && (
				<ul className="surface-card mt-4 divide-y divide-border text-[0.8125rem]">
					{connections.map((c) => (
						<li key={c._id} className="flex min-h-10 items-center justify-between gap-4 py-1.5 pr-1.5 pl-3.5">
							<span className="truncate">
								{c.client}
								{c.redirectHost && <span className="text-muted-foreground"> · {c.redirectHost}</span>}
								<span className="text-muted-foreground"> · {c.canWrite ? "reads, sets characters" : "reads only"}</span>
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
		</section>
	);
}
