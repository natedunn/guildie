import assert from "node:assert/strict";
import { test } from "node:test";
import { consentPage, escapeHtml } from "./pages.ts";
import { buildServer, callTool } from "./tools.ts";

const convex = { siteUrl: "https://example.convex.site", secret: "s".repeat(40) };
const props = { userId: "u1", connectionId: "c1" };

test("the consent page escapes what the client chose", () => {
	const html = consentPage(
		{ clientName: `<script>alert(1)</script>`, redirectHost: `evil.example"><b>`, redirectIsLoopback: false },
		"handle&1",
	);
	assert.ok(!html.includes("<script>alert"));
	assert.ok(!html.includes(`"><b>`));
	assert.ok(html.includes(escapeHtml("handle&1")));
	assert.ok(html.includes("named itself"));
});

test("the consent page warns about apps on this computer and names a verified domain", () => {
	const html = consentPage(
		{ clientName: "Claude", clientDomain: "claude.ai", redirectHost: "127.0.0.1", redirectIsLoopback: true },
		"h",
	);
	assert.ok(html.includes("an app on your computer"));
	assert.ok(html.includes("Published by <strong>claude.ai</strong>"));
});

test("callTool sends the secret and the connection, and returns Convex's text", async () => {
	let sent: { url: string; init?: RequestInit } | undefined;
	const fake = (async (url: string, init?: RequestInit) => {
		sent = { url, init };
		return Response.json({ text: "Wildhammers: 12 members." });
	}) as typeof fetch;
	const out = await callTool(convex, props, "guild_roster", { search: "druid" }, fake);
	assert.equal(sent?.url, "https://example.convex.site/mcp/tool");
	assert.equal(new Headers(sent?.init?.headers).get("Authorization"), `Bearer ${convex.secret}`);
	assert.deepEqual(JSON.parse(String(sent?.init?.body)), {
		connectionId: "c1",
		tool: "guild_roster",
		args: { search: "druid" },
	});
	assert.deepEqual(out, { content: [{ type: "text", text: "Wildhammers: 12 members." }] });
});

test("callTool turns Convex's errors and outages into tool errors", async () => {
	const disconnected = (async () => Response.json({ error: "This app was disconnected." })) as unknown as typeof fetch;
	assert.deepEqual(await callTool(convex, props, "me", {}, disconnected), {
		content: [{ type: "text", text: "This app was disconnected." }],
		isError: true,
	});
	const down = (async () => {
		throw new Error("network");
	}) as unknown as typeof fetch;
	assert.equal((await callTool(convex, props, "me", {}, down)).isError, true);
	const broken = (async () => new Response("oops", { status: 500 })) as unknown as typeof fetch;
	assert.equal((await callTool(convex, props, "me", {}, broken)).isError, true);
});

test("the consent page asks separately for changing settings and acting in guilds", () => {
	const html = consentPage({ clientName: "Claude", redirectHost: "claude.ai", redirectIsLoopback: false }, "h");
	assert.ok(html.includes(`name="write" value="1" checked`));
	assert.ok(html.includes(`name="act" value="1">`), "acting is off unless ticked");
});

test("the tools offered follow what the player allowed", async () => {
	const listed = async (allowed: { canWrite?: boolean; canAct?: boolean }) => {
		const server = buildServer(convex, props, allowed);
		const tools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
		return Object.keys(tools);
	};
	const read = await listed({});
	assert.ok(read.includes("my_quests") && read.includes("recipes") && read.includes("guild_addons"));
	assert.ok(!read.includes("set_stat_priority") && !read.includes("create_request"));
	const write = await listed({ canWrite: true });
	assert.ok(write.includes("set_stat_priority") && !write.includes("create_request"));
	const act = await listed({ canAct: true });
	assert.ok(act.includes("create_request") && act.includes("track_craft") && !act.includes("set_gear_preference"));
});
