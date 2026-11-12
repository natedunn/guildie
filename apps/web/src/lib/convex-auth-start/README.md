# convex-auth-start

A stopgap TanStack Start adapter for Convex Auth v2 (`@convex-dev/auth@2`),
which only ships a Next.js adapter today (get-convex/convex-auth#350).

It mirrors `@convex-dev/auth/ssr/nextjs` using the package's framework-agnostic
`@convex-dev/auth/ssr` building blocks:

- `server.ts` — the auth route handlers and the server-side `CookieStore`
  (TanStack Start's `getCookie`/`setCookie`). Server-only; import it lazily.
- `functions.ts` — `getAuthToken`, a server function the root route calls in
  `beforeLoad` to hand the SSR token to Convex and the client.
- `provider.tsx` — the client provider (port of the Next.js one, minus its
  `history.replaceState(null)` hack, which would wipe TanStack Router's state).
  It keeps the access token in page memory, not localStorage (`pageStorage`),
  and the Convex client reuses the page's first token (`initialAuthTokenReuse`
  in `router.tsx`): see the comments there for the mobile sign-in bug both fix.
  `SessionWatcher` signs the page out as soon as its session is revoked or
  signed out elsewhere (sessions are stateful since 2.0).
- Routes: `apps/web/src/routes/auth/{signin,refresh,signout}.ts`.

Workaround: `AuthProvider`/`useAuth`/`SessionWatcher` aren't in the package's exports map, so
`tsconfig.json` maps `#convex-auth-react-internal` to
`@convex-dev/auth/dist/react/client.js`. It must be that exact file because the
method hooks (`useSignInWithGithub`, …) read the same React context.

When an official adapter lands: delete this folder, the three auth routes and
the tsconfig path, then follow the official setup.
