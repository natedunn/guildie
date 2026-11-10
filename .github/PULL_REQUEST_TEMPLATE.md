## What and why

<!-- What this changes and why. Link the issue: "Closes #123". -->

## How I tested it

<!-- What you ran and clicked. Locally (pnpm dev), on the preview site, in game, in the Windows app. -->

## Screenshots

<!-- For anything visible: before and after. A preview link (https://<branch>.preview.guildie.club) if you have one. Delete this section if nothing changed on screen. -->

## CHANGELOG

<!-- The line you added under "## Unreleased" in CHANGELOG.md, starting with where it changes ("- **Web:** …", "**App:**", "**Addon:**", or "**Web, App:**"), or "none: <why>" (docs, tests, refactor). -->

## Checklist

- [ ] Small and about one thing
- [ ] `pnpm check` and `pnpm test` pass
- [ ] Addon changed: every `apps/addon/tests/*_test.lua` passes under `luajit`, and `## Version` in `Guildie.toc` is left to the maintainers
- [ ] Desktop app changed: `pnpm --filter @guildie/desktop smoke --url <local site>` passes
- [ ] Gear rules changed: both `shared/upgrades.ts` and `Upgrades.lua`, and `upgrade_vectors.json` regenerated
- [ ] CHANGELOG line under `## Unreleased` (or not needed, said why above)
- [ ] UI follows the design rules (AGENTS.md, `design-system` skill); screenshots above
- [ ] No secrets, tokens or production data in the diff
- [ ] I've read the whole diff myself (including what an AI assistant wrote)
