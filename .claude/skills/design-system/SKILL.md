---

name: design-system
description: Guildie's visual rules, tokens and shared UI components, and how to check UI changes with screenshots. Use when building or restyling any page or component in apps/web/src, adding a shadcn component, choosing colors, type or spacing, showing items, characters or classes, or reviewing how something looks on the web, on phones and in the Windows app.
---

# Design system

Minimal, dark only, an **app** rather than a website. The same React app runs
on guildie.club and inside the Windows app, so every page must work in both.

## Rules

- **App shell** (`__root.tsx`, `.app-shell` in `styles/app.css`): sidebar on
  the left, one content pane (`#content`) that scrolls by itself; the page
  never scrolls as a whole. Phones get a top bar (`AppTopBar`) instead of the
  sidebar. On the web the breadcrumbs bar (md up) and the phone top bar are
  frosted and float over the top of the pane; the pane pads its top by
  `--pane-inset` and the page scrolls under them (sticky things keep
  `top: 0`, which already stops under the bar). In the Windows app
  (`html[data-desktop="true"]`) the sidebar and 40px title bar sit on the
  window's material (Mica), above the pane; the content pane stays solid.
- **The look: light on dark** (it started on the landing page and runs
  through the app). Warm near-black surfaces lit from above: cards have a
  hairline that catches the light at the top and fades down the sides;
  titles are tight and fade from white to grey; the top of every page has a
  faint world map and a legendary glow behind the header that are gone
  before the data starts. The landing uses it at full strength; the app
  quietly.
- **Color:** warm greys (surfaces, hairline borders at ~8%) plus one UI
  accent, amber `--highlight` (`text-highlight`, `bg-highlight/10`,
  `border-highlight/85`): focus rings, the active tab's underline, the
  active nav row, a checked switch, an active chip's edge, a progress bar.
  Thin or faint, chrome only: never on item names or item tooltips, where
  orange means legendary. Color that means something comes from the game:
  class colors (`ClassText`), item quality (`.q-*`, `QUALITY_COLORS`), quest
  level difficulty (`.qd-*`, the quest log's colors) and in-game tooltip
  colors. No emoji, textures, decorative badges, or other new accent colors.
- **Gradients and glows:** allowed for light, not decoration: the card
  hairline and sheen (`.surface-card`), faded headings (`.text-fade`), the
  top-of-page map and glow (`.pane-backdrop`, already in the shell), and in
  heroes (landing, sign-in) `.map-backdrop`, `.glow`, `.grid-lines`,
  `.streak`. Never behind tables, lists or other data, and never colored
  fills on controls.
- **Type:** one sans family (Inter on the web, Segoe in the app), 13-14px UI
  text (`text-sm`, `text-[0.8125rem]`), `.num` for numbers that line up.
  Headings are weight (`font-semibold`), not size or color; page titles add
  tight tracking and the fade (`PageHeader` does it).
- **Shapes:** 6px radius on controls (`--radius`), 8px on cards
  (`--card-radius`; 12px on the landing), 1px borders, no shadows except
  popovers, menus and tooltips (`--popover-shadow`).
- **Decoration is game art:** item and talent icons and character renders
  from Blizzard's media URLs. Item tooltips look like the game's.
- **Copy:** short, plain, sentence case. Say what happened and what to do.

## Phones

- Nothing scrolls sideways but a wide grid in its own `overflow-x-auto` box
  (give it `relative`, or `sr-only` labels inside widen the pane). A table
  with a sticky head (`.table-sticky`) can't scroll sideways at all: drop
  columns by the pane's width with container queries (`@container`,
  `@max-2xl:hidden`; the roster does), since the sidebar and the Windows app
  change the pane's width, not the viewport's.
- Touch screens (`pointer-coarse:`) get ~40px buttons, nav rows and chips
  (`ui/button.tsx`, `app.css`) and 16px text fields (no iOS zoom). Small icon
  buttons outside `Button` add `pointer-coarse:size-9` or so.
- Hover-only things need a tap path: item icons open the item panel; talent
  tooltips open on tap.
- Fixed sheets and dialogs keep to the safe area (`env(safe-area-inset-*)`)
  and fit the screen (`max-h-[…dvh]` with their own scroll). The app shell
  already pads for the notch and home indicator.
- `apps/web/scripts/check-mobile.mjs` checks every page (docs/local-dev.md).

## Tokens

All in `apps/web/src/styles/app.css` (`:root`, mapped into Tailwind by
`@theme inline`): `--chrome` (sidebar/title bar), `--background` (content),
`--surface`, `--well`, `--foreground`, `--muted-foreground`, `--hover`,
`--selected`, `--border`, `--border-strong`, `--tooltip`, `--destructive`.
Use the Tailwind names (`bg-surface`, `text-muted-foreground`, `border-border`)
rather than hex values. Need a new shade? Add a token there, not an inline
color.

The look's tokens: `--highlight` (amber accent, `*-highlight`), `--glow`
(legendary orange, for glows only), `--ring` (amber focus), `--hairline`
(the card edge's gradient), `--card-sheen`, `--card-fill`, `--card-radius`,
`--popover-shadow`, `--row-hover`, `--pane-inset`.

Utilities (`@layer components` in app.css; Tailwind classes on the same
element win):

| Class | Use |
| --- | --- |
| `.surface-card` | Any card or boxed group: replaces `rounded-md border border-border bg-surface` with the same box. `Panel`/`PANEL` and the sign-in card use it. Add `overflow-hidden` when it holds a table or a full-bleed header. Link/button cards brighten on hover. |
| `.hairline` | Just the lit edge, on something with its own fill and no border (the landing's frame). |
| `.heading-display` + `.text-fade` | Tight, faded titles. `PageHeader` has them; use for a page's own header (the character page) and hero titles. Not for section titles or table text. |
| `.pane-backdrop` | The map and glow at the top of the pane; the root shell draws it on every page. Don't add another. |
| `.map-backdrop`, `.glow`, `.grid-lines` | Absolutely placed empty boxes behind a hero (landing, sign-in). Tune the map with `--map-opacity`, `--map-y`, `--map-size`. |
| `.streak` | An amber light along a featured card's top edge; an empty child of a card. Once per screen at most. |
| `.frosted` | Blurred translucent chrome for something content scrolls under. |
| `.pill` | A small rounded label with something to say ("Free and open source"), a status. Not decoration. |
| `.chip` | Toggle chips (filters); active ones get an amber edge. |
| `.fade-bottom` | A visual that fades into the page at its bottom. |

Shared primitives already carry it: buttons (amber focus ring, warm
pressed/open state; primary keeps the light fill), inputs and selects (amber
border and soft ring on focus), switches (amber when on), tabs and
`PageTabs` (amber underline), tables (warm hover rows, stronger head rule),
menus and plain tooltips (sheen, lit top edge), the sidebar's active row.
Item and talent tooltips (`.item-tooltip`) stay the game's.

shadcn primitives (on Base UI) live in `src/components/ui/`. Add new ones with
the shadcn CLI (`components.json`), then restyle them through the tokens in
`app.css` so they match.

## Components to reuse

| Component                                  | File                                              | For                                                                                                |
| ------------------------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `PageHeader`, `Page`, `SectionTitle`       | `components/page-header.tsx`                      | Every page: title, description, actions; body width                                                |
| `PageTabs`, `PageTab`                      | `components/page-tabs.tsx`                        | Tabs that are routes                                                                               |
| `ItemIcon`, `ItemHover`, `ItemTooltipBody` | `components/item.tsx`                             | Item icons with quality edge; hover tooltip like the game's; click opens the item panel (`?item=`) |
| `ItemSheet`                                | `components/item-sheet.tsx`                       | The item panel (who can craft it, upgrade for whom)                                                |
| `ClassText`                                | `components/class-name.tsx`                       | Names in class color, or item quality with `quality`                                               |
| `CharacterAvatar`, `UNFETCHED_NOTE`        | `components/character-avatar.tsx`                 | Portraits, with a silhouette for characters Blizzard hasn't published                              |
| `PaperDoll`                                | `components/paper-doll.tsx`                       | Equipped gear in slot order                                                                        |
| `TalentTree`                               | `components/talent-tree.tsx`                      | Talent trees from Blizzard's layout                                                                |
| `RecipeItem`, `Reagents`                   | `components/recipe-row.tsx`                       | Recipes and their reagents                                                                         |
| Icons                                      | `@hugeicons/react` + `@hugeicons/core-free-icons` | UI icons (most use `strokeWidth={1.75}`)                                                           |

## Checking your change

1. `pnpm dev`, open the page (docs/local-dev.md; sample data and guest sign-in).
2. Look at it three ways: a wide window, a phone width (~390px; the
   `check-mobile.mjs` script covers every page), and the app
   layout (devtools → override the user agent with
   `Mozilla/5.0 GuildieDesktop/0.3.5`, add ` (Mica)` for the transparent
   chrome).
3. Screenshots for the PR. With Playwright (not a repo dependency; run it
   with `npx`, or use your assistant's browser tool):

   ```sh
   npx -y playwright@1 screenshot --ignore-https-errors --viewport-size=1280,800 \
   	https://guildie.localhost:1355/g/us/<guild> shot-wide.png
   npx -y playwright@1 screenshot --ignore-https-errors --viewport-size=390,844 \
   	https://guildie.localhost:1355/g/us/<guild> shot-phone.png
   ```

   (Install a browser once with `npx -y playwright@1 install chromium`.)
   Pages behind sign-in need a scripted guest sign-in first; an assistant
   with a browser tool can click "Sign in as a guest" on `/sign-in`.
4. Compare against the rules above: no new colors, amber only on chrome, no
   glows behind data, no shadows, numbers in `.num`, the content pane
   scrolls and the page doesn't.

Desktop-only UI (Settings → Addon, App) needs the real app for its data:
`pnpm --filter @guildie/desktop dev --url <your local URL>` (desktop-app skill).
