# Auth environments

Sign-in is Battle.net, through Convex Auth v2 (`@convex-dev/auth@2.0.0`,
pinned and patched). One Battle.net client per tier, and a gateway Worker per
tier that forwards Battle.net's callback to whichever Convex deployment
started the flow. That's what lets every worktree, every branch preview and
cloud dev share one client. Same design as Onda and Sportsball.

## Tiers

| Tier | Serves                                      | Gateway Worker                                              | Battle.net client | Convex                                            |
| ---- | ------------------------------------------- | ----------------------------------------------------------- | ----------------- | ------------------------------------------------- |
| Dev  | local worktrees, cloud dev, branch previews | `guildie-gateway-dev` on `https://gateway-dev.guildie.club` | `guildie-dev`     | cloud dev `merry-fish-229`, plus preview defaults |
| Prod | guildie.club                                | `guildie-gateway` on `https://gateway.guildie.club`         | `guildie`         | prod `scintillating-gnat-539`                     |

Each Battle.net client registers two redirect URLs, and they never change:

| Tier | Sign-in                                                     | Read characters (claim)                                 |
| ---- | ----------------------------------------------------------- | ------------------------------------------------------- |
| Dev  | `https://gateway-dev.guildie.club/oauth/battlenet/callback` | `https://gateway-dev.guildie.club/oauth/claim/callback` |
| Prod | `https://gateway.guildie.club/oauth/battlenet/callback`     | `https://gateway.guildie.club/oauth/claim/callback`     |

Sign-in asks for `openid wow.profile`, so Battle.net shows one consent
screen. Convex Auth doesn't hand us the sign-in's access token, so reading the
characters is a second authorization (`wow.profile`) right after sign-in,
which Battle.net approves without asking again. We never store Battle.net's
tokens.

## Settings, all of them

**Convex**, on cloud dev, on prod, and in the preview defaults (each with its
own values per tier):

| Variable                                                   | What                                                                                                  |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `AUTH_BATTLENET_CLIENT_ID`, `AUTH_BATTLENET_CLIENT_SECRET` | The tier's Battle.net client. Also used for the roster sync.                                          |
| `AUTH_GATEWAY_SECRET`                                      | The tier's routing secret (same value as its gateway's `ROUTING_SECRET`).                             |
| `AUTH_BATTLENET_CALLBACK_URL`                              | The tier's gateway sign-in callback. The claim callback is derived from it (`/oauth/claim/callback`). |

That's six. There is no `SITE_URL` on cloud deployments: prod and each preview
get their app origin baked in at deploy (`apps/web/convex/buildSite.ts`, written by the
deploy scripts). Local backends get `SITE_URL` from `apps/web/scripts/dev-seed.sh`, and
guest sign-in turns itself on there only (`isLocalBackend` in
`apps/web/convex/origins.ts`).

**Gateway Workers:** one secret each, `ROUTING_SECRET`. Their
`ALLOWED_TARGETS` is in `apps/gateway/wrangler.jsonc`.

**App Worker (`guildie`):** no runtime settings. Build settings are in
docs/deploy.md.

## How a sign-in flows

1. `auth:startSignInWithBattlenet` (`viaGateway` in `apps/web/convex/authGateway.ts`)
   runs the package's start, then prefixes `state` in Battle.net's URL with
   `<b64url(CONVEX_SITE_URL)>.<b64url(HMAC(secret, "battlenet\n" + site))>.`.
   The browser keeps the plain state. `redirect_uri` is the gateway (patch).
2. Battle.net redirects to `<gateway>/oauth/battlenet/callback`.
3. The gateway checks the HMAC with `ROUTING_SECRET` and the target against
   `ALLOWED_TARGETS`, then 302s to `<target>/oauth/battlenet/callback` with the
   plain state. It holds no Battle.net credentials. Callbacks are rate limited
   per IP.
4. The deployment's stock callback exchanges the code (sending the gateway
   URL as `redirect_uri`) and returns the browser to the app origin that
   started the sign-in, which must be one of its allowed origins.

## How claiming flows

It runs by itself after every Battle.net sign-in, and from "Refresh my
characters" on /me. The same routing, with provider `claim`
(`apps/web/convex/claims.ts`, `apps/web/src/lib/claim.ts`):

1. "Continue with Battle.net" marks the tab (sessionStorage) and signs in as
   above, returning to `/sign-in`. Once the browser has finished the sign-in,
   `/sign-in` sees the mark and calls `claims:start`.
2. `claims:start` records the request (user, app origin) and sends the browser
   to Battle.net with the prefixed state. Battle.net approves without a
   screen, since sign-in already granted `wow.profile`.
3. The gateway forwards to `<CONVEX_SITE_URL>/oauth/claim/callback`
   (`apps/web/convex/http.ts`), which bounces the browser to `<app>/claim/callback`.
4. The app checks the state against sessionStorage and calls
   `claims:complete` as the signed-in user, which exchanges the code and
   reads `/profile/user/wow` from the us, eu, kr and tw hosts with the one
   token. Each region that answers replaces that region's claims (404 means
   none there); a region that fails keeps what it had. Only the person who
   started, in the same browser, can finish.
5. For each claimed character at level 10+, `claims:complete` reads its
   public profile (app token) for its guild, adds guilds we don't track yet
   (public) and syncs them.
6. The browser goes on to `next` if sign-in had one, else the player's guild
   if they're in exactly one, else /me.

A guild's owner is whoever claimed its guild master's character (rank 0),
set by claims and roster syncs. Guilds added before that rule keep their
first owner until the guild master claims.

## What we carry on top of the package

| Thing                                                                                   | Where                             | Remove when                                               |
| --------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------- |
| **Patch:** optional `CALLBACK_URL` component env                                        | `patches/@convex-dev__auth.patch` | Upstream supports a configurable callback (convex-auth#1) |
| `viaGateway` wrapper (calls the package's mutation through the undocumented `_handler`) | `apps/web/convex/authGateway.ts`  | Same                                                      |
| Gateway Worker                                                                          | `apps/gateway`                    | Same                                                      |

The patch is Onda's. When upgrading the package, check it still applies
(`pnpm install` fails if it doesn't); docs/convex-auth.md tracks upstream.

## Changing or rotating settings

Pipe secrets in so they stay out of shell history.

- **A Convex value:** `pbpaste | npx convex env set --deployment <name> NAME`.
  After changing cloud dev, re-run `sh apps/web/scripts/preview-defaults.sh` so new
  previews get it too.
- **A routing secret:** generate one (`openssl rand -base64 32`) and set it on
  the gateway and on every deployment of the tier together:
  `pnpm wrangler secret put ROUTING_SECRET -c wrangler.jsonc --env <dev|prod>`
  (from `apps/gateway`), then `AUTH_GATEWAY_SECRET` on Convex, then (dev)
  preview defaults.
- **Gateway code:** from `apps/gateway`, `pnpm test && pnpm check`, then
  `pnpm deploy:dev` / `pnpm deploy:prod`. `https://<gateway>/` answers
  "Guildie sign-in gateway." when it's up.
