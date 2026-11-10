---

name: gear-and-weights
description: How Guildie's gear-upgrade suggestions work ("upgrade for Brisket (Feral), maybe Miller (at 24)") on the site's item panel and in the addon's tooltips, and how to change stat weights, thresholds or the rules without the TypeScript and Lua versions drifting. Use when touching apps/web/convex/shared/weights.ts, shared/upgrades.ts, shared/itemInfo.ts, upgradeProfiles.ts, apps/addon/Guildie/Upgrades.lua, or upgrade_vectors.json, or when a suggestion looks wrong.
---

# Gear suggestions and stat weights

A best guess from stat weights, not a sim. Two implementations of the same
rules: TypeScript on the site, Lua in the addon. Overview: docs/addon.md,
"Guild data in game".

## Pieces

| File                                         | What                                                                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/convex/shared/weights.ts`          | Plain data: `SPECS` (3 trees per class, stat weights, main stat = 1), `DEFAULT_TREE`, `STAT_POINTS`, `THRESHOLDS`                                             |
| `apps/web/convex/shared/proficiencies.ts`    | `CLASS_RULES` (armor/weapon types by level, dual wield): WoW: Forever's game data (`proficiencies.generated.ts`) plus reviewed `OVERRIDES`; docs/game-data.md |
| `apps/web/convex/shared/upgrades.ts`         | The rules: `specsOf`, `scoreItem`, `suits`, `usableAt`, `baseline`, `judge`, `suggest`, `explain`, `upgradeMember`, `upgradeRules()`                          |
| `apps/web/convex/shared/itemInfo.ts`         | Reads an item from its (English) tooltip lines: slot, armor/weapon type, stats, class restriction, Unique                                                     |
| `apps/web/convex/upgradeProfiles.ts`         | A guildmate as the rules see them: spec(s) and the score of what they wear per slot                                                                           |
| `apps/web/convex/crafting.ts` (`itemDetail`) | The site's item panel ("Upgrade for", with the reason)                                                                                                        |
| `apps/web/convex/helper.ts` (guild data)     | Puts `upgradeRules()` and each active member into `GuildieData.lua`                                                                                           |
| `apps/addon/Guildie/Upgrades.lua`            | Lua port of `upgrades.ts`; reads the hovered item with the game's APIs                                                                                        |
| `apps/addon/tests/upgrade_vectors.json`      | Shared cases, run by both test suites                                                                                                                         |
| `apps/web/scripts/gen-upgrade-vectors.ts`    | Writes the vectors from the TypeScript                                                                                                                        |

## The decision, in short

For each guildmate seen in the last `activeDays`: skip if they can't use it
(class, armor/weapon type at their level, more than `levelsAhead` levels
away, Unique already worn). Spec = tree with most points (under
`minSpecPoints`: `DEFAULT_TREE`); a second tree with 10+ is the second spec.
Score = Σ weight × stat + armor and DPS terms; items whose stats are mostly
useless to the spec (`minFit`) don't suit it. Compare with what they wear in
that slot (weaker ring/trinket, main+off hand for a two-hander). **Upgrade:**
gain ≥ `upgrade` (15%), usable now, main spec. **Maybe:** gain ≥ `maybe`
(3%), second spec, or usable within `levelsAhead`.

## Tuning weights (the common change)

Weights and thresholds are **data**: they reach the addon through
`GuildieData.lua` on the next download, so no addon release is needed.

1. Edit `SPECS` / `THRESHOLDS` in `weights.ts`. Keep each
   tree's main stat at 1; note your source in the comment (WowSims presets,
   theorycrafting links).
2. `pnpm --filter @guildie/web test`. "real weights: plausible picks" in
   `convex/upgrades.test.ts` checks sensible outcomes with the real weights;
   add a case for the situation you're fixing.
3. The shared vectors use their own fixed test rules, not the real weights,
   so weight-only changes don't touch `upgrade_vectors.json`.
4. Check it on the site: the item panel (`?item=<id>` on a guild page) shows
   who it's for and why.

## Who can wear and wield what

Not hand-written: `CLASS_RULES` comes from the game's own tables
(docs/game-data.md). Never edit `proficiencies.generated.ts`; regenerate it
(`node apps/web/scripts/gen-proficiencies.mjs`), and a daily workflow opens a
`game-data` pull request when a Forever build changes it. Where the data is
wrong for Forever (Season of Discovery leftovers: Shaman Dual Wield, Druid
Polearms), add or remove an entry in `OVERRIDES` (shared/proficiencies.ts)
with a reason and how it's confirmed; `proficiencies:audit` compares the
skills players' addons upload with the rules. The shape (`armor`, `weapons`,
`dualWield`) reaches the addon in `upgrades.rules.classes`, so rule changes
need no addon release, and the shared vectors use their own test rules.

## Changing the rules (logic)

The two implementations must match exactly:

1. Change `shared/upgrades.ts` **and** `Upgrades.lua` the same way (the Lua
   mirrors the TS function by function).
2. Add inputs for the new case in `apps/web/scripts/gen-upgrade-vectors.ts`,
   then regenerate: `node apps/web/scripts/gen-upgrade-vectors.ts`. Review the
   diff of `upgrade_vectors.json`.
3. Run both: `pnpm --filter @guildie/web test` and
   `luajit apps/addon/tests/upgrades_test.lua`.
4. A new field in the rules or member shape also goes through `helper.ts`'s
   guild data and must be optional in Lua (older `GuildieData.lua` files and
   older addons coexist).
5. Lua changes ship with the next app release (bump of `## Version` by the
   maintainer); the site's version changes on merge. Say in the PR that the
   addon needs a release.

## Gotchas

- Stat keys are Blizzard's stat types (`AGILITY`, `SPELL_POWER`, ...) plus
  `ARMOR`, `DPS`, `OFFHAND_DPS`, `RANGED_DPS`. In game they come from
  `GetItemStats` (`ITEM_MOD_<KEY>_SHORT`) or the English tooltip.
- Non-English tooltips aren't parsed; the site falls back to the items table
  or an estimate from item level (`estimateScore`).
- Numbers are compared with a 1e-9 tolerance in the shared tests; Lua and JS
  floats must follow the same order of operations.
- Shared code stays free of Convex imports (`node --test` runs it).
