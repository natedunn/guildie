# Guildie

A home base for World of Warcraft guilds, built for **WoW: Forever**:
who's in the guild, their level, class, race, rank, gear, talents,
professions and recipes, and in game, which guildmates an item would help.

- **The site**, [guildie.club](https://guildie.club): rosters, characters,
  what the guild can craft, and guild requests (ask for reagents or a craft,
  a guildmate claims it). Sign in with Battle.net and claim your characters.
- **The Windows app** ([download](https://github.com/natedunn/guildie/releases/latest)):
  the site in its own window. It installs and updates the addon, uploads what
  the addon saves, so your character shows up after a `/reload` instead of
  after Blizzard catches up, and updates itself.
- **The addon**: saves what the game knows about your character, and adds
  guild hints to item tooltips (who's requesting this, who needs this
  reagent, who this gear is an upgrade for). It comes with the app.

Open source and built by guild members. Want to help?
[CONTRIBUTING.md](CONTRIBUTING.md). Where it's headed:
[docs/roadmap.md](docs/roadmap.md).

<!-- Screenshots: roster, character page, in-game tooltip. -->

## Repo

| Folder          | What                                                                    |
| --------------- | ----------------------------------------------------------------------- |
| `apps/web`      | The site: TanStack Start + Convex, on Cloudflare Workers                |
| `apps/desktop`  | The Windows app (Electron)                                              |
| `apps/addon`    | The in-game addon (Lua), shipped inside the app                         |
| `packages/sync` | The app's uploader: reads the addon's saved data, writes its guild data |
| `apps/gateway`  | OAuth callback gateway Worker                                           |
| `docs/`         | How it works and how it's run                                           |

`apps/helper`, the old tray-only uploader, is retired; the Windows app
replaces it.

## Stack

- [TanStack Start](https://tanstack.com/start) (React, SSR)
- [Convex](https://convex.dev) for the database, sync jobs and auth
- [Convex Auth v2](https://auth-v2.previews.convex.dev) (beta, patched) with Battle.net sign-in
- Cloudflare Workers, with a preview per branch
- [shadcn/ui](https://ui.shadcn.com) on [Base UI](https://base-ui.com), Tailwind v4
- Electron for the Windows app, Lua 5.1 for the addon

## Run it

```sh
pnpm install
pnpm dev
```

No keys needed: a fresh checkout gets sample data and a guest sign-in.
Details, worktrees and the desktop app against your local site:
[docs/local-dev.md](docs/local-dev.md).

More docs:

- [docs/addon.md](docs/addon.md): the addon, the app and the upload API
- [docs/deploy.md](docs/deploy.md): production and branch previews
- [docs/auth-environments.md](docs/auth-environments.md): sign-in, the gateway, settings per tier
- [docs/blizzard-setup.md](docs/blizzard-setup.md), [docs/setup.md](docs/setup.md): running your own copy

## How data flows

- **Rosters**: `apps/web/convex/sync.ts` pulls each guild's roster from
  Blizzard's API every hour (and on "Sync now"), then each member's profile,
  equipment, professions, talents and avatar, staggered under Blizzard's rate
  limits. Recipes, items and talent trees sync weekly.
- **Sign-in**: Battle.net OpenID Connect with `wow.profile`. Right after,
  a second Battle.net hop (approved without asking) reads the account's
  characters in every region; we store the names and drop the token. That's
  how a person is tied to guild members.
- **From the game**: the addon saves on `/reload` and logout; the app uploads
  it. Per character and per part, the newer of the game's read and Blizzard's
  profile wins (`apps/web/convex/profile.ts`).
- **To the game**: the app downloads the guild's data into the addon every 15
  minutes, for its tooltips.

## What Blizzard's API can't tell us

- **Who's online right now.** We show "last seen" (last logout).
- **Characters below level 10**, or that haven't logged out since reaching
  it: on the roster, but no profile, gear or professions until then (unless
  the addon sends them).
- **Rank names**: only rank numbers. 0 is the guild master.
- WoW: Forever's API isn't documented by Blizzard yet. Paths here come from
  community testing ([Pinta365/blizzard_api](https://github.com/Pinta365/blizzard_api)).

## Other game versions

`flavor` on guilds and characters is there so realm-based versions (Classic
Era, Anniversary) can be added. `apps/web/convex/shared/wow.ts` has the
per-flavor API details; a realm-based flavor needs realm slugs in the guild
and character paths.

## License

MIT
