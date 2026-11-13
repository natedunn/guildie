#!/usr/bin/env sh
# Run by scripts/dev.sh once the local backend is up. A new backend gets its
# settings and guild data from cloud dev (scripts/deployments.sh) when this
# machine's Convex login can read it (the maintainer). Otherwise (contributors,
# forks, GUILDIE_SAMPLE=1): local settings and the sample guild
# (fixtures/sample). Decided once per backend. Every run sets SITE_URL to this
# checkout's URL, the one origin sign-in may return to. Until the settings are
# in, Convex holds the first push and retries it. See docs/local-dev.md.
#   usage: dev-seed.sh <cloud port> <app url>
set -eu
# Run from apps/web (the Convex project and Worker), wherever this was started.
cd "$(dirname "$0")/.."
cloud="$1"
url="$2"
. scripts/deployments.sh

i=0
until curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$cloud/version"; do
	i=$((i + 1))
	[ "$i" -lt 60 ] || { echo "dev-seed: backend on :$cloud never came up" >&2; exit 1; }
	sleep 1
done

umask 077
dir="$(mktemp -d)"
trap '/bin/rm -rf "$dir"' EXIT

# Where this backend's data comes from: what it was seeded with, else cloud dev
# if we can read it, else the sample.
if [ -f .convex/local/sample-seeded ] || [ -f .convex/local/fake-guild-seeded ]; then
	data_from=sample
elif [ -f .convex/local/guild-data-seeded ]; then
	data_from=cloud
elif [ -n "${GUILDIE_SAMPLE:-}" ] || [ -z "$cloud_dev" ]; then
	data_from=sample
elif npx convex env get AUTH_GATEWAY_SECRET --deployment "$cloud_dev" < /dev/null > /dev/null 2>&1; then
	data_from=cloud
else
	data_from=sample
	echo "dev-seed: no access to cloud dev ($cloud_dev), so this backend gets the sample guild (docs/local-dev.md)"
fi

if [ "$data_from" = sample ]; then
	# SITE_URL and placeholder Battle.net keys (scripts/dev-env.mjs), then
	# the sample guild. Your own Blizzard keys, once set, are kept.
	node scripts/dev-env.mjs "$url"
	marker=.convex/local/sample-seeded
	if [ ! -f "$marker" ] && [ ! -f .convex/local/fake-guild-seeded ]; then
		node scripts/sample-seed.mjs && touch "$marker" && echo "dev-seed: imported the sample guild (fixtures/sample)"
	fi
	exit 0
fi

# `env get` rather than `env list`: the CLI lists names only when it detects an agent.
# Keyed on the gateway secret: a backend made before cloud dev existed has
# local placeholder settings but no gateway ones, and needs cloud dev's
# (overwriting the placeholders) for sign-in to work.
if [ -z "$(npx convex env get AUTH_GATEWAY_SECRET 2>/dev/null)" ]; then
	npx convex env list --include-values --deployment "$cloud_dev" | grep -vE '^(SITE_URL|VITE_CONVEX_URL|VITE_CONVEX_SITE_URL)=' > "$dir/env"
	npx convex env set --force --from-file "$dir/env" > /dev/null
	echo "dev-seed: copied dev settings from $cloud_dev"
fi

# Guilds, their rosters, the recipe catalog and talent tree names only: no
# users, claims or auth tables. Once per
# backend; delete .convex/local to start over.
marker=.convex/local/guild-data-seeded
if [ ! -f "$marker" ]; then
	echo "dev-seed: importing guild data from $cloud_dev"
	npx convex export --deployment "$cloud_dev" --path "$dir/snapshot.zip" > /dev/null
	tables="guilds characters recipes talentTreeInfo"
	# Every app table comes along so the snapshot's table numbers (which its
	# ids encode) stay consistent, but only these keep their rows.
	mkdir "$dir/data"
	unzip -q "$dir/snapshot.zip" -x '_components/*' -d "$dir/data"
	for documents in "$dir"/data/*/documents.jsonl; do
		table="$(basename "$(dirname "$documents")")"
		case " _tables $tables " in
			*" $table "*) ;;
			*) : > "$documents" ;;
		esac
	done
	(cd "$dir/data" && zip -qr ../data.zip .)
	npx convex import --replace-all -y "$dir/data.zip" > /dev/null
	touch "$marker"
	echo "dev-seed: imported guild data"
fi

if [ "$(npx convex env get SITE_URL 2>/dev/null)" != "$url" ]; then
	npx convex env set SITE_URL "$url" > /dev/null
	echo "dev-seed: SITE_URL=$url"
fi
