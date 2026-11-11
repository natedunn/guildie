#!/usr/bin/env sh
# Builds a branch preview (scripts/preview-build.sh) and uploads it as a Worker
# Preview at https://<name>.preview.guildie.club: the same steps as Workers
# Builds' Previews command, for `pnpm release:preview` by hand. See
# docs/deploy.md.
set -eu
# Run from apps/web (the Convex project and Worker), wherever this was started.
cd "$(dirname "$0")/.."

sh scripts/preview-build.sh
# The Cloudflare Vite plugin writes the built Worker's config here.
npx wrangler preview --config dist/server/wrangler.json --name "$(sh scripts/preview-name.sh)"
echo "Preview: https://$(sh scripts/preview-name.sh).preview.guildie.club"
