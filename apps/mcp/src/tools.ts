import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// The tools an AI app sees. Each one is answered by Convex
// (apps/web/convex/mcp.ts, via POST <CONVEX_SITE_URL>/mcp/tool) as the player
// who connected the app; the names here are the keys of MCP_TOOLS in
// apps/web/convex/http.ts. Keep descriptions short: apps send them to the
// model on every turn.

export type Props = { userId: string; connectionId: string };

export type ConvexTarget = { siteUrl: string; secret: string };

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const fail = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });

export async function callTool(
	convex: ConvexTarget,
	props: Props,
	tool: string,
	args: Record<string, unknown>,
	fetcher: typeof fetch = fetch,
): Promise<ToolResult> {
	let res: Response;
	try {
		res = await fetcher(`${convex.siteUrl}/mcp/tool`, {
			method: "POST",
			headers: { Authorization: `Bearer ${convex.secret}`, "Content-Type": "application/json" },
			body: JSON.stringify({ connectionId: props.connectionId, tool, args }),
		});
	} catch {
		return fail("Guildie is unreachable right now. Try again in a minute.");
	}
	const body = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
	if (body?.error) return fail(body.error);
	if (!res.ok || typeof body?.text !== "string") return fail("Guildie couldn't answer that. Try again in a minute.");
	return { content: [{ type: "text", text: body.text }] };
}

const guild = z.string().max(64).optional().describe("Guild name. Leave out if the player is in one guild.");

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

export const INSTRUCTIONS = `Guildie (guildie.club) tracks guilds in World of Warcraft: Forever (a Classic-era game; level cap 60).
Data comes from Blizzard (as of each character's last logout) and from the Guildie addon (fresher, in-game).
Characters are "Name Surname"; one name is enough when it's unique. Everything is read-only and limited to the player's own guilds.
Start with \`me\` to learn who the player is and which guilds they're in.`;

/** A fresh server per request (stateless): the tools, bound to this player's connection. */
export function buildServer(convex: ConvexTarget, props: Props) {
	const server = new McpServer({ name: "guildie", version: "1.0.0" }, { instructions: INSTRUCTIONS });
	const call = (tool: string) => (args: Record<string, unknown>) => callTool(convex, props, tool, args);

	server.registerTool(
		"me",
		{
			title: "Me",
			description: "The player: their BattleTag, claimed characters and guilds.",
			annotations: READ_ONLY,
		},
		() => callTool(convex, props, "me", {}),
	);
	server.registerTool(
		"guild_roster",
		{
			title: "Guild roster",
			description:
				"Members of a guild: level, race, class, rank, item level, talent points, professions, last logout. Optionally filter by any of those words.",
			inputSchema: {
				guild,
				search: z.string().max(64).optional().describe('Filter, e.g. "druid", "alchemy", "Brisket".'),
			},
			annotations: READ_ONLY,
		},
		call("guild_roster"),
	);
	server.registerTool(
		"character",
		{
			title: "Character",
			description:
				"One character in the player's guilds: gear by slot, talents, stat priority, professions, dungeons cleared, and how fresh the data is.",
			inputSchema: { name: z.string().min(1).max(64).describe('"Brisket" or "Brisket Smith".') },
			annotations: READ_ONLY,
		},
		call("character"),
	);
	server.registerTool(
		"who_can_craft",
		{
			title: "Who can craft",
			description:
				'Recipes known in the guild matching a search (recipe, item, item type or tooltip text, e.g. "8 slot bag"), with crafters by skill and reagents.',
			inputSchema: { search: z.string().min(2).max(64), guild },
			annotations: READ_ONLY,
		},
		call("who_can_craft"),
	);
	server.registerTool(
		"guild_requests",
		{
			title: "Guild requests",
			description: "Open and in-progress requests in the guild: who wants what, crafted or not, and who's on it.",
			inputSchema: { guild },
			annotations: READ_ONLY,
		},
		call("guild_requests"),
	);
	server.registerTool(
		"guild_activity",
		{
			title: "Guild activity",
			description: "The guild's recent feed, newest first: level-ups, dungeon clears, quests, requests.",
			inputSchema: { guild, limit: z.number().int().min(1).max(100).optional().describe("Default 30.") },
			annotations: READ_ONLY,
		},
		call("guild_activity"),
	);
	server.registerTool(
		"my_inventory",
		{
			title: "My bags and banks",
			description:
				"Items in the player's own characters' bags and banks (as the addon last read them), with counts per character. Optionally search by item name.",
			inputSchema: { search: z.string().max(64).optional() },
			annotations: READ_ONLY,
		},
		call("my_inventory"),
	);
	return server;
}
