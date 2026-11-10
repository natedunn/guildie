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
