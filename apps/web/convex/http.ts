import { httpRouter } from "convex/server";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { sha256 } from "./claims";

const http = httpRouter();

// Battle.net's redirect for "claim my characters" (directly, or forwarded by
// the gateway). It only bounces the browser to the app that started the flow:
// the code is exchanged there, by the signed-in user who holds the state.
http.route({
	path: "/oauth/claim/callback",
	method: "GET",
	handler: httpAction(async (ctx, request) => {
		const url = new URL(request.url);
		const state = url.searchParams.get("state");
		const origin = state && (await ctx.runQuery(internal.claims.originFor, { stateHash: await sha256(state) }));
		if (!origin) return new Response("This link expired. Go back to Guildie and start again.", { status: 400 });
		const next = new URL(`${origin}/claim/callback`);
		for (const key of ["code", "state", "error"]) {
			const value = url.searchParams.get(key);
			if (value) next.searchParams.set(key, value);
		}
		return new Response(null, {
			status: 302,
			headers: { Location: next.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
		});
	}),
});

// ---- The MCP Worker (apps/mcp, docs/mcp.md) ----------------------------------------
// Server to server only: every call carries MCP_SECRET, which this deployment
// and its Worker share. Players never reach these directly.

const MCP_TOOLS = {
	me: internal.mcp.me,
	guild_roster: internal.mcp.guildRoster,
	character: internal.mcp.character,
	who_can_craft: internal.mcp.whoCanCraft,
	guild_requests: internal.mcp.requests,
	guild_activity: internal.mcp.activity,
	my_inventory: internal.mcp.inventory,
} as const;

/** The Worker's secret, compared in constant time; false when this deployment has none set. */
async function fromMcpWorker(request: Request) {
	const secret = process.env.MCP_SECRET;
	const given = request.headers.get("Authorization")?.replace(/^Bearer /, "");
	if (!secret || secret.length < 32 || !given) return false;
	const [a, b] = await Promise.all([sha256(secret), sha256(given)]);
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** A user-facing message from a ConvexError, else null (a bug: logged, not shown). */
function shownError(err: unknown) {
	if (err instanceof ConvexError) return typeof err.data === "string" ? err.data : "Something went wrong.";
	return null;
}

/** The player came back from /connect/ai: the Worker swaps their one-time code for a connection. */
http.route({
	path: "/mcp/exchange",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		if (!(await fromMcpWorker(request))) return json({ error: "unauthorized" }, 401);
		const body = (await request.json().catch(() => null)) as { code?: unknown; state?: unknown } | null;
		if (typeof body?.code !== "string" || typeof body.state !== "string") return json({ error: "bad request" }, 400);
		const result = await ctx.runMutation(internal.mcp.exchange, { code: body.code, state: body.state });
		return result ? json(result) : json({ error: "This sign-in expired or was already used. Start again." }, 400);
	}),
});

/** One tool call, as the player behind the connection. Answers `{ text }` or `{ error }` (shown to the AI app). */
http.route({
	path: "/mcp/tool",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		if (!(await fromMcpWorker(request))) return json({ error: "unauthorized" }, 401);
		const body = (await request.json().catch(() => null)) as {
			connectionId?: unknown;
			tool?: unknown;
			args?: unknown;
		} | null;
		const tool = typeof body?.tool === "string" ? MCP_TOOLS[body.tool as keyof typeof MCP_TOOLS] : undefined;
		if (!tool || typeof body?.connectionId !== "string") return json({ error: "Unknown tool." }, 400);
		const args = typeof body.args === "object" && body.args !== null ? body.args : {};
		try {
			// biome-ignore lint/suspicious/noExplicitAny: each tool's own validators check the args
			const text: string = await ctx.runQuery(tool as any, { ...args, connectionId: body.connectionId });
			const connectionId = body.connectionId;
			await ctx.runMutation(internal.mcp.touch, { connectionId: connectionId as Id<"aiConnections"> });
			return json({ text });
		} catch (err) {
			const message = shownError(err);
			if (message) return json({ error: message });
			console.error("mcp tool failed", body.tool, err);
			return json({ error: "That didn't work. Check the arguments and try again." });
		}
	}),
});

export default http;
