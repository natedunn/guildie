# Changelog

What changed in each release of the Guildie app for Windows, at a glance. Most
of Guildie is the website, which the app shows, so a release also lists what
changed on the site since the last one. The release workflow uses the section
for its version as the GitHub release notes, and the app shows them under
Settings → App.

Each pull request adds a line under `## Unreleased` (in `### New`,
`### Improvements` or `### Fixes`), written for players. A release turns it
into that version's section.

## Unreleased

### New

- Links to Guildie show a proper preview when shared (Discord, messages, social sites), with the guild's or character's name where there is one.

### Improvements

- Settings → Addon and → App say Guildie is open source, with links to the code and to report a bug.

## 0.3.7

### Improvements

- A subtle border of Guildie's own around the window on Windows 11, instead of none.
- The roster no longer shows guild rank (character pages still do).
- Sidebar icons line up with their labels in the app.

## 0.3.6

### New

- A redesigned in-game window with the Guildie logo and an "On Guildie" check: it lists what Guildie doesn't have yet for your character (level, talents, gear, professions, recipes). Addon 0.6.0; restart WoW once to load it.

### Improvements

- After an upload, the app fetches Guildie's data right away, so your next /reload shows you caught up.
- Spacing on the guild pages and icon alignment in the sidebar.

### Fixes

- The window's accent-colored outline stayed while the window was focused on Windows 11.

## 0.3.5

### New

- Gear suggestions: hover an item in game and Guildie says which guildmates it would help ("upgrade for…", "maybe…"), a best guess from their spec and what they wear. The item panel on the site shows the same, with the reason. Addon 0.5.0; restart WoW once to load it.
- Check for updates, in the tray and in Settings → App, which also shows when an update is downloading.

### Improvements

- No more accent-colored outline around the window on Windows 11.

## 0.3.4

### New

- What's new: after an update, the app tells you and shows what changed (Settings → App).
- Settings has tabs: Account, Guilds, Addon and App.
- The sync button on a guild shows when it last synced with Blizzard and when it syncs next.

### Improvements

- The roster sorts by level, and search also finds race and class ("night elf druid").
- Characters Blizzard hasn't published yet (under level 10, or not logged out since) get a placeholder and an explanation instead of an empty page.
- Members only moved to Settings → Guilds, for the guild's owner.
- The sidebar groups your guilds under one Guilds heading, so several guilds read clearly.

### Fixes

- The sidebar shows your level from the game when it's newer than Blizzard's.

## 0.3.3

### New

- Everything the game knows about your character now reaches Guildie when you /reload or log out: level, gear (with the exact tooltips, enchants included), profession skills, and the recipes in each profession window you open. Addon 0.4.0; restart WoW once to load it.

## 0.3.2

### Improvements

- A clearer sidebar: your guilds and characters, with portraits and levels, and Settings.
- Slightly warmer colors throughout.

## 0.3.1

### New

- An Addon page: see whether the addon is installed and which version, install, update or uninstall it, and choose your WoW folder.
- The roster's "Last synced" shows whether a character's data came from the game or from Blizzard.

## 0.3.0

### New

- Guildie installs the addon for you and keeps it up to date.
- The app updates itself in the background.
- A proper installer; no admin rights needed.
