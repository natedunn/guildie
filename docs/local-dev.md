# Local development

`pnpm dev` runs one checkout: its own local Convex backend and the app,
served through [Portless](https://github.com/vercel-labs/portless). You don't
need a Convex account, a Blizzard API key or any of the maintainer's secrets:
a new backend that can't reach the maintainer's cloud dev deployment starts
with a sample guild instead.

- [Contributors](#contributors): no accounts, sample data, guest sign-in.
- [The maintainer](#the-maintainer): settings and data from cloud dev.
- [Every checkout](#every-checkout): URLs, ports, worktrees.

## Contributors

### What you need

- macOS or Linux (on Windows, use WSL: the dev scripts are POSIX shell).
- Node.js 24 or newer, and pnpm 10 (`corepack enable` sets it up).
- Git.

### Run it

```sh
git clone <this repo> guildie
cd guildie
pnpm install
pnpm dev
```

Open the URL it prints (`https://guildie.localhost:1355`). If the browser
warns about the certificate, run `npx portless trust` once.

The first run downloads Convex's local backend, then sets it up
(`apps/web/scripts/dev-seed.sh`):

- **Settings**, generated on your machine (`apps/web/scripts/dev-env.mjs`):
  sign-in keys, guest sign-in, and placeholder Battle.net keys.
- **The sample guild** (`apps/web/fixtures/sample`): "Sample Guild" with 64
  members, their gear, talents and professions, the items and recipes they
  use, and every talent tree.

It prints `dev-seed: no access to cloud dev …, so this backend gets the
sample guild` and `dev-seed: imported the sample guild`. That happens once per
checkout; later runs keep your data.

### Sign in

Go to **Sign in** and choose **Sign in as a guest**. Battle.net sign-in isn't
set up on a contributor's backend (it needs the project's Battle.net app and
sign-in gateway), and the page says so.

Each guest plays one of the Sample Guild's characters, so you see the app as
a guild member. The first guest gets the guild master, which makes it the
guild's owner (Settings → Guilds); the next guests get other members. Sign
out and sign in as a guest again to be someone else.

### Your own Blizzard API key (optional)

The sample is a snapshot: nothing syncs from Blizzard. To sync real guilds
(rosters, character profiles, the recipe catalog):

1. Get a free client at <https://develop.battle.net> → **API Access → Create
   Client**. Any name; the redirect URL can be anything (it's for sign-in,
   which still uses guest accounts locally).
2. With `pnpm dev` running, in another terminal at the repo root:

   ```sh
   pnpm blizzard-keys
   ```

   It asks for the client ID and secret and puts them on your local backend
   (`AUTH_BATTLENET_CLIENT_ID`, `AUTH_BATTLENET_CLIENT_SECRET`). Nothing is
   written to a file.
3. Check them, then add a real guild:

   ```sh
   cd apps/web
   export CONVEX_AGENT_MODE=anonymous
   npx convex run dev:probe '{"guild": "Your Guild", "region": "us"}'
   npx convex run dev:addGuild '{"name": "Your Guild", "region": "us"}'
   npx convex run recipes:syncCatalog   # the full recipe catalog, a few minutes
   ```

The backend also re-syncs every guild hourly while it runs. The Sample Guild
is never synced (its names are made up).

### Start over

Stop `pnpm dev`, delete `apps/web/.convex/local`, and run `pnpm dev` again:
new keys, a fresh copy of the sample, no guests. Your Blizzard keys go with
it, so set them again.

### About the sample

`apps/web/fixtures/sample` comes from a real guild's public Blizzard data,
anonymized by `apps/web/scripts/sample-export.mjs`:

- The guild is renamed "Sample Guild" and every character gets a made-up
  name. Blizzard's character ids are dropped; the character renders are kept.
- Last-login times are shifted by a few hours, and every time in the sample
  is moved forward on import so it looks recent.
- No accounts, BattleTags, claims, tokens or addon uploads.
- Items and recipes are trimmed to what the guild uses.

To refresh it (maintainer, or anyone with a synced guild on their backend),
with `pnpm dev` running:

```sh
node apps/web/scripts/sample-export.mjs eu/unbound   # region/slug of the source guild
```

## The maintainer

A new backend whose machine is logged in to Convex with access to cloud dev
(`cloud_dev` in `apps/web/scripts/deployments.sh`) gets instead:

- **Settings from cloud dev:** the Battle.net dev client, dev gateway,
  signing keys and guest sign-in.
- **Data from cloud dev:** the `guilds`, `characters`, `recipes` and
  `talentTreeInfo` tables. Users and claims are not copied.

Sign-in and claiming then work in every checkout: Battle.net sends everyone
to `gateway-dev.guildie.club`, which forwards to whichever local backend
started the flow (docs/auth-environments.md).

The choice is made once per backend, from what it was seeded with. A new one
gets the sample when cloud dev can't be read (not logged in, offline), when
`cloud_dev` is empty (a fork), or when you ask for it:

```sh
GUILDIE_SAMPLE=1 pnpm dev   # in a checkout with no apps/web/.convex/local yet
```

### Changing dev settings

Set them on cloud dev, and new worktrees pick them up:

```sh
pbpaste | npx convex env set --deployment <cloud dev> NAME
```

Existing checkouts keep what they were seeded with. Set it there too
(`npx convex env set NAME value` inside `apps/web`), or delete the checkout's
`apps/web/.convex/local` to reseed, which also wipes its data.

## Every checkout

| Checkout           | App                                       | Convex backend                                 |
| ------------------ | ----------------------------------------- | ---------------------------------------------- |
| main               | `https://guildie.localhost:1355`          | `127.0.0.1:3270` / `3271`                      |
| any other worktree | `https://<folder>.guildie.localhost:1355` | a pair in `20000`–`31999`, stable per worktree |

`<folder>` is the worktree's folder name, lowercased, with a leading
`guildie-` dropped. Each checkout keeps its own data in
`apps/web/.convex/local/default/`, so worktrees never share a database or
fight over which code is deployed. Run as many as you like at once:

```sh
git worktree add ../guildie-roster-notes -b roster-notes
cd ../guildie-roster-notes && pnpm dev
```

Every run sets the backend's `SITE_URL` to the checkout's URL. The first push
waits for the settings and goes through by itself a few seconds later (a
"not set" error from Convex before that is expected).

### Phones

`apps/web/scripts/check-mobile.mjs` opens every page at 390, 360 and 768px
wide (as a touch screen) and fails when something overflows sideways (the page
or the content pane), a dialog doesn't fit the screen, or a text field is
under 16px (iOS zooms into those). It needs `pnpm dev` running and
Playwright, which isn't a repo dependency (install it in a folder of its own):

```sh
mkdir -p /tmp/pw && (cd /tmp/pw && npm i playwright && npx playwright install chromium)
PLAYWRIGHT_DIR=/tmp/pw node apps/web/scripts/check-mobile.mjs \
	--base https://<name>.guildie.localhost:1355 --guest --shots /tmp/mobile
```

Signed out pages always run. `--guest` signs in as a guest for the rest
(Settings, Requests); `--code <session code>` signs in with a desktop session
code instead, and `--state <file>` keeps the sign-in for the next run. It
visits the first guild and character in the sidebar, or `--guild /g/eu/x
--character /c/eu/y`. `--shots` saves a screenshot of each page. It isn't in
CI.

Guildie installs as an app from a phone's browser (Add to Home Screen) through
`apps/web/public/manifest.webmanifest`; its icons are in
`apps/web/icons/README.md`. There's no service worker on purpose: pages are
rendered by the Worker with live data from Convex, so a cache could only serve
old pages and old code after a deploy, and browsers no longer need one to
install the app.

### Notes

- Portless's proxy runs on port 1355 (set `PORTLESS_PORT` to change it).
- `apps/web/scripts/dev.sh` writes the checkout's `CONVEX_DEPLOYMENT`,
  `VITE_CONVEX_*` and `VITE_SITE_URL` into `apps/web/.env.local` before
  starting anything; other lines are kept.
- A checkout's backend is recognised by its data folder. `pnpm dev` stops one
  left behind by a crashed run, refuses to start if the checkout is already
  running elsewhere, and stops its backend when it exits.
- `npx convex …` inside `apps/web` targets the checkout's local backend (set
  `CONVEX_AGENT_MODE=anonymous` when running it by hand). Its dashboard:
  `npx convex dashboard`. `--deployment` or `--prod` target cloud deployments.
- Removing a worktree (`git worktree remove`) removes its data with it.
- The desktop app's layout without the app: send its user agent, e.g.
  `curl -sk -A "Mozilla/5.0 GuildieDesktop/0.2.0" https://<name>.guildie.localhost:1355/`
  (the browser's devtools can override the user agent too; add ` (Mica)` for
  the transparent chrome). The app itself against your checkout:
  `pnpm --filter @guildie/desktop dev --url https://<name>.guildie.localhost:1355`,
  or `smoke` instead of `dev` for the headless check.
