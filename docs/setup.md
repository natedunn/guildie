# Setting up Guildie from scratch

For running your own copy (a fork, another guild). guildie.club itself is
already set up this way; docs/deploy.md and docs/auth-environments.md describe
it. Replace `guildie.club`, `natedunn/guildie` and the deployment names with
yours.

You end up with: sign-in in every local worktree, a preview per branch, and
production. Do the parts in order; each ends with a check.

## Reference: every value

Save the secrets in one password-manager item as you go.

| Value                              | Kind   | Made in | Goes to                                                                               |
| ---------------------------------- | ------ | ------- | ------------------------------------------------------------------------------------- |
| Dev deployment name                | note   | Part 1  | `cloud_dev=` in `apps/web/scripts/deployments.sh`                                     |
| Prod deployment name               | note   | Part 1  | `ALLOWED_TARGETS` in `apps/gateway/wrangler.jsonc` (`https://<name>.convex.site`)     |
| Project id                         | note   | Part 1  | `convex_project=` in `apps/web/scripts/deployments.sh`                                |
| Battle.net dev client ID + secret  | secret | Part 2  | cloud dev `AUTH_BATTLENET_CLIENT_ID`, `AUTH_BATTLENET_CLIENT_SECRET`                  |
| Battle.net prod client ID + secret | secret | Part 2  | prod `AUTH_BATTLENET_CLIENT_ID`, `AUTH_BATTLENET_CLIENT_SECRET`                       |
| Dev routing secret                 | secret | Part 3  | Worker `guildie-gateway-dev` `ROUTING_SECRET` **and** cloud dev `AUTH_GATEWAY_SECRET` |
| Prod routing secret                | secret | Part 3  | Worker `guildie-gateway` `ROUTING_SECRET` **and** prod `AUTH_GATEWAY_SECRET`          |
| Prod deploy key                    | secret | Part 6  | build variable `CONVEX_DEPLOY_KEY` on the `main` trigger                              |
| Preview deploy key                 | secret | Part 6  | build variable `CONVEX_DEPLOY_KEY` on the other-branches trigger                      |

Signing keys are generated straight into Convex; nothing to save.

## Part 1: Convex project

1. <https://dashboard.convex.dev> → your team → **Create Project**.
2. Note the **development** deployment's name (deployment picker or URL, like
   `merry-fish-229`) and, after switching the picker to **Production**, the
   prod deployment's name.
3. Note the project id: `curl -s -H "Authorization: Bearer <team access token>" https://api.convex.dev/v1/teams/<numeric team id>/list_projects`.
4. Put them in `apps/web/scripts/deployments.sh` and `apps/gateway/wrangler.jsonc`
   (see the table).

**Check:** `npx convex env list --deployment <dev name>` runs without error.

## Part 2: Battle.net clients

<https://develop.battle.net> → **API Access → Create Client**, twice:

| Field         | Dev                                                                                                                                                                       | Prod                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Client Name   | `guildie-dev`                                                                                                                                                             | `guildie`                                                                                                       |
| Redirect URLs | `https://gateway-dev.guildie.club/oauth/battlenet/callback` and `https://gateway-dev.guildie.club/oauth/claim/callback`                                                   | `https://gateway.guildie.club/oauth/battlenet/callback` and `https://gateway.guildie.club/oauth/claim/callback` |
| Service URL   | your repo URL                                                                                                                                                             | same                                                                                                            |
| Intended Use  | `Guild roster directory for World of Warcraft: Forever. Reads public guild rosters and character profiles. Players sign in with Battle.net to link their own characters.` | same                                                                                                            |

Copy each Client ID and Client Secret (the secret is shown once).

**Check:** each client lists exactly its two redirect URLs.

## Part 3: Gateways

From `apps/gateway`, with wrangler logged in to your Cloudflare account
(`pnpm wrangler whoami`):

```sh
pnpm install && pnpm test && pnpm check
pnpm deploy:dev
pnpm deploy:prod
openssl rand -base64 32 | tr -d '\n' | tee /dev/stderr | pnpm wrangler secret put ROUTING_SECRET -c wrangler.jsonc --env dev
openssl rand -base64 32 | tr -d '\n' | tee /dev/stderr | pnpm wrangler secret put ROUTING_SECRET -c wrangler.jsonc --env prod
```

(`tee /dev/stderr` shows each secret once so you can save it.)

**Check:** `curl https://gateway-dev.guildie.club/` and
`curl https://gateway.guildie.club/` print `guildie sign-in gateway.`

## Part 4: Convex settings

For each tier, with `X` set to that tier's deployment name and that tier's
values:

```sh
X=<dev or prod deployment name>
pbpaste | npx convex env set --deployment $X AUTH_BATTLENET_CLIENT_ID       # copy it first
pbpaste | npx convex env set --deployment $X AUTH_BATTLENET_CLIENT_SECRET
pbpaste | npx convex env set --deployment $X AUTH_GATEWAY_SECRET            # that tier's routing secret
npx convex env set --deployment $X AUTH_BATTLENET_CALLBACK_URL https://gateway-dev.guildie.club/oauth/battlenet/callback   # prod: gateway.guildie.club
```

Then push code to cloud dev and write the preview defaults:

```sh
pnpm push:cloud-dev
sh apps/web/scripts/preview-defaults.sh
```

**Check:** both deployments list exactly `AUTH_BATTLENET_CLIENT_ID`,
`AUTH_BATTLENET_CLIENT_SECRET`, `AUTH_GATEWAY_SECRET`,
`AUTH_BATTLENET_CALLBACK_URL`; the preview defaults list the same four. (No
signing keys: the deployment signs session tokens itself.) And this prints `token: "ok"` and your member count:

```sh
npx convex run --deployment <dev name> dev:probe '{"guild": "Your Guild", "region": "us"}'
```

## Part 5: Local checkouts

```sh
npx convex run --deployment <dev name> dev:addGuild '{"name": "Your Guild", "region": "us"}'
/bin/rm -rf .convex/local   # reseed from cloud dev
pnpm dev                    # https://guildie.localhost:1355
```

**Check:** your guild shows; Battle.net sign-in works and lands on your
guild with your characters claimed; a second worktree (`git worktree add ../guildie-test -b test`) signs in
at its own URL.

## Part 6: The app Worker

1. Cloudflare → **Workers & Pages → Create → Import a repository → GitHub →**
   your repo. Project name `guildie` (must match `wrangler.jsonc`), production
   branch `main`. Deploy. This creates the Worker, the GitHub connection and a
   build token.
2. **Settings → Builds** on the `guildie` Worker, root directory `apps/web` on
   both tabs. **Production:** empty build command, deploy command
   `sh scripts/cloudflare-deploy.sh`. **Previews Base:** turn on "Builds for
   Preview branches", empty build command, command
   `sh scripts/preview-build.sh && npx wrangler preview --config dist/server/wrangler.json --name "$(sh scripts/preview-name.sh)"`.
3. Make a prod deploy key (Convex prod deployment → Settings → Deploy keys)
   and a preview deploy key (project Settings → Preview deploy keys). Add each
   as secret build variable `CONVEX_DEPLOY_KEY`: the prod key on Production,
   the preview key on Previews Base.
4. Retry the `main` build.

**Check:** `https://guildie.club` loads and sign-in works. Push any branch:
`https://<branch>.preview.guildie.club` loads and sign-in works there too.

## Part 7: Preview cleanup (optional)

Add the three GitHub secrets in docs/deploy.md. Without them the cleanup
workflow fails, and previews still expire on their own.

## When something fails

| Symptom                                                | Fix                                                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Battle.net: "invalid redirect URI"                     | The client's redirect URLs don't match the gateway URLs exactly                                                          |
| Gateway: "This sign-in link is invalid"                | `AUTH_GATEWAY_SECRET` isn't that tier's `ROUTING_SECRET`; or (prod) `ALLOWED_TARGETS` isn't your prod `.convex.site` URL |
| Back on the app but not signed in                      | Locally: `SITE_URL` on the local backend isn't the page's origin (`pnpm dev` sets it)                                    |
| Convex push: "declared as required … not set"          | A Part 4 value is missing                                                                                                |
| Build: "not a preview deploy key" / "is a preview key" | The two triggers' `CONVEX_DEPLOY_KEY` values are swapped                                                                 |
