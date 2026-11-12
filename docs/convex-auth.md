# Convex Auth 2.0: what we carry

We run `@convex-dev/auth@2.0.0` (stable). Upstream is `convex/convex-auth`
(v2 on `main`), docs at <https://auth-v2.previews.convex.dev>. The onda repo
tracks upstream in detail (`onda/docs/convex-auth.md`); its check applies
here too.

| Thing                                                                                                                                  | Where                                                                                            | Why                                                                                                                         | Remove when                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| TanStack Start SSR adapter                                                                                                             | `apps/web/src/lib/convex-auth-start/`, `apps/web/src/routes/auth/*`                              | Only a Next.js adapter ships                                                                                                | Official adapter (#350, #126)                                                |
| `#convex-auth-react-internal` alias, `optimizeDeps` exclude                                                                            | `tsconfig.json`, `vite.config.ts`                                                                | `AuthProvider` isn't exported                                                                                               | Package exports it                                                           |
| **Patch**: optional `CALLBACK_URL` component env, `viaGateway`, gateway Worker                                                         | `patches/`, `apps/web/convex/authGateway.ts`, `apps/gateway`                                     | One callback per tier for every deployment (docs/auth-environments.md)                                                      | Configurable callback upstream (#1)                                          |
| **Patch**: exports for `methods/oauth/server`, `methods/anonymous/*`, `components/{oauth,anonymous}/*`                                 | `patches/`                                                                                       | 2.0 hides custom OAuth (Battle.net) and anonymous (guest) from its exports; the files still ship                            | Upstream exports them again (#849, #848; anonymous with account linking)     |
| Desktop sign-in (`auth:signInWithDesktopCode`): a method built with `bindMethod`, typed via the `convex-auth-internal-types` condition | `apps/web/convex/auth.ts`, both tsconfigs                                                        | The desktop app signs its window in with a one-time code from the browser approval (Google sign-in can't run inside an app) | A public custom-method API                                                   |
| Reactive sign-out: `SessionWatcher` in the adapter's provider                                                                          | `apps/web/src/lib/convex-auth-start/provider.tsx`                                                | Signs a page out as soon as its session ends elsewhere                                                                      | Official adapter                                                             |
| Battle.net catalog                                                                                                                     | `apps/web/convex/authBattlenet.ts`                                                               | No built-in Battle.net method                                                                                               | Keep                                                                         |
| Claim flow (own OAuth, through the gateway)                                                                                            | `apps/web/convex/claims.ts`, `apps/web/convex/http.ts`, `apps/web/src/routes/claim/callback.tsx` | No account linking or provider tokens in v2                                                                                 | Upstream linking / provider tokens (#751, #429)                              |
| Dev guest sign-in                                                                                                                      | `apps/web/convex/auth.ts`, `apps/web/convex/users.ts`                                            | Use the app without keys                                                                                                    | Keep (local backends only, `isLocalBackend` in `apps/web/convex/origins.ts`) |

## Upgrading a deployment from 2.0.0-beta.0

2.0 changed the auth components' schemas, so `convex deploy` fails (and
deploys nothing) while a deployment still has beta-era rows:
`Schema validation failed in component "auth"`. Clear these first, then deploy
right away (a sign-in in between writes a beta-era row again; if the deploy
fails on one, clear and retry):

```sh
: > empty.jsonl
for t in sessions refreshTokens; do
	npx convex import --deployment <name> --component auth --table $t --replace -y empty.jsonl
done
npx convex import --deployment <name> --component authAnonymous --table accounts --replace -y empty.jsonl
```

- Everyone is signed out once (sessions and their JWT format changed).
- No account copy: 2.0 keeps Battle.net accounts in the `authBattlenet`
  component, so a returning player looks new to it, and
  `users.createFromBattlenet` returns their existing user by `battlenetId`.
- `auth/accounts` stays behind as an orphan table (allowed). Keep it as a
  backup; delete it from the dashboard later.
- `AUTH_PRIVATE_KEY` and `AUTH_JWKS` are unused (the deployment signs session
  tokens itself); remove them from the deployment and the preview defaults.
- The desktop app and site need no update: tokens and routes are the same
  shape.

## Check for updates

```sh
npm view @convex-dev/auth dist-tags versions --json
```
