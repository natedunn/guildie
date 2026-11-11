# Gear upgrade suggestions

How Guildie decides that an item is an upgrade for a guildmate: the
"**Guildie**: upgrade for Brisket (Feral), maybe Miller (at 24)" line in the
addon's item tooltips, and the "Upgrade for" list in the site's item panel.

It's a best guess from stat weights and what each person wears, not a
simulation. If a suggestion looks wrong, or you know a spec's priorities
better, open an issue or a pull request; see
[Changing the weights](#changing-the-weights).

The code: `apps/web/convex/shared/weights.ts` (the weights and thresholds)
and `apps/web/convex/shared/upgrades.ts` (the decision). The addon runs the
same rules in Lua (`apps/addon/Guildie/Upgrades.lua`); shared test cases
(`apps/addon/tests/upgrade_vectors.json`) keep the two identical.

## The short version

1. **Can they use it?** Class restrictions, armor and weapon types for their
   class at their level, and the item's required level.
2. **Which spec?** The talent tree they've put the most points in.
3. **What's it worth to them?** Each stat on the item times how much that
   stat is worth to their spec (the weights below), plus armor and weapon
   DPS.
4. **Compared with what?** The same score for what they wear in that slot.
5. **Verdict:** 15% better or more is an **Upgrade**; 3% to 15% is a
   **Maybe**. Bigger gains are listed first.

## Step by step

### 1. Who's considered

- Guildmates seen in the last **14 days** (last logout, or the addon's last
  read). Your own characters are left out.
- Only characters whose gear Guildie has read (from Blizzard or the addon).

### 2. Can they use it

The rules for who can wear and wield what come from the game's own data
([game-data.md](game-data.md)), not by hand: Mail and Plate at 40, which
weapon types each class learns and when, dual wielding.

An item is out if:

- it lists classes and theirs isn't one ("Classes: Rogue"),
- their class can never use its armor or weapon type,
- it's Unique and they already wear one, or
- it needs a level more than **3** above theirs.

If they can use it within 3 levels, it can only be a **Maybe**, shown as
"Maybe, at 24".

### 3. Their spec

The talent tree with the most points is the main spec (a tie goes to the
default below). Under **10 points** in every tree, each class gets the tree
most people level with:

| Class   | Default       |
| ------- | ------------- |
| Warrior | Arms          |
| Paladin | Retribution   |
| Hunter  | Beast Mastery |
| Rogue   | Combat        |
| Priest  | Shadow        |
| Shaman  | Enhancement   |
| Mage    | Frost         |
| Warlock | Affliction    |
| Druid   | Feral         |

Another tree with 10 or more points is their second spec: an item that only
suits it can be a **Maybe**, never an Upgrade.

### 4. The score

```
score = Σ (stat on the item × the spec's weight for it)
      + armor × the ARMOR weight
      + weapon DPS × the DPS weight for where it goes
```

Weapon DPS uses one of three weights: main hand (or two-hander), off hand,
or ranged (bows, guns, crossbows, thrown, wands).

Two adjustments:

- **The wrong kind of item:** if the stats the spec cares about are worth
  less than **30%** of the item's raw stat total, it doesn't suit the spec at
  all (Agility gear for a Mage scores 0, so it's never suggested). Attack
  Power counts as half a point and Bonus Armor as a tenth for that total.
- **Lighter armor after 40:** from level **40**, body armor lighter than the
  best type the class can wear counts **80%** (leather for a level 45
  Warrior).

### 5. Compared with what they wear

The same score, for the same spec, of what's in the slot the item would go
in:

- **Rings and trinkets:** the weaker of the two.
- **Two-handers:** main hand plus off hand.
- **Off hands and shields:** with a two-hander equipped, the two-hander
  (they'd give it up).
- **One-handers:** the main hand, or the off hand for classes that dual wield
  (whichever gains more).
- **Empty slot:** counts as a score of 1, so anything useful is a big gain.

If Guildie doesn't know a worn item's stats, it estimates its score from its
item level, quality and slot.

```
gain = (new score − worn score) / worn score
```

Because every stat counts, stats you'd lose are included: a ring with more
Agility but no Stamina is weighed against both.

### 6. The verdict and the order

| Verdict     | When                                                                    |
| ----------- | ----------------------------------------------------------------------- |
| **Upgrade** | Gain of 15% or more, usable now, main spec                              |
| **Maybe**   | Gain of 3% to 15%; or only their second spec; or usable within 3 levels |
| Nothing     | Under 3%                                                                |

The list puts every Upgrade before every Maybe, then sorts by gain (biggest
first), then by name. The addon tooltip shows the top 3; the site's item
panel shows the top 5, each with why ("+6 Agility, +4 Stamina over Embossed
Leather Gloves").

### An example

A level 30 Combat Rogue wears gloves with +3 Agility, +3 Stamina and 50
armor. A guildmate links gloves with +6 Agility, +4 Stamina and 60 armor.
With Combat's weights (Agility 1, Stamina 0.5, Armor 0.02):

- New: 6 × 1 + 4 × 0.5 + 60 × 0.02 = **9.2**
- Worn: 3 × 1 + 3 × 0.5 + 50 × 0.02 = **5.5**
- Gain: (9.2 − 5.5) / 5.5 = **67%**, an **Upgrade**.

## The weights

Where the numbers come from: [WowSims](https://github.com/wowsims)' stat
weights (MIT), from `wowsims/forever` where a spec has presets and
`wowsims/classic` for the rest. Those are endgame raid values. Guildie sets
each spec's main stat to 1, scales the rest to it, then moves them toward
leveling:

- Stamina counts for everyone (0.5 to 0.6 for most specs, more for tanks and
  Warlocks).
- Primary stats count more; hit and crit count less, since nobody levels
  near a cap.
- Spirit counts more for healers and Priests (drinking less).
- Set bonuses and Season of Discovery rune effects are left out.

Each spec also has a hand-written stat priority, first to third (`stats` in
`SPECS`). The roster and character pages show it as "stats to look for".
Each stat in it must have a weight in that spec (`statPriority.test.ts`). The
default priority is only for showing; the weights decide.

A player who claimed a character can choose another tree's priority or their
own three instead (`convex/statPriority.ts`), and suggestions follow that
choice everywhere: the item panel, the Crafting page's upgrade views and the
addon's tooltips (`specsFor` in `shared/upgrades.ts`):

- **Another tree:** that tree's weights. The tree their talents put them in
  becomes the second spec (maybes) if it has 10+ points.
- **Their own three:** their talents' tree, bent by `customWeights`. Per
  plain stat point (Attack Power counts half), the first stat is worth as
  much as the spec's best stat, the second 0.8 of it and the third 0.6, each
  only raised and never above the one before. Stats left out are capped at
  0.9 of the third. Weapon DPS and school damage stay; Armor, if named, is
  doubled (first), ×1.6 or ×1.3. Example: Enhancement as Strength, Intellect,
  Agility: Strength 1, Intellect 0.45 → 0.8, Agility 0.6, Crit 0.9 → 0.54.
  It's a spec of its own, `SHAMAN:1:STRENGTH,INTELLECT,AGILITY`, named
  "Str/Int/Agi" (tooltips say "upgrade for Nate (Str/Int/Agi)"). The site
  adds it to the rules in `GuildieData.lua`, so the addon needs no change.

In game, a change shows in guildmates' tooltips after their Guildie app's
next guild data refresh (every 15 minutes) and a `/reload`.

Weapon DPS weights are per point of DPS, so they look large: a Combat Rogue
values 1 main-hand DPS like about 5 Agility. Blank: the spec ignores that
stat.

### Warrior

| Stat                   | Arms | Fury | Protection |
| ---------------------- | ---: | ---: | ---------: |
| Strength               |    1 |    1 |        0.6 |
| Agility                |  0.7 |  0.8 |        0.6 |
| Stamina                |  0.6 |  0.6 |          1 |
| Attack Power           | 0.45 | 0.45 |       0.25 |
| Crit                   |  0.9 |    1 |        0.4 |
| Hit                    |  0.9 |  0.9 |        0.5 |
| Defense                |  0.2 |  0.2 |       0.45 |
| Block                  |      |      |        0.2 |
| Health per 5           |      |      |        0.5 |
| Armor                  | 0.02 | 0.02 |       0.05 |
| Bonus Armor            |      |      |       0.05 |
| Weapon DPS (main hand) |    8 |  4.5 |        2.5 |
| Weapon DPS (off hand)  |      |  1.4 |            |
| Ranged / wand DPS      |  0.3 |  0.3 |        0.2 |

### Paladin

| Stat                   | Holy | Protection | Retribution |
| ---------------------- | ---: | ---------: | ----------: |
| Strength               |  0.3 |        0.6 |           1 |
| Agility                |      |        0.5 |         0.7 |
| Stamina                |  0.5 |          1 |         0.6 |
| Intellect              |    1 |        0.3 |         0.4 |
| Spirit                 |  0.7 |            |             |
| Attack Power           |      |        0.2 |        0.42 |
| Spell Power            |  1.2 |        0.4 |         0.5 |
| Spell Damage           |  0.5 |        0.4 |         0.5 |
| Spell Healing          |  1.1 |            |             |
| Crit                   |  0.4 |            |         0.9 |
| Hit                    |      |            |         0.9 |
| Defense                |      |       0.45 |             |
| Block                  |      |        0.2 |             |
| Mana per 5             |    1 |        0.3 |         0.3 |
| Health per 5           |      |        0.5 |             |
| Armor                  | 0.02 |       0.05 |        0.02 |
| Bonus Armor            |      |       0.05 |             |
| Weapon DPS (main hand) |    1 |          2 |         5.8 |
| Ranged / wand DPS      |    1 |            |             |

### Hunter

| Stat                   | Beast Mastery | Marksmanship | Survival |
| ---------------------- | ------------: | -----------: | -------: |
| Strength               |          0.15 |         0.15 |      0.2 |
| Agility                |             1 |            1 |        1 |
| Stamina                |           0.5 |          0.5 |      0.6 |
| Intellect              |           0.3 |          0.3 |      0.3 |
| Spirit                 |           0.1 |          0.1 |      0.1 |
| Attack Power           |          0.45 |         0.45 |     0.45 |
| Crit                   |           0.8 |          0.9 |      0.9 |
| Hit                    |           0.8 |          0.9 |      0.8 |
| Mana per 5             |           0.4 |          0.4 |      0.4 |
| Armor                  |          0.02 |         0.02 |     0.02 |
| Weapon DPS (main hand) |           0.5 |          0.4 |      0.7 |
| Weapon DPS (off hand)  |           0.2 |          0.2 |      0.3 |
| Ranged / wand DPS      |             3 |          3.2 |        3 |

### Rogue

| Stat                   | Assassination | Combat | Subtlety |
| ---------------------- | ------------: | -----: | -------: |
| Strength               |          0.55 |   0.55 |     0.55 |
| Agility                |             1 |      1 |        1 |
| Stamina                |           0.5 |    0.5 |      0.5 |
| Attack Power           |           0.5 |    0.5 |      0.5 |
| Crit                   |           0.9 |   0.85 |     0.85 |
| Hit                    |           0.9 |    0.9 |      0.9 |
| Armor                  |          0.02 |   0.02 |     0.02 |
| Weapon DPS (main hand) |           4.1 |    5.4 |      5.4 |
| Weapon DPS (off hand)  |             2 |    1.5 |      1.2 |
| Ranged / wand DPS      |           0.3 |    0.3 |      0.3 |

### Priest

| Stat              | Discipline | Holy | Shadow |
| ----------------- | ---------: | ---: | -----: |
| Stamina           |        0.5 |  0.5 |    0.6 |
| Intellect         |          1 |    1 |      1 |
| Spirit            |        0.8 |  0.9 |    0.8 |
| Spell Power       |        1.2 |  1.2 |    1.3 |
| Spell Damage      |        0.7 |  0.5 |    1.3 |
| Spell Healing     |        1.1 |  1.1 |    0.2 |
| Shadow Damage     |        0.3 |      |    1.2 |
| Holy Damage       |        0.3 |  0.3 |        |
| Crit              |        0.4 |  0.4 |    0.6 |
| Hit               |            |      |    0.6 |
| Mana per 5        |          1 |    1 |    0.6 |
| Armor             |       0.02 | 0.02 |   0.02 |
| Ranged / wand DPS |          1 |    1 |      1 |

### Shaman

| Stat                   | Elemental | Enhancement | Restoration |
| ---------------------- | --------: | ----------: | ----------: |
| Strength               |           |           1 |         0.2 |
| Agility                |           |         0.6 |             |
| Stamina                |       0.6 |         0.6 |         0.5 |
| Intellect              |         1 |        0.45 |           1 |
| Spirit                 |       0.4 |             |         0.5 |
| Attack Power           |           |        0.45 |             |
| Spell Power            |       1.3 |         0.3 |         1.2 |
| Spell Damage           |       1.3 |         0.3 |         0.5 |
| Spell Healing          |       0.2 |             |         1.1 |
| Fire Damage            |       0.4 |             |             |
| Nature Damage          |       0.9 |             |             |
| Crit                   |       0.6 |         0.9 |         0.4 |
| Hit                    |       0.6 |         0.8 |             |
| Mana per 5             |       0.6 |         0.3 |           1 |
| Armor                  |      0.02 |        0.02 |        0.02 |
| Weapon DPS (main hand) |           |         6.4 |         0.8 |
| Ranged / wand DPS      |         1 |             |           1 |

### Mage

| Stat              | Arcane | Fire | Frost |
| ----------------- | -----: | ---: | ----: |
| Stamina           |    0.6 |  0.6 |   0.6 |
| Intellect         |      1 |    1 |     1 |
| Spirit            |    0.5 |  0.5 |   0.5 |
| Spell Power       |    1.3 |  1.3 |   1.3 |
| Spell Damage      |    1.3 |  1.3 |   1.3 |
| Spell Healing     |    0.2 |  0.2 |   0.2 |
| Arcane Damage     |    1.1 |      |       |
| Fire Damage       |        |  1.1 |       |
| Frost Damage      |        |      |   1.1 |
| Crit              |    0.6 |  0.6 |   0.6 |
| Hit               |    0.6 |  0.6 |   0.6 |
| Mana per 5        |    0.6 |  0.6 |   0.6 |
| Armor             |   0.02 | 0.02 |  0.02 |
| Ranged / wand DPS |      1 |    1 |     1 |

### Warlock

| Stat              | Affliction | Demonology | Destruction |
| ----------------- | ---------: | ---------: | ----------: |
| Stamina           |        0.9 |          1 |         0.8 |
| Intellect         |          1 |          1 |           1 |
| Spirit            |        0.5 |        0.5 |         0.5 |
| Spell Power       |        1.3 |        1.3 |         1.3 |
| Spell Damage      |        1.3 |        1.3 |         1.3 |
| Spell Healing     |        0.2 |        0.2 |         0.2 |
| Fire Damage       |            |            |         1.1 |
| Shadow Damage     |        1.1 |        1.1 |         0.8 |
| Crit              |        0.6 |        0.6 |         0.6 |
| Hit               |        0.6 |        0.6 |         0.6 |
| Mana per 5        |        0.6 |        0.6 |         0.6 |
| Armor             |       0.02 |       0.02 |        0.02 |
| Ranged / wand DPS |          1 |          1 |           1 |

### Druid

| Stat              | Balance | Feral | Restoration |
| ----------------- | ------: | ----: | ----------: |
| Strength          |         |  0.95 |             |
| Agility           |         |     1 |             |
| Stamina           |     0.6 |   0.7 |         0.5 |
| Intellect         |       1 |  0.15 |           1 |
| Spirit            |     0.5 |   0.1 |         0.9 |
| Attack Power      |         |   0.4 |             |
| Spell Power       |     1.3 |       |         1.2 |
| Spell Damage      |     1.3 |       |         0.5 |
| Spell Healing     |     0.3 |       |         1.1 |
| Arcane Damage     |     0.9 |       |             |
| Nature Damage     |     0.7 |       |             |
| Crit              |     0.6 |  0.75 |         0.4 |
| Hit               |     0.6 |   0.8 |             |
| Defense           |         |   0.3 |             |
| Mana per 5        |     0.6 |   0.2 |           1 |
| Armor             |    0.02 |  0.08 |        0.02 |
| Bonus Armor       |         |  0.08 |             |
| Ranged / wand DPS |       1 |       |           1 |

## Changing the weights

Weights and thresholds are data. They reach the addon in `GuildieData.lua`
with the Guildie app's next download, so a change needs no addon release.

1. Edit `SPECS` or `THRESHOLDS` in `apps/web/convex/shared/weights.ts`. Keep
   each spec's main stat at 1, and say where your numbers come from in the
   comment (a sim, theorycrafting, testing in game).
2. Update the tables in this file to match.
3. Run `pnpm --filter @guildie/web test`. "real weights: plausible picks" in
   `apps/web/convex/upgrades.test.ts` checks sensible outcomes; add a case
   for what you're fixing.
4. Check an item on the site: `?item=<id>` on a guild page shows who it's
   for and why.

Changing the rules themselves (not just the numbers) means changing the
TypeScript and the Lua together and regenerating the shared test cases; the
`gear-and-weights` guide in `.claude/skills/` walks through it.
