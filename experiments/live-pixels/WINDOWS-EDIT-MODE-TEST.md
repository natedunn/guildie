# Windows Edit Mode and upload pilot verification

Date: November 12, 2026 (America/Mexico_City).
Branch tested: `experiment/live-pixel-export`, commit `cfa3abe`.
This is a development pilot test, not a release or deployment.

## Setup

- Updated only the installed `GuildieLivePixels` addon files from this branch,
  after backing up the previous experimental addon. Left SavedVariables untouched.
- Used the existing WoW Forever installation in fullscreen/borderless mode.
  Windows display scaling is 125%; the default 1.6-unit cells measure two physical
  pixels each, making the square 32×32 physical pixels.
- Built the desktop pilot from source. Used pnpm 10.28.2 as pinned by the repo;
  the host's pnpm 11 rejected the frozen lockfile configuration. No lockfile edit.
- Stopped the installed normal Guildie app and launched development Electron with
  `--hidden --live-pixels-config <local ignored config>`, using the existing
  signed-in guildie.club connection. No installer, release or deployment.

## Results and evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Built-in Edit Mode displays the static amber `Guildie sync` square | PASS | User observed it in Forever after reload and activation. |
| Dragging in built-in Edit Mode | PASS | User moved the square; subsequent capture located it at its new position. |
| Export pauses in Edit Mode | PASS (visual/user observation) | Square became static rather than flashing. A separate timed capture while enabled in Edit Mode was not recorded. |
| Closing Edit Mode resumes previously enabled export | PASS | User observed resume; calibrated capture and the desktop pilot decoded afterward. |
| Square stops intercepting clicks outside Edit Mode | PASS (user observation) | User explicitly confirmed click-through after closing Edit Mode. |
| Calibration after moving | PASS | Neighboring origins were checked over changing frames; selected origin passed 120/120 checksum-and-palette samples. Coordinates remain local. |
| Desktop capture recovery | PASS | Fresh pilot launch logged `waiting`, then `receiving`. No existing pilot was running; this was the first pilot launch on this PC, replacing the normal installed app. |
| Snapshot upload | PASS | Log recorded `Uploaded live pixel snapshot` with nonempty accepted updates. One successful pixel upload, zero upload failures/refusals or reader-failed entries in the test interval. This confirms server acceptance, not a field-by-field website comparison. |
| Disabled export stays disabled across opening/closing Edit Mode | PASS | User confirmed the static square appeared only inside Edit Mode, disappeared on close, and export stayed disabled. Pilot subsequently logged `stale`. |
| Position survives `/reload` | PASS (user observation) | After reload, user reopened Edit Mode and confirmed the same position. |
| Reload does not enable export | PASS | User confirmed it stayed hidden after reload and disappeared again when Edit Mode closed. Final pilot state remained `stale`. |

Forever's existing `EditModeManagerFrame` integration worked in this session.
No compatibility code fix was needed. `/guildiepixels edit` remains implemented
as the fallback; it was not separately retested in this session.
Position is shared across Edit Mode layouts; Blizzard save/cancel semantics were
not tested and do not undo the addon's position according to the implementation.

## Automated checks

- Five experiment Lua/Python tests passed using LuaJIT 2.1 through the local
  Python/lupa adapter (the repository harness normally invokes the LuaJIT CLI).
- Ten focused desktop capture and sync tests passed:
  `node --test apps/desktop/src/live-pixels.test.ts packages/sync/src/sync.test.ts`.
- Desktop source build succeeded (`node scripts/build.mjs` in `apps/desktop`).
- No full monorepo suite, formal FPS benchmark, macOS/Retina validation, or release
  build was run for this test.

## Final state and privacy

The development pilot remains running in the tray with capture status `stale`;
in-game export is disabled. The reader process remains part of the pilot and
polls the configured rectangle, but no current complete records are arriving.
Ordinary SavedVariables sync remains active. Re-enabling `/guildiepixels on` at
that position allows the configured pilot to resume receiving and uploading.

Only complete snapshots were sent through the user's authorized signed-in
Guildie connection. Live records are used for liveness and are not uploaded by
this integration. Private capture records, account/character names, inventory,
tokens, absolute local paths and machine-specific coordinates are omitted from
this report and were not committed. The ignored local pixel config contains
paths and geometry, not an API token.
