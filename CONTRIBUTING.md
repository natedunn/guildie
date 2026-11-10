# Contributing to Guildie

Thanks for helping. Guildie is built by guild members for guild members, and
you don't need to be a professional developer to contribute: small fixes,
UI polish, better wording and bug reports are all welcome. Many of us work
with an AI coding assistant; that's fine too (see below).

## Getting started

You need Node 24, pnpm (`corepack enable`), and git. For addon work, also
[LuaJIT](https://luajit.org) (`brew install luajit`, or your package
manager).

```sh
git clone https://github.com/natedunn/guildie.git
cd guildie
pnpm install
pnpm dev
```

[docs/local-dev.md](docs/local-dev.md) has the details: the local URL, sample
data, guest sign-in, and running several checkouts at once. You don't need
any API keys or secrets to work on the site.

## The workflow

1. **Pick something.** An issue labeled
   [`good first issue`](https://github.com/natedunn/guildie/labels/good%20first%20issue)
   is a good start. For anything bigger than a fix, open an issue (or comment
   on one) first so we can agree on the approach before you build it.
2. **Branch.**
   - **Collaborators** (guild members with write access): branch in this
     repo, e.g. `git switch -c roster-notes`. Every pushed branch gets its own
     preview site at `https://<branch>.preview.guildie.club` with its own
     database, so you can share a working link in your PR.
   - **Everyone else:** fork the repo and branch in your fork. Forks don't get
     a preview site; screenshots in the PR do the job.
3. **Make the change**, keep it small, and run the checks (below).
4. **Open a pull request** against `main`. The template asks for what and
   why, how you tested, screenshots for UI changes and a CHANGELOG line.
5. A maintainer reviews. Merging to `main` deploys guildie.club.

### Checks

Every PR runs these; run them before pushing:

```sh
pnpm lint:fix                                # format and lint (Biome); CI runs `biome ci`
pnpm check                                   # typecheck, every package
pnpm test                                    # unit tests, every package
pnpm test:addon                              # addon tests (Lua; needs luajit)
pnpm --filter @guildie/desktop smoke --url https://guildie.localhost:1355   # desktop app, with pnpm dev running
```

CI (`.github/workflows/ci.yml`) runs all of these, the smoke test on Windows
against guildie.club, and checks for a CHANGELOG line (label the PR
`skip-changelog` for changes players won't notice). Tabs, double quotes,
semicolons; Biome formats the rest.

## What a good PR looks like

- **Small and about one thing.** Two unrelated fixes are two PRs.
- **Tests** when you change logic: next to the code (`*.test.ts`, run with
  `node --test`) or in `apps/addon/tests` for Lua.
- **A CHANGELOG line** under `## Unreleased` in [CHANGELOG.md](CHANGELOG.md),
  written for players, under `### New`, `### Improvements` or `### Fixes`,
  starting with where the change lives: `**Web:**` (the site, which the app's
  window also shows), `**App:**` (the Windows app itself), `**Addon:**` (in
  game), or several: `- **Web, App:** The roster sorts by level.` CI checks
  the label. Skip the line only for changes players can't see (docs, tests,
  refactors), with the `skip-changelog` label.
- **Screenshots** (or a short clip) for anything visible, and a preview link
  if you have one.
- **No secrets**, no production data, no generated noise (`routeTree.gen.ts`
  and `convex/_generated` are fine to commit when they change).

## Where things live

| Folder                   | What                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `apps/web`               | The site: TanStack Start (React) + Convex. `src/routes` pages, `src/components` UI, `convex/` backend                 |
| `apps/web/convex/shared` | Code both sides use: game data (`wow.ts`), gear-upgrade rules                                                         |
| `apps/desktop`           | The Windows app (Electron): the site in a window, installs the addon, uploads its data                                |
| `apps/addon`             | The in-game addon (Lua). Ships inside the desktop app                                                                 |
| `packages/sync`          | The desktop app's uploader: reads the addon's saved data, writes `GuildieData.lua`                                    |
| `apps/gateway`           | The sign-in gateway Worker (maintainers)                                                                              |
| `docs/`                  | How things work: [addon.md](docs/addon.md), [local-dev.md](docs/local-dev.md), [deploy.md](docs/deploy.md), auth docs |

## Working with an AI assistant

[AGENTS.md](AGENTS.md) is the project brief for any assistant (Claude Code
reads it through CLAUDE.md). Task guides ("skills") live in
[`.claude/skills/`](.claude/skills): Convex, sign-in, routes, design, the
addon, Blizzard's API, the desktop app, gear suggestions. Claude Code picks
them up by itself; with another tool, tell it to read the relevant
`SKILL.md` first.

Tips:

- Start the assistant with the issue and ask it to read the matching skill
  before changing anything.
- Ask it to run the checks above and to show you screenshots of UI changes.
- Read the diff yourself before you open the PR. You're the author; "the AI
  wrote it" isn't a review.
- Keep it from wandering: one task per PR, and no drive-by rewrites.

## Ask first before touching

These need a maintainer's say before you change them (CODEOWNERS enforces
review):

- **Sign-in and auth:** `apps/web/convex/auth*`, `apps/web/src/lib/convex-auth-start`,
  `apps/gateway`, `patches/` (the patched Convex Auth beta).
- **The desktop app's bridge, updater and window code:**
  `apps/desktop/src/{preload,main,updater,window-border}.ts`. The bridge is a
  security boundary between the website and the player's computer.
- **Releases and CI:** `.github/`, version numbers, `## Version` in
  `Guildie.toc`, release tags.
- **Production data and settings:** never run functions or change settings
  on production (`scintillating-gnat-539`). Your local backend is yours to
  break.

## Releases

Maintainers cut releases with `pnpm release <version> --push` (on an
up-to-date `main`): it turns `## Unreleased` into the new version's section,
bumps the app and tags `desktop-v<version>`. The addon's version lives in
`apps/addon/Guildie/Guildie.toc`; bump it in the PR that changes the addon,
since installed copies only update when that number goes up. GitHub Actions builds the Windows installer and
publishes it; installed apps update themselves. The site deploys on every
merge to `main`. Contributors don't need to bump versions.

## Reporting bugs and ideas

Use the issue templates. For security problems, don't open an issue: see
[SECURITY.md](SECURITY.md).

By contributing you agree your work is released under the [MIT License](LICENSE)
and to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
