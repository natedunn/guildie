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
- `POST /api/helper/snapshot`, body (≤ 2 MB): the addon's payload as saved,
  `{ "version": 4, "characters": [ ... ] }` (versions 1, talents and level
  only, 2, without `inventory`, and 3, without `quests`, are still accepted) → `{ accepted: [slug], unmatched: [name], rejected: [name] }`.
  One upload per 5 s per token, at most 50 characters. A character, version 2:

  ```jsonc
  {
    "guid": "Player-4904-004E2BA2", "name": "Lich", "level": 23,
    "xp": 1200, "xpMax": 15000, "classToken": "PRIEST", "raceToken": "NightElf",
    "capturedAt": 1794336950,                 // game server time, seconds
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

## Guild data in game (requests, reagent and gear-upgrade tooltips)

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
  weekly) and each member's known recipes (with their profile, hourly).
- The addon adds one line to item tooltips, skipping your own characters:
  "**Guildie** might want this: Brenna (Tailoring), Corwin (Alchemy) +2".
- Gear upgrades (addon 0.5.0): `upgrades` holds the rules and stat weights
  once (`apps/web/convex/shared/weights.ts`, seeded from WowSims' EP weights)
  and each guildmate seen in the last 14 days (not your own characters):
  class, level, main and second spec, and the score of what they wear in each
  slot, worked out on the site from their gear's tooltips. On an equippable
  item's tooltip the addon reads the item (`GetItemInfoInstant`,
  `GetItemInfo`, `GetItemStats`, its tooltip lines for "Classes:", Unique and
  Soulbound), scores it for each of them the same way
  (`Guildie/Upgrades.lua`, a port of `convex/shared/upgrades.ts`; both run
  `apps/addon/tests/upgrade_vectors.json`) and adds at most one line:
  "**Guildie**: upgrade for Brisket (Feral), maybe Miller (at 24)". Upgrade:
  15%+ better than what they wear there, usable now, main spec. Maybe: 3-15%,
  their second spec, or usable within 3 levels. Nothing for items soulbound to
  you. The site's item panel lists the same, with why ("+6 Agility, +4
  Stamina over Embossed Leather Gloves"). About 20 KB of the file for a guild
  of 60.
- Your own characters (addon 0.6.0): `characters`, by name, each claimed
  character as Guildie shows it now (the merged profile, below): see "Up to
  date with Guildie". About 0.5 KB per character.
- Guild requests (addon 0.8.0): `requests` and `myRequests`; see "Guild
  requests".
- The file is generated as data literals only (`packages/sync/src/luaData.ts`,
  tested), since the game runs addon files as code.

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

States: "Up to date with Guildie", "N changes not on Guildie yet:" and the
lines, "Guildie doesn't know this character yet" (no entry: not claimed, or
not synced yet), "No data from the Guildie app yet" (no `GuildieData`).
What happens next depends on whether anything changed since this UI loaded:
if so it uploads at logout or `/reload`; if not, the game already wrote it at
the last `/reload` and the app uploads it, but `GuildieData.lua` was read
before that, so the window catches up at the next `/reload`.

## Which data wins

Per character and per part, newest wins (`convex/profile.ts`, used by the
roster, the character pages, guild crafting, item panels and the addon's
guild data). Blizzard's profile describes the character as of their last
session, so its time is `lastLoginAt`:

- Level: the higher of the two (levels never drop; `lastLoginAt` is the start
  of the session, so a level gained later in it can be Blizzard's).
- Gear and item level, the profession list with skill: the addon's while its
  read is newer than `lastLoginAt`.
- Known recipes, per profession: the addon's read while newer, added to
  Blizzard's list (recipes are only lost with the profession). A profession
  no longer known shows none.
- Quests in progress: the addon's quest log while newer than `lastLoginAt`,
  else Blizzard's list (ids only).
- Talents: the addon's while newer than the last time Blizzard's talents
  changed (`talentsChangedAt`, set by the hourly sync); an empty list from the
  addon doesn't replace Blizzard's points.
- Anything the addon never read stays Blizzard's.

So: no addon, Blizzard's data as before. `/reload` after a level, a gear
swap or opening a profession: the game's (the pages say "From the game, 5
minutes ago"; the roster's Last synced shows the controller icon and the
newest in-game time). Play elsewhere without the app and log out: Blizzard's
is newer and takes over.

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
  requester, can release a claim (back to open). 10 open per player per
  guild, quantity 1-1000, note up to 140 characters.
- **Stale:** no activity for 7 days shows as stale, with "Still need it?" on
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
- **In game:** `requests` in the guild data, by item id: `{ kind, quantity,
  name, classId, claimedBy? }`, at most 5 per item and 300 items. The
  tooltip line: "**Guildie**: Todd is requesting 20, claimed by Miller",
  "Brenna wants this crafted (2)". `myRequests` `{ open, stale }` feeds the
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
- **Who sees what:** which quests a character has in progress is public on
  Blizzard's profiles; Guildie shows it only to the guild's signed-in
  members ("Also on it", Dungeons). Objectives and progress only to the
  character's own player. `/quests` and `/inventory` need sign-in.
- **In game:** `GetQuestLogTitle` (or `C_QuestLog.GetInfo`), with
  `GetQuestTagInfo`, the leader boards (or `C_QuestLog.GetQuestObjectives`),
  on `QUEST_LOG_UPDATE`. A collapsed header hides its quests, so they keep
  their last read. Like bags, changes update the saved read; the payload
  catches up at the next full read (at the latest, `/reload` or logout).

## Verified in game

- Talent reading (names and ranks) in WoW: Forever.
- The GUID's number equals Blizzard's character id, so uploads match on id.

## Not verified yet

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
