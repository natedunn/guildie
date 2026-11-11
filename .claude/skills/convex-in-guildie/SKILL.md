---

name: convex-in-guildie
description: How Guildie's Convex backend is organized and changed safely. Use when adding or editing queries, mutations, actions, crons or the schema in apps/web/convex, when running Convex functions by hand (locally or against a cloud deployment), or when TypeScript reports circular types in Convex code.
---

# Convex in Guildie

Backend: `apps/web/convex/`. Plain Convex: `query`, `mutation`, `action` (and
`internal*`) from `./_generated/server`, arguments with `v` validators. No
wrappers, no ORM.

## Where things are

| File                                         | What                                                                                                                                            |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.ts`                                  | Tables and shared validators (`vRegion`, `vEquippedItem`, ...)                                                                                  |
| `guilds.ts`, `users.ts`, `crafting.ts`       | What pages read and write                                                                                                                       |
| `sync.ts`                                    | Roster and character sync from Blizzard (hourly cron, "Sync now")                                                                               |
| `blizzard.ts`                                | The Blizzard client: `appToken`, `blizzardGet` (blizzard-forever-api skill)                                                                     |
| `items.ts`, `recipes.ts`, `talents.ts`       | Static game data from Blizzard, synced in staggered batches                                                                                     |
| `quests.ts`, `shared/quests.ts`              | Quest catalog (filled like items: `ensure` + daily `backfill`), Personal → Quests (`mine`), a guild's Dungeons page (`guild`, members only)     |
| `inventory.ts`                               | Personal → Inventory (`all`): the viewer's own characters' bags and banks; nobody else's                                                        |
| `helper.ts`, `addonPayload.ts`, `profile.ts` | Addon uploads, guild data for the addon, newest-wins merge (docs/addon.md)                                                                      |
| `auth*.ts`, `claims.ts`, `http.ts`           | Sign-in (auth-and-sign-in skill; ask before changing)                                                                                           |
| `crons.ts`                                   | `sync guild rosters` hourly, `sync recipe catalog` weekly (also talent layouts), daily: `expire stale requests`, item and quest backfills       |
| `dev.ts`                                     | `seed`, `probe`, `get` (one raw Blizzard response), `addGuild`: dev helpers                                                                     |
| `requests.ts`, `shared/requests.ts`          | Guild requests: handlers, and the rules (permissions, lifecycle, staleness, mats) as pure functions (docs/addon.md, "Guild requests")           |
| `proficiencies.ts`                           | `audit`: players' in-game weapon/armor skills against the rules in `shared/proficiencies.ts` (docs/game-data.md)                                |
| `shared/`                                    | Code the site and backend both import (`wow.ts`, gear rules). No Convex imports here, so `node --test` can run it; imports use `.ts` extensions |

## Rules

- **Blizzard calls only in actions.** Queries and mutations can't `fetch`. An
  action fetches, then calls an `internalMutation` to write
  (`sync.syncCharacter` → `sync.applyProfile`).
- **Public functions check who's asking.** Use `requireUserId(ctx)` or
  `getAuthUserId(ctx)` (`users.ts`). Members-only guilds must stay hidden from
  non-members (`guilds.get` returns `{ hidden: true }`).
- **Internal by default.** Anything the browser doesn't call is
  `internalQuery`/`internalMutation`/`internalAction`.
- **User-facing errors** are `throw new ConvexError("message")`; the UI shows
  the message.
- **Spread work out.** Big jobs schedule batches with
  `ctx.scheduler.runAfter(i * STAGGER_MS, ...)` to stay under Blizzard's rate
  limits and Convex's per-function limits (see `items.ensure`,
  `recipes.syncCatalog`).
- **Tests** are plain `node --test` over pure functions (`*.test.ts` next to
  the code, `pnpm --filter @guildie/web test`). Put logic you want to test in
  a pure function, not inside a handler.

## Generated types

`_generated/` is committed. `pnpm dev` runs `convex dev`, which regenerates it
on every save. Commit the changes with your PR. If `api.foo.bar` "doesn't
exist", `convex dev` isn't running or the push failed (read its output).

## Circular types (the classic gotcha)

A function whose return type TypeScript infers from `ctx.runQuery(internal.x...)`
or `ctx.runAction(...)` in the same `api` graph can make `api`/`internal`
circular, and everything turns to `any` or errors with "implicitly has type
'any' because it ... is referenced directly or indirectly in its own
initializer". Fix: annotate the handler's return type or the variable:

```ts
handler: async (ctx, { itemIds }): Promise<{ queued: number }> => { ... }
const token: string = await appToken(ctx, "us");
```

See `items.ensure`, `talents.syncLayouts`, and the annotated provider types in
`auth.ts`.

## Changing the schema on a live database

Production has real data, and `convex deploy` (on every merge to `main`)
refuses a schema the existing documents don't match. Widen, migrate, narrow:

1. **Widen** (PR 1): add the field as `v.optional(...)`, or add the new union
   member. Code writes the new shape and reads both.
2. **Migrate**: an `internalMutation` that backfills old documents in
   batches (paginate, or `.take(n)` and reschedule itself). A maintainer runs
   it on production after PR 1 deploys. Previews start empty, so they rarely
   need it.
3. **Narrow** (PR 2, after the backfill): make the field required, drop the
   old shape and the migration.

Removing a field is the same in reverse: stop reading it, make it optional,
clear it, then delete it from the schema. Adding a table or an index is safe
in one step. Say in the PR which step it is.

## Running functions by hand

Inside a checkout, `npx convex ...` targets that checkout's local backend
(with `CONVEX_AGENT_MODE=anonymous` set when running it yourself):

```sh
cd apps/web
export CONVEX_AGENT_MODE=anonymous
npx convex run dev:seed
npx convex run sync:syncAll '{"force": true}'
npx convex data guilds
npx convex logs
```

Cloud deployments (maintainers only; ask first, never write to prod casually):

```sh
npx convex run --deployment scintillating-gnat-539 ...   # production
npx convex run --deployment merry-fish-229 ...           # cloud dev
```

Gotcha: `--prod` in a worktree whose `.env.local` points at an anonymous local
backend runs against **that local backend**, not production. Always name the
deployment with `--deployment <name>` (names in `apps/web/scripts/deployments.sh`
and docs/deploy.md).

## More

- docs/local-dev.md: local backends per checkout, seeding.
- docs/deploy.md: how prod and previews deploy (Convex URLs baked at build,
  `buildSite.ts` written at deploy).
- docs/addon.md: the upload API and which data wins.
