import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// The tools an AI app sees. Each one is answered by Convex
// (apps/web/convex/mcp*.ts, via POST <CONVEX_SITE_URL>/mcp/tool) as the player
// who connected the app; the names here are the keys of MCP_TOOLS and
// MCP_WRITE_TOOLS in apps/web/convex/http.ts. Keep descriptions short: apps
// send them to the model on every turn.

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
const anyGuild = z
	.string()
	.max(64)
	.optional()
	.describe("Guild name: one of the player's, or any public guild. Leave out if the player is in one guild.");
const ownCharacter = z.string().max(64).optional().describe("One of the player's characters. Leave out for all.");
const days = z.union([z.literal(14), z.literal(30), z.literal(90)]);

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

export const INSTRUCTIONS = `Guildie (guildie.club) tracks guilds in World of Warcraft: Forever (a Classic-era game; level cap 60).
Data comes from Blizzard (as of each character's last logout) and from the Guildie addon (fresher, in game: bags, banks, gold, quest progress).
Characters are "Name Surname"; one name is enough when it's unique. Reading covers the player's own guilds, and the rosters, characters, crafters and addons of public guilds by name.
If the player allowed it, set_stat_priority and set_gear_preference change their own characters' settings, and the request and tracking tools act for them in their guilds (guildmates see requests and get notified). Confirm with the player before changing anything.
Start with \`me\` to learn who the player is, which guilds they're in and what this app may do.`;

type Call = (tool: string) => (args: Record<string, unknown>) => Promise<ToolResult>;

/** A fresh server per request (stateless): the tools, bound to this player's connection. */
export function buildServer(
	convex: ConvexTarget,
	props: Props,
	{ canWrite = false, canAct = false }: { canWrite?: boolean; canAct?: boolean } = {},
) {
	const server = new McpServer({ name: "guildie", version: "1.1.0" }, { instructions: INSTRUCTIONS });
	const call: Call = (tool) => (args) => callTool(convex, props, tool, args);
	registerReads(server, call);
	if (canWrite) registerWrites(server, call);
	if (canAct) registerActs(server, call);
	return server;
}

function registerReads(server: McpServer, call: Call) {
	server.registerTool(
		"me",
		{
			title: "Me",
			description:
				"The player: their BattleTag, characters (level, class, guild, professions, gold), guilds, and what this app may do.",
			annotations: READ_ONLY,
		},
		() => call("me")({}),
	);
	server.registerTool(
		"guild_roster",
		{
			title: "Guild roster",
			description:
				"Members of a guild (the player's, or any public guild): level, race, class, rank, item level, talent points, professions, last logout. 200 per page; filter by any of those words.",
			inputSchema: {
				guild: anyGuild,
				search: z.string().max(64).optional().describe('Filter, e.g. "druid", "alchemy", "Brisket".'),
				page: z.number().int().min(1).max(50).optional().describe("Default 1."),
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
				"One character in the player's guilds (or a public guild, by full name): gear by slot, talents, stat priority, professions, dungeons cleared, gold for the player's own, and how fresh the data is.",
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
			inputSchema: { search: z.string().min(2).max(64), guild: anyGuild },
			annotations: READ_ONLY,
		},
		call("who_can_craft"),
	);
	server.registerTool(
		"guild_requests",
		{
			title: "Guild requests",
			description:
				"Open and in-progress requests in the guild: who wants what, crafted or not, who's on it, and each one's id.",
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
		"guild_quests",
		{
			title: "Guild dungeon quests",
			description:
				"Dungeon and raid quests the guild's members have in progress, by dungeon, with who has which: who to group with.",
			inputSchema: { guild, dungeon: z.string().max(64).optional().describe('e.g. "Wailing Caverns".') },
			annotations: READ_ONLY,
		},
		call("guild_quests"),
	);
	server.registerTool(
		"guild_addons",
		{
			title: "Guild addons",
			description:
				"The addons members of a guild run (only those who share them), most used first; search to see who runs which version.",
			inputSchema: {
				guild: anyGuild,
				search: z.string().max(64).optional().describe('An addon or category, e.g. "Questie".'),
			},
			annotations: READ_ONLY,
		},
		call("guild_addons"),
	);
	server.registerTool(
		"recipes",
		{
			title: "Recipes",
			description:
				"Search every recipe in the game: profession, what it makes and needs, skill-up levels, how it's learned (trainer or pattern), and who in the player's guilds knows it.",
			inputSchema: {
				search: z.string().min(2).max(64).describe("A recipe or item name, or a recipe id."),
				profession: z.string().max(32).optional(),
			},
			annotations: READ_ONLY,
		},
		call("recipes"),
	);
	server.registerTool(
		"item",
		{
			title: "Item",
			description:
				"One item by name or id: its tooltip, the recipe that makes it and who knows it, how many the player has, and open requests for it.",
			inputSchema: { name: z.string().min(2).max(64) },
			annotations: READ_ONLY,
		},
		call("item"),
	);
	server.registerTool(
		"my_inventory",
		{
			title: "My bags and banks",
			description:
				"Items in the player's own characters' bags and banks (as the addon last read them), with counts per character, and each one's gold. Optionally search by item name.",
			inputSchema: { search: z.string().max(64).optional() },
			annotations: READ_ONLY,
		},
		call("my_inventory"),
	);
	server.registerTool(
		"my_quests",
		{
			title: "My quests",
			description:
				"The player's characters' quest logs: level, zone, objectives and progress, ready to turn in, and guildmates on the same quests.",
			inputSchema: {
				character: ownCharacter,
				search: z.string().max(64).optional().describe("A quest, zone or dungeon."),
			},
			annotations: READ_ONLY,
		},
		call("my_quests"),
	);
	server.registerTool(
		"my_crafting",
		{
			title: "My crafting",
			description:
				"What the player's characters can craft, per profession: skill, recipes that still give skill-ups (with reagents on hand), what their bags can make now, trainer recipes to learn.",
			inputSchema: { character: ownCharacter, profession: z.string().max(32).optional() },
			annotations: READ_ONLY,
		},
		call("my_crafting"),
	);
	server.registerTool(
		"tracked_crafts",
		{
			title: "Tracked crafts",
			description:
				"The crafts the player is gathering for: each reagent's have against need, which character holds it, and where to get the rest (vendor, a guildmate who makes it).",
			annotations: READ_ONLY,
		},
		() => call("tracked_crafts")({}),
	);
	server.registerTool(
		"my_requests",
		{
			title: "My requests",
			description:
				"The player's own requests (open, and closed in the last two weeks), crafts guildmates asked them to make, and crafts they accepted, with ids and reagents.",
			annotations: READ_ONLY,
		},
		() => call("my_requests")({}),
	);
	server.registerTool(
		"my_notifications",
		{
			title: "My notifications",
			description: "The player's Guildie inbox, newest first: what happened to their requests and crafts.",
			inputSchema: { limit: z.number().int().min(1).max(50).optional().describe("Default 20.") },
			annotations: READ_ONLY,
		},
		call("my_notifications"),
	);
}

/** Changing the player's own characters' settings (scope guildie:write). */
function registerWrites(server: McpServer, call: Call) {
	const WRITES = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
	const character = z.string().min(1).max(64).describe("One of the player's own claimed characters.");
	server.registerTool(
		"set_stat_priority",
		{
			title: "Set stat priority",
			description:
				"Set what one of the player's own characters looks for on gear: 3-10 stats (most important first) with an optional steepness (even, balanced, steep), a talent tree's priority, or reset to follow their talents. The character tool lists the choices.",
			inputSchema: {
				character,
				stats: z
					.array(z.string().max(32))
					.min(3)
					.max(10)
					.optional()
					.describe('e.g. ["Agility", "Strength", "Stamina"]'),
				steepness: z
					.enum(["even", "balanced", "steep"])
					.optional()
					.describe("How much more the first stat counts. Default balanced."),
				tree: z.string().max(32).optional().describe('A talent tree, e.g. "Feral Combat", instead of stats.'),
				reset: z.boolean().optional().describe("Back to following their talents."),
			},
			annotations: WRITES,
		},
		call("set_stat_priority"),
	);
	server.registerTool(
		"set_gear_preference",
		{
			title: "Set gear preference",
			description:
				'Set the armor and/or weapon types one of the player\'s own characters prefers in gear suggestions, most preferred first ("none" clears). strict: suggest only these types.',
			inputSchema: {
				character,
				armor: z
					.union([z.string().max(32), z.array(z.string().max(32)).max(8)])
					.optional()
					.describe('e.g. ["Leather", "Mail"], or "none".'),
				weapon: z
					.union([z.string().max(32), z.array(z.string().max(32)).max(8)])
					.optional()
					.describe('e.g. ["Two-Handed Axes", "Two-Handed Maces"], or "none".'),
				strict: z.boolean().optional().describe("Only suggest these types, rather than just preferring them."),
			},
			annotations: WRITES,
		},
		call("set_gear_preference"),
	);
}

/** Acting for the player in their guilds (scope guildie:act): requests, tracked crafts, notifications. */
function registerActs(server: McpServer, call: Call) {
	const ACTS = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
	server.registerTool(
		"create_request",
		{
			title: "Make a request",
			description:
				"Ask the guild for an item (a fixed amount, or ongoing: any they have, for 14, 30 or 90 days), or ask one guildmate to craft a recipe. Guildmates see it; the crafter is notified.",
			inputSchema: {
				guild,
				item: z.string().max(64).optional().describe("An item name or id, to be sent."),
				recipe: z.string().max(64).optional().describe("A recipe name or id, to have crafted."),
				quantity: z.number().int().min(1).max(1000).optional().describe("Default 1. Not for ongoing."),
				ongoing: z.boolean().optional().describe("Items: any amount, until it ends."),
				days: days.optional().describe("Ongoing: how long. Default 30."),
				crafter: z.string().max(64).optional().describe("Recipes: the guildmate to ask (one who knows it)."),
				hasMats: z.boolean().optional().describe("Recipes: the player has the reagents."),
				character: z
					.string()
					.max(64)
					.optional()
					.describe("Which of the player's characters asks. Default: highest level."),
				note: z.string().max(140).optional(),
			},
			annotations: ACTS,
		},
		call("create_request"),
	);
	server.registerTool(
		"update_request",
		{
			title: "Answer or close a request",
			description:
				"Act on a request by its id. Requester: cancel, done, still_needed, ask (a crafter, after a decline), has_mats or no_mats, change (ongoing: days, note), back_out (take an accepted craft back). Crafter asked: accept, decline; after accepting: back_out. Crafts close by themselves when the item arrives.",
			inputSchema: {
				request: z.string().min(8).max(64).describe("The request's id, from guild_requests or my_requests."),
				action: z.enum([
					"cancel",
					"done",
					"still_needed",
					"ask",
					"has_mats",
					"no_mats",
					"change",
					"accept",
					"decline",
					"back_out",
				]),
				crafter: z.string().max(64).optional().describe("ask: the guildmate to ask."),
				days: days.optional().describe("change: the new length, from now."),
				note: z.string().max(140).optional().describe("change: the new note."),
			},
			annotations: ACTS,
		},
		call("update_request"),
	);
	server.registerTool(
		"track_craft",
		{
			title: "Track a craft",
			description:
				"Track a craft for the player, or change how many: its reagents show have and need on Guildie and on their tooltips in game.",
			inputSchema: {
				recipe: z.string().min(2).max(64).describe("A recipe name or id."),
				quantity: z.number().int().min(1).max(999).optional().describe("How many to make. Default 1."),
			},
			annotations: { ...ACTS, idempotentHint: true },
		},
		call("track_craft"),
	);
	server.registerTool(
		"untrack_craft",
		{
			title: "Stop tracking a craft",
			description: "Stop tracking one of the player's tracked crafts.",
			inputSchema: { recipe: z.string().min(2).max(64).describe("A recipe name or id.") },
			annotations: { ...ACTS, destructiveHint: true, idempotentHint: true },
		},
		call("untrack_craft"),
	);
	server.registerTool(
		"mark_notifications_read",
		{
			title: "Mark notifications read",
			description: "Mark all of the player's Guildie notifications read.",
			annotations: { ...ACTS, idempotentHint: true },
		},
		() => call("mark_notifications_read")({}),
	);
}
