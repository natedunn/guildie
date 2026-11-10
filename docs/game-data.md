# Game data: who can wear and wield what

Which armor and weapon types each class can use, and from which level, comes
from WoW: Forever's own game data, not from a hand-written list. Blizzard's
web API has none of it (`playable-class` has no proficiencies, item
subclasses are just names, profiles have no skills), so Guildie reads the
game's DB2 tables, which [wago.tools](https://wago.tools) publishes for every
build (Forever is product `wowf`).

Used by: gear-upgrade suggestions (site and addon tooltips, through
`GuildieData.lua`), a character's "Can use" (Gear tab) and the guild's Gear
page.

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

Requests to wago.tools are few (one build list and three tables a day) and
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
