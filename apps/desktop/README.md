# Guildie for Windows (`apps/desktop`)

Guildie in its own window, plus what the retired tray helper used to do: it
uploads what the Guildie addon saves in game, and downloads your guild's data
into the addon for its tooltips. It also installs the addon and keeps it up to
date, and updates itself. Sign in inside the window and that's it.

The app is how players get the addon: there's no addon-store release, and the
addon needs the app anyway (it uploads the addon's saved data and writes the
guild data the tooltips use).

Electron + TypeScript. Windows first; it runs on macOS for development.

## Using it

- **Install:** download `Guildie-Setup-<version>.exe` from
  [GitHub Releases](https://github.com/natedunn/guildie/releases/latest) and
  run it: per user (`%LOCALAPPDATA%\Programs\guildie`), no admin prompt, a
  desktop and Start menu shortcut. The builds aren't code-signed, so Windows
  SmartScreen says "Windows protected your PC": **More info**, then **Run
  anyway** (once per download).
- **The addon:** the app ships it and installs it into every WoW: Forever
  folder (`_forever_*`) of the WoW folder it uses: on start, and when you
  choose a WoW folder. A missing addon is installed; an older one (by `##
  Version` in `Guildie.toc`) is replaced, keeping its `GuildieData.lua`; a
  newer one (a developer's) is left alone; other addons are never touched.
  It's swapped in as a whole folder, so a crash leaves the old or the new
  addon, never half. If WoW is running it still updates and says so: the new
  files load at `/reload` (a first install, at the game's next start).
- **App updates:** the installed app checks GitHub Releases at start and every
  hour, downloads an update in the background, and installs it when you
  quit, or right away with **Restart to update** in the tray (it also
  notifies once it's downloaded). The zip build, development and the smoke
  test never update.
- **Window:** guildie.club as an app: a sidebar, a title bar with back and
  forward, Windows' own window buttons, Mica behind it on Windows 11. Mouse
  back/forward buttons, Alt+Left/Right and Ctrl+R (or F5) work. Links to
  other sites open in your browser. Battle.net sign-in stays
  in the window.
- **Connecting:** signing in on the site hands the app a token (the bridge
  below). Until the site does that, choose **Connect...** in the tray: the
  window shows a code to approve, as the helper did.
- **Tray** (notification area): who you're connected as, the last upload, the
  WoW folder, the addon's version (**Addon: not installed — Install** when it
  isn't), **Restart to update** (once an update is downloaded), **Open
  Guildie**, **Upload now**, **Choose World of Warcraft folder...**,
  **Reinstall addon**, **Start with Windows**, **About Guildie**, **Sign
  out**, **Quit**.
  Left-click opens the window. Closing the window keeps it running in the tray,
  with the window and its page unloaded (only the uploader stays in memory;
  started with `--hidden` there's no window until you open one). About shows
  memory and CPU across Guildie's processes; the log gets the same line every
  15 minutes.
- **WoW folder:** found in the usual places (or the helper's remembered one);
  otherwise choose it from the tray. It watches every
  `_*_/WTF/Account/*/SavedVariables/Guildie.lua` and writes
  `_*_/Interface/AddOns/Guildie/GuildieData.lua` every 15 minutes, on connect,
  and on **Upload now** (only when it changed).
- One copy runs at a time; opening it again shows the window.

Settings and the log (`guildie.log`) are in `%APPDATA%\guildie\desktop`, next
to the helper's. Tokens are encrypted with Windows' DPAPI (Electron
`safeStorage`) and kept per site: a preview's token never applies to
guildie.club.

Flags: `--url <site>` (or `GUILDIE_URL`), `--hidden` (start in the tray; what
Start with Windows uses), `--smoke-test`, `--user-data <dir>`.

## Building

On the Windows PC (from the repo root):

```sh
pnpm install
pnpm --filter @guildie/desktop build:win
# -> apps/desktop/release/Guildie-Setup-0.3.0.exe and Guildie-0.3.0-win-x64.zip
```

The addon goes in as `resources/addon/Guildie` (electron-builder
`extraResources`, from `apps/addon/Guildie` minus `GuildieData.lua`). In
development the app installs from `apps/addon/Guildie` directly.

From macOS, without wine: `pnpm --filter @guildie/desktop build:win-cross`
makes the zip (exe icon and version included). The NSIS installer needs
`makensis`, which electron-builder ships for Intel Macs only: on Apple Silicon
it runs once Rosetta is installed (`softwareupdate --install-rosetta`), then
`build:win` works on the Mac too.

## Releasing

Releases are built on GitHub (`.github/workflows/desktop-release.yml`, on
`windows-latest`) and published as GitHub Releases, which is where installed
apps look for updates.

1. Bump `version` in `apps/desktop/package.json` (say `0.3.0`) and commit. To
   ship a new addon with it, bump `## Version` in `apps/addon/Guildie/Guildie.toc`
   too: players' addons are updated only when that number goes up.
2. Tag that commit `desktop-v<version>` and push the tag:
   `git tag desktop-v0.3.0 && git push origin desktop-v0.3.0`.
3. The workflow checks the tag matches the version (it fails otherwise),
   builds, and creates the release `desktop-v0.3.0` with
   `Guildie-Setup-0.3.0.exe`, its `.blockmap` and `latest.yml`. It's a normal
   release, not a draft (`publish.releaseType: release`), and becomes the
   repo's **Latest**.

electron-updater reads only the repo's _Latest_ release (`releases/latest`),
so any other release in this repo (an addon zip, say) must be a pre-release or
unticked as Latest, or installed apps stop finding updates. Running the
workflow by hand on a branch builds without publishing and keeps the installer
as a workflow artifact.

Development (any OS):

```sh
pnpm --filter @guildie/desktop dev --url https://desktop.guildie.localhost:1355
pnpm --filter @guildie/desktop smoke --url https://desktop.guildie.localhost:1355
pnpm --filter @guildie/desktop test     # origin rules, addon install/update
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
waits for someone to approve the code it logs.

## How it's put together

| File                | What                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------- |
| `src/main.ts`       | Start-up, single instance, the bridge's IPC handlers, tray actions                            |
| `src/window.ts`     | The window: title bar overlay (`TITLEBAR`), size and position, what stays in the window       |
| `src/origins.ts`    | Which URLs are Guildie (bridge), sign-in hops (stay in the window), everything else (browser) |
| `src/preload.ts`    | The bridge, `window.guildieDesktop`                                                           |
| `src/connection.ts` | Token, connect / pair / sign out, runs `SyncEngine` from `packages/sync`                      |
| `src/settings.ts`   | `settings.json`: window, WoW folder, encrypted tokens                                         |
| `src/tray.ts`       | The tray menu                                                                                 |
| `src/addon.ts`      | Installs and updates the addon in WoW: Forever from the shipped copy                          |
| `src/updater.ts`    | App updates from GitHub Releases (electron-updater)                                           |
| `src/smoke.ts`      | `--smoke-test`                                                                                |

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
` GuildieDesktop/<version>`, plus ` (Mica)` on Windows 11 (`desktopUserAgent`
in `src/window.ts`). The site reads it while rendering on the server and puts
`data-desktop="true"` (and `data-material="mica"`) on `<html>`, so the first
paint already has the app's layout: the page doesn't scroll, only its content
pane does; a 40px title bar with back, forward and the page title sits over
the content; the sidebar runs to the top on the left. The preload still marks
`data-desktop` too, for pages served before that.

The title bar: the window buttons are drawn over the top right, 40px tall
(`TITLEBAR`), on `#111113` (the site's `--chrome`), or transparent over Mica
on Windows 11 (build 22000+; `hasMica`), where the site makes its sidebar and
title bar transparent and keeps the content pane solid. Windows 10 and macOS
get the solid color. The site keeps the buttons' strip clear with
`env(titlebar-area-x)` / `env(titlebar-area-width)` and marks its title bar
`-webkit-app-region: drag` (links and buttons `no-drag`). For sites from
before that (no `.app-titlebar`), the app makes any `<header>` draggable
itself, with a rule any site rule overrides.

## Not verified on Windows yet

Built from macOS and smoke-tested there against a local Guildie. Still to try
on Windows: the installer, the title bar overlay and Mica (and that Windows
10 falls back to the solid color), mouse back/forward buttons, the tray icon and menu,
notifications, Start with Windows, DPAPI, and WoW folder detection. Also:
installing the addon into a real WoW: Forever folder (and the folder swap
while the game runs; if Windows won't rename the folder the app overwrites
the files one by one instead), self-updates from a release (needs two
releases to see one), and Start with Windows surviving an update.
