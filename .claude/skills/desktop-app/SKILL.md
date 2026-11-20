---

name: desktop-app
description: How the Guildie desktop app (apps/desktop, Electron; Windows, macOS and Linux) is built, secured, tested and released. Use when changing anything in apps/desktop or packages/sync, the window.guildieDesktop bridge or the site code that calls it (apps/web/src/lib/desktop.ts, components/desktop-bridge.tsx, Settings → Addon/App), addon installation, app updates (including the unsigned macOS updater), packaging, signing, or the release workflow.
---

# The desktop app

Electron + TypeScript. Guildie in a window, plus: installs and updates the
addon in WoW: Forever, uploads what the addon saves, writes `GuildieData.lua`,
and updates itself. Windows (NSIS installer), macOS (one universal app, dmg
to install, zip to update) and Linux (an x86_64 AppImage). Full reference:
apps/desktop/README.md.

## Layout

| File                             | What                                                                                                | Ask first? |
| -------------------------------- | --------------------------------------------------------------------------------------------------- | ---------- |
| `src/main.ts`                    | Start-up, single instance, the bridge's IPC handlers (`guildie:*`), tray actions                    | yes        |
| `src/preload.ts`                 | The bridge (`window.guildieDesktop`), sandboxed                                                     | yes        |
| `src/origins.ts`                 | Which URLs are Guildie (get the bridge), sign-in hops, everything else (opens in the browser)       | yes        |
| `src/updater.ts`                 | Self-update from GitHub Releases: electron-updater on Windows and Linux, `mac-updater.ts` on macOS  | yes        |
| `src/mac-updater.ts`             | The unsigned macOS app's own updater: latest-mac.yml, zip, sha512, ditto, swap script after quit    | yes        |
| `src/window-border.ts`           | Hides Windows 11's accent border via `dwmapi.dll` through **koffi** (FFI)                           | yes        |
| `src/window.ts`                  | Window, title bar overlay, user agent (`GuildieDesktop/<v>`, ` (Mica)`)                             |            |
| `src/connection.ts`              | Token, connect/pair/sign out, runs `SyncEngine` from `packages/sync`                                |            |
| `src/addon.ts`                   | Installs/updates the addon from the bundled copy                                                    |            |
| `src/tray.ts`, `src/settings.ts` | Tray / menu bar menu; `settings.json` with `safeStorage`-encrypted tokens                           |            |
| `src/platform.ts`                | Open at login (macOS LaunchAgent, Linux autostart), the Linux launcher entry, Linux tray detection  |            |
| `src/smoke.ts`                   | `--smoke-test`                                                                                      |            |
| `scripts/build.mjs`              | esbuild bundles main + preload into `dist/` (no `node_modules` shipped), copies `assets/`           |            |
| `scripts/package.mjs`            | Runs electron-builder; macOS: ad-hoc signing unless `CSC_LINK`/`CSC_NAME` (then Developer ID)       | yes        |
| `electron-builder.yml`           | Targets and fixed asset names per OS, `extraResources` (addon; koffi on Windows), GitHub feed       | yes        |
| `packages/sync`                  | Upload/download logic: SavedVariables reader, uploader, `GuildieData.lua` writer, WoW folder search |            |

## The bridge: security rules

The bridge connects web pages to the player's computer. Keep all of these:

- Exposed **only on Guildie origins** (`isGuildieUrl`: `guildie.club`,
  `*.preview.guildie.club`, `*.guildie.localhost`). Never on Battle.net or
  any other page.
- Every IPC handler checks `event.senderFrame`: main frame, and the origin of
  the site the app is set to (`fromSite` and `pageOnly` in `main.ts`). A preview opened from
  guildie.club gets `{ connected: false }` and its writes reject.
- **Validate every argument** in the main process (types, lengths, enums).
  The preload passes `unknown`.
- **The token only goes in.** Nothing returns a token, a path the page didn't
  choose, or file contents to the page.
- Context isolation on, sandbox on, no Node in the page, no `<webview>`, no
  permissions besides clipboard write. Self-signed certificates only for
  `*.localhost`.
- New bridge methods are **optional** on the site side
  (`apps/web/src/lib/desktop.ts`): older app versions stay installed for a
  while. Check `bridge.method` exists before calling; never remove or change
  the shape of an existing one. Document it in apps/desktop/README.md ("The
  bridge").

## Running and testing

```sh
pnpm --filter @guildie/desktop check    # typecheck
pnpm --filter @guildie/desktop test     # origin rules, addon install/update (node --test)
pnpm --filter @guildie/desktop dev --url https://guildie.localhost:1355     # with pnpm dev running
pnpm --filter @guildie/desktop smoke --url https://guildie.localhost:1355   # headless PASS/FAIL
```

The smoke test loads the site hidden with throwaway settings, checks the
bridge (only on Guildie's pages, exactly the expected functions, bad input
rejected, no Node), installs the addon into a fake WoW folder, updates an
older one keeping its `GuildieData.lua`, and checks status reaches the page.
`GUILDIE_SMOKE_TOKEN=gld_…` adds connect, upload, download and sign-out.
Add a smoke check when you add a bridge method.

## What you can only test on each OS

Each OS's window chrome, tray / menu bar, notifications, open at login,
token storage (DPAPI, Keychain, Secret Service/KWallet), WoW folder
detection and installer. Windows: Mica, the window border (koffi + dwmapi),
NSIS. macOS: the dmg and Gatekeeper on a downloaded copy, the traffic
lights. Linux: the AppImage under FUSE, trays per desktop. Say in the PR
what was tried where; a maintainer or a guildie on that OS tries the rest.

Building: `build:mac` only on a Mac; `build:win` (NSIS) and `build:linux`
(AppImage) on Apple Silicon need Rosetta (electron-builder's makensis and
mksquashfs are Intel-only; without it: "spawn Unknown system error -86").
`build:win-cross` (zip) works anywhere. The release workflow builds all three.

Self-update only runs where `canSelfUpdate()` (`selfUpdateBlocker()` says why
not): the Windows NSIS install, a macOS Guildie.app in a writable folder (not
the dmg, not App Translocation), the Linux AppImage (`APPIMAGE` set). Dev,
the Windows zip and smoke never update. The macOS swap can be tried locally
against a served zip (`GUILDIE_MAC_UPDATE_FEED`, README "macOS updates
without a signature"); a real update needs two releases.

## Releases (maintainers)

`pnpm release <version> --push` on an up-to-date `main` (scripts/release.mjs)
does it: `## Unreleased` in CHANGELOG.md becomes `## <version>` (the release
notes on GitHub and in Settings → App), `apps/desktop/package.json` gets the
version, and it commits, tags `desktop-v<version>` and pushes.
`.github/workflows/desktop-release.yml` then checks the tag matches and
creates the release once (before any upload: parallel uploads would each
create one), then Windows, macOS and Linux jobs run check and test, build,
and upload into it: the installer (also as `Guildie-Setup.exe`), `.blockmap`
and `latest.yml`; `Guildie-mac-universal.dmg`/`.zip` and `latest-mac.yml`;
`Guildie-linux-x86_64.AppImage` and `latest-linux.yml`. macOS and Linux upload
only after a smoke test of the packaged app. The unversioned names are what
the site links (`releases/latest/download/<name>`): never rename them. The addon's `## Version` in `Guildie.toc` is bumped in the
PR that changes the addon (players' copies update only when it goes up).

electron-updater reads only the repo's **Latest, non-draft** release. Any
other release in this repo must be a pre-release or not marked Latest, or
installed apps stop finding updates. Builds aren't code-signed (SmartScreen
asks once; macOS: right-click → Open or Privacy & Security → Open Anyway).
macOS signing turns on by adding the `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`
and `APPLE_API_*` secrets (README "Signing the macOS app"), no code change.
Squirrel.Mac refuses unsigned updates, hence `mac-updater.ts`; keep it until
every player runs a signed build. Each ad-hoc build is a "new app" to macOS
privacy settings: Keychain and Screen Recording may ask again after an update.

## Gotchas

- The preload runs sandboxed: it may only `require("electron")` and what
  esbuild inlines (`origins.ts`).
- `__VERSION__` is injected by `scripts/build.mjs` from `package.json`.
- koffi's native binary is loaded at runtime from `resources/koffi`
  (external in esbuild, Windows-only `extraResources` in electron-builder).
- The bundled addon is `resources/addon/Guildie` on every OS; the app
  reinstalls it at each start, which is how an app update updates the addon.
- Settings and the log live in `%APPDATA%\guildie\desktop`,
  `~/Library/Application Support/guildie/desktop` or `~/.config/guildie/desktop`
  (`guildie.log`).
- Linux window grouping: `desktopName: guildie.desktop` (extraMetadata) is
  Electron's app_id and the launcher entry's `StartupWMClass=guildie`; keep
  them in step with `src/platform.ts`.
- Icons are `apps/desktop/assets/`: `guildie.ico`, `guildie-256.png`,
  `guildie.icns`, `linux/` drawn by `scripts/make-icon.py` (committed, no
  image libraries); `tray-*` by `scripts/make-tray-icon.py`.
