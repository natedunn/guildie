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
- Open Edit Mode to drag the square, or reset its position. Export pauses while
  Edit Mode is open. Position is shared across layouts and saved on drag stop.

In the app, enable **Experimental sync without reloading** in Settings → Addon,
or **Experimental live sync** in the tray. Capture consent is remembered per site.
Signing out stops the helper, and signing in resumes it if the setting is enabled.
Turning the app setting off or quitting stops capture. Turning export off in WoW
hides the square; the app continues looking while WoW is foreground until its own
capture setting is disabled.

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
The website shows the new controls only when the method exists. Before deploying
the website changes, the tray toggle can test the integration against guildie.club.

## Windows acceptance checklist before release

1. Disable the separate legacy `GuildieLivePixels` addon. Install the updated main
   Guildie addon (use Reinstall in the development app; the release version bump is
   still a maintainer step). Fully restart WoW because new Lua files were added.
2. Confirm the Guildie page appears in WoW's addon settings and defaults to disabled.
   Toggle export, palette and size there, without slash commands. Restart/reload
   and verify preferences persist. Move/reset in Edit Mode, including near edges.
3. Launch the packaged app without Python installed or any pixel config/launch flag.
   Enable capture in the tray or updated website settings. Confirm automatic
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
