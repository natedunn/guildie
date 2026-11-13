# Deploying

Cloudflare Workers Builds deploys every push to `natedunn/guildie`, the same
model as onda: Worker `guildie` → Settings → Builds, with two tabs.

| Tab           | Branches        | Command                                                                                                                         | `CONVEX_DEPLOY_KEY` | Result                                                                                                    |
| ------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------- |
| Production    | `main`          | `sh scripts/cloudflare-deploy.sh`                                                                                               | prod deploy key     | Convex prod `scintillating-gnat-539`, then `https://guildie.club`                                         |
| Previews Base | everything else | `sh scripts/preview-build.sh && npx wrangler preview --config dist/server/wrangler.json --name "$(sh scripts/preview-name.sh)"` | preview deploy key  | a Convex preview named after the branch, then a Worker Preview at `https://<branch>.preview.guildie.club` |

Both use root directory `apps/web` and an empty build command; the scripts
build. Cloudflare requires the Previews command to call `npx wrangler preview`
itself, so the preview script only builds. Each tab has exactly one build
variable, `CONVEX_DEPLOY_KEY` (secret), with a different key on each. That
split is the whole per-environment setup. Each script refuses the other's key,
and the production script refuses to run from any branch but `main`.

"Builds for Preview branches" must be on. Ignore "Preview URLs are disabled":
that's Cloudflare's `*.workers.dev` preview links, off on purpose
(`preview_urls: false`); previews live on `preview.guildie.club`.

The branch name becomes one DNS label: lowercased, anything outside
`[a-z0-9-]` turned into `-`, cut to 40 characters (`feat/Notes` →
`feat-notes`). See `apps/web/scripts/preview-name.sh`.

## How it works

- **Convex URLs are baked into the app at build.** `convex deploy --cmd` sets
  `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` for the build.
- **The app origin is baked into Convex at deploy.** The deploy scripts write
  it to `apps/web/convex/buildSite.ts` just before `convex deploy`, so no deployment
  needs a `SITE_URL` setting.
- **The Worker has no runtime settings.** Blizzard calls and syncs run in
  Convex.
- **Previews need no registration with the gateway.** A deployment signs its
  own address into the OAuth `state`, and the dev gateway accepts any
  `*.convex.site`.
- **New Convex previews start from the preview defaults**
  (`npx convex env default list --type preview`): cloud dev's settings, written by
  `apps/web/scripts/preview-defaults.sh`. (Deployments sign their own session
  tokens, so there are no signing keys to copy.)
- **Previews start empty.** Add a guild in the preview and it syncs from
  Blizzard; the crons keep it current.
- **Cleanup.** When a pull request closes or a branch is deleted,
  `.github/workflows/preview-cleanup.yml` deletes the branch's Worker Preview
  and Convex preview (needs the GitHub secrets below). Either way, Convex
  deletes previews after 14 days without a deploy (Pro), and Cloudflare drops
  the oldest Worker Previews past its limit.

## Where things are

| Thing              | Where                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| Convex project     | `guildie` (id 3403136, team `nate-dunn`)                                                       |
| Convex deployments | cloud dev `merry-fish-229`, prod `scintillating-gnat-539` (`apps/web/scripts/deployments.sh`)  |
| Worker             | `guildie` on account "Nate", domains `guildie.club` and `preview.guildie.club` (previews only) |
| Build token        | "guildie build token" (created by the dashboard import; used by both triggers)                 |
| Gateways           | docs/auth-environments.md                                                                      |

## GitHub secrets for preview cleanup

`natedunn/guildie` → Settings → Secrets and variables → Actions:

| Secret                    | Value                                                                      |
| ------------------------- | -------------------------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID`   | `fc87b44f5832b25053fec2efb19fc208`                                         |
| `CLOUDFLARE_API_TOKEN`    | a Cloudflare API token with **Account → Workers Scripts → Edit** on "Nate" |
| `CONVEX_MANAGEMENT_TOKEN` | a Convex team access token (team `nate-dunn`)                              |

## Changing settings

- **Convex values:** docs/auth-environments.md.
- **Build commands and their `CONVEX_DEPLOY_KEY`:** Workers & Pages → `guildie`
  → Settings → Builds (Production and Previews Base tabs). The API can't
  change the Previews Base settings yet (it accepts and ignores them): use the
  dashboard. A Convex deploy key is made in the Convex dashboard
  (prod: deployment Settings → Deploy keys; previews: project Settings →
  Preview deploy keys).

## Deploying by hand

`pnpm release` deploys prod and `pnpm release:preview` the current branch as a
preview. Each needs the matching key in `CONVEX_DEPLOY_KEY`.
