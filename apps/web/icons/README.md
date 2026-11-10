# App icons

The icons a phone or a browser uses when Guildie is installed as an app
(`public/manifest.webmanifest`, and `apple-touch-icon` in
`src/routes/__root.tsx`). They're the sidebar's shield (`mark.svg`, the same
paths as `Wordmark` in `src/components/app-sidebar.tsx`) on the chrome color
(`--chrome`, #13110e).

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
```

Check the maskable one at <https://maskable.app>.
