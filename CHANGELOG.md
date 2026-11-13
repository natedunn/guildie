# Changelog

What changed in each release of the Guildie app for Windows, at a glance. Most
of Guildie is the website, which the app shows, so a release also lists what
changed on the site since the last one. The release workflow uses the section
for its version as the GitHub release notes, and the app shows them under
Settings → App.

Each pull request adds a line under `## Unreleased` (in `### New`,
`### Improvements` or `### Fixes`), written for players and starting with
where you'll see the change: `**Guildie:**` (the site, in a browser or in the
app's window), `**App:**` (the Windows app itself: installing, updating, the
tray, uploads) or `**Addon:**` (in game), or several, e.g. `**Guildie, App:**`.
CI checks for it. A release turns `## Unreleased` into that version's section.

## Unreleased

## 0.3.34

### Improvements

- **Guildie, Addon:** Gear suggestions are simpler: "upgrade" when it's clearly better and you give nothing up, otherwise "possible upgrade" (this replaces "maybe" and "trade-off"), so you decide. Armor of a type you didn't pick counts for more, so a good cloth piece on a leveling shaman or druid shows up as a possible upgrade instead of "not an upgrade". Your own row on item tooltips drops the percentage ("You | upgrade"): it was a rough estimate, and the game's compare tooltip shows the actual stat changes.
- **Guildie, Addon:** The guild's Addons page is easier to read: each addon shows its icon and description from CurseForge, with how many players run it. Addons are grouped into Most of the guild, Common and Just one person, and you can filter by category. Click an addon to see who runs it and which version. An addon's modules (like Deadly Boss Mods' raid packs) count as one addon. Icons and descriptions need the updated Guildie addon.

## 0.3.33

### New

- **Addon:** Item tooltips now say whether an item is an upgrade for the character you're on ("You | upgrade +35%", "not an upgrade", "can't use"), scored against what you're wearing right now. It also shows on quest rewards and loot rolls.
- **Addon:** Experimental: with the Dialogue UI addon installed, its quest window's item tooltips show the Guildie section too. Turn it off in Guildie's settings.
- **Guildie, Addon:** Share the addons you run, if you want to. Choose No one (the default), Guild or Public under Settings → Account → Privacy or on your character's new Addons tab. Your guild gets an Addons page showing what members run, most used first. Only enabled addons are listed. Your list shows up after your next /reload or logout in game.

### Fixes

- **Addon:** Guildie no longer tries to open the game's Edit Mode, which WoW blocked ("Guildie has been blocked from an action...") and left half open. To move the live sync square anywhere, press Escape, choose Edit Mode and drag it; the corner buttons in Guildie's settings still work.
- **Guildie, Addon:** Characters' professions show again. A failed read in game was replacing them with an empty list, and it also deleted the recipes the addon had read: open each profession window once after updating to read them again.
- **Guildie:** When the game and Blizzard disagree, the newer one shows again, so playing without the Guildie app no longer leaves old gear, talents or quests on your page. An empty read from either side never hides the other's data.

### Improvements

- **Addon:** A clearer Guildie window: one answer at the top ("Up to date", "Live sync on", "2 changes to upload", or what's wrong and how to fix it), details tucked away, and tabs that show which one you're on. Settings are grouped into Sync, Live square and Display, and you pick how you sync in one place. With live sync on, changes since your last reload no longer show as a warning.
- **Guildie:** Characters under level 10 say that their details come only from the Guildie app in game.
- **Guildie, Addon:** Gear suggestions are more sensible: an upgrade has to add at least a point of your main stat, white and grey armor is only suggested for an empty slot (and says "empty slot"), armor outside your preferred types (or cloth on a shaman, leather on a warrior in mail) is a "maybe" at most and counts for less as you level, items you already wear aren't suggested again, and hunters no longer get thrown weapons unless they choose them in their preferences.

## 0.3.32

### Improvements

- **Guildie, App, Addon:** Keep captured character data from being replaced by stale Blizzard responses, recover missed quest completions with periodic checks, retain delivery reports until acknowledged, and retry live captures saved on disk after app restarts. Healthy experimental sync no longer shows a permanent warning banner; upload and storage failures appear in the app's sync settings.

- **Guildie, Addon:** Fixed item requests count down as deliveries are received, and help suggestions use the amount still needed.

## 0.3.31

### Fixes

- **Addon:** Close the experimental sync warning without stopping sync. Your choice is remembered across reloads and logins; restore it in Settings, and view sync warnings anytime on Status.

## 0.3.30

### New

- **Guildie, Addon:** Keep sender and recipient names with request deliveries. The feed shows who received which items, how many, and whether they arrived by mail or trade, including partial contributions and the delivery that completed the request.

- **Guildie, App, Addon:** Item requests track partial deliveries and finish automatically when the recipient’s addon confirms enough items collected from mail or received in trade. Sender mail reports mark claimed requests sent; manual completion remains available. Requires a full game restart after updating the addon.

- **Guildie, App, Addon:** Remember confirmed quest turn-ins and sync them when the live square is visible again, or through normal reload/logout sync. Completed dungeon quest markers keep those confirmations even while Blizzard catches up.

### Improvements

- **Addon:** One wider Guildie window now contains Status and Settings tabs, opened from the minimap or the Options launcher. Status prioritizes actual data differences and warns about unverified or stalled experimental sync; pixel corners stay fully inset when scaling or resizing.

- **Guildie, Addon:** Recipe tooltips say "requires lvl 25 (at lvl 12)" for a guildmate whose skill is too low, instead of "at 25 (has 12)".

### Fixes

- **App:** Give the Windows taskbar group an explicit Guildie icon, separate from the window and tray icons.
- **App, Addon:** Guild data reaches the game again. For about a day the app couldn't download it, so tooltips kept showing old requests, reagents and upgrades, and "who can learn it" never appeared.

## 0.3.29

### New

- **Guildie, App, Addon:** Experimental sync without reloading (enable it in WoW; app capture is on by default unless previously disabled). Enable it in WoW's addon settings and reload once to sync through a small amber square, move it in Edit Mode, and let the app find it automatically. Updating the addon requires a full WoW restart.

### Improvements

- **Addon:** Open unified General and Experimental sync settings from the minimap button. Move the sync square to either left corner or use Edit Mode, with guidance to keep it uncovered.
- **App:** Capture follows the saved in-game setting after /reload. Manage the app override in Settings → Addon; the tray no longer has a separate toggle.

### Fixes

- **Addon:** Experimental sync starts and resets slightly inside the screen so its header is not clipped at the edge. Saved custom positions stay unchanged.

- **App:** Use Guildie's Windows icon for the running app's taskbar button.
- **Addon:** Keep experimental live-sync pixels aligned when the UI scale changes during login or display changes, so automatic capture can find the square.

## 0.3.28

### Fixes

- **Guildie, Addon:** First Aid manuals now say who can learn them too.
- **Guildie, Addon:** So do the Expert Cookbook, First Aid and Fishing books, Carrie's Cookbook, and Forever's new plans and patterns that Blizzard's recipe list doesn't have yet (like the "Adaptive" sets).

## 0.3.27

### New

- **Guildie, Addon:** See whether a recipe (pattern, plans, formula...) is worth sending someone: for each guildmate with the profession, whether they already know it, already have one, can learn it now, or need more skill first. It shows on the recipe's tooltip in game, in the item panel, under recipes in your Inventory, and on Crafting's new "Who can learn" tab. Guildmates see only the recipes you're holding for your own professions, nothing else in your bags.

### Improvements

- **Guildie:** Requests stay where they are while you're on the page, so a request you claim no longer jumps to the top of the list. Crafts you can make, then crafts in your professions, now come first.

## 0.3.26

### New

- **Guildie, Addon:** Ask the guild for an item as an ongoing request ("send me any you have") for 2 weeks, 1 month or 3 months, next to the fixed-amount requests. Ongoing requests have their own tab on Requests, where "I can help" shows what's in your bags that someone wants, and lead the item's tooltip in game as "wants all you have".

### Improvements

- **Guildie, App:** Signing out now ends that session right away, on every page and window that used it. Everyone is signed out once by this update; sign in again.

### Fixes

- **Guildie:** Let phone pages scroll behind the browser’s floating controls instead of stopping above an empty bottom area.

- **Guildie:** Members-only pages (Requests, Feed and others) no longer flash "only for members" or redraw the whole page while loading when you're signed in.
- **Guildie:** Align request feed text, show only inventory-covered requests in “I can help,” and add a searchable inventory character selector with an All characters view.

## 0.3.25

### Improvements

- **App:** The sidebar and title bar are one continuous dark frame around the page, with no seam where they meet.

## 0.3.24

### New

- **Guildie, Addon:** Remove a suggestion you don't want under Crafting → Upgrades for me, and it's never suggested for that character again, on the site or in anyone's tooltips in game. "Show removed" brings them back.
- **Guildie:** A Filter menu on the roster: level 60 only, and hide unpublished or unclaimed characters. New members get a "New" tag for their first week.
- **Guildie:** The sidebar shows how many things happened in each guild's Feed today.
- **Guildie:** Leaving a character's Preferences with unsaved changes now asks first.

### Improvements

- **Guildie:** Stat priority's weighting is now a simple dropdown (Balanced by default), with a "How does this work?" table showing what each of your stats is worth.
- **Guildie:** The Feed groups alike events into one row per day (everyone who cleared a dungeon or reached a level), and a day now runs until 4am, so a late night counts with its evening.
- **Guildie:** Quests shows one character at a time, picked from a searchable menu.
- **Guildie:** Upgrades for me and Upgrades I can craft are grouped into cards (Upgrades, Trade-offs, Maybe), and upgrade reasons show stats gained in green and lost in red, like the game.
- **Guildie:** On the roster, hover a character's claimed badge to see their player's BattleTag.
- **Guildie, App:** The Guildie icon is gold now, everywhere from the browser tab to the Windows app.
- **Guildie, App:** Other various UI tweaks and fixes.

### Fixes

- **Guildie:** Signing in on a phone no longer lands you on your guild looking signed out, without your characters.
- **Guildie, Addon:** Signing in no longer erases your characters' stat priority, gear preferences and removed suggestions. Settings lost before this fix have to be set again.
- **App:** If the app can't read its settings file for a moment, it no longer forgets your WoW folder and sign-in.
- **Guildie:** On phones, the roster no longer looks cut off at the side; swipe it sideways to see every column.

## 0.3.23

### Improvements

- **Guildie:** Downloading the Windows app first shows a short beta notice, including what to do if Windows says "Windows protected your PC".

### Fixes

- **Guildie:** Big headings no longer cut off the bottom of letters like g and y, and the home page's copy is tidier.

## 0.3.22

### Improvements

- **Guildie, App:** The browser tab icon, the app's icon and link previews (Discord, iMessage and the like) match the new look.

## 0.3.21

### New

- **Guildie, App:** Search everything with Ctrl+K (⌘K on a Mac), "/" or Search at the top of the sidebar: your guild's members, items by name or by what they do ("restores mana", "10 slot bag", flavor text) with how many you have in your bags and bank, recipes and who can craft them, quests, dungeons ("sfk" and "brd" work), open requests, other public guilds, every page and setting. It can also sync your roster, hide your BattleTag and sign you out.

### Improvements

- **Guildie:** A dungeon's quests say under their name whether they start inside, end inside or (in a chain) are done inside, and the roster's ticks are plain checkmarks.

### Fixes

- **App:** Signed out, the app opens the sign-in card again (with its title bar), not the website's landing page.

## 0.3.20

### New

- **Guildie:** A new home page for visitors who aren't signed in: a full-width tour of what Guildie does (the roster, gear upgrades, crafting and requests, dungeons, the addon's tooltips, the Windows app), with sign-in with Battle.net in one click. Guild search is gone for now.
- **Guildie:** The guild roster has a Gear tab: what each member can wear and wield at their level, the armor, weapons and stats they prefer, and whether the player set those or they follow their talents.

### Improvements

- **Guildie, App:** Signing in is one card that shows each step (signing in, reading your characters, finding and syncing your guild) and takes you to your guild, or explains what to do if it can't find one.
- **Guildie:** The sync button moved to the bottom of the sidebar, so every page shows when your guild last synced; tooltips have a cleaner look; Feed's filters are tabs like Crafting's; new Inventory and Gear icons.
- **Guildie, App:** A new look across the whole site, matching the new home page: cards lit from above, a faint map of Azeroth at the top of each page, warm amber for the tab, page and field you're on, and a frosted bar over the page as you scroll.

### Fixes

- **Guildie:** Deadmines lists The Unsent Letter and Scarlet Monastery lists Vorrel's Revenge, dungeon quests Blizzard doesn't mark as such; Shaper's Terrace's Digestible Research is shown as starting in the dungeon.
- **Guildie:** Dungeon quests that start inside the dungeon (from a drop, like the Crest of Lordaeron, or someone you meet in there) say "Starts in dungeon" instead of "Not picked up", and no longer count against being quest ready.
- **Guildie:** Dungeon quest chains show every step's name, instead of "Quest 97289" for steps Blizzard doesn't list as dungeon quests.

## 0.3.19

### Improvements

- **Guildie, Addon:** Gear suggestions for guildmates who can use an item a few levels from now say "Maybe, at lvl 24" on the site and "maybe (lvl 24)" in tooltips, instead of "at 24".
- **Guildie:** Simpler Dungeons pages. The Dungeons page is a grid of cards with each dungeon's level range and how many guildmates are level and quest ready, a search, and "View as" any guildmate to see which dungeons they've completed. A dungeon's page lists the whole roster with a column each for level, quests picked up and quests turned in (the level check is now the dungeon's own level), and its quests: only your guild's side, class quests marked, chains listed whole, colored by level and ticked for whoever you're viewing as, with links to Wowhead's guide and maps.

## 0.3.18

### Improvements

- **Guildie:** Your characters have a Preferences tab for their stats to look for and gear types, with room to see every option: each talent tree's top stats side by side, and your own stats with their weights in one list. The Gear tab still shows them.
- **Guildie:** Custom stat priorities can list up to 10 stats (pages still show the top three; an item is a trade-off only if it gives up one of your top five).
- **Guildie, Addon:** Prefer several armor and weapon types, in your order ("Two-Handed Axes, then Two-Handed Maces"), or allow only those. Each type further down counts a little less.

## 0.3.17

### New

- **Guildie:** Experimental: ask Claude, ChatGPT or another AI app about your guild. Add Guildie as a connector (Settings → Account → AI apps) and it can read your guilds' rosters, characters, crafters, requests and activity, and your own bags and banks. If you allow it, it can also set your characters' stat priority and gear preferences, and nothing else. Disconnect it any time.

## 0.3.16

### Improvements

- **Guildie, Addon:** Gear suggestions now tell a clear upgrade (more of your stats, nothing lost) from a trade-off (gives up some of one stat for more of another), on Crafting → Upgrades for me, the item panel and in-game tooltips.
- **Guildie:** Your stat priority can list up to five stats and say how much more the first counts: Even, Balanced, Steep or your own. Pages still show the top three. Change it on your character page, or reorder and set it right on Upgrades for me.

## 0.3.15

### New

- **Guildie:** Upgrades I can craft, on a guild's Crafting page: your recipes that would be an upgrade for someone in the guild (your other characters included), with why and any open requests for them.
- **Addon:** "Say why tooltips have nothing" in the `/guildie` window (on by default): items Guildie has nothing for say why, like "Soulbound, can't be traded" or "No guildmates need this".

### Improvements

- **Guildie, Addon:** Gear suggestions follow each character's stat priority. Pick another talent tree or your own three stats on your character page, and Upgrades for me, Upgrades I can craft, the item panel and guildmates' tooltips in game (after their Guildie app refreshes) use it.
- **Guildie, Addon:** Gear types: on your character page, pick the armor and weapon type you prefer, and whether to see only that type. Gear suggestions on the site and in game count other types less, or leave them out.
- **Addon:** Guildie's part of item tooltips is set apart from the item's own lines: it comes last, after a gap and a "Guildie" header with the addon's icon, with one short row per guildmate (their name, then what they're requesting, might want it for, or would get as an upgrade), instead of long wrapping lines that each started with "Guildie".
- **Addon:** "Might want" suggestions on reagent tooltips skip what nobody needs a guildmate for: reagents vendors sell (thread, vials, flux, dyes, Simple Wood), and the simple mats herbalists, skinners and miners only use for camping items (Incense Candle, Camp Chair, Lodestone); green camping mats like Silver Bar still show, as "Camping+Mining". Up to 8 guildmates are listed instead of 3.

### Fixes

- **Addon:** The Guildie logo sits centered in the `/guildie` window's portrait ring and in the minimap button.

## 0.3.14

### New

- **Guildie:** Upgrades for me, on a guild's Crafting page: everything guildmates can craft that would be an upgrade for your characters, with why ("+4 Agility, +4 Stamina over Archery Training Gloves"), who can make it and a Request button.

### Improvements

- **Guildie, Addon:** Items nobody can trade (Binds when picked up, Soulbound, Quest Item) are no longer suggested as upgrades for guildmates or as "might want this" reagents, and can't be requested. A crafted Binds when picked up item still shows under Upgrades for me when your own character knows the recipe.

## 0.3.13

### New

- **Guildie:** A new Dungeons page: a card per dungeon with its art and how many guildmates are ready (level and every dungeon quest for their class picked up or done), partly ready (level only) and completed. Each dungeon has its own page with everyone's status and what they're missing, its quests (class-only ones marked) and its bosses.
- **Guildie:** A guild Feed: who leveled up, who cleared a dungeon for the first time, who turned in dungeon quests, and who requested, claimed and fulfilled requests. Filter by kind, and show level-ups only every 5 levels.
- **Guildie:** Stat priority: the three stats each character should look for on gear, from their main talent tree. See it on the roster's new Stat priority view and on a character's Gear tab, with a link to Wowhead's class guides. Doing something unusual? Change it for a character you've claimed: pick another tree's, or your own three.

### Improvements

- **Guildie:** A clearer dungeon page: big Ready, Partly ready and Completed tiles that switch who's listed, guildmates with avatars and a square per quest (done, in their log, not picked up), and a quest table with the guild's progress. Quest rewards are gone: Blizzard's data leaves out many of them.
- **Guildie:** The roster is split into views (Overview, Stat priority, Professions) so it fits on the screen.
- **Guildie:** A tighter character page: the gear, with their stats to look for, talents and what they can use in panels beside it.

## 0.3.12

### Improvements

- **Addon:** A clearer in-game window with separate sync, guild tooltip, request and preference sections, shorter labels, and scrolling on smaller screens. Sync now explains the UI reload and is unavailable during combat.
- **Addon:** The window's scroll bar only shows when there's something to scroll.
- **Addon:** Item tooltips no longer suggest guildmates for Cooking, Fishing or First Aid reagents, since nearly everyone has those.
- **App:** Installing or reinstalling the addon checks that World of Warcraft: Forever was found first, and says what to do if it wasn't.
- **Guildie, App:** In the Windows app, one addon notice at the bottom of the sidebar when needed: the addon isn't installed (dismiss it if you don't want it), an addon update didn't install (Update addon), or WoW is still running the old addon after an update (type /reload). Nothing shows while an app update is ready, since it brings the addon with it.
- **Addon:** Saves its own version, so the app can tell when WoW needs a /reload to load an update.
- **Guildie:** The roster and crafting lists keep every column on narrow windows and phones and scroll sideways instead of hiding them.
- **Guildie:** How gear-upgrade suggestions are worked out, with every spec's stat weights, is written up in docs/gear-upgrades.md.

## 0.3.11

### New

- **Guildie:** A Personal section in the sidebar. Inventory: all your characters' bags and banks on one page, with a search ("where's my Silk Cloth?" Lich bags 37 · Isai bank 20), a character filter and when each was last read; it replaces the Inventory tab on character pages. Quests: your characters' quests in progress, by character or by zone, each with a Wowhead link and who in your guild is on it too.
- **Guildie:** Dungeons, under each of your guilds: the dungeon and raid quests members have in progress, by dungeon, so you can see who to group with. Only the guild's members see it.
- **Addon:** Saves your quest log (each quest's progress, and whether it's complete), so Guildie shows your quests after a /reload instead of after you log out. Addon 0.10.0.

## 0.3.10

### Fixes

- **Guildie:** Items in the Inventory tab missing their name and icon. Guildie now also fills in any it's missing once a day.
- **Addon:** The addon saves each bag and bank item's name, so items Blizzard's website data doesn't list still show by name. Addon 0.9.0.

### New

- **Guildie:** An Inventory tab on your own characters: what's in their bags and bank, as the addon last read them (bags at your last /reload or logout, the bank as of the last time you opened it). Only you can see it.

### Improvements

- **Guildie, App:** Release notes label changes to the site "Guildie" (in a browser or the app's window) instead of "Web".
- **Guildie:** Works better on phones: add Guildie to your home screen as an app, nothing runs off the side of the screen, the roster fits, talents show their tooltip when tapped, buttons are easier to tap, and typing in a search box no longer zooms in on iPhones.
- **Guildie:** The roster's column names stay in view as you scroll.
- **Guildie:** Search for what you need right on the Requests page ("What do you need?"), then request the item, or a craft when someone in the guild can make it.

## 0.3.9

### New

- **Guildie:** Guild requests: ask your guild for reagents or a craft (open an item, or Request on Crafting), and claim what you can provide or make. The requester marks it done; requests over a week old ask "Still need this?", and close after 30 days.
- **Addon:** Tooltips say who in your guild is requesting an item, and the Guildie window shows your open requests. Addon 0.8.0; restart WoW once to load it.
- **Addon, App:** For craft requests, Guildie checks your bags and bank as of your last /reload or logout, so guildmates see "Has the mats". Nobody else sees what's in your bags.

### Improvements

- **Guildie, App:** Release notes say where each change shows: Guildie, App or Addon.
- **App:** The app checks for updates every hour instead of every 6 hours.
- **Guildie:** A little more room under each guild's name in the sidebar.

## 0.3.8

### New

- **Guildie:** Links to Guildie show a proper preview when shared (Discord, messages, social sites), with the guild's or character's name where there is one.
- **Guildie:** A Gear page for each guild: which class can wear and wield what (and from which level), and "Who can use…": pick an armor or weapon type to see the guildmates who can use it now and who will.
- **Guildie:** Character pages show what they can use under their gear ("Mail at 40" until then).
- **Addon:** The addon sends your weapon and armor skills, so Guildie can check its rules against the game.

### Improvements

- **Guildie:** Settings → Addon and → App say Guildie is open source, with links to the code and to report a bug.
- **Guildie, Addon:** Who can use what now comes from WoW: Forever's own game data, checked daily. Gear suggestions now count Rogues for axes, and polearms only from level 20.

## 0.3.7

### Improvements

- **App:** A subtle border of Guildie's own around the window on Windows 11, instead of none.
- **Guildie:** The roster no longer shows guild rank (character pages still do).
- **Guildie:** Sidebar icons line up with their labels in the app.

## 0.3.6

### New

- **Addon:** A redesigned in-game window with the Guildie logo and an "On Guildie" check: it lists what Guildie doesn't have yet for your character (level, talents, gear, professions, recipes). Addon 0.6.0; restart WoW once to load it.

### Improvements

- **App:** After an upload, the app fetches Guildie's data right away, so your next /reload shows you caught up.
- **Guildie:** Spacing on the guild pages and icon alignment in the sidebar.

### Fixes

- **App:** The window's accent-colored outline stayed while the window was focused on Windows 11.

## 0.3.5

### New

- **Addon, Guildie:** Gear suggestions: hover an item in game and Guildie says which guildmates it would help ("upgrade for…", "maybe…"), a best guess from their spec and what they wear. The item panel on the site shows the same, with the reason. Addon 0.5.0; restart WoW once to load it.
- **App, Guildie:** Check for updates, in the tray and in Settings → App, which also shows when an update is downloading.

### Improvements

- **App:** No more accent-colored outline around the window on Windows 11.

## 0.3.4

### New

- **Guildie:** What's new: after an update, the app tells you and shows what changed (Settings → App).
- **Guildie:** Settings has tabs: Account, Guilds, Addon and App.
- **Guildie:** The sync button on a guild shows when it last synced with Blizzard and when it syncs next.

### Improvements

- **Guildie:** The roster sorts by level, and search also finds race and class ("night elf druid").
- **Guildie:** Characters Blizzard hasn't published yet (under level 10, or not logged out since) get a placeholder and an explanation instead of an empty page.
- **Guildie:** Members only moved to Settings → Guilds, for the guild's owner.
- **Guildie:** The sidebar groups your guilds under one Guilds heading, so several guilds read clearly.

### Fixes

- **Guildie:** The sidebar shows your level from the game when it's newer than Blizzard's.

## 0.3.3

### New

- **Addon, Guildie:** Everything the game knows about your character now reaches Guildie when you /reload or log out: level, gear (with the exact tooltips, enchants included), profession skills, and the recipes in each profession window you open. Addon 0.4.0; restart WoW once to load it.

## 0.3.2

### Improvements

- **Guildie:** A clearer sidebar: your guilds and characters, with portraits and levels, and Settings.
- **Guildie, App:** Slightly warmer colors throughout.

## 0.3.1

### New

- **Guildie, App:** An Addon page: see whether the addon is installed and which version, install, update or uninstall it, and choose your WoW folder.
- **Guildie:** The roster's "Last synced" shows whether a character's data came from the game or from Blizzard.

## 0.3.0

### New

- **App:** Guildie installs the addon for you and keeps it up to date.
- **App:** The app updates itself in the background.
- **App:** A proper installer; no admin rights needed.
