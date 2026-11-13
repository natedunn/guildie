# Experimental sync without reloading

The main Guildie addon exports complete character snapshots through a small amber
square. The Windows app captures and uploads those snapshots through the existing
authenticated endpoint. Normal SavedVariables sync remains active. This feature
is opt-in on both sides and does not provide server-side live health or location.

## Player controls

In WoW, open **Options → AddOns → Guildie**:

- Enable experimental sync (off initially, remembered across logins).
- Choose the default amber palette or grayscale for troubleshooting.
- Choose small or larger cells. The addon snaps to physical pixels when the
  client exposes screen dimensions; the intended sizes are 32×32 and 64×64.
- Open Edit Mode to drag the square, or use Move to top left / Move to bottom left. Export pauses while
  Edit Mode is open. Position is shared across layouts and saved on drag stop.

App capture defaults on unless previously disabled. Manage **Experimental sync without reloading** in Settings → Addon; there is no tray toggle. The in-game export still defaults off. After enabling or disabling it, `/reload` saves the choice; the app reads the newest Forever account save and only starts capture when that setting is enabled. Missing or unreadable saves leave capture stopped. With multiple WoW accounts, the most recently saved account determines this preference.
Signing out stops the helper, and signing in resumes it if the setting is enabled.
Turning the app setting off or quitting stops capture. Turning export off in WoW
hides the square immediately; `/reload` then tells the app to stop capture too. The app setting can stop capture immediately.

The bundled helper monitors the original desktop process handle and exits if the
app crashes or is force-closed, even when there are no new capture records.

The app scans the foreground WoW client rectangle to locate the protocol header,
validates eight distinct packets, then captures only the square. It searches again
after moving/resizing/theme changes or interrupted visibility. It does not capture
while another application is foreground. Captured images are never saved or uploaded.
The helper has no network calls and never receives the account token. Only complete
snapshots upload; live records are discarded after updating capture status.

Status distinguishes waiting for WoW, searching, checking alignment, receiving,
stale and failed. Receiving does not mean a snapshot has uploaded: check Last upload
and the log for `Uploaded live pixel snapshot`. Bulk throughput is unchanged from
the pilot (~1.2 KB/sec); large snapshots can take minutes. Bank/recipe data still
requires opening those windows. Returned GuildieData.lua still loads on reload.

## Building on Windows

The helper is a PyInstaller **one-directory** application with its Python runtime
and MSS included. Players do not install Python. Windows release CI builds the
helper before packaging it as `resources/capture/GuildieCapture.exe` and its files.
The addon is included through the existing `resources/addon/Guildie` installation.

For a development or test installer, use Python 3.12 and the repository's pinned pnpm:

```sh
pnpm install --frozen-lockfile
python -m pip install -r apps/desktop/capture/requirements.txt
pnpm --filter @guildie/desktop capture:build
pnpm --filter @guildie/desktop build:win --publish never
```

The helper must be built on Windows. Cross-packaging on a Mac requires the helper
directory from a Windows build. macOS does not offer the automatic-capture setting.
The old `--live-pixels-config` flag remains for manual diagnostic captures only.

The additive `setLivePixels(boolean)` desktop bridge method requires the same
main-frame/site-origin checks as other addon actions. Older apps simply omit it.
The website shows the new controls only when the method exists. Use a site build with these controls when testing the updated desktop app.

## Windows acceptance checklist before release

1. Disable the separate legacy `GuildieLivePixels` addon. Install the updated main
   Guildie addon (use Reinstall in the development app; the release version bump is
   still a maintainer step). Fully restart WoW because new Lua files were added.
2. Confirm the Guildie page appears in WoW's addon settings and defaults to disabled.
   Toggle export, then `/reload` to start or stop app capture; change palette and size there without slash commands. Restart/reload
   and verify preferences persist. Move/reset in Edit Mode, including near edges.
3. Launch the packaged app without Python installed or any pixel config/launch flag.
   Check capture in the updated app settings. Confirm automatic
   calibration on small and large squares, amber and grayscale, then move the
   square and verify recovery without entering coordinates. Try 100% and 125%
   Windows scaling; fractional scaling and HDR may need further tuning.
4. Change bags, gear, quests, bank and professions; compare their actual values on
   the site after complete snapshots upload. Server acceptance alone isn't enough.
5. Alt-tab, hide/cover the square, minimize/close/reopen WoW and change display
   configuration. Capture must pause outside foreground WoW and recover afterward.
6. Toggle capture off, sign out, quit, restart and uninstall the addon. Check no
   capture process remains after stopping and the app never silently re-enables
   a disabled preference. Test installer upgrade and normal sync fallback.
7. Check CPU/FPS over a longer session, especially while searching. Record sanitized
   outcomes in the repository; no raw snapshots, screenshots with private data,
   machine paths, tokens or local configuration files.

Current local tests cover protocol compatibility with the shipped Lua files,
palette/size/origin discovery, movement and foreground loss in simulated capture,
settings persistence and registration, process lifecycle and snapshot upload logic.
Actual in-game UI and the new packaged auto-discovery require this Windows pass.
Blizzard approval of this transport remains unconfirmed.

## Quest completion backlog (addon 0.17.0, payload 5)

The square repeats snapshots containing retained quest completion IDs. The
reader needs a complete valid snapshot, but does not need to see the moment of
the turn-in. It can recover after the square is uncovered or the app restarts.
Sending a snapshot never clears the addon's records: there is no acknowledgment
channel. Duplicate and out-of-order snapshots merge safely on the server.
SavedVariables uploads carry the same backlog when live export is off.

The existing 1 MiB live-snapshot limit still applies; growing history and many
saved alts can increase transfer time. SavedVariables remain the fallback.
In-memory events survive a covered square, but not necessarily a WoW crash
before its next save. Only data exposed by supported game APIs can be retained.

Acceptance on Forever (not yet run):

1. Install addon 0.17.0 and a matching desktop build that accepts payload 5;
   deploy the compatible backend first. Keep ordinary/custom quest UI addons on.
2. Enable experimental sync and `/reload`. Cover the square, turn in two quests
   (accepting a follow-up if available), then uncover it. Check both completed
   markers appear and the follow-up remains in the log, without another reload.
3. Turn in a quest with the app stopped, restart the app, and verify recovery.
   Reload/relog and verify the backlog survives; switch characters and verify
   completions remain separate.
4. Abandon a different quest and finish another's objectives without turning it
   in. Neither should gain a turned-in marker.
5. Turn off live capture, turn in another quest, and `/reload`. Verify normal
   SavedVariables upload updates the same marker. Trigger a Blizzard refresh;
   a stale result must not remove the addon-confirmed completion.
6. Check an earlier completed quest is restored by the available history API.
   If no history API works, report that limitation separately from event capture.

Automated coverage drops pixel frames during turn-ins, then decodes a subsequent
snapshot using the shipped Lua exporter and Python reader. It also covers event
bursts, duplicate delivery, reload persistence, character isolation, history API
failures and older payloads. This does not establish Forever API support.

## Request delivery acceptance (payload 6; not yet verified in Forever)

This builds on the retained quest backlog. Only ordinary **item** requests are
tracked; crafted item requests, enchant services, COD, returned mail, and ambiguous
matches retain the manual workflow. The receiver's report alone counts toward
completion. A sender report only marks a claimed request sent and records a
separate sent total. Ongoing requests record receipts without closing.

The addon must have the request in its downloaded GuildieData before the action.
It binds the event to that request ID and uses exact character names (including
Forever surnames), never a first-name guess. Its existing limited tooltip request
cache may omit a request; stale or missing data requires manual completion.
The currently loaded cache only updates at reload/login. No mail text, subject,
coins, or unrelated transactions are uploaded.

Events retain a per-character ID through reloads. The server records consumed
IDs atomically with progress, so repeat snapshots cannot count twice; receiver
and sender reports update separate totals. Changed claims, closed requests,
non-item requests, wrong characters/guilds, and events predating the request are
ignored. Records are addon observations, not independently verified Blizzard
receipts. A unique matching delivery is assumed to fulfill that request; the
addon cannot infer whether the player intended it as an unrelated gift.

The addon retains the most recent 200 matching records per character, for up to
30 days (pruned when recording new transactions); the server ignores older ones.
Long offline periods or more than 200 unsynced records can require manual
completion. Reload/logout writes them to SavedVariables; live pixels carry the
same records sooner. A crash before saving can lose unsynced records. Ingestion
schedules bounded batches of 50, so completion may appear shortly after upload.
The existing payload/live snapshot size limits still apply.

PC test, using a matching backend/app and both players' updated addons:

1. Fully restart WoW (new `Deliveries.lua` file). Create a 20-item request,
   claim it on the sender, download guild data and reload both clients. Verify
   exact first/surname identity with the default UI and the players' mail addons.
2. Mail 7 items. Sync the sender: sent progress should show 7; request stays open.
   Open the receiver's mailbox without collecting: received stays 0. Collect and
   sync: received becomes 7/20. Repeat uploads/reloads: still 7/20.
3. Trade the remaining 13. Both click accept, complete and sync: request closes
   at 20/20. Upload both clients in both orders; sent reports never add receipts.
4. Repeat with pixel export disabled and reload/logout uploads, and with the
   square covered during delivery then uncovered. Stop/restart the companion.
5. Cancel/decline a trade, change its offered items, fail mail collection with
   full bags, send COD, return mail, and collect returned mail. None should count
   as fulfillment. Test individual attachments and the default/custom open-all
   actions. Overlapping/uncorrelated collection operations intentionally fail
   closed and may need manual completion.
6. Test multiple stacks, partial collections, another character, multiple
   contributors to an ongoing request, a stale/missing request cache, and a
   cancelled request followed by a new one for the same item. Old receipts must
   never fulfill the new request. Craft/enchant requests retain manual controls.

Capture requires `MAIL_SUCCESS` with an item ID plus the expected bag-count
increase, or `UI_INFO_MESSAGE` matching `ERR_TRADE_COMPLETE` after both accepts.
Confirm these actual event sequences on Forever before approving release; tests
use API stubs and do not establish client support. Unknown/restricted APIs are
caught and leave the manual controls available. Nothing clicks or accepts for
the player, and no game memory or UI widget text is read.
