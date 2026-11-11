# AI apps (MCP)

Experimental: Settings → Account → AI apps says so, with the address and
how to add it.

Players can ask Claude, ChatGPT or any other app that speaks MCP about their
guild: "who can craft a Mooncloth Bag?", "what's Brisket wearing?", "which
requests are open?". The app connects to Guildie's MCP server at
`https://mcp.guildie.club/mcp`, the player signs in with their Guildie
account, and the app reads what that player can see on the site, nothing more.
If the player allows it, it can also set their own characters' stat priority
and gear preferences, and nothing else.

## The pieces

| Where                                                    | What                                                                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `apps/mcp` (Worker `guildie-mcp`, `mcp.guildie.club`)    | OAuth 2.1 (`@cloudflare/workers-oauth-provider`, KV `OAUTH_KV`) and the MCP endpoint (stateless, `/mcp`) |
| `apps/mcp/src/tools.ts`                                  | The tools the app sees: names, descriptions, argument schemas                                            |
| `apps/web/convex/mcp.ts`                                 | What each tool answers (short plain text), connecting, the connection list                               |
| `apps/web/convex/http.ts` (`/mcp/exchange`, `/mcp/tool`) | The Worker's way in, guarded by `MCP_SECRET`                                                             |
| `apps/web/src/routes/connect/ai.tsx`                     | Where the player confirms which account the app gets                                                     |
| Settings → Account → AI apps                             | The address to copy, how to add it in Claude and ChatGPT, connected apps with Disconnect                 |

The Worker holds no game data and no Battle.net tokens. It knows a player only
as `{ userId, connectionId }`, encrypted in the OAuth grant.

## How connecting flows

1. The app calls `/mcp` without a token, gets a `401` pointing at
   `/.well-known/oauth-protected-resource/mcp`, registers itself (dynamic
   registration at `/oauth/register`, or a client metadata document), and
   opens `/authorize` in the player's browser.
2. `/authorize` shows our consent page: the app's name (self-declared unless
   it comes from a metadata document's domain), where its tokens go, and a
   warning when that's an app on this computer. The library binds the page to
   the browser with a `__Host-` cookie.
3. Continue sends the browser to `https://guildie.club/connect/ai?state=…`
   (after sign-in, if needed). The player confirms; `mcp:startConnect` stores a
   one-time code (hash only, five minutes) bound to the state, and the browser
   goes to `<MCP_URL>/callback?state=…&code=…`.
4. `/callback` only works in the browser that started (the library's state
   cookie). The Worker swaps the code at Convex `POST /mcp/exchange`, which
   creates an `aiConnections` row, and finishes the OAuth grant.
5. Each tool call is `POST /mcp/tool` with the connection id. Convex looks the
   connection up first: Disconnect in Settings deletes it, and the app is cut
   off on its next call. Access tokens last an hour, refresh tokens a year
   (30 days idle).

## The tools

Reading, limited to the player's own guilds (whatever their visibility) and,
for bags and banks, their own characters:

`me`, `guild_roster`, `character`, `who_can_craft`, `guild_requests`,
`guild_activity`, `my_inventory`.

Changing, only if the player allowed it when connecting, only on characters
they claimed, and only these two settings (never anything about the account,
the guild or requests):

- `set_stat_priority`: 3 to 5 stats with a steepness, a talent tree's, or
  reset to their talents.
- `set_gear_preference`: preferred (or only) armor and weapon types.

They go through the same checks as the site (`setStatPriority` and
`setGearPreference` in `convex/statPriority.ts`), and the `character` tool
lists the choices for the player's own characters.

**Permission:** the consent page has "Also let it change your characters'
stat priority and gear preferences", ticked by default. Ticked, the grant gets
scope `guildie:write` as well as `guildie:read`, and the connection
`canWrite`. The Worker only offers the two tools to tokens with that scope, and
Convex checks `canWrite` (`writerOf`) on every change. Connections from before
this, or with the box unticked, stay read-only; reconnecting is the way to
allow changes.

To add a read tool: a handler in `convex/mcp.ts` (an `internalQuery` that
starts with `viewerOf` and returns a string), its name in `MCP_TOOLS` in
`convex/http.ts`, and its description and arguments in `apps/mcp/src/tools.ts`.
A tool that changes something is an `internalMutation` starting with
`writerOf`, in `MCP_WRITE_TOOLS`, registered after `canWrite` in `tools.ts`.
Keep answers short: names, not ids; one line per thing; cap long lists with
`capped`. Descriptions go to the model on every turn, so keep them to a
sentence.

## Settings

| Where                                   | Name              | Value                                                                       |
| --------------------------------------- | ----------------- | --------------------------------------------------------------------------- |
| Convex prod `scintillating-gnat-539`    | `MCP_SECRET`      | 64 random hex characters (`openssl rand -hex 32`), the same as the Worker's |
| Convex prod `scintillating-gnat-539`    | `MCP_URL`         | `https://mcp.guildie.club`                                                  |
| Worker `guildie-mcp` (secret)           | `MCP_SECRET`      | The same value as on Convex                                                 |
| Worker `guildie-mcp` (`wrangler.jsonc`) | `PUBLIC_URL`      | `https://mcp.guildie.club`                                                  |
| Worker `guildie-mcp` (`wrangler.jsonc`) | `SITE_URL`        | `https://guildie.club`                                                      |
| Worker `guildie-mcp` (`wrangler.jsonc`) | `CONVEX_SITE_URL` | `https://scintillating-gnat-539.convex.site`                                |
| Worker `guildie-mcp` (`wrangler.jsonc`) | KV `OAUTH_KV`     | Namespace `guildie-mcp-oauth`; its id goes in `env.prod.kv_namespaces`      |

A deployment without `MCP_SECRET` refuses every call to `/mcp/*`, and one
without `MCP_URL` says AI apps can't connect. Previews and cloud dev have
neither.

### Setting up production (once)

```sh
cd apps/mcp
export CLOUDFLARE_ACCOUNT_ID=fc87b44f5832b25053fec2efb19fc208
npx wrangler kv namespace create guildie-mcp-oauth   # put the id in wrangler.jsonc, env.prod
npx wrangler secret put MCP_SECRET -c wrangler.jsonc --env prod
cd ../web
npx convex env set MCP_SECRET <the same value> --deployment scintillating-gnat-539
npx convex env set MCP_URL https://mcp.guildie.club --deployment scintillating-gnat-539
cd ../mcp && pnpm deploy:prod
```

The Convex side ships with the normal deploy (merge to `main`); set the
variables before or after, it stays off until both are there.

## Locally

1. `pnpm dev` (the site and this checkout's Convex backend).
2. On that backend: `npx convex env set MCP_SECRET <secret>` and
   `npx convex env set MCP_URL http://localhost:8788` (in `apps/web`, with
   `CONVEX_AGENT_MODE=anonymous`).
3. `apps/mcp/.dev.vars` (ignored by git):

   ```
   CONVEX_SITE_URL=http://127.0.0.1:<site port>
   SITE_URL=https://<checkout>.guildie.localhost:1355
   MCP_SECRET=<the same secret>
   ```

   The site port is `VITE_CONVEX_SITE_URL` in `apps/web/.env.local`.
4. `pnpm --filter @guildie/mcp dev` serves `http://localhost:8788/mcp`. Point
   an MCP client at it (MCP Inspector: `npx @modelcontextprotocol/inspector`),
   or Claude Code: `claude mcp add --transport http guildie http://localhost:8788/mcp`.
