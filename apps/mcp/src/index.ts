import OAuthProvider, {
	AuthorizationError,
	authorizationErrorRedirect,
	type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { consentPage, homePage, messagePage } from "./pages.ts";
import { buildServer, type Props } from "./tools.ts";

// Guildie's MCP server (docs/mcp.md). AI apps register themselves (dynamic
// client registration or a metadata document), send the player to
// /authorize, and get OAuth tokens for /mcp. Who the player is comes from
// guildie.club itself:
//
// 1. GET /authorize: our consent page (client name, where tokens go).
// 2. POST /authorize: approved → guildie.club/connect/ai?state=…, where the
//    signed-in player confirms. Convex hands back a one-time code bound to
//    that state (convex/mcp.ts startConnect).
// 3. GET /callback?state&code: the library checks the state is this
//    browser's; Convex swaps the code for a connection (POST /mcp/exchange);
//    we finish the OAuth grant with { userId, connectionId } as its props.
// 4. POST /mcp: each tool call goes to Convex with the connection id, which
//    the player can delete in Settings to cut the app off.

export interface Env {
	OAUTH_KV: KVNamespace;
	/** Set by the library for the default handler. */
	OAUTH_PROVIDER: OAuthHelpers;
	/** This Worker's origin, e.g. https://mcp.guildie.club. */
	PUBLIC_URL: string;
	/** The Guildie site players confirm on, e.g. https://guildie.club. */
	SITE_URL: string;
	/** The Convex deployment's HTTP actions origin (….convex.site). */
	CONVEX_SITE_URL: string;
	/** Shared with that deployment's MCP_SECRET. `wrangler secret put`. */
	MCP_SECRET: string;
	LIMITER?: RateLimit;
}

const SCOPE = "guildie:read";
const DAY_S = 86_400;

const trimSlash = (url: string) => url.replace(/\/+$/, "");

/** The OAuth error page or redirect for a failed /authorize or /callback. */
function authorizationFailed(err: unknown) {
	if (err instanceof AuthorizationError) {
		if (err.redirectTo) return Response.redirect(err.redirectTo, 302);
		return messagePage("Couldn't connect", err.description);
	}
	throw err;
}

const defaultHandler = {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const oauth = env.OAUTH_PROVIDER;
		try {
			if (url.pathname === "/" && request.method === "GET") return homePage(`${trimSlash(env.PUBLIC_URL)}/mcp`);

			if (url.pathname === "/authorize" && request.method === "GET") {
				const authRequest = await oauth.parseAuthRequest(request);
				const facts = await oauth.describeConsent(authRequest);
				const consent = await oauth.beginConsent(authRequest);
				consent.headers.set("Content-Type", "text/html; charset=utf-8");
				return new Response(consentPage(facts, consent.handle), { headers: consent.headers });
			}

			if (url.pathname === "/authorize" && request.method === "POST") {
				const form = await request.formData();
				const handle = String(form.get("handle") ?? "");
				if (form.get("decision") !== "approve") {
					const denied = await oauth.denyConsent(request, handle);
					return new Response(null, { status: 302, headers: denied.headers });
				}
				const approved = await oauth.approveConsent(request, handle, { scope: [SCOPE] });
				const facts = await oauth.describeConsent(approved.request);
				const { state, headers } = await oauth.beginUpstream(approved.request, { headers: approved.headers });
				const next = new URL("/connect/ai", env.SITE_URL);
				next.searchParams.set("state", state);
				next.searchParams.set("client", facts.clientName.slice(0, 60));
				next.searchParams.set("host", facts.redirectHost);
				headers.set("Location", next.toString());
				return new Response(null, { status: 302, headers });
			}

			if (url.pathname === "/callback" && request.method === "GET") {
				const { request: original, headers } = await oauth.finishUpstream(request);
				const code = url.searchParams.get("code");
				if (!code) {
					headers.set("Location", authorizationErrorRedirect(original, "access_denied"));
					return new Response(null, { status: 302, headers });
				}
				const res = await fetch(`${trimSlash(env.CONVEX_SITE_URL)}/mcp/exchange`, {
					method: "POST",
					headers: { Authorization: `Bearer ${env.MCP_SECRET}`, "Content-Type": "application/json" },
					body: JSON.stringify({ code, state: url.searchParams.get("state") }),
				});
				const body = (await res.json().catch(() => null)) as {
					userId?: string;
					connectionId?: string;
					error?: string;
				} | null;
				if (!res.ok || !body?.userId || !body.connectionId) {
					console.warn("mcp: exchange failed", res.status, body?.error);
					return messagePage("Couldn't connect", body?.error ?? "Guildie didn't answer. Start again from your AI app.");
				}
				const props: Props = { userId: body.userId, connectionId: body.connectionId };
				const { redirectTo } = await oauth.completeAuthorization({
					request: original,
					userId: body.userId,
					metadata: { connectionId: body.connectionId },
					scope: original.scope.length ? original.scope : [SCOPE],
					props,
				});
				headers.set("Location", redirectTo);
				return new Response(null, { status: 302, headers });
			}
		} catch (err) {
			return authorizationFailed(err);
		}
		return messagePage("Not found", "There's nothing here.", 404);
	},
};

const mcpHandler = {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const props = (ctx as ExecutionContext & { props: Props }).props;
		if (env.LIMITER && !(await env.LIMITER.limit({ key: props.connectionId })).success) {
			return new Response("Too many requests. Slow down a little.", { status: 429 });
		}
		const server = buildServer({ siteUrl: trimSlash(env.CONVEX_SITE_URL), secret: env.MCP_SECRET }, props);
		// Stateless: no sessions to keep, so any isolate can answer any request.
		const transport = new WebStandardStreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
			enableJsonResponse: true,
		});
		await server.connect(transport);
		return transport.handleRequest(request);
	},
};

// The provider's options name this Worker's own URL, which differs per env,
// so it's built on the first request.
let provider: OAuthProvider<Env> | undefined;
let builtFor = "";

function providerFor(env: Env) {
	const origin = trimSlash(env.PUBLIC_URL);
	if (!provider || builtFor !== origin) {
		provider = new OAuthProvider<Env>({
			apiRoute: "/mcp",
			apiHandler: mcpHandler,
			defaultHandler,
			authorizeEndpoint: "/authorize",
			tokenEndpoint: "/oauth/token",
			clientRegistrationEndpoint: "/oauth/register",
			clientIdMetadataDocumentEnabled: true,
			scopesSupported: [SCOPE],
			resourceMetadata: {
				resource: `${origin}/mcp`,
				authorization_servers: [origin],
				scopes_supported: [SCOPE],
				resource_name: "Guildie",
			},
			accessTokenTTL: 3600,
			// A connected app stays connected while it's used at least monthly.
			refreshTokenTTL: 365 * DAY_S,
			refreshTokenIdleTTL: 30 * DAY_S,
		});
		builtFor = origin;
	}
	return provider;
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		return providerFor(env).fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
