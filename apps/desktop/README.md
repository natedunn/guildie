# Guildie for Windows, macOS and Linux (`apps/desktop`)

Guildie in its own window, plus what the retired tray helper used to do: it
uploads what the Guildie addon saves in game, and downloads your guild's data
into the addon for its tooltips. It also installs the addon and keeps it up to
date, and updates itself. Sign in inside the window and that's it.

The app is how players get the addon: there's no addon-store release, and the
addon needs the app anyway (it uploads the addon's saved data and writes the
guild data the tooltips use).

Electron + TypeScript, one codebase for Windows, macOS (one universal app,
Apple Silicon and Intel) and Linux (an x86_64 AppImage).

## Using it

### Installing

Everything is on [GitHub Releases](https://github.com/natedunn/guildie/releases/latest).
None of the builds are code-signed yet, so each OS asks once.

- **Windows:** `Guildie-Setup-<version>.exe` (also as `Guildie-Setup.exe`,
  the same file under a name that doesn't change, for a direct link). Per user
  (`%LOCALAPPDATA%\Programs\guildie`), no admin prompt, a desktop and Start
  menu shortcut. SmartScreen says "Windows protected your PC": **More info**,
  then **Run anyway** (once per download).
- **macOS** (12 or later): `Guildie-mac-universal.dmg`. Open it and drag
  Guildie to Applications, then open it **from Applications** (not from the
  disk image, which can't update itself). The first time, macOS says it can't
  check Guildie for malicious software: **right-click Guildie → Open → Open**,
  or try once, then **System Settings → Privacy & Security → Open Anyway**
  (macOS 15+ only offers the second). After that it opens normally, updates
  included.
- **Linux:** `Guildie-linux-x86_64.AppImage`. Make it executable
  (`chmod +x Guildie-linux-x86_64.AppImage`, or Properties → Allow executing)
  and run it; keep it somewhere it can stay (say `~/Applications`), since
  updates replace that file. AppImages need FUSE 2: on Ubuntu 22.04 and later
  `sudo apt install libfuse2` (24.04: `libfuse2t64`); without it, run it with
  `--appimage-extract-and-run`. On first start it adds itself to the app
  launcher (`~/.local/share/applications/guildie.desktop`).

### What it does

- **The addon:** the app ships it and installs it into every WoW: Forever
  folder (`_forever_*`) of the WoW folder it uses: on start, and when you
  choose a WoW folder. A missing addon is installed; an older one (by `##
  Version` in `Guildie.toc`) is replaced, keeping its `GuildieData.lua`; a
  newer one (a developer's) is left alone; other addons are never touched.
  It's swapped in as a whole folder, so a crash leaves the old or the new
  addon, never half. If WoW is running it still updates and says so: the new
  files load at `/reload` (a first install, at the game's next start). Every
  app update brings the addon it ships, so updating the app (any OS) updates
  the addon at the next start.
- **App updates:** the installed app checks GitHub Releases at start and every
  hour, downloads an update in the background, and installs it when you
  quit, or right away with **Restart to update** in the tray / menu bar (it
  also notifies once it's downloaded). Windows: the NSIS install only (not the
  zip). macOS: the app in Applications (or any folder you can write to), not
  run from the disk image or from Downloads without moving it (macOS then runs
  a hidden read-only copy, "App Translocation"). Linux: the AppImage (not an
  unpacked build). Development and the smoke test never update.
- **Window:** guildie.club as an app: a sidebar, a title bar with back and
  forward. Windows: its own window buttons, Mica behind it on Windows 11.
  Linux: the same frameless window and buttons, no Mica. macOS: the traffic
  lights in the title bar, a menu bar (Guildie, Edit, View, Window). Mouse
  back/forward buttons work everywhere; Alt+Left/Right and Ctrl+R (or F5) on
  Windows and Linux; Cmd+[ / Cmd+], Cmd+Left/Right (outside text fields),
  Cmd+R and the trackpad's swipe on macOS. Links to other sites open in your
  browser. Battle.net sign-in stays in the window.
- **Connecting:** signing in on the site hands the app a token (the bridge
  below). Until the site does that, choose **Connect...** in the tray: the
  window shows a code to approve, as the helper did.
- **Tray / menu bar:** who you're connected as, the last upload, the WoW
  folder, the addon's version (**Addon: not installed — Install** when it
  isn't), **Restart to update** (once an update is downloaded), **Open
  Guildie**, **Upload now**, **Choose World of Warcraft folder...**,
  **Reinstall addon**, **Start with Windows** (**Open at login** on macOS and
  Linux), **About Guildie**, **Sign out**, **Quit**. Closing the window keeps
  it running there, with the window and its page unloaded (only the uploader
  stays in memory; started with `--hidden` there's no window until you open
  one). About shows memory and CPU across Guildie's processes; the log gets
  the same line every 15 minutes.
  - macOS: a template icon in the menu bar; the Dock icon shows only while
    the window is open. Opening Guildie.app again opens the window. Cmd+Q
    quits (and installs a downloaded update). Open at login is a LaunchAgent
    (`~/Library/LaunchAgents/club.guildie.desktop.plist`, `--hidden`), offered
    only when the app runs from a lasting place.
  - Linux: needs a StatusNotifierItem host. KDE, Cinnamon, XFCE, Budgie have
    one; GNOME needs the "AppIndicator and KStatusNotifierItem Support"
    extension (Ubuntu ships it on). Without a tray, closing the window quits.
    Open at login is `~/.config/autostart/guildie.desktop` (AppImage only).
- **WoW folder:** found in the usual places (or the helper's remembered one);
  otherwise choose it from the tray. Windows: the usual install folders.
  macOS: `/Applications/World of Warcraft`, `~/Applications/World of
  Warcraft`, `/Applications/Games/World of Warcraft`. Linux (Wine or Proton):
  `$WINEPREFIX`, `~/.wine`, Lutris (`~/Games/*`), Bottles, Steam/Proton
  prefixes, Heroic and Faugus, each with `drive_c/Program Files
  (x86)/World of Warcraft` and the like; choosing the prefix itself works too.
  It watches every `_*_/WTF/Account/*/SavedVariables/Guildie.lua` and writes
  `_*_/Interface/AddOns/Guildie/GuildieData.lua` every 15 minutes, on connect,
  and on **Upload now** (only when it changed).
- One copy runs at a time; opening it again shows the window.

Settings and the log (`guildie.log`): `%APPDATA%\guildie\desktop` on Windows
(next to the helper's), `~/Library/Application Support/guildie/desktop` on
macOS, `~/.config/guildie/desktop` on Linux. Tokens are encrypted with
Electron `safeStorage` (Windows: DPAPI; macOS: the Keychain, which may ask
once to let Guildie use its item; Linux: the Secret Service or KWallet, and
with no keyring at all, saved unencrypted in a file only you can read,
`"plain": true`) and kept per site: a preview's token never applies to
guildie.club.

Flags: `--url <site>` (or `GUILDIE_URL`), `--hidden` (start in the tray; what
Start with Windows / Open at login uses), `--smoke-test`, `--user-data <dir>`.

## Building

From the repo root, after `pnpm install`. Output in `apps/desktop/release`.

| OS where you build | Command           | Makes                                                                   |
| ------------------ | ----------------- | ----------------------------------------------------------------------- |
| Windows            | `build:win`       | `Guildie-Setup-<version>.exe`, `Guildie-<version>-win-x64.zip`          |
| macOS              | `build:win-cross` | the Windows zip only (no wine needed)                                   |
| macOS              | `build:mac`       | `Guildie-mac-universal.dmg`, `.zip`, `latest-mac.yml`, `mac-universal/` |
| macOS              | `build:mac-dir`   | `mac-arm64/Guildie.app` only (this Mac's arch, quick)                   |
| Linux              | `build:linux`     | `Guildie-linux-x86_64.AppImage`, `latest-linux.yml`, `linux-unpacked/`  |

Run each as `pnpm --filter @guildie/desktop <command>`. The `release:*`
variants (`release:win`, `release:mac`, `release:linux`) also upload to the
GitHub release (needs `GH_TOKEN`); CI uses `release:win` and uploads the macOS
and Linux builds itself after their smoke test.

- The addon goes in as `resources/addon/Guildie` on every OS
  (`Guildie.app/Contents/Resources/addon/Guildie` on macOS), from
  `apps/addon/Guildie` minus `GuildieData.lua` (electron-builder
  `extraResources`). In development the app installs from `apps/addon/Guildie`
  directly. koffi's binary and the live-pixels capture helper are Windows-only
  for now.
- Cross-building: the NSIS installer needs `makensis`, and the AppImage needs
  `mksquashfs`; electron-builder's macOS copies of both are Intel-only, so on
  Apple Silicon they run once Rosetta is installed
  (`softwareupdate --install-rosetta`; without it the AppImage step fails with
  "spawn Unknown system error -86"). The macOS app can only be built on a Mac.
- Icons: `scripts/make-icon.py` draws all of them (`assets/guildie.ico`,
  `guildie-256.png`, `guildie.icns`, `linux/<n>x<n>.png`) with no image
  libraries; the files are committed. Tray icons: `scripts/make-tray-icon.py`.

## Releasing

Releases are built on GitHub (`.github/workflows/desktop-release.yml`) and
published as GitHub Releases, which is where installed apps look for updates.
`pnpm release <version> --push` (scripts/release.mjs) does steps 1 and 2.

1. Bump `version` in `apps/desktop/package.json` (say `0.3.0`) and commit. To
   ship a new addon with it, bump `## Version` in `apps/addon/Guildie/Guildie.toc`
   too: players' addons are updated only when that number goes up.
2. Tag that commit `desktop-v<version>` and push the tag:
   `git tag desktop-v0.3.0 && git push origin desktop-v0.3.0`.
3. The workflow checks the tag matches the version (it fails otherwise) and
   creates the release `desktop-v0.3.0` once, with this version's CHANGELOG
   section as notes. Then three jobs build in parallel and upload into it:
   - Windows (`windows-latest`): `Guildie-Setup-0.3.0.exe`, its `.blockmap`,
     `latest.yml`, and the same installer as `Guildie-Setup.exe`.
   - macOS (`macos-latest`): `Guildie-mac-universal.dmg`, `.zip`, the zip's
     `.blockmap` and `latest-mac.yml`, after a smoke test of the packaged app.
   - Linux (`ubuntu-latest`): `Guildie-linux-x86_64.AppImage` and
     `latest-linux.yml`, after a smoke test of the AppImage (in `xvfb`).
     It's a normal release, not a draft (`publish.releaseType: release`), and
     becomes the repo's **Latest**. If one platform's job fails, re-run it: the
     others' files stay.

The asset names without a version (`Guildie-Setup.exe`,
`Guildie-mac-universal.dmg`, `Guildie-linux-x86_64.AppImage`) are what the
site links (`releases/latest/download/<name>`): don't rename them.

electron-updater and the macOS updater read only the repo's _Latest_ release
(`releases/latest`), so any other release in this repo (an addon zip, say)
must be a pre-release or unticked as Latest, or installed apps stop finding
updates. Running the workflow by hand on a branch builds all three without
publishing and keeps them as workflow artifacts.

## macOS updates without a signature

Squirrel.Mac, which electron-updater uses on macOS, only installs updates
signed with a Developer ID. Until Guildie is signed, it updates itself
(`src/mac-updater.ts`):

1. It reads `latest-mac.yml` from the Latest release
   (`releases/latest/download/latest-mac.yml`) and compares versions.
2. A newer one: it downloads `Guildie-mac-universal.zip` into
   `<userData>/update`, checks its sha512 against the yml, unzips it with
   `ditto`, and checks the app inside (bundle id `club.guildie.desktop`, the
   version the yml said, the addon in it).
3. When Guildie quits (Quit, Cmd+Q, logout) or on **Restart to update**, a
   detached `/bin/sh` script waits for the app to exit, moves the new
   Guildie.app next to the old one, swaps them (two renames on the same
   volume; the old one goes back if the new one won't go in), deletes the
   old one, clears `com.apple.quarantine`, and on a restart opens it again
   (`open -n`). Plain quit doesn't reopen. Its lines go to `guildie.log`.

It needs a folder it can write to: `/Applications` is fine for an admin
account; a standard account's copy in `/Applications` that it can't replace
logs "Updates: off" (move it to `~/Applications`, or update by hand).

Because each build is ad-hoc signed, macOS sees every update as a different
app for privacy permissions: the Keychain may ask again to let Guildie use
its safe-storage item (choose **Always Allow**), and permissions granted in
System Settings (Screen Recording, for live pixels later) may need turning
off and on again after an update. A Developer ID signature fixes both.

Trying an update without a release: build the app twice (the second with a
higher version), put the second's `Guildie-mac-universal.zip` and
`latest-mac.yml` in a folder, serve it (`python3 -m http.server 8765`), and
start the first from a writable folder with
`GUILDIE_MAC_UPDATE_FEED=http://127.0.0.1:8765/latest-mac.yml`
(`--user-data <dir> --use-mock-keychain` keeps your own settings and Keychain
out of it).

## Signing the macOS app

Signing is decided when packaging (`scripts/package.mjs`), so turning it on
is adding secrets to the repo (Settings → Secrets and variables → Actions),
no code change:

| Secret                 | What                                                                     |
| ---------------------- | ------------------------------------------------------------------------ |
| `MAC_CSC_LINK`         | The "Developer ID Application" certificate and key, as a base64 `.p12`   |
| `MAC_CSC_KEY_PASSWORD` | The `.p12`'s password                                                    |
| `APPLE_API_KEY`        | An App Store Connect API key (the `.p8` file's contents), for notarizing |
| `APPLE_API_KEY_ID`     | That key's ID                                                            |
| `APPLE_API_ISSUER`     | The issuer ID (App Store Connect → Users and Access → Integrations)      |

With `MAC_CSC_LINK` set, the build signs with the Developer ID and the
hardened runtime (electron-builder's default entitlements) and, with the
`APPLE_API_*` three, notarizes and staples. Without it (today) it's ad-hoc
signed (`identity: "-"`, which Apple Silicon needs to run it at all), hardened
runtime off, not notarized. The secrets are `MAC_`-prefixed because
electron-builder would also try to sign the Windows build with a plain
`CSC_LINK`. Locally, `CSC_NAME="Your Name (TEAMID)"` signs with a certificate
in your keychain.

Once signed builds are out, the macOS updater can go back to electron-updater
(Squirrel.Mac): the first signed release still has to be installed by the
custom updater, and later ones by either. Keep the custom one until every
player is on a signed build.

## Development

On any OS:

```sh
pnpm --filter @guildie/desktop dev --url https://desktop.guildie.localhost:1355
pnpm --filter @guildie/desktop smoke --url https://desktop.guildie.localhost:1355
pnpm --filter @guildie/desktop test     # origin rules, addon install/update, updaters
pnpm --filter @guildie/desktop check
```

`--smoke-test` starts hidden with a throwaway settings folder, loads the site,
checks the bridge (present only on Guildie's pages, exactly these functions,
bad input rejected, no Node in the page), installs the addon into a fake WoW
folder, updates an older one in another (its `GuildieData.lua` kept), points
the sync engine there and checks the status (addon version included) reaches
the page, prints PASS/FAIL and exits 0
or 1. With `GUILDIE_SMOKE_TOKEN=gld_…` (a token for that site) it also
connects, uploads, downloads guild data and signs out (which revokes the
token). With `GUILDIE_SMOKE_PAIR=1` it also runs the pairing fallback and
waits for someone to approve the code it logs. A packaged build runs it too:
`release/mac-universal/Guildie.app/Contents/MacOS/Guildie --smoke-test --url …`,
or the AppImage with `--appimage-extract-and-run --smoke-test --url …`.

Chromium's sandbox on Linux needs unprivileged user namespaces (or a setuid
`chrome-sandbox`, which an AppImage can't have), and Ubuntu 24.04 and later
restrict them for apps without an AppArmor profile. The AppImage's launcher
(electron-builder's `AppRun`) checks and adds `--no-sandbox` when the sandbox
can't start, so Guildie still opens there, without Chromium's OS-level
sandbox (context isolation and the bridge's checks stay). CI allows the
namespaces on the runner (`sysctl kernel.apparmor_restrict_unprivileged_userns=0`)
so the smoke test runs sandboxed; `pnpm dev`/`smoke` on such a machine need
the same, or `--no-sandbox`.

## How it's put together

| File                   | What                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `src/main.ts`          | Start-up, single instance, the bridge's IPC handlers, tray actions                            |
| `src/window.ts`        | The window: title bar overlay (`TITLEBAR`), size and position, what stays in the window       |
| `src/platform.ts`      | Open at login on macOS and Linux, the Linux launcher entry, whether Linux has a tray          |
| `src/origins.ts`       | Which URLs are Guildie (bridge), sign-in hops (stay in the window), everything else (browser) |
| `src/preload.ts`       | The bridge, `window.guildieDesktop`                                                           |
| `src/connection.ts`    | Token, connect / pair / sign out, runs `SyncEngine` from `packages/sync`                      |
| `src/settings.ts`      | `settings.json`: window, WoW folder, encrypted tokens                                         |
| `src/tray.ts`          | The tray / menu bar menu                                                                      |
| `src/addon.ts`         | Installs and updates the addon in WoW: Forever from the shipped copy                          |
| `src/updater.ts`       | App updates: electron-updater on Windows and Linux, `mac-updater.ts` on macOS                 |
| `src/mac-updater.ts`   | The unsigned macOS app's own updater (above)                                                  |
| `src/smoke.ts`         | `--smoke-test`                                                                                |
| `scripts/build.mjs`    | esbuild bundles main + preload into `dist/`, copies `assets/`                                 |
| `scripts/package.mjs`  | Runs electron-builder; picks ad-hoc or Developer ID signing on macOS                          |
| `electron-builder.yml` | Targets per OS, asset names, `extraResources`, the GitHub feed                                |

Notifications: while connected, `connection.ts` asks the site for new ones
every minute (`Api.notifications`, `POST /api/helper/notifications`) and
main shows each as a system notification; clicking it opens the window at
that page. Only plain paths on the connected site are accepted.

The upload and download logic is `packages/sync` (`@guildie/sync`), which
the retired helper used too. `scripts/build.mjs` bundles main and preload
with esbuild, so the packaged app carries no `node_modules`, and copies the
icons from `assets/` (drawn by `scripts/make-icon.py`).

Security: context isolation on, sandboxed page, no Node in the page, no
`<webview>`, and no permissions granted besides writing to the clipboard. The bridge is exposed only on
Guildie's own origins, and the main process checks each call's frame (main
frame, this site's origin) and validates every argument. The token goes in,
never comes back out. Self-signed certificates are accepted for `*.localhost`
only.

## The bridge (for the website)

On Guildie's pages only (`guildie.club`, `*.preview.guildie.club`,
`*.guildie.localhost`), the app sets `<html data-desktop="true">` and:

```ts
window.guildieDesktop = {
	isDesktop: true,
	version: string,
	getState(): Promise<{ connected: boolean; account?: string }>,
	setToken(token: string, account?: string): Promise<void>, // after sign-in; rejects if the site doesn't accept the token
	signOut(): Promise<void>, // revokes the token and disconnects
	getStatus(): Promise<{
		connected: boolean;
		account?: string;
		lastUpload?: { at: number; characters: string[] }; // character slugs
		guildDataAt?: number;
		wowFolder?: string;
		addonVersion?: string; // the Guildie addon installed in that WoW folder
	}>,
	onStatus(callback: (status) => void): () => void, // returns unsubscribe
};
```

Calls from a different Guildie site than the one the app is set to (say a
preview opened from guildie.club) get `{ connected: false }`, and `setToken`
and `signOut` reject.

The window tells the site it's the app in its user agent:
` GuildieDesktop/<version>`, plus ` (Mica)` on Windows 11, then
` Platform/<win|mac|linux>` (`desktopUserAgent` in `src/window.ts`; apps from
before macOS and Linux send no `Platform`, which means Windows). The site reads it while rendering on the server and puts
`data-desktop="true"` (and `data-material="mica"`) on `<html>`, so the first
paint already has the app's layout: the page doesn't scroll, only its content
pane does; a 40px title bar with back, forward and the page title sits over
the content; the sidebar runs to the top on the left. The preload still marks
`data-desktop` too, for pages served before that.

The title bar: the window buttons are drawn over the top right, 40px tall
(`TITLEBAR`), on `#13110e` (the site's `--chrome`), or transparent over Mica
on Windows 11 (build 22000+; `hasMica`), where the site tints its sidebar and
title bar with its chrome color at 90% (so the wallpaper only shifts the warm
near-black a little) and keeps the content pane solid. Windows 10 and Linux
get the solid color with the same buttons. macOS hides its title bar and
keeps the traffic lights at the top left, vertically centered in the same
40px; the site leaves room for them with `env(titlebar-area-x)`. The site keeps the buttons' strip clear with
`env(titlebar-area-x)` / `env(titlebar-area-width)` and marks its title bar
`-webkit-app-region: drag` (links and buttons `no-drag`). For sites from
before that (no `.app-titlebar`), the app makes any `<header>` draggable
itself, with a rule any site rule overrides.

## Not verified yet

Each OS can only be tried on that OS; say in the PR what was tried where.

- **Windows:** the installer, the title bar overlay and Mica (and that
  Windows 10 falls back to the solid color), the tray, notifications, Start
  with Windows, DPAPI, WoW folder detection, installing the addon into a real
  WoW: Forever folder (and the folder swap while the game runs; if Windows
  won't rename the folder the app overwrites the files one by one instead),
  self-updates from a release (needs two releases to see one), and Start with
  Windows surviving an update.
- **macOS** (a Mac, any arch): the dmg and the Gatekeeper prompt on a
  download (a local build isn't quarantined, so it doesn't ask), the menu bar
  icon and menus, the traffic lights over the site's title bar, Keychain
  prompts, Open at login, a real WoW folder, and an update from one real
  release to the next (the swap itself is tested locally against a served
  zip; the relaunch after Restart to update only on a real install). The
  universal app's Intel half needs an Intel Mac (or Rosetta: `arch -x86_64`).
- **Linux** (a desktop with X11 or Wayland): the AppImage under FUSE, the tray
  on GNOME (with the AppIndicator extension), KDE and others, the launcher
  entry and its icon, the keyring, Wine/Proton WoW folders, and an
  AppImage self-update (electron-updater's AppImageUpdater). CI only builds
  it and runs the smoke test under `xvfb`.

## Experimental notifications while you play

Off until turned on in Settings → App, each saved in `settings.json`
(`notify`), on this computer:

- **Items mailed for your requests** (`itemsMailed`): the app asks
  `/api/helper/notifications` for the opt-in kind `itemsMailed` too ("Brenna
  mailed you 7 Silk Cloth", written when a guildmate's addon reports mailing
  something for your request that you haven't collected yet). Off: the site
  leaves them out (they stay in the site's inbox).
- **Reload reminders** (`reloadReminders`): the game reads
  `GuildieData.lua` only at login and `/reload`. The app remembers the guild
  data it loaded then (WoW opening, or Guildie.lua saved, which the game does
  at `/reload` and logout) and compares each download with it
  (`packages/sync` `ReloadReminder`). When 10 or more changes that tooltips
  use (gear, level-ups, requests, crafters' recipes) piled up while WoW is
  open, it shows a notification to `/reload`; again at most hourly, and only
  after 10 more.

**Fresh data when WoW opens** (always): the game reads
`GuildieData.lua` when the player enters the world, so as soon as WoW opens
the app downloads guild data instead of waiting for its 15-minute refresh.
WoW counts as open while a top-level window is titled "World of Warcraft…"
(not a browser tab about it; `src/wow-running.ts`). The app asks Windows
directly (EnumWindows and GetWindowTextW through koffi, a fraction of a
millisecond) every 5 s while WoW is closed and every 30 s while it's open.
If koffi can't load, it uses tasklist every 30 s. The first five checks are
logged with how long they took. macOS: a process inside a
`World of Warcraft*.app/Contents/MacOS/` bundle, from `ps`, every 30 s.
Linux: a process named like the game's .exe (Wine names processes after it),
from `/proc`, every 5 s while closed.

The additive optional bridge method `setNotifyOption(option, boolean)` turns
one on or off (`option`: `"itemsMailed"` or `"reloadReminders"`); status adds
`notify: { itemsMailed, reloadReminders, reloadRemindersAvailable }`.

## Experimental live pixel sync

The current integration is documented in [live sync](../../docs/live-sync.md).
Windows builds bundle a capture helper; the app's Settings → Addon provides
an opt-in switch. The addon has its own persistent settings under WoW's addon menu.
The additive optional bridge method `setLivePixels(boolean)` controls capture;
status adds `livePixelsAvailable`, `livePixelsEnabled` and `livePixels`. Every call
uses the normal main-frame/origin gate, validates a boolean, and exposes no paths,
screenshots or tokens. `capture:build` and Windows CI package the helper/runtime.

The following launch flag remains for manual diagnostics:

Development builds can start the separately installed pixel reader with
`--live-pixels-config <absolute JSON path>`. Setup, calibration and the Windows
verification checklist are in [the experiment guide](../../experiments/live-pixels/README.md#desktop-upload-pilot).
The app owns capture for that run, uses its existing authenticated snapshot uploader,
and shows capture state in the tray. This does not change the web bridge or enable
capture in ordinary launches. The legacy standalone experimental addon is not bundled; automatic capture uses the bundled helper.

Live captures are durably queued under userData/sync-outbox before upload, scoped
to the site and saved token. Normal quit preserves the queue; explicit sign-out
purges it. Optional status.syncIssue reports upload/storage problems. See
../../docs/live-sync.md for limits and recovery behavior.
