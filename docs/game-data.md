# Game data: what the game's own files say

Which armor and weapon types each class can use, and from which level, and
where each recipe stops giving skill-ups, come from WoW: Forever's own game
data, not from a hand-written list. Blizzard's web API has none of it
(`playable-class` has no proficiencies, item subclasses are just names,
profiles have no skills, recipes have no levels), so Guildie reads the
game's DB2 tables, which [wago.tools](https://wago.tools) publishes for every
build (Forever is product `wowf`).

Used by: gear-upgrade suggestions (site and addon tooltips, through
`GuildieData.lua`), a character's "Can use" (Gear tab) and the guild's Gear
page. Recipe levels: see "Recipe skill levels" below.

## Pieces

| File                                                | What                                                                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `apps/web/scripts/gen-proficiencies.mjs`            | Reads `SkillLine`, `SkillRaceClassInfo` and `ChrClasses` for a build and writes the generated file                     |
| `apps/web/convex/shared/proficiencies.generated.ts` | Generated: every weapon and armor skill line, per class the level it unlocks and the rows granting it; suspects marked |
| `apps/web/convex/shared/proficiencies.ts`           | The rules the app uses: the data plus `OVERRIDES` (each with a reason and how it's confirmed); `CLASS_RULES`; helpers  |
| `apps/web/convex/proficiencies.ts`                  | `proficiencies:audit`: players' in-game skills against the rules                                                       |
| `.github/workflows/game-data.yml`                   | Daily check for a new build; opens a pull request when the data changed                                                |

How the tables are read: a class can learn a skill if any of the skill's
`SkillRaceClassInfo` rows has the class's bit in `ClassMask` (bit = class id
− 1). Races are ignored (rows that differ only by race exist for starting
skills, and Forever's new races changed those masks). `MinLevel` is the level
it can be trained (0: from the start); with several rows, the lowest. Item
types: skill line → item subclass in the script (`ARMOR`, `WEAPONS`).
Relics (librams, idols, totems) have no skill line; they're overrides.

## Overrides

Data that's wrong for Forever. Classic Era's tables carry Season of
Discovery rows, and Forever's were built from them, so some rows give a class
something it can't have:

- **Shaman Dual Wield** (row 2455, level 1): Season of Discovery's rune. No
  Forever talent or trainer is known to grant it. Not counted.
- **Druid Polearms** (row 2483, level 20): also in Classic Era's data, where
  druids can't train polearms. Not counted.

The generator marks these rows `suspect`; a test fails if a suspect grant has
no override, and if an override no longer changes anything (the data caught
up: remove it). Once the audit shows a player who has one of them in game,
remove its override.

## The daily check

`.github/workflows/game-data.yml` runs every day at 06:17 UTC (and by hand:
Actions → Game data → Run workflow, optionally with a build):

1. Runs the generator for the newest `wowf` build. A new build whose data is
   the same leaves the file alone (its stamp stays the build that last changed
   it), and the workflow stops there.
2. If the data changed: commits to the branch `bot/game-data` and opens (or
   updates) a pull request labeled `game-data` whose description lists what
   changed per class, e.g. `+ Axes from level 1` for Rogue.
3. A maintainer reviews it: does the change look like the real game? Add an
   override if not, a CHANGELOG line if players will notice, and merge.

Pull requests and pushes made with the workflow's `GITHUB_TOKEN` don't start
other workflows, so the workflow starts CI itself on `bot/game-data`
(`workflow_dispatch`, which is allowed). On those runs the "CHANGELOG entry"
check is skipped; a maintainer's own push (or closing and reopening the pull
request) runs the full CI. Opening a pull request also needs the repository
setting "Allow GitHub Actions to create and approve pull requests" (Settings →
Actions → General). Without it the workflow opens (or updates) an issue
labeled `game-data` with the summary and a link to open the pull request by
hand, which then runs CI as usual.

Requests to wago.tools are few (two build lists and six tables a day) and
name Guildie and this repository in the User-Agent.

By hand:

```sh
node apps/web/scripts/gen-proficiencies.mjs                       # newest build
node apps/web/scripts/gen-proficiencies.mjs --build 1.60.1.70888  # a given build
node apps/web/scripts/gen-proficiencies.mjs --summary out.md      # also: what changed, as markdown
node apps/web/scripts/gen-proficiencies.mjs --check               # exit 1 if it would change
pnpm --filter @guildie/web test                                   # overrides still apply
```

## Confirming in game

The addon (0.7.0+) uploads each character's weapon and armor skills as the
game's skill list shows them (English names), the level they were read at,
and whether it can dual wield. Weapon skills are trained, so lacking one the
rules allow is normal; only having one the rules say the class can't have
(yet) is a contradiction. To see them on production (maintainers):

```sh
cd apps/web
npx convex run proficiencies:audit --deployment scintillating-gnat-539
```

It returns `findings` (character, class, level, the skill, what the rules
say, and the override it contradicts if any) and, per override that removes
something, `contradictedBy` (characters that have it: remove the override)
and `consistentWith` (characters of that class at or above the data's level
without it: weak support, since skills are trained).

## Recipe skill levels

Where each recipe turns yellow, green and grey in the profession window
(when it stops giving skill-ups), also from Forever's own tables, since
Blizzard's web API doesn't have it. For ranking who could use a reagent
best (the addon's item tooltips).

| File                                               | What                                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `apps/web/scripts/gen-recipe-skills.mjs`           | Reads `SkillLine`, `SkillLineAbility` and `SpellName` for a build and writes the generated file |
| `apps/web/convex/shared/recipeSkills.generated.ts` | Generated: per profession, each recipe's id, name, and yellow and grey levels                   |
| `apps/web/convex/shared/recipeSkills.ts`           | `recipeSkill(recipeId)` (levels, with green) and `recipeColor(levels, skill)`                   |
| `apps/web/scripts/lib/wago.mjs`                    | What the generators share: build lookup, tables as CSV, Biome formatting                        |

How the tables are read:

- `SkillLineAbility.ID` is Blizzard's recipe id (`recipes.recipeId`), so the
  two join exactly. `TrivialSkillLineRankLow` is yellow,
  `TrivialSkillLineRankHigh` grey, and green starts halfway between
  (rounded down), the game's own rule.
- The professions are the skill lines with a tier under them (Tailoring 197
  over Tailoring 2948); their names match Blizzard's.
- Left out: rows with no grey level (Find Herbs and other abilities) and
  rows whose spell isn't in the build's `SpellName` (leftovers: Forever
  dropped Classic's Minor Healing Potion recipe but kept its row).
- Not read: where orange starts, the skill needed to learn a recipe.
  Trainers keep it on the server, so nearly every row says 1, and the few
  that don't are Classic's numbers Forever didn't update. See "Learn levels".

Forever changed many levels from Classic Era (Bolt of Silk Cloth is
110/120 here, 135/145 in Era), so the numbers must come from `wowf` builds,
never Era's.

The daily check covers this file too: a pull request lists the recipes whose
levels changed per profession (`~ Bolt of Silk Cloth: 110/120 → 115/125`).
To confirm one, open the profession window on a character near that level
and compare the recipe's color.

```sh
node apps/web/scripts/gen-recipe-skills.mjs                       # newest build
node apps/web/scripts/gen-recipe-skills.mjs --build 1.60.1.70959  # a given build
node apps/web/scripts/gen-recipe-skills.mjs --summary out.md      # also: what changed, as markdown
node apps/web/scripts/gen-recipe-skills.mjs --check               # exit 1 if it would change
```

## Waylaid Crates and Supplies

What each Waylaid Crate and Waylaid Supplies item takes to fill, for the
addon's item tooltips (who in the guild makes or gathers it). Neither
Blizzard's web API nor the item's name says it, so it comes from Forever's
own tables.

| File                                          | What                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| `apps/web/scripts/gen-waylaid.mjs`            | Reads the items, their "Use:" spells and what those take; writes the file |
| `apps/web/convex/shared/waylaid.generated.ts` | Generated: each crate or Supplies item, its level and what it takes       |

- **Supplies** take one item: the spell's `SpellReagents` row ("Add 12
  Bronze Bars to complete the shipment" is reagent 2841, count 12). Five of
  them (Dusky Belts, Gnomish Rocket Boots, Goblin Mortars, Lesser
  Stoneshield Potions, Shadowskin Gloves) take 20 Copper Bars whatever their
  names say, in the game and in its tooltip, so the file keeps that.
- **Crates** take any one bundle of several. The spell's description lists
  them by name (`- $M3 Stranglekelp`, where `$M3` is effect 2's base
  points, the count). Names become item ids through `ItemSparse`; a name
  shared by several items needs an entry in `SAME_NAME` in the script
  (Dark Iron Ore), else it fails.

The daily check covers this file too (`~ Waylaid Crate: …: 10 Silver Bar or
20 Iron Bar → …`). To confirm a change, read the crate's tooltip in game.

```sh
node apps/web/scripts/gen-waylaid.mjs                       # newest build
node apps/web/scripts/gen-waylaid.mjs --build 1.60.1.71037  # a given build
node apps/web/scripts/gen-waylaid.mjs --summary out.md      # also: what changed, as markdown
node apps/web/scripts/gen-waylaid.mjs --check               # exit 1 if it would change
```

## Learn levels

The skill a trainer asks for to learn a recipe (where orange starts) isn't
in the game's files, and no other source has Forever's. So the addon (0.24.0)
reads it from trainer windows: on `TRAINER_SHOW`/`TRAINER_UPDATE` it lists
each recipe's name, the item it makes and `GetTrainerServiceSkillReq`, keeps
one list per profession (later trainers add to it; a new game build starts
over) and sends them with every upload as `trainers` (docs/addon.md, "API").
It's the same for every player, so one visit covers everyone.

- `convex/learnLevels.ts` matches each read to Blizzard's recipe ids by name
  within the profession (and the crafted item when two recipes share a
  name, or when the name matches none: smelting's trainer lists "Tin Bar"
  for "Smelt Tin"); anything ambiguous is skipped. One row per recipe in
  `recipeLearnLevels`, the newest read winning, with the recipe's yellow and
  grey levels at the time. If a game update changes those, the row stops
  counting until someone reads a trainer again. A requirement above the
  recipe's grey level is refused.
- A player's read is matched again only when it's newer than their last one
  for that profession (`trainerReads`).
- Used by `convex/reagentProgress.ts`: a recipe someone hasn't learned counts
  only if a trainer was seen teaching it, and only from that skill (a
  pattern's recipe needs the pattern). Recipes they know need no learn level.
- Patterns, plans and formulas carry theirs in their tooltips
  (`recipeItems.skill`); those only move a reagent's "from".
- Coverage (maintainers): the site's Admin page (sidebar, Personal; Learn
  levels tab), or `npx convex run learnLevels:coverage --deployment <name>`:
  per profession, recipes with colors, how many have a current learn level,
  how many a stale one, and the newest read. The page also counts trainer
  visits and the players they came from.

Checked in game (docs/addon.md, "Verified in game"): with the window's
"Unavailable" filter on, a trainer lists recipes above your skill, also for
a profession you don't have; each read records whether the filter was on.
A trainer lists only up to the rank it teaches, so city trainers fill in
the most.

## Dungeons

The Dungeons page (`/g/<region>/<guild>/dungeons`) reads three sources:

- **The dungeon list** (`apps/web/convex/shared/dungeons.generated.ts`):
  `node apps/web/scripts/gen-dungeons.mjs` reads Forever's LFGDungeons,
  ContentTuning (the level each dungeon is tuned for), Map, DungeonEncounter
  (bosses, in order) and LoadingScreens from wago.tools. LFGDungeons has no
  map ids in Forever, so the script lists which map each finder entry is.
  Raids are left out. Run it again when Forever adds a dungeon, and add the
  dungeon's Blizzard quest areas to `AREAS` in `shared/dungeons.ts`.
- **The art**: each dungeon's loading screen, converted to JPEG and uploaded
  to the `guildie-assets` R2 bucket (served at `assets.guildie.club/dungeons/<key>.jpg`)
  by `apps/web/scripts/dungeon-art.py` (needs Pillow and Wrangler; see the
  script). The images are Blizzard's art, so they stay out of the repository.
- **Quests** (`convex/dungeons.ts`, weekly cron and on demand:
  `npx convex run dungeons:syncQuests`): every quest Blizzard lists in the
  dungeon's quest areas and types "Dungeon", with its class limits
  (`requirements.classes`), reward items, and side (from the reputations it
  rewards). Members' turned-in quests come from Blizzard's
  `/quests/completed` with each profile sync (`completedQuests` table).

Blizzard has no quest chains (prerequisites), boss loot or dungeon maps for
Forever, and the game files don't either: "ready" counts a quest in the log
as its chain done, and the page links to Wowhead for loot and maps.

## After a hotfix

Hotfixes change items (stats, binding) and quests (a quest stops being a
Dungeon quest). What catches up by itself:

- **Items** (`convex/items.ts`): the site saves each item's tooltip from
  Blizzard and scores upgrades from it. A daily cron looks up again the 500
  items saved longest ago, once they're over 30 days old, so a changed item
  is right within a month or so. Items Blizzard 404s on keep what we have.
  To fix particular items now (ids from the hotfix notes, on Wowhead):
  `npx convex run items:syncBatch '{"itemIds":[1234,5678]}'` (add `--prod`).
- **Dungeon quests**: the weekly sync replaces each dungeon's list from
  Blizzard's quest types; `npx convex run dungeons:syncQuests` does it now.
- **The addon** reads items from the game itself, so it needs nothing.

Stat weights don't follow from hotfix notes; change them only on purpose
([gear-upgrades.md](gear-upgrades.md)).
