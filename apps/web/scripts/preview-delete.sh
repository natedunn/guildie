#!/usr/bin/env sh
# Deletes a branch's previews: its Worker Preview and its Convex preview
# deployment. Run by .github/workflows/preview-cleanup.yml when a pull request
# closes or a branch is deleted; either may already be gone. See docs/deploy.md.
#   usage: preview-delete.sh <branch>
# Needs CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN (Workers Scripts: Edit) and
# CONVEX_MANAGEMENT_TOKEN (a Convex team access token): the same secrets as Kino.
set -eu

name="$(WORKERS_CI_BRANCH="$1" sh "$(dirname "$0")/preview-name.sh")"
[ -n "$name" ] || { echo "preview-delete: no preview name for '$1'" >&2; exit 1; }
[ "$name" != main ] || { echo "preview-delete: main has no preview" >&2; exit 1; }
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is not set}"
: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is not set}"
: "${CONVEX_MANAGEMENT_TOKEN:?CONVEX_MANAGEMENT_TOKEN is not set}"

previews=https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/workers/guildie/previews
convex=https://api.convex.dev/v1
. "$(dirname "$0")/deployments.sh"
[ -n "$convex_project" ] || { echo "preview-delete: set convex_project in scripts/deployments.sh" >&2; exit 1; }

# Worker Preview. Cloudflare names it after the raw branch (feat/foo) and makes
# its own slug for the URL (feat-foo.preview.guildie.club), which may not match
# preview-name.sh exactly, so find it by either and delete it by id.
list="$(curl -sSf -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "$previews?per_page=100")"
id="$(printf '%s' "$list" | jq -r --arg b "$1" --arg n "$name" \
	'[.result[] | select(.name == $b or .slug == $n or .name == $n)][0].id // empty')"
if [ -n "$id" ]; then
	# Cloudflare also deletes a branch's preview around merge time, so it can
	# vanish between the lookup and this delete
	deleted="$(curl -s -o /dev/null -w '%{http_code}' -X DELETE -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "$previews/$id")"
	case "$deleted" in
	2??) echo "preview-delete: deleted Worker Preview $name" ;;
	404) echo "preview-delete: Worker Preview $name was already deleted" ;;
	*) echo "preview-delete: deleting Worker Preview $name returned $deleted" >&2; exit 1 ;;
	esac
else
	echo "preview-delete: no Worker Preview $name"
fi

# Convex preview deployment, by its preview name. Older ones used the raw
# branch name.
deployment="$(curl -sSf -H "Authorization: Bearer $CONVEX_MANAGEMENT_TOKEN" \
	"$convex/projects/$convex_project/list_deployments?deploymentType=preview" |
	jq -r --arg n "$name" --arg b "$1" '.[] | select(.deploymentType == "preview" and (.previewIdentifier == $n or .previewIdentifier == $b)) | .name')"
if [ -z "$deployment" ]; then echo "preview-delete: no Convex preview $name"; fi
for d in $deployment; do
	deleted="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $CONVEX_MANAGEMENT_TOKEN" "$convex/deployments/$d/delete")"
	case "$deleted" in
	2??) echo "preview-delete: deleted Convex preview $d ($name)" ;;
	404) echo "preview-delete: Convex preview $d ($name) was already deleted" ;;
	*) echo "preview-delete: deleting Convex preview $d returned $deleted" >&2; exit 1 ;;
	esac
done
