#!/usr/bin/env sh
# Builds a branch preview: deploys a Convex preview named after the branch and
# builds the app against it. Workers Builds' Previews command runs it, then
# uploads the result itself (Cloudflare requires the command to call
# `npx wrangler preview`):
#
#   sh scripts/preview-build.sh && npx wrangler preview --config dist/server/wrangler.json --name "$(sh scripts/preview-name.sh)"
#
# `sh scripts/preview-deploy.sh` does both (by hand: `pnpm release:preview`).
# See docs/deploy.md.
#
# A new Convex preview starts with the project's preview defaults
# (scripts/preview-defaults.sh); its origin is baked in below. Previews start
# with no guilds; add one in the app and it syncs from Blizzard.
set -eu
# Run from apps/web (the Convex project and Worker), wherever this was started.
cd "$(dirname "$0")/.."

name="$(sh scripts/preview-name.sh)"
[ "$name" != main ] || { echo "preview-build: main deploys production, not a preview" >&2; exit 1; }
site="https://$name.preview.guildie.club"

: "${CONVEX_DEPLOY_KEY:?CONVEX_DEPLOY_KEY (the preview deploy key) is not set}"
# With any other key, `convex deploy` ignores --preview-name and deploys to
# that key's deployment, which would put this branch on prod.
case "$CONVEX_DEPLOY_KEY" in
preview:*) ;;
*) echo "preview-build: CONVEX_DEPLOY_KEY is not a preview deploy key; refusing to deploy" >&2; exit 1 ;;
esac

# Bake the app's origin into the Convex functions (convex/buildSite.ts), so
# the preview needs no SITE_URL setting. Restored afterwards for hand runs.
trap 'git checkout -- convex/buildSite.ts 2>/dev/null || true' EXIT
printf 'export const BUILD_SITE_URL: string = "%s";\n' "$site" > convex/buildSite.ts

# --cmd also gets VITE_CONVEX_SITE_URL.
# A new preview's database is empty: fill the recipe catalog (reagent tooltips
# need it) on its first deploy. Guilds sync once someone signs in.
VITE_SITE_URL="$site" npx convex deploy --preview-name "$name" --preview-run recipes:syncCatalog \
	--cmd "pnpm run build" --cmd-url-env-var-name VITE_CONVEX_URL
echo "Built for $site"
