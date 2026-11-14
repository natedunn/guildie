# Addon and desktop app

Blizzard updates a character's public profile only when they log out. The
addon and the desktop app let players who install them show changes sooner:
after a `/reload`. The addon saves everything it can read in game: level, XP,
guild, gear with each item's tooltip, professions with skill, known recipes
(when a profession's window is opened) and talents. What it reads and when:
apps/addon/README.md.

The desktop app (`apps/desktop`, Electron, Windows) does the uploading, with
the code in `packages/sync`: Guildie in its own window; signing in there
connects it. It replaced the helper (`apps/helper`, a tray-only Bun program,
now retired and removed). The server still accepts the helper's tokens, and
the API keeps the name: `/api/helper/*`, `helper.ts`.

Below, "the helper" means the desktop app's uploader (or the old helper).

## Installing

Players install the desktop app, and the app installs the addon:

1. Download `Guildie-Setup-<version>.exe` from
   [GitHub Releases](https://github.com/natedunn/guildie/releases/latest) and
   run it (per user, no admin; unsigned, so SmartScreen asks once: **More
   info**, **Run anyway**).
2. The app finds the WoW folder (or **Choose World of Warcraft folder...** in
   the tray) and installs the addon into `_forever_/Interface/AddOns/Guildie`.
   Restart WoW if it was running.
3. Sign in in the app's window.

After that, both stay current on their own: a new app version downloads from
GitHub Releases and installs when the app quits (or **Restart to update**),
and each app version carries the addon, updating an older installed copy
(`## Version` in `Guildie.toc`) on start, keeping its `GuildieData.lua`. If
WoW is running, the app says to `/reload`.

There's no addon-store (CurseForge, Wago) release: the addon is useless without
the app, which uploads what it saves and writes its guild data. Releasing:
apps/desktop/README.md, "Releasing".

```
game ── addon saves GuildieDB ──▶ SavedVariables/Guildie.lua (on /reload, logout)
                                         │ desktop app (or helper) watches, uploads on change
                                         ▼
                    POST https://guildie.club/api/helper/snapshot  (Bearer gld_…)
                                         ▼
                         Convex helper:ingest ── addonSnapshots
```

## What's where

| Piece                                                                                | Where                                                                                                                      |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Addon (Lua, interface 16001)                                                         | `apps/addon/Guildie` (shipped inside the desktop app)                                                                      |
| Desktop app (Electron → Windows installer, GitHub Releases)                          | `apps/desktop`                                                                                                             |
| Addon install and update, app self-update                                            | `apps/desktop/src/addon.ts`, `apps/desktop/src/updater.ts`                                                                 |
| Shared: SavedVariables reader, uploader, `GuildieData.lua` writer, WoW folder search | `packages/sync` (`@guildie/sync`)                                                                                          |
| Tokens, ingest                                                                       | `apps/web/convex/helper.ts`                                                                                                |
| Payload checks, recipe matching                                                      | `apps/web/convex/addonPayload.ts`                                                                                          |
| Guild requests (rules, handlers; the private inventory behind the mats check)        | `apps/web/convex/shared/requests.ts`, `apps/web/convex/requests.ts`; "Guild requests" below                                |
| Personal → Inventory (your bags and banks, owner only)                               | `apps/web/convex/inventory.ts`, `apps/web/src/routes/inventory.tsx`                                                        |
| Quests: catalog, Personal → Quests, a guild's Dungeons page                          | `apps/web/convex/quests.ts`, `apps/web/convex/shared/quests.ts`; "Quests" below                                            |
| Newest-wins merge with Blizzard's data                                               | `apps/web/convex/profile.ts` (`pickProfile` in helper.ts)                                                                  |
| What Guildie shows for your own characters, for the addon's "On Guildie" check       | `apps/web/convex/addonView.ts` (in `guildData`), `apps/addon/Guildie/Status.lua`                                           |
| Addon tests (stubbed WoW API, luajit)                                                | `apps/addon/tests`                                                                                                         |
| HTTP endpoints                                                                       | `apps/web/src/routes/api/helper/{me,snapshot}.ts`                                                                          |
| Talent ID → class and tree                                                           | `apps/web/convex/shared/foreverTalents.ts` (generated by `scripts/gen-forever-talents.mjs` from the WowSims exporter, MIT) |

## API

Connecting, desktop app: the user signs in in the app's window and the site
hands the app a token through `window.guildieDesktop.setToken` (the bridge,
apps/desktop/README.md); the app checks it with `/me` before keeping it. When
the site signs out it calls `signOut()`, which revokes the token. The pairing
below is the app's fallback.

Connecting, helper (no token to copy):

- `POST /api/helper/pair` `{ label }` → `{ code, pollSecret, connectUrl, expiresInSeconds }`.
  The helper opens `connectUrl` (`/helper/connect?code=…`); the signed-in player
  clicks Connect.
- `POST /api/helper/pair/poll` `{ code, pollSecret }` → `pending`, `expired`, or
  `approved` with the token (handed over once). Codes last 10 minutes.

The rest take `Authorization: Bearer gld_…`. Only the token's hash is stored;
an account keeps up to 10 (connecting an 11th retires the least recently
used); the account page lists them with Disconnect.

- `POST /api/helper/signout` → the token stops working.
- A 401 from `snapshot` or `guild-data` means the token was revoked (say from
  the account page): the helper and the app forget it and show "not connected".
- `GET /api/helper/me` → `{ battletag, characters }` or 401.
- `POST /api/helper/notifications` (the Windows app, every minute while
  connected) → `{ notifications: [{ id, text, link }] }` or 401: recent
  notifications for the app to show, each handed out once (`link` is a path
  on the site; the app opens nothing else). See "Notifications".
- `POST /api/helper/snapshot`, body (≤ 2 MB): the addon's payload as saved,
  `{ "version": 7, "characters": [ ... ] }` (versions 1, talents and level
  only, 2, without `inventory`, 3, without `quests`, 4, without `completedQuestIds`, 5, without `deliveries`, and 6, without `addons`, are still accepted) → `{ accepted: [slug], unmatched: [name], rejected: [name] }`.
  One upload per 5 s per token, at most 50 characters. A character, version 2:

  ```jsonc
  {
    "guid": "Player-4904-004E2BA2", "name": "Lich", "level": 23,
    "xp": 1200, "xpMax": 15000, "classToken": "PRIEST", "raceToken": "NightElf",
    "capturedAt": 1794336950,                 // game server time, seconds
    "levelAt": 1794330000,                    // optional: when `level` was reached (seen in game)
    "talentsAt": 1794330000,                  // optional (0.19+): when `talents` were last read; a failed read keeps both
    "guild": { "name": "Unbound", "rank": "Member", "rankIndex": 5 },
    "talents": [ { "id": 134214, "rank": 5, "name": "Wand Specialization" } ],
    "equipment": {
      "capturedAt": 1794336950, "averageItemLevel": 21.47,
      "items": [ {
        "slot": 16, "id": 2520, "name": "Broadsword of the Eagle", "quality": 2,
        "itemLevel": 24, "enchant": 241, "suffix": 852,
        "tooltip": [ { "left": "Two-Hand", "right": "Sword" }, { "left": "Crusader", "color": "#00ff00" } ]
      } ]
    },
    "professions": { "capturedAt": 1794336950, "skills": [ { "name": "Tailoring", "id": 197, "rank": 215, "max": 225 } ] },
    "recipes": [ { "profession": "Tailoring", "capturedAt": 1794336900,
                   "known": [ { "name": "Bolt of Silk Cloth", "item": 4305 }, { "name": "Some Enchant" } ] } ],
    "proficiencies": { "capturedAt": 1794336950, "level": 23,
                       "skills": [ "Cloth", "Daggers", "Staves", "Wands" ], "dualWield": false },
    "inventory": {                            // version 3 (addon 0.8.0)
      "bags": { "capturedAt": 1794336950, "items": [ { "id": 2589, "count": 25 } ] },
      "bank": { "capturedAt": 1794250000, "items": [ { "id": 2589, "count": 40 } ] }
    },
    "quests": {                               // version 4 (addon 0.10.0)
      "capturedAt": 1794336950,
      "list": [ { "id": 166, "title": "The Defias Brotherhood", "level": 22, "tag": "Dungeon",
                  "zone": "The Deadmines", "objectives": [ { "text": "Edwin VanCleef's head: 0/1", "done": false } ] },
                { "id": 214, "title": "Red Silk Bandanas", "level": 17, "complete": true } ]
    },
    "addons": {                               // version 7, on the character read last only
      "capturedAt": 1794336950,
      "list": [ { "name": "Questie", "title": "Questie", "version": "9.1.0", "curse": "334372" },
                { "name": "Auctionator", "version": "11.0.12", "notes": "Easier auction house" } ]
                                              // curse (## X-Curse-Project-ID) and notes (## Notes,
                                              // only without a curse ID, 120 chars): addon 0.20+
    }
  }
  ```

  `slot` is the inventory slot (1 head … 19 tabard), `quality` the game's
  index (0 poor … 7 heirloom), `id` in skills the skill line id where the
  client gives one, `item` in recipes the crafted item. `proficiencies`
  (addon 0.7.0+): the weapon and armor skills in the game's skill list
  (English names), the level they were read at, and `CanDualWield()`; the
  site checks them against its rules (docs/game-data.md). `inventory`
  (addon 0.8.0+): bags (backpack and bag slots) and the bank as of the last
  time it was open in game, item id → count (at most 600 items each); see
  "Guild requests". `quests` (addon 0.10.0+): the quest log, at most 60
  quests and 12 objectives each: the game's title, level (none for scaling
  quests), tag (`Dungeon`, `Elite`, `Raid`...), the header it's under
  (`zone`), `complete`/`failed`, and each objective's text; see "Quests".
  Tooltip lines
  exclude the name; `color` is omitted for white. Talent `id` is the TraitDefinition ID.
  Each character is checked on its own (types, counts, lengths, clocks no
  more than 10 minutes ahead: `convex/addonPayload.ts`); one that fails is
  listed in `rejected` and the rest still go in.

What the site does with it (`helper:ingest`):

- Each part of the stored snapshot (`addonSnapshots`) keeps whichever copy
  is newer by its own `capturedAt`, so an older upload never replaces newer
  data.
- Professions are mapped to Blizzard's skill line ids by skill line id or
  English name; unknown ones (Riding, other languages) are dropped. If none
  are recognised the section is ignored and Blizzard's stays.
- Weapon and armor skills are stored as sent (newer wins), for
  `proficiencies:audit` (docs/game-data.md).
- Recipes are matched to the catalog (`recipes`, by profession) by crafted
  item, then by name; unmatched names are counted (`unmatched`), not kept.
- New gear gets icons through `items.ensure`, with the game's tooltip as the
  fallback when Blizzard's item API has none.
- The quest log is stored on the snapshot (newer wins); quests the catalog
  doesn't have yet are looked up (`quests.ensure`), with the game's title,
  tag and header as the fallback when Blizzard has none.
- Bags and bank go to their own table (`inventories`, newer read wins per
  part), never into `addonSnapshots`, and re-check the player's open craft
  requests.
- The addons running (`addons`, payload 7) are account-wide: the newest list
  in the upload goes to `playerAddons`, and only if the player shares it
  (below). Otherwise it's dropped. CurseForge project IDs in the list are
  looked up for an icon, summary, link and categories (`addonCatalog`,
  convex/addonCatalog.ts); addons without one are matched by folder against
  CurseForge's popular WoW projects (`addonFolders`, synced weekly).

A character is accepted only if the token's owner claimed it: matched by
Blizzard's character id (the hex number at the end of the in-game GUID), or by
first name if exactly one claimed character has it.

## Desktop app bridge

The Guildie desktop app loads the site in its window and exposes a bridge
through Electron's `contextBridge`, on our own origins only:

```ts
window.guildieDesktop?: {
	isDesktop: true;
	version: string;
	getState(): Promise<{ connected: boolean; account?: string }>;
	setToken(token: string, account?: string): Promise<void>;
	signOut(): Promise<void>;
}
```

The web side (`apps/web/src/lib/desktop.ts`, `apps/web/src/components/desktop-bridge.tsx`,
mounted in `__root.tsx`):

- When the bridge exists, the player is signed in and `getState()` says not
  connected, the page calls `helper:issueDesktopToken({ label })` (signed-in
  user; label `Desktop app <version>`) and hands the token to
  `setToken(token, battletag)`. Once per signed-in user per page load. It's
  an ordinary `gld_…` token: same 10-per-account limit, listed on /me with
  Disconnect, used with the API above.
- "Sign out" on the site also calls `signOut()` on the bridge.
- Nowhere else issues tokens without the pairing code.
- Layout: the app appends ` GuildieDesktop/<version>` (and ` (Mica)` on
  Windows 11) to its user agent. The root route reads it during SSR
  (`readDesktopInfo` in `lib/desktop.ts`) and renders
  `<html data-desktop="true">` (and `data-material="mica"`), which switches on
  the title bar (`components/app-titlebar.tsx`), default cursors, and
  transparent chrome over Mica (`styles/app.css`). `useInDesktopApp()` is true
  from the first render when the user agent says so, and once mounted when only
  the bridge does (app builds before 0.2).

## Guild data in game (requests, recipe, reagent and gear-upgrade tooltips)

The other direction: the helper downloads `GET /api/helper/guild-data` every
15 minutes (and on connect, on "Upload now", and right after any upload the
site accepted, so the next `/reload` shows Guildie caught up) and writes it to
`Interface/AddOns/Guildie/GuildieData.lua` in each installed copy of the
addon. The game loads it at login and `/reload`, so tooltips are as fresh as
your last login or reload.

- Only guilds the token's claimed characters are in (so members-only guilds
  work, and nobody else's guild is downloaded).
- For each reagent: guild members whose known recipes use it, most recipes
  first (top 8). Built from Blizzard's recipe catalog (`apps/web/convex/recipes.ts`,
  weekly) and each member's known recipes (with their profile, hourly), in
  `convex/reagentSuggestions.ts`. Left out: Cooking, Fishing and First Aid
  (nearly everyone has them), the gathering professions' camping recipes
  (Incense Candle, Camp Chair, Lodestone and upgrades) except for their
  green-or-better reagents (Silver Bar, Truesilver Bar, listed as
  "Camping+Mining"; Mining's smelting
  counts in full), and reagents vendors sell (`VENDOR_REAGENTS` in `shared/wow.ts`:
  thread, vials, flux, dyes, Simple Wood...).
- Tooltips end with a Guildie block: a blank line, a gold "Guildie" header
  with the addon's icon, then one indented row per person, in two columns:
  the class-colored name, and what Guildie knows in muted grey. Requests
  first, then recipe items, then reagents, then upgrades. The hook goes on at `PLAYER_LOGIN`,
  so other addons' lines (added at load) come before the block. Reagent
  rows, skipping your own characters, up to 8 (all the site sends):
  "Brenna | might want (Tailoring, Alchemy)", then "+2 more". With "Say
  why tooltips have nothing" ticked in the `/guildie` window
  (`GuildieDB.settings.sayWhyEmpty`, on by default), an item with nothing
  to show gets one row instead: "Soulbound, can't be traded" (or Binds when
  picked up, Quest Item), "No guildmates need this", or "No guild data yet
  (needs the Guildie app)".
- Gear upgrades (addon 0.5.0): `upgrades` holds the rules and stat weights
  once (`apps/web/convex/shared/weights.ts`, seeded from WowSims' EP weights)
  and each guildmate seen in the last 14 days (not your own characters):
  class, level, main and second spec, and the score of what they wear in each
  slot, worked out on the site from their gear's tooltips. On an equippable
  item's tooltip the addon reads the item (`GetItemInfoInstant`,
  `GetItemInfo`, `GetItemStats`, its tooltip lines for "Classes:", Unique and
  Soulbound), scores it for each of them the same way
  (`Guildie/Upgrades.lua`, a port of `convex/shared/upgrades.ts`; both run
  `apps/addon/tests/upgrade_vectors.json`) and adds a row each for up to 3 people:
  "Brisket | upgrade (Feral)", "Pip | possible upgrade (Str/Int/Agi)", "Miller | possible upgrade (lvl 24)",
  "Todd | possible upgrade (Enhancement, cloth)", "Skurg | empty slot (Arms)". Upgrade:
  15%+ better than what they wear there (and at least a point of their main
  stat), usable now, main spec, an armor type they want, none of
  their priority stats lower. Possible upgrade: anything else 3%+ better,
  some of a priority stat given up, their second spec, usable within 3 levels, or an armor type they don't
  want. Empty slot: plain armor (no stats) for a slot they have nothing in. Nothing for items soulbound to
  you. The site's item panel lists the same, with why ("+6 Agility, +4
  Stamina over Embossed Leather Gloves"). About 20 KB of the file for a guild
  of 60. How the scoring works, with every spec's weights:
  [gear-upgrades.md](gear-upgrades.md).
- For you (addon 0.19.0): `upgrades.mine` holds the same profile for each of
  your own characters, however long ago you played them. On the character
  you're on, the addon scores what you wear right now (`U.liveMember`:
  `GetInventoryItemLink` per slot, the site's score for a slot whose item
  hasn't loaded yet; cached until `PLAYER_EQUIPMENT_CHANGED`,
  `PLAYER_LEVEL_UP` or `GET_ITEM_INFO_RECEIVED`) and puts your row first:
  "You | upgrade", "You | possible upgrade (cloth)", "You | empty slot", "You |
  not an upgrade", "You | needs lvl 30", "You | can't use"; nothing for an item
  you wear. It shows for items that can't be traded too (quest rewards,
  loot rolls), where guildmates' rows don't. Setting: "Show whether items are
  an upgrade for you" (`showForYou`, on by default).
- Dialogue UI (experimental, addon 0.19.0): the Dialogue UI addon draws its
  own quest-window tooltips, which the game's tooltip hooks don't reach. When
  it's installed, the addon registers with its public API
  (`DialogueUIAPI.AddItemTooltipProcessorExternal`, the hook its own
  translations use) and adds the same Guildie block there
  (`ns.hookDialogueUI` in `Tooltip.lua`; `## OptionalDeps: DialogueUI` so it
  loads first). Setting: "Guildie in Dialogue UI tooltips (experimental)"
  (`dialogueUI`, on by default).
- Your own characters (addon 0.6.0): `characters`, by name, each claimed
  character as Guildie shows it now (the merged profile, below): see "Up to
  date with Guildie". About 0.5 KB per character.
- Guild requests (addon 0.8.0): `requests` and `myRequests`; see "Guild
  requests".
- Recipe items (addon 0.14.0): `recipes`; see "Recipe items".
- Notifications (addon 0.20.0): `notifications`, `[{ id, text }]`, recent
  unread ones meant for the game; see "Notifications".
- The file is generated as data literals only (`packages/sync/src/luaData.ts`,
  tested), since the game runs addon files as code.

## Notifications

What happened to a player's requests, written once with its text when it
happens (`convex/notifications.ts`, text and channels in
`shared/notifications.ts`), kept 60 days:

| Kind             | When                             | Site inbox | Windows app | In game |
| ---------------- | -------------------------------- | ---------- | ----------- | ------- |
| `craftClaimed`   | someone claims your craft        | yes        | yes         | yes     |
| `craftSent`      | the claimant marks it sent       | yes        | yes         | yes     |
| `requestDone`    | deliveries complete your request | yes        | yes         | no      |
| `requestExpired` | the daily cron expires it        | yes        | no          | no      |

- **Site:** Personal → Notifications (`/notifications`), unread count in the
  sidebar. Opening it marks everything read.
- **Windows app:** asks `POST /api/helper/notifications` every minute while
  connected and shows each as a system notification; clicking opens the
  request. Only ones from the last 24 hours, unread, each once (with the app
  on two computers, the first to ask shows it).
- **In game:** `GuildieData.notifications`, unread ones from the last 7 days;
  the addon prints each once in chat at login or `/reload`
  (`ns.announceNotifications`, UI.lua), remembering the ids in
  `GuildieDB.notified`.

## Recipe items

Is a pattern (plans, formula, schematic...) worth sending someone? For each
guild character with its profession, one of four states, most useful first:
**can learn it** now, **later** (skill below what it needs), **has one**
already (in bags or bank, not learned), or **knows it**. The rule is
`apps/web/convex/shared/recipeStatus.ts` (tested), mirrored in
`Guildie/Tooltip.lua` `recipeRows` (`tests/recipes_test.lua`).

- **Catalog:** `recipeItems` (`apps/web/convex/recipeItems.ts`), weekly after
  the recipe catalog: Blizzard's item search for item class 9 (paged by id,
  the search caps at 1,000; "Book" class tomes skipped), then each item for
  its skill requirement (`preview_item.requirements.skill`: profession id and
  level) and what it teaches. Matched to `recipes` by the crafted item
  (`preview_item.recipe.item`) within the profession, else by name
  ("Formula: Enchant Bracer - Minor Health" or the item's spell name against
  the recipe name), with the profession by name when the item gives another
  id for it (Forever's First Aid manuals: 2942, the catalog: 129).
- **Filling the gaps** (`apps/web/convex/shared/recipeResearch.ts`):
  - Rank books (Expert Cookbook, Expert First Aid, Expert Fishing) teach a
    max skill, read from their text ("allowing a maximum of 225"): known once
    the character's max skill is there (`rank`).
  - Items whose recipe Blizzard's catalog lacks (Forever's "Adaptive" plans
    and patterns, some schematics) say "Teaches you how to craft X": Guildie
    adds its own `recipes` row for X (negative `recipeId`, `fromItem`), with
    the crafted item and reagents when the item has them. The addon's recipe
    reads match it by name like any other; profile syncs count a known recipe
    of that name as it (`mapProfessions`). When Blizzard adds the real recipe,
    `recipes.save` drops ours and the next recipe-item sync matches the real one.
  - What neither Blizzard nor the item says, looked up by hand (`RESEARCHED`,
    with the source): Carrie's Cookbook teaches Grand Lobster Banquet and
    Specklefin Feast (`recipeIds`; known with both).
  - Anything else unmatched is kept without `recipeId` and not shown.
- **Known recipes and skill:** the merged profile (Blizzard plus newer addon
  reads), as everywhere else.
- **Has one:** the one part of a character's bags and bank guildmates see:
  recipe items for a profession they have that they haven't learned
  (`heldUnlearned`). Members of the guild only; nothing else in their
  inventory is shared.
- **On the site:** the item panel's "Who can learn it" (guild pages), the
  Crafting page's "Who can learn" tab (`crafting.guildRecipeItems`, search by
  name, "Only ones someone needs" on by default), and under recipe items on
  Inventory (across the player's guilds, their own characters included).
- **In game:** `recipes = { items = { [itemId] = { profession, skill (0:
  unknown), recipeId, more recipeIds (0.15.0) } }, ranks = { [itemId] = {
  profession, skill, max skill it unlocks } } (0.15.0; apart, so 0.14.0
  leaves them out), crafters = { { name, classId, skills = { Tailoring =
  120 } (-1: unknown), max = { Tailoring = 225 } (0.15.0), known = {
  recipeIds it teaches }, has = { itemIds } } } }`. Rows: "Cy | can learn it", "Bo | requires lvl 25 (at lvl 5)",
  "Di | has one already" (up to 8, then "+N more could use it"), then "Known
  by Ada, Ben, Cat +2". The character you're on is left out (the game's own
  tooltip says "Already known" or the requirement in red); your other
  characters are listed. Nothing for recipe items that bind on pickup.

## Up to date with Guildie

The addon's window says how far behind Guildie is for the character you're
on. The site sends, for each of the token owner's claimed characters
(`convex/addonView.ts`, from `mergeProfile`):

```jsonc
"characters": {
  "Lich": {
    "slug": "lich-braz", "id": 5122978,        // Blizzard id = the GUID's hex number
    "level": 36,
    "talents": { "total": 25, "trees": [ { "name": "Discipline", "points": 18 } ],
                 "ranks": "135360:2,135363:5" },  // "id:rank" by id; absent if an id is unknown
    "gear": { "1": 9492, "16": 2520 },           // inventory slot -> item id
    "professions": { "Tailoring": { "skill": 215, "recipes": 60 } },
    "synced": { "at": 1794336950000, "from": "game" }  // or "blizzard" (lastLoginAt)
  }
}
```

`recipes` is the larger of the game's own count from the last upload and
the recipes matched to the catalog, so a recipe the catalog can't match
doesn't read as new forever. The addon (`Guildie/Status.lua`) finds the entry
by the GUID's id, else by name, and compares it with its last read:

- Level: only when the game's is higher ("Level 23 (Guildie has 22)").
- Talents: more points ("Talents: 3 more points"); fewer, or the same total
  with other ranks ("Talents changed (respec)"). An empty read says nothing.
- Gear: slots whose item differs, shirt and tabard ignored ("New gear:
  <name>" for one, "2 gear changes").
- Professions (names the site knows): higher skill ("Tailoring 155 (Guildie
  has 150)"), "New profession: Mining 12", "Mining unlearned".
- Recipes: for professions whose window was read, more than Guildie's count
  ("4 new Tailoring recipes"); fewer is a filtered window, not news.

The window's answer (`S.summary`), worded around what the addon can know
(`GuildieData.lua` only refreshes at login or `/reload`):

- "Waiting for the Guildie app" (no `GuildieData`), "Not on Guildie yet" (no
  entry: not claimed, or not synced yet).
- With live sync on, a live problem first ("Live sync stopped/paused/waiting"
  with its fix). Otherwise changes since the last reload are "Live sync on":
  the app picks them up as you play, and the window confirms them at reload.
- With reload sync: "N changes to upload" (changed since this UI loaded; they
  upload at logout or `/reload`), or "Saved for upload" (the last `/reload`
  wrote them for the app, but `GuildieData.lua` was read before that).
- "Up to date", or "Check not loaded" when the comparison is old or incomplete.

The changes themselves are under Show details (open when there's a problem).

## Which data wins

Per character and per part, one rule (`decide` in `convex/profile.ts`, used
by the roster, the character pages, guild crafting, item panels and the
addon's guild data). Blizzard's profile describes the character as of their
last session, so its time is `lastLoginAt`:

- Gear (and item level), talents, the profession list with skill, the quest
  log: if only one source has the part, that one. If both do, the newer: the
  addon's read time for that part (talents: `talentsAt`, which a failed read
  doesn't move) against the `lastLoginAt` of the sync that last fetched that
  part from Blizzard (`characters.blizzardAt`; a part whose fetch failed
  keeps its older time).
- Empty (no gear, no talent points, no professions, an empty quest log) shows
  only when both sources say empty. Either can come back empty by mistake:
  Forever's `GetProfessions` returns nothing right after login and at logout,
  and Blizzard has empty responses. So one empty source never hides the
  other's data, and a real removal (unlearning, a respec, abandoning quests)
  shows once Blizzard agrees, after the player logs out and the next sync.
- Under level 10 Blizzard has no profile, so everything is the addon's (the
  character page says so).
- Known recipes: Blizzard's and the addon's together, per profession in the
  list shown (recipes are only lost with the profession). Both writers only
  add: an upload adds a read's recipes to the stored ones, and a Blizzard
  sync adds to the recipes earlier syncs listed. The profile drops them only
  with their profession.
- Turned-in quests: everything either source has seen (both lists only grow).
- Level: the higher of the two (levels never drop).

Both sides also protect against failed reads before they reach the rule: the
addon never replaces a non-empty profession list with an empty one (and reads
again 5 seconds after login), and the upload keeps the stored list when an
older addon sends an empty one. The in-game status window compares with the
quest log Guildie shows (`questsFrom`: Blizzard's has ids only, so only ids
are compared).

Checking it: `profile.test.ts` runs every part through every case (missing,
empty, older, newer, from either source). Maintainers see a "Data sources"
panel at the bottom of each character page (Battle.net account ids in the
`MAINTAINER_BATTLENET_IDS` Convex env var, comma-separated; everyone on a
local backend), and after a deploy:

```sh
npx convex run sources:audit --deployment <name>   # pass continueCursor back to page
```

lists characters that show empty while a source has data (should never
happen) and parts where one source is empty and the other isn't.

Addon data is player-provided; Blizzard's can't be edited by the player.

## Guild requests

Members ask the guild for an item or a craft; a guildmate claims it and
trades or mails it; the requester marks it done (`/g/<region>/<guild>/requests`,
"Request this" in the item panel, "Request" on Crafting rows). Rules in
`apps/web/convex/shared/requests.ts` (tested), handlers in
`apps/web/convex/requests.ts`.

- **Who:** only signed-in members (a claimed character in the guild's roster
  now) see, post, claim or close requests, even in a public guild. Items:
  any other member can claim. Crafts: only a member with a character that
  knows the recipe (merged professions, so the addon's recipe reads count).
- **Lifecycle:** open → claimed → done (the requester; the claimant can mark
  it sent first) or cancelled (the requester). The claimant, or the
  requester, can release a claim (back to open). 15 open per player per
  guild, quantity 1-1000, note up to 140 characters.
- **Fixed amount or ongoing:** an item can instead be asked for as ongoing
  ("send me any you have"): no quantity (stored as 0), nobody claims it,
  guildmates just send it. It's up for 2 weeks, 1 month or 3 months (no
  open-ended ones), then the daily cron closes it as expired; so does a
  requester with no character left in the guild. 20 ongoing per player per
  guild, apart from the 15. One active item request per item, of either
  kind: the page offers "Change request" instead, which switches kinds while
  nobody has claimed it (`requests.update`). The Requests page has a tab
  each (`?type=ongoing`) with the same Open / Mine / I can help filter;
  "I can help" on Ongoing is anything in your bags or bank someone wants.
  The feed says "Todd is collecting Silk Cloth".
- **Stale:** (fixed amounts) no activity for 7 days shows as stale, with "Still need it?" on
  the Requests page, in the sidebar and in the addon window. 30 days: the
  daily cron (`expire stale requests`) closes it as expired.
- **Mats for crafts:** sending the reagents is on the requester. The addon
  records bags (on bag changes) and the bank (only while it's open), and the
  app uploads them with everything else, so Guildie has them **as of the
  player's last `/reload` or logout**, never live. If the bags and last bank
  read of any of the player's characters cover the reagents, the request
  says "Has the mats"; otherwise the player can tick "I have the mats", or
  leave it "Mats not confirmed". The requester sees have/need per reagent
  and when bags and bank were last read; nobody else ever sees the counts.
  Claimed requests keep their mats state (the mats may be in the mail).
- **In game:** `requests` in the guild data, by item id: `{ requestId, kind, quantity,
  name, slug, classId, claimedBy? = { name, slug, classId } }`, or `{ requestId, kind, ongoing = true, name, slug, classId }`
  (no quantity), ongoing first, at most 5 per item and 300 items. The
  tooltip has a row per request: "Todd | wants all you have" (ongoing, and
  then no "might want" row for Todd), "Miller | requesting 20, claimed by
  Brenna", "Brenna | wants it crafted (2)". `myRequests` `{ open, stale }` feeds the
  window's "Your requests: 2 open (1 stale)". Enchants (no item) aren't on
  tooltips.

## Quests

Personal → Quests (`/quests`) lists your characters' quests in progress, by
character or by zone; each with its area, type (Blizzard's `Dungeon`/`Raid`,
else the game's tag), level (in the quest log's colors for that character),
complete or failed and objectives (from the addon), a Wowhead link, and
"Also on it": guildmates in any of your guilds with the same quest. A
guild's Dungeons page (`/g/<region>/<guild>/dungeons`) groups the members'
dungeon and raid quests by dungeon, so people can see who to group with.

- **Data:** each character's `in_progress` list from Blizzard
  (`/profile/wow/character/{slug}/quests`, with the hourly profile sync;
  as of the character's last logout) on `characters.quests`; the addon's
  quest log (payload 4) on the snapshot; newest wins (`profile.ts`). The
  `quests` table is the catalog: title, type and area from
  `/data/wow/quest/{id}` (static; most quests have no type, dungeon quests
  have `Dungeon` and the dungeon as area), the level from the game. Filled
  by `quests.ensure` when new ids turn up, and daily (`backfill quest
  titles`). A quest Blizzard 404s gets the game's (or Blizzard's
  in-progress) title and is retried weekly.
- **Turned-in quests (payload 5, addon 0.17.0):** optional `completedQuestIds`
  is a sorted, unique array of positive quest IDs (up to 20,000 per uploaded
  character; IDs at most 10,000,000). The addon retains IDs from actual turn-in
  events and supported completed-history APIs in `GuildieDB.characters[guid]`.
  Every snapshot repeats them. Ingestion unions them with the previous addon
  snapshot after the existing ownership check, even for older uploads; missing
  and empty arrays never delete confirmations. The Dungeons page unions these
  with Blizzard's `completedQuests` table, so a stale Blizzard response cannot
  undo a live turn-in. An unknown history remains unknown until either source
  supplies it. This records ever-completed IDs, not an event timeline or counts
  of repeatable quests; the existing Blizzard-driven quest feed is unchanged.
- **Who sees what:** which quests a character has in progress is public on
  Blizzard's profiles; Guildie shows it only to the guild's signed-in
  members ("Also on it", Dungeons). Objectives and progress only to the
  character's own player. `/quests` and `/inventory` need sign-in.
- **In game:** `GetQuestLogTitle` (or `C_QuestLog.GetInfo`), with
  `GetQuestTagInfo`, the leader boards (or `C_QuestLog.GetQuestObjectives`),
  on `QUEST_LOG_UPDATE`. A collapsed header hides its quests, so they keep
  their last read. Like bags, changes update the saved read; the payload
  catches up at the next full read (at the latest, `/reload` or logout).

### Addons the player runs (payload 7)

The addon lists the addons loaded for the current character
(`C_AddOns.GetNumAddOns`/`GetAddOnInfo`/`IsAddOnLoaded`, or the old globals):
disabled ones aren't loaded, so they're left out, as are `Blizzard_*`. Each
has its folder name, its `.toc` title and `Version` with color codes and
textures removed, at most 200. Only the character read last carries the
list; the others' copies are dropped on each read.

Sharing is opt in, per player (Settings → Account → Privacy, or the
character's Addons tab): **No one** (the default; nothing is kept, and
choosing it deletes the stored list), **Guild** (members of the guild of the
character or guild page being looked at) or **Public** (anyone who can see
the character or guild). The list shows on the player's characters (Addons
tab) and on each guild's Addons page, summed up by addon
(`convex/addons.ts`, rules in `convex/shared/addons.ts`). The player always
sees their own.

## Verified in game

- Talent reading (names and ranks) in WoW: Forever.
- The GUID's number equals Blizzard's character id, so uploads match on id.

## Not verified yet

- The addon list (payload 7): that `C_AddOns.GetAddOnInfo` and
  `IsAddOnLoaded` take an index in Forever, and that `GetNumAddOns` leaves
  out Blizzard's own addons (we skip `Blizzard_*` anyway).

- The 0.4.0 reads in Forever: gear tooltips (`C_TooltipInfo` or the hidden
  tooltip), `GetAverageItemLevel`, `GetProfessions` vs `GetSkillLineInfo`,
  and recipe reading (`GetTradeSkillInfo`, `C_TradeSkillUI`, or the Craft
  API for Enchanting) with their events. Each falls back to the other API and
  keeps the last good read.

- The 0.5.0 gear-upgrade reads in Forever: `GetItemStats` (or
  `C_Item.GetItemStats`) and its key names (`ITEM_MOD_<STAT>_SHORT`, armor as
  `RESISTANCE0_NAME`, DPS as `ITEM_MOD_DAMAGE_PER_SECOND_SHORT`; without it
  the addon reads the English tooltip), `GetItemInfoInstant`'s equip location
  and subclass, and the tooltip lines it scans (`ITEM_SOULBOUND`,
  `ITEM_UNIQUE*`, `ITEM_CLASSES_ALLOWED`).

- The 0.7.0 weapon and armor skill read in Forever: `GetSkillLineInfo`'s
  "Weapon Skills" and "Armor Proficiencies" sections, and `CanDualWield`.
  Once players upload them, `proficiencies:audit` says whether they match.

- The 0.8.0 bag and bank reads in Forever: `C_Container.GetContainerNumSlots`
  / `GetContainerItemInfo` (or the old globals), the bag index range
  (`NUM_TOTAL_EQUIPPED_BAG_SLOTS` or `NUM_BAG_SLOTS`, bank `BANK_CONTAINER` and
  `NUM_BANKBAGSLOTS` after the bags), and the events `BAG_UPDATE`,
  `BAG_UPDATE_DELAYED`, `BANKFRAME_OPENED`/`_CLOSED`,
  `PLAYERBANKSLOTS_CHANGED`, `PLAYERBANKBAGSLOTS_CHANGED`. The request line on
  tooltips and the window's "Your requests" row.

- The 0.10.0 quest log read in Forever: which of `GetQuestLogTitle` /
  `C_QuestLog.GetInfo` the client has and their fields (`questID`,
  `isComplete` as 1/-1), `GetQuestTagInfo`'s tag names, the objective text,
  quest log headers (zone or dungeon names), and that the log is loaded by
  the first `QUEST_LOG_UPDATE` after login.

- The desktop app on Windows (built from macOS and smoke-tested there; see
  apps/desktop/README.md).
- The addon's window (0.6.0: which frame template Forever has, the logo in
  the portrait, text sizes and wrapping), minimap button, and whether
  "Upload while I'm AFK" is allowed by the game.
- Whether `/reload` alone also makes Blizzard refresh the profile.

## Desktop app sign-in

Signing in never happens inside the app's window: Battle.net's "Sign in with
Google/Apple" can't run in an embedded browser. Instead:

1. The app (Sign in on the site, or the tray) starts pairing with
   `session: true` and opens `/helper/connect?code=…` in the player's browser.
2. They sign in there (any Battle.net login) and click Connect.
3. The app's poll returns its upload token and a one-time `sessionCode`
   (5 minutes, single use, hash stored in `desktopSessionCodes`).
4. The app opens `/desktop/session?code=…` in its window, which swaps the code
   for a normal session through the sign-in proxy (`auth:signInWithDesktopCode`)
   and goes on to the player's guild.

### Request delivery records (payload 6)

Optional character `deliveries` is an array of at most 200 records: `id`,
`requestId`, `kind` (`mailSent`, `mailReceived`, `tradeSent`, `tradeReceived`),
`other` (the other character's name as the game showed it), `itemId`, `quantity`, and `at` (game time seconds).
The app accepts v6 and earlier formats. Upload ownership checks precede bounded
internal processing; optional request progress fields and the new
`requestDeliveryEvents` table are additive, with no migration needed. Existing
manual claim/sent/done controls remain supported. See the request delivery
acceptance section in [live-sync.md](live-sync.md) for matching, retention,
limitations, and release verification. Publish backend support before the new
addon/app. Installing the new Lua file requires a full game restart.

Delivery records also accept optional `reporterName`, the character name observed
at capture time. New server ledger entries preserve both participant names and
resolved character references, plus item, quantity, method and time. Legacy v6
records remain accepted. Recipient-confirmed contributions produce detailed
members-only feed entries, with an explicit completion note on the final receipt.
