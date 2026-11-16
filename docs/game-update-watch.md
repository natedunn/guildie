# Broader game-update triage

The `Game data` workflow keeps its existing armor/weapon generator, bot branch,
maintainer review and explicit CI dispatch. A separate job in that **same workflow**
checks official Forever patch news after the generator finishes, including when
that job fails. It has only `contents: read` and `issues: write`; it cannot write
code, merge, deploy, or change production Convex data. No API key or paid model is
needed.

## What it does

- Reads the official Blizzard news index for Forever hotfix, patch, tuning,
  update and adjustment articles. Rechecks the ten newest discovered/tracked
  article IDs even when they leave the index, so edits to a rolling hotfix post
  are detected. Title/body layout changes or empty discovery fail visibly.
- First run **baselines** current notes without replaying old patches. Future
  articles and added/modified lines are classified across classes/talents/scoring,
  equipment, professions, quests/dungeons/progression and API/addon/roster data.
- Removed previously relevant lines also trigger review, without assuming that
  editing a note proves an in-game rollback.
- Creates one issue per article only when changed lines indicate concrete
  potential repository relevance. The issue mentions `@natedunn`, links the
  official source, gives a short evidence excerpt, references the affected data
  families/files, and suggests checks. These are **inferred review leads**, not
  proof that Guildie broke or that a rebuild is needed.
- Searches open and closed issues/PRs. Bot-created issues with the same source/content marker are deduplicated.
  Other bot work suppresses a review only when it quotes all changed evidence
  exactly; a matching URL or game-data label alone is not proof of coverage.
  Related matches link the existing proficiency PR rather than generating
  another proficiency update. A materially changed article
  can update/reopen its own review issue, preserving prior review context and
  maintainer notes rather than replacing them; unchanged content never does.
- Failed source checks or proficiency jobs open/update one attention issue.
  A later fully successful run closes it. Repeated failures update the same
  issue, not a new issue every day. If GitHub issue access itself fails, the
  Actions run is the fallback signal; configure GitHub Actions notifications.

## State and recovery

One closed, unassigned issue titled `Game update watch state (no action needed)`
contains a machine marker plus URLs, content hashes and line hashes. It contains
**no copied article bodies**. This durable state does not depend on cache/artifact
retention. Do not edit/delete it to silence alerts: pause the workflow instead.
Only state/review markers authored by `github-actions[bot]` are trusted.
An invalid state fails rather than silently resetting and replaying history.
The 60 KB guard fails visibly before exceeding GitHub's issue-body limit.

Issue bodies also carry a source ID and content hash, making a retry after a
partial write safe. Writes are sequential under the existing workflow concurrency
lock. Closing a review acknowledges the current version; new relevant content
may reopen it. To stop permanently, disable the workflow or remove the triage job,
not its state issue.

## Coverage limits and rollout

This is deterministic triage, **not exhaustive semantic understanding**. It does
not watch every forum reply, datamine all DB2 tables, interpret undocumented game
changes, or guarantee recognition of an entirely new mechanic. Official news
index discovery, its title terms and ten-article lookback are explicit bounds;
forum-only announcements may precede or never reach the news index. Inspect
`AREAS` in `scripts/game-update-triage.mjs` as Guildie's features grow. Preserve
review for changes to weights, mechanics and data contracts instead of silently
calculating replacements from prose.

Existing data syncs still own validated routine refreshes. The new job does not
start another proficiency generator or automatically rebuild/release the app.
Keep any external patch watcher temporarily as a read-only coverage check, with
GitHub issues/PRs as the deduplication authority. Retire that watch only after the
merged workflow has baselined successfully and the chosen source coverage is
acceptable; otherwise it can cover forum-only announcements without duplicating
issues here.

## Test and run

```sh
node --test scripts/game-update-triage.test.mjs
node scripts/game-update-triage.mjs --sources-only # live, read-only source smoke check
# Reads GitHub state, prints proposed writes; does not mutate anything:
GITHUB_REPOSITORY=natedunn/guildie GH_TOKEN=... node scripts/game-update-triage.mjs
# Only the scheduled/manual Actions job should normally use --write.
```

The script tests run in ordinary PR CI (`pnpm test`) and immediately before the
scheduled job receives its write token. Inspect the first merged workflow run,
closed state issue and subsequent no-change run before treating it as operational.
