# App icons

The icons a phone or a browser uses when Guildie is installed as an app
(`public/manifest.webmanifest`, and `apple-touch-icon` in
`src/routes/__root.tsx`). They're the sidebar's shield in its gold gradient
(`mark.svg`, the same paths and stops as `GuildieMark` in
`src/components/mark.tsx`) on the chrome color (`--chrome`, #13110e) with a
faint legendary glow (`--glow`, 22% at most) behind it.

| File                                | Size | For                                                         |
| ----------------------------------- | ---- | ----------------------------------------------------------- |
| `public/icons/icon-192.png`         | 192  | Android, Chrome's install prompt (rounded tile)             |
| `public/icons/icon-512.png`         | 512  | Splash screen, desktop installs (rounded tile)              |
| `public/icons/maskable-512.png`     | 512  | Android's own icon shape: full bleed, mark in the safe zone |
| `public/icons/apple-touch-icon.png` | 180  | iOS home screen (iOS rounds the corners)                    |

To change them, edit `mark.svg` (or the sizes in `scripts/gen-icons.mjs`) and
render again. Playwright isn't a repo dependency; install it anywhere:

```sh
mkdir -p /tmp/pw && (cd /tmp/pw && npm i playwright && npx playwright install chromium)
PLAYWRIGHT_DIR=/tmp/pw node apps/web/scripts/gen-icons.mjs
# or with your own Chrome: CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

Check the maskable one at <https://maskable.app>.

The same tile is also `public/favicon.svg` (by hand: the mark at 26/32 on a
rounded `--chrome` square with the glow) and the Windows app's icon
(`apps/desktop/scripts/make-icon.py`); change them together. The gold outline
shield is the in-game addon's icon (`apps/addon/Guildie/icon.tga`, and
`public/landing/addon-icon.svg` for the landing page's tooltip mock), kept
gold to sit with the game's tooltip colors.
