---

name: auth-and-sign-in
description: How sign-in works in Guildie (Convex Auth 2.0 with a patch, Battle.net OAuth through a gateway Worker, character claims, desktop app sign-in and pairing, local guest sign-in) and what must not break. Use before touching anything about users, sessions, sign-in or sign-out, claiming characters, upload tokens, the /auth, /sign-in, /claim, /helper/connect or /desktop/session routes, apps/gateway, or patches/.
---

# Auth and sign-in

**Ask a maintainer before changing any of this** (CODEOWNERS). Most features
only need the user id: `requireUserId(ctx)` / `getAuthUserId(ctx)` from
`apps/web/convex/users.ts`, and `api.users.viewer` on the client.

## The pieces

| What                                                                                  | Where                                                                                                                                                                     | Docs                                            |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Convex Auth `2.0.0`, pinned and **patched** (optional `CALLBACK_URL`, hidden exports) | `patches/@convex-dev__auth.patch`, `apps/web/convex/auth.ts`, `convex.config.ts`                                                                                          | docs/convex-auth.md                             |
| TanStack Start SSR adapter (only Next.js ships upstream)                              | `apps/web/src/lib/convex-auth-start/`, `apps/web/src/routes/auth/{signin,refresh,signout}.ts`                                                                             | its README.md                                   |
| Battle.net provider                                                                   | `apps/web/convex/authBattlenet.ts`                                                                                                                                        | docs/auth-environments.md                       |
| Gateway routing (signed `state`, one callback URL per tier)                           | `apps/web/convex/authGateway.ts` (`viaGateway`), `apps/gateway`                                                                                                           | docs/auth-environments.md                       |
| Claiming characters (our own OAuth hop after sign-in)                                 | `apps/web/convex/claims.ts`, `claimRegions.ts`, `http.ts`, `src/lib/claim.ts`, `src/routes/claim/callback.tsx`, `src/routes/sign-in.tsx`                                  | docs/auth-environments.md, "How claiming flows" |
| Desktop app sign-in (one-time session code)                                           | `auth:signInWithDesktopCode` in `auth.ts`, `desktopSessionCodes`, `src/routes/desktop/session.tsx`                                                                        | docs/addon.md, "Desktop app sign-in"            |
| Upload tokens (`gld_…`) and pairing                                                   | `apps/web/convex/helper.ts` (`issueDesktopToken`, `startPairing`, `approvePairing`, `pollPairing`, `signOut`), `src/routes/helper/connect.tsx`, `src/routes/api/helper/*` | docs/addon.md, "API"                            |
| Guest sign-in (local only)                                                            | `signInAsGuest` in `auth.ts`, `users.createFromGuest`, `isLocalBackend` in `origins.ts`                                                                                   | docs/local-dev.md                               |
| Allowed return origins                                                                | `apps/web/convex/origins.ts` (`SITE_URL` locally, `buildSite.ts` baked at deploy)                                                                                         | docs/deploy.md                                  |

## How it flows (short)

1. **Sign in:** `auth:startSignInWithBattlenet` → Battle.net → the tier's
   gateway (`gateway-dev.guildie.club` or `gateway.guildie.club`) checks the
   HMAC in `state` and forwards to the Convex deployment that started it →
   back to the app origin. Scope `openid wow.profile`.
2. **Claim:** right after, `/sign-in` calls `claims:start`; Battle.net
   approves silently; `claims:complete` reads `/profile/user/wow` in every
   region with that one token, stores the characters, drops the token.
   Claimed characters tie a user to guild members; whoever claims rank 0 owns
   the guild.
3. **Desktop app:** the window never shows Battle.net's login (Google
   sign-in refuses embedded browsers). The app pairs through the player's
   browser (`/helper/connect?code=…`), gets an upload token plus a 5-minute
   one-time `sessionCode`, and opens `/desktop/session?code=…`, which swaps
   it for a normal session. When the site is signed in inside the app and the
   app isn't connected, `components/desktop-bridge.tsx` issues a token and
   hands it over via the bridge.
4. **Guest:** on a local backend only, "Sign in as a guest" makes a Guest
   user (with the sample data, it plays a sample character).

## Don't break

- **Never store Battle.net tokens.** Claims use the token once and drop it.
- **Upload tokens:** only the hash is stored; the raw token is shown/handed
  over once. Max 10 per account. Tokens from the retired helper still work:
  keep the `/api/helper/*` endpoints and their shapes compatible (older app
  versions in the wild call them).
- **Redirects:** only to `allowedRedirectOrigins`; `next` params go through
  `safeNext` (same-site paths only).
- **Guest sign-in and the seed** must stay impossible on cloud deployments:
  they check `isLocalBackend()` server-side, not a setting.
- **Members-only guilds:** visibility checks are on the server.
- **The patch:** `pnpm install` fails if it no longer applies after an
  upgrade. The upgrade checklist is in docs/convex-auth.md.
- **Circular types:** provider setups in `auth.ts` carry explicit type
  annotations because inferring them from `internal.users` is circular; keep
  them.

## Testing locally

No Battle.net keys needed: use guest sign-in (docs/local-dev.md). Real
Battle.net sign-in locally needs the dev client and dev gateway (maintainers;
docs/blizzard-setup.md, docs/auth-environments.md). Previews
(`<branch>.preview.guildie.club`) have real Battle.net sign-in through the dev
gateway.
