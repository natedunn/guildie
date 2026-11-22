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
				open in requests, what's in your bank, which quests you share with guildmates. It reads what you see on Guildie.
				If you allow it when connecting, it can also set your characters' stat priority and gear preferences, and make
				and answer requests and track crafts for you, and nothing else.
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
					<span className="text-foreground">Claude (web or desktop):</span> open claude.ai/plugins → Add → Add custom
					connector. Name it Guildie, paste this address and click Continue. Choose Sign in now and finish adding the
					connector. After connecting, enable Guildie in your chat's + → Connectors menu.
				</li>
				<li>
					<span className="text-foreground">ChatGPT:</span> in your browser, open chatgpt.com/plugins → Add → Add a
					custom MCP server. Name it Guildie, paste this address and choose OAuth. Create and install the plugin, then
					type @Guildie in a new chat.
				</li>
				<li>
					Sign in with Guildie when asked and confirm on guildie.club. Character changes are optional; leave them off
					for read-only access. You can disconnect below at any time.
				</li>
				<li>
					Missing the add option? Availability depends on your AI app's plan and workspace permissions; a workspace
					admin may need to add Guildie for you.
				</li>
			</ul>
			{connections && connections.length > 0 && (
				<ul className="surface-card mt-4 divide-y divide-border text-[0.8125rem]">
					{connections.map((c) => (
						<li key={c._id} className="flex min-h-10 items-center justify-between gap-4 py-1.5 pr-1.5 pl-3.5">
							<span className="truncate">
								{c.client}
								{c.redirectHost && <span className="text-muted-foreground"> · {c.redirectHost}</span>}
								<span className="text-muted-foreground">
									{" "}
									·{" "}
									{[c.canWrite ? "sets characters" : "", c.canAct ? "acts in guilds" : ""].filter(Boolean).join(", ") ||
										"reads only"}
								</span>
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
