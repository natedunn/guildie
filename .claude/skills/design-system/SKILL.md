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
  sidebar. In the Windows app (`html[data-desktop="true"]`) the sidebar and
  40px title bar sit on the window's material (Mica); the content pane stays
  solid.
- **Color:** neutral greys only (surfaces, hairline borders at ~8% white).
  Color that means something comes from the game: class colors
  (`ClassText`), item quality (`.q-*`, `QUALITY_COLORS`) and in-game tooltip
  colors. No gradients, glows, emoji, textures, decorative badges, or new
  accent colors.
- **Type:** one sans family (Inter on the web, Segoe in the app), 13-14px UI
  text (`text-sm`, `text-[0.8125rem]`), `.num` for numbers that line up.
  Headings are weight (`font-semibold`), not size or color.
- **Shapes:** 6px radius (`--radius`), 1px borders, no shadows except
  popovers and tooltips.
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
4. Compare against the rules above: no new colors, no shadows, numbers in
   `.num`, the content pane scrolls and the page doesn't.

Desktop-only UI (Settings → Addon, App) needs the real app for its data:
`pnpm --filter @guildie/desktop dev --url <your local URL>` (desktop-app skill).
