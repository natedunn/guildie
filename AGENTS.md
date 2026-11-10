# Guildie

WoW: Forever guild site (guildie.club), its Windows app and its in-game
addon. See README.md, CONTRIBUTING.md and docs/.

Monorepo (pnpm workspaces):
- `apps/web`: the app (TanStack Start + Convex). Its scripts cd to apps/web
  themselves; Workers Builds runs with root directory `apps/web`.
- `apps/gateway`: the OAuth callback gateway Worker.
- `apps/addon`: the in-game addon (Lua 5.1). `apps/desktop`: the Windows app
  (Electron: the site in a window plus the uploader; apps/desktop/README.md).
- `packages/sync`: the desktop app's SavedVariables reader, uploader and
  GuildieData.lua writer. (`apps/helper`, the old tray uploader, is retired;
  the server still accepts its tokens.)

- pnpm. Tabs, double quotes, semicolons (Lua: 4 spaces, like the existing files).
- `pnpm dev` per checkout (Portless URL, own Convex backend): docs/local-dev.md.
  Deploys and previews: docs/deploy.md. OAuth gateway and env per tier:
  docs/auth-environments.md.
- Convex: plain `query`/`mutation`/`action` with `v` validators. Blizzard API
  calls only in actions (`apps/web/convex/blizzard.ts`, `apps/web/convex/sync.ts`).
- Auth: `@convex-dev/auth@2.0.0-beta.0` (patched). Users via `getAuthUserId` /
  `requireUserId` (apps/web/convex/users.ts). Adapter notes: docs/convex-auth.md.
- Shared game data (classes, races, API paths per flavor): `apps/web/convex/shared/wow.ts`,
  imported by both sides. Forever is realmless: characters are `{name}-{surname}`.
- Pages: route `loader` + `ensureQueryData(convexQuery(...))`, components read
  with `useSuspenseQuery`. Writes: `useMutation` from `convex/react`.
- Each PR adds a line under `## Unreleased` in CHANGELOG.md (player-facing
  wording), labeled with where it changes: `- **Web:** …`, `**App:**`,
  `**Addon:**` or several (`**Web, App:**`); CI checks it. Maintainers cut
  releases.
- Design: minimal, dark only, an app rather than a website (the same React
  app runs on the web and in the Windows app). Tokens live in
  `apps/web/src/styles/app.css`; restyle shadcn primitives there.
  - App shell: a left sidebar for navigation and one content pane that
    scrolls by itself; the page never scrolls as a whole. Phones get a top
    bar instead of the sidebar. In the desktop app (`html[data-desktop]`)
    the sidebar and title bar sit on the window's own translucent material.
  - Color: neutral greys only (surfaces, hairline borders at ~8% white).
    Color with meaning comes from class colors (`ClassText`), item quality
    (`.q-*`) and in-game tooltip colors. No gradients, glows, emoji,
    textures or decorative badges.
  - Type: one sans family, 13-14px UI text, `.num` for tabular numbers.
    Headings are weight, not size or color.
  - Shapes: 6px radius, 1px borders, no shadows except popovers/tooltips.
  - Game art is the decoration: item and talent icons (Blizzard render URLs)
    and character renders. Item tooltips mimic the game's (`ItemHover`,
    `ItemTooltipBody` in `apps/web/src/components/item.tsx`).

## Skills

Task guides for AI assistants in `.claude/skills/<name>/SKILL.md` (Claude
Code loads them by itself; with another assistant, point it at the file):

- `convex-in-guildie`: functions, schema changes on a live database, running functions locally vs prod, crons.
- `auth-and-sign-in`: Convex Auth v2 beta (patched), Battle.net via the gateway, claims, desktop sign-in, guest sign-in.
- `tanstack-start-routes`: file routes, loaders and queries, layouts, search params, SSR and desktop detection, breadcrumbs.
- `design-system`: the look, tokens, shared components, checking UI with screenshots.
- `wow-addon`: the Lua addon, SavedVariables, GuildieData.lua, the luajit test harness.
- `blizzard-forever-api`: namespaces, realmless names, what 404s, rate limits, media URLs.
- `desktop-app`: the Electron app, the bridge and its security rules, smoke test, releases and self-update.
- `gear-and-weights`: gear-upgrade suggestions, tuning weights, the TS/Lua parity tests.
