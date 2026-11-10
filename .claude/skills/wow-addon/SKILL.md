---

name: wow-addon
description: How the Guildie WoW addon (apps/addon, Lua 5.1, WoW Forever) works, gets data in and out, is tested outside the game and ships. Use when changing anything in apps/addon, the addon's SavedVariables payload, GuildieData.lua, in-game tooltips, or the code that reads or writes those files (packages/sync, apps/web/convex/helper.ts, addonPayload.ts).
---

# The WoW addon

`apps/addon/Guildie/` is the addon as it ships; `apps/addon/tests/` doesn't
ship. Interface 16001 (WoW: Forever 1.60.1). Read apps/addon/README.md and
docs/addon.md first; this is the short version.

## Constraints that shape everything

- **Lua 5.1** (the game's dialect). No `goto`, no integer division `//`, no
  `utf8` library, no bit ops beyond what WoW provides. 4-space indentation,
  like the existing files.
- **No network.** Addons can't make requests. The only way out is
  SavedVariables (`GuildieDB` in `WTF/Account/<account>/SavedVariables/Guildie.lua`),
  which **the game writes only on `/reload`, logout or exit**. The only way in
  is a Lua file in the addon folder (`GuildieData.lua`) that loads at login
  and `/reload`.
- **The app carries the data.** The desktop app (`apps/desktop`, logic in
  `packages/sync`) watches SavedVariables, uploads `GuildieDB.payload` to
  `/api/helper/snapshot`, and writes `GuildieData.lua` from
  `/api/helper/guild-data` every 15 minutes. Without the app the addon only
  saves.
- **`GuildieData.lua` runs as code.** It's generated as data literals only
  (`packages/sync/src/luaData.ts`); the checked-in copy is an empty
  placeholder. Never generate executable Lua from server data.
- **`PLAYER_LOGOUT` can't wait:** the last read must be synchronous.

## Files

| File              | What                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `Guildie.toc`     | Load order, `## Version` (what the app compares to update players' copies)                          |
| `Guildie.lua`     | Events, the debounced read, talents, building `GuildieDB.payload` (JSON, `version` 2)               |
| `Capture.lua`     | Gear (with tooltips), professions, weapon/armor skills, recipes; modern API first, classic fallback |
| `Upgrades.lua`    | Gear-upgrade suggestions, a port of `apps/web/convex/shared/upgrades.ts` (gear-and-weights skill)   |
| `Tooltip.lua`     | The lines added to item tooltips (reagents, upgrades)                                               |
| `UI.lua`          | `/guildie` window and minimap button                                                                |
| `GuildieData.lua` | Placeholder; the app overwrites it per player                                                       |

## Forever's API is uncertain

Forever is a modern client running classic-style content; which APIs exist
isn't documented. `Capture.lua` tries the modern API (`C_TooltipInfo`,
`GetProfessions`, `C_TradeSkillUI`), then the classic one (hidden
`GameTooltip`, `GetSkillLineInfo`, `GetTradeSkillInfo`, the Craft API for
Enchanting). Each reader returns `nil` when it can't answer, and the last
good read (with its `capturedAt`) is kept. Follow that pattern: guard every
API with an existence check, `pcall` where it may error, never upload a
hole. What's confirmed in game vs not: docs/addon.md, "Verified in game".

## Tests (no game needed)

```sh
luajit apps/addon/tests/capture_test.lua    # capture and payload
luajit apps/addon/tests/upgrades_test.lua   # gear suggestions + shared vectors
for t in apps/addon/tests/*_test.lua; do luajit "$t"; done   # all of them
```

`tests/wow.lua` is a stubbed WoW API: `wow.load({ ...game state... })` loads
the addon files in `.toc` order with fake units, items, events and frames.
Add the APIs you call to the stub, and test both the modern and the classic
path when you add a fallback. `capture_test.lua <path>` also writes a
SavedVariables file like the game's, for trying the app and site end to end;
`upgrades_test.lua GuildieData.lua items.json` prints tooltip lines for real
guild data.

`tests/upgrade_vectors.json` is shared with the site's TypeScript tests;
regenerate it with `node apps/web/scripts/gen-upgrade-vectors.ts`, never by
hand.

## Changing the payload

The site validates every upload (`apps/web/convex/addonPayload.ts`, with
tests). Add fields as optional on both sides; the site still accepts payload
version 1, and older addons stay installed for a while. Document the field in
docs/addon.md ("API").

## Shipping

- There's no CurseForge/Wago release. The addon ships **inside the desktop
  app** (`electron-builder.yml` `extraResources`), which installs it and
  replaces older copies by `## Version`.
- Bumping `## Version` is part of a release (maintainers), not of your PR.
  Players get it with the next app release.
- **New files** (a new `.lua` in the `.toc`) need a full **game restart**,
  not just `/reload`; say so in the CHANGELOG line.
- To try a change in game: copy `apps/addon/Guildie` into
  `_forever_/Interface/AddOns/` (the app leaves a newer `## Version` alone),
  or ask a maintainer for a test build.
