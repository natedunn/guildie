# Guildie addon

Experimental sync without reloading is configured under **Options → AddOns →
Guildie**. Export starts off; enabling it is remembered across logins. Choose amber
(default) or grayscale troubleshooting mode, small or large squares, and move it
through Edit Mode. After enabling or disabling export, `/reload` saves your choice for the app. The signed-in Windows app captures only while that saved choice is enabled, unless capture was also disabled in its Settings → Addon. See
[live sync](../../docs/live-sync.md) for setup and current limitations. New files
in this update require a full game restart.

Saves your character as the game sees it for the Guildie desktop app
(`apps/desktop`) to upload to
guildie.club, so the site shows it before Blizzard's profile catches up
(which is only after you log out).

Addons can't use the internet. The game writes the addon's data
(`WTF/Account/<account>/SavedVariables/Guildie.lua`) when you log out or
reload the UI, and the Guildie app, running on the same computer, uploads it then.

- **Install:** install the Guildie desktop app (apps/desktop, from GitHub
  Releases); it installs this folder into WoW: Forever's `Interface/AddOns`
  and updates it when a newer app ships a higher `## Version`. Bump that
  version in `Guildie.toc` whenever the addon changes, or players keep the old
  copy. (Copying the folder by hand works for development.)
- **Minimap button**, addon compartment and `/guildie` open one Guildie window.
  Options → AddOns → Guildie is a logo/name launcher with an **Open Guildie** button.
  Drag the minimap button to reposition it.
- **Status tab:** only character sync status, actual differences from the loaded
  server comparison, sync method, warnings, and **Save & reload**. The wider
  window lists all changes and scrolls only when content exceeds the screen.
- **Settings tab:** general preferences, then experimental pixel sync, color/size
  controls, safe corner placement and Edit Mode.
- **Server comparison:** `Status.lua` compares the local character with
  `GuildieData.characters`, loaded at login/reload. Actual differences take
  priority regardless of transport. Recent matching data says **Matches the last
  Guildie update**; old or incomplete comparison data is explicitly unverified.
  Bags, bank, quests and delivery uploads are included alongside gear,
  professions and talents. The addon cannot confirm live receipt or detect
  screen obstruction; the app provides live capture/upload health. Pixel sync
  shows a dismissible banner only for local export failures or stalled output.
  Visibility instructions remain in Settings; cached comparisons stay on Status.
- **Sync while I'm AFK** (off by default, experimental): reloads the UI for
  you while you're flagged AFK and out of combat, if something changed, at most
  every 20 minutes. If the game doesn't allow addons to reload on their own, it
  turns itself off and tells you.
- **Tooltips:** hover a reagent to see guildmates whose known recipes use it
  ("Brenna: might want (Tailoring)"), and a piece of gear to see who it
  might be an upgrade for ("Brisket: upgrade (Feral)", "Miller: maybe (at
  24)";
  `Upgrades.lua`, docs/addon.md), all under a "Guildie" header at the end
  of the tooltip. The Guildie app downloads your
  guild's data into `GuildieData.lua`; it loads at login and `/reload`.
- Interface version 16001 is WoW: Forever 1.60.1.

## What's saved, and when

Per character, in `GuildieDB` (`Guildie.lua`, `Capture.lua`):

| What                                                                        | Read with                                                                                                                              | When                                                              |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Level, XP, class, race                                                      | `UnitLevel`, `UnitXP`/`UnitXPMax`, `UnitClass`, `UnitRace`                                                                             | every read                                                        |
| Guild and rank                                                              | `GetGuildInfo`                                                                                                                         | every read (kept while the game hasn't loaded it yet after login) |
| Talents                                                                     | `C_ClassTalents` / `C_Traits` (below)                                                                                                  | every read                                                        |
| Gear, slots 1–19                                                            | `GetInventoryItemLink`/`ID`/`Quality`; item level from `GetDetailedItemLevelInfo` or `GetItemInfo`; average from `GetAverageItemLevel` | every read                                                        |
| Each item's tooltip as the game shows it (colors, enchant, durability, set) | `C_TooltipInfo.GetInventoryItem`, else a hidden `GameTooltip` (`SetInventoryItem`) read line by line, name line skipped                | every read                                                        |
| Professions with skill and max                                              | `GetProfessions`/`GetProfessionInfo` (skill line ids), else `GetSkillLineInfo`                                                         | every read                                                        |
| Known recipes (name, crafted item id)                                       | `GetTradeSkillInfo`/`GetTradeSkillItemLink`, `C_TradeSkillUI`, or the Craft API (`GetCraftInfo`, Enchanting in classic-era clients)    | **only when you open that profession's window**                   |
| The quest log (id, title, level, tag, header, complete, objectives)         | `C_QuestLog.GetInfo`/`GetQuestObjectives`/`GetQuestTagInfo`, else `GetQuestLogTitle`, `GetQuestLogLeaderBoard`, `GetQuestTagInfo`      | every read, and on `QUEST_LOG_UPDATE` (saved read only)           |

A read happens at login, on level up, gear changes, skill and guild changes,
talent changes, when a profession window opens or updates, and on logout and
`/reload` (`PLAYER_LOGOUT`, which can't wait). Bursts of events are read once
a second later.

- Each part keeps its own `capturedAt` (game server time): something that
  can't be read right now keeps its last good read and time.
- Recipes: the last read per profession is kept across sessions, and a new
  read adds to it (a filter or a collapsed header in the window can hide
  some, and recipes are only ever lost with the profession). A profession
  you haven't opened since keeps its old list; an unlearned one drops off
  with its recipes. Open each profession's window once to send its recipes.
- A collapsed header in the skills tab hides what's under it; those
  professions keep their last read. Same for the quest log: quests under a
  collapsed header keep their last read.

The payload (`GuildieDB.payload`, JSON, `version` 4; docs/addon.md, "API")
is rebuilt on every read for all of the account's characters, and the app
uploads it when the game writes the file.

## Tests

`luajit apps/addon/tests/capture_test.lua` loads the addon with a stubbed WoW
API (`tests/wow.lua`) and checks what each read saves and the JSON.
`luajit apps/addon/tests/upgrades_test.lua` checks the gear-upgrade
suggestions: the cases in `upgrade_vectors.json` (shared with the site's
TypeScript, written by `apps/web/scripts/gen-upgrade-vectors.ts`), reading a
hovered item, and the tooltip line; given a `GuildieData.lua` and a JSON list
of items, it prints the line for each. With a
path it also writes a SavedVariables file like the game's, for trying the
app and the site end to end. `luajit apps/addon/tests/status_test.lua` checks
the "On Guildie" comparison and builds the window against the stub (each
frame template, rows on one left edge); given a `GuildieData.lua` the app
wrote and a character name in it, it plays that character a level, an item,
5 skill and 4 recipes ahead (or exactly as Guildie has it, with `same`) and
prints the window's lines. The stub loads the files in `Guildie.toc`'s order.
Tests live outside `Guildie/` so they don't ship.

## Talents

Talents are read with `C_ClassTalents` / `C_Traits`, the way the
[WowSims exporter](https://github.com/wowsims/exporter) (MIT) reads them in
Forever, and sent as TraitDefinition IDs: the same IDs as Blizzard's web API,
which is how guildie.club places them in their trees. Confirmed in game: talent
reading, and that the in-game GUID's number is Blizzard's character id.

Not confirmed in game yet (0.6.0): the window's frame template
(`PortraitFrameTemplate` with the logo in the portrait, else
`BasicFrameTemplateWithInset`, else a dialog-box backdrop), the logo on its
dark disc (`TempPortraitAlphaMask`), and how text measures and wraps there
(the window sizes itself from `GetStringHeight`).

Not confirmed in game yet (0.4.0): which of the gear, tooltip, profession and
recipe APIs above Forever has (each read tries the modern API, then the
classic one, and an unreadable part keeps its last read), and whether
`TRADE_SKILL_*` or `CRAFT_*` fire for Enchanting there.

### Retained quest completions (0.17.0)

The addon records confirmed `QUEST_TURNED_IN` IDs per character and keeps sending
that set in later snapshots. Covering the sync square, disabling live export, or
closing the desktop app delays delivery; it does not clear the set. Normal
SavedVariables uploads carry the same records after `/reload` or logout. WoW
only writes SavedVariables at reload/logout/normal exit, so a crash can still
lose records from the current session.

Where supported, `C_QuestLog.GetAllCompletedQuestIDs()` restores earlier history;
older clients use `QueryQuestsCompleted`, `QUEST_QUERY_COMPLETE`, and
`GetQuestsCompleted`. Calls/events are guarded and failures keep the last known
IDs. A quest disappearing from the log, completing its objectives, or showing a
reward window never counts as a confirmed turn-in. Repeated turn-ins record an
ID once, not a count of repetitions. Forever's event/history APIs still need an
in-game acceptance check; custom quest UI addons should not affect these events.

### Request deliveries

The addon observes successful mail collections and completed trades for cached
item requests, and retains the records for live or reload/logout upload. It
never performs those actions. Sender reports mark claimed requests sent;
recipient reports advance received quantities and close fixed-amount requests.
Live capture is optional: with it off, the desktop app uploads the same
receipts after `/reload` or logout. Receipt IDs survive both paths and reloads;
the server counts each receipt once, even if live and file uploads overlap.
Sender reports do not reduce the remaining quantity. The original target is
preserved, and the remaining amount is derived from recipient receipts, floored
at zero. Tooltips show this server remainder after refreshed GuildieData loads
at login or `/reload`; the addon does not subtract local receipts a second time.
Crafts, enchants, COD, returns and uncertain matches keep manual completion.
A request must be in the loaded GuildieData, including its request ID. Tracking
retains at most 200 matching events per character for 30 days; it cannot recover
transactions missed while the addon was disabled. Installing `Deliveries.lua`
requires a full game restart. Forever event behavior remains pending the
[acceptance checklist](../../docs/live-sync.md#request-delivery-acceptance-payload-6-not-yet-verified-in-forever).
