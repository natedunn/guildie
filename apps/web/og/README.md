# Share image

`og.html` is the source of `public/og.png`, the image link previews show for
every page (Discord, iMessage, social sites): 1200×630, set in
`src/lib/share.ts`. To change it, edit `og.html` and save a 1200×630
screenshot of it as `public/og.png` (any browser at that window size, or
Playwright: `page.setViewportSize({ width: 1200, height: 630 })` then
`page.screenshot()`). The names in the roster card are made up.
