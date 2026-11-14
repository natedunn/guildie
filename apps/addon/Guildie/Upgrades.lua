-- Gear-upgrade suggestions on item tooltips: which guildmates the hovered
-- item might help (rows under Guildie: "Brisket | upgrade (Feral)", "Pip | possible upgrade (Str/Int/Agi)",
-- "Miller | possible upgrade (lvl 24)").
-- A best guess from stat weights, not a sim.
--
-- The rules, the weights and each guildmate (level, spec, scores of what they
-- wear) come from GuildieData.lua (`GuildieData.upgrades`), which the app
-- downloads from guildie.club; only the hovered item is read here. The
-- scoring is a port of apps/web/convex/shared/upgrades.ts: keep the two the
-- same (apps/addon/tests/upgrade_vectors.json is run against both).

local ADDON, ns = ...

local U = {}
ns.upgrades = U

-- ---- The decision (port of shared/upgrades.ts) ------------------------------------

local SLOTS_BY_INV_TYPE = {
    HEAD = { 1 }, NECK = { 2 }, SHOULDER = { 3 }, CHEST = { 5 }, ROBE = { 5 }, WAIST = { 6 },
    LEGS = { 7 }, FEET = { 8 }, WRIST = { 9 }, HAND = { 10 }, FINGER = { 11, 12 }, TRINKET = { 13, 14 },
    CLOAK = { 15 }, WEAPON = { 16 }, ["2HWEAPON"] = { 16, 17 }, WEAPONMAINHAND = { 16 },
    WEAPONOFFHAND = { 17 }, SHIELD = { 17 }, HOLDABLE = { 17 },
    RANGED = { 18 }, RANGEDRIGHT = { 18 }, THROWN = { 18 }, RELIC = { 18 },
}
U.SLOTS_BY_INV_TYPE = SLOTS_BY_INV_TYPE

local RANGED_TYPES = { RANGED = true, RANGEDRIGHT = true, THROWN = true }
local BODY_ARMOR = { [1] = true, [2] = true, [3] = true, [4] = true }

local function bestArmor(cls, level)
    local best = 1
    for sub = 1, 4 do
        local from = cls.armor[sub]
        if from and from <= level then best = sub end
    end
    return best
end

-- The best body armor type a class ever wears (topArmor in upgrades.ts).
local function topArmor(cls)
    local top = 1
    for sub = 1, 4 do
        if cls.armor[sub] then top = sub end
    end
    return top
end

--- What armor of a type they don't want counts at a level: rules.offTypeFactors,
--- { { fromLevel, factor }, ... } lowest first (missing in older GuildieData.lua:
--- preferBestFactor).
function U.offTypeFactor(rules, level)
    local factor = rules.preferBestFactor
    for _, step in ipairs(rules.offTypeFactors or {}) do
        if level >= step[1] then factor = step[2] end
    end
    return factor
end

local function isBodyArmor(item)
    return item.cls == 4 and item.invType ~= "CLOAK" and BODY_ARMOR[item.subclass or 0] == true
end

-- Weapon subclasses for the ranged slot: a weapon preference counts within its group.
local RANGED_WEAPONS = { [2] = true, [3] = true, [16] = true, [18] = true, [19] = true }

-- 0-based place of `value` in `list`, or nil.
local function indexOf(list, value)
    for i, v in ipairs(list) do
        if v == value then return i - 1 end
    end
    return nil
end

--- The player's preferred armor or weapon types (member fields armorPref,
--- armorPrefs, weaponPref, weaponPrefs): the item's place among them (0 for
--- the first), false for another type of the same kind (weapons ranked
--- within melee or ranged), nil when no preference covers the item
--- (preferred in upgrades.ts). Data from before lists only has armorPref and
--- weaponPref.
function U.preferred(item, p)
    if not p then return nil end
    if p.armorPref and isBodyArmor(item) then
        local i = indexOf(p.armorPrefs or { p.armorPref }, item.subclass or -1)
        if i == nil then return false end
        return i
    end
    if p.weaponPref and item.cls == 2 and item.subclass then
        local ranged = RANGED_WEAPONS[item.subclass] == true
        local group = {}
        for _, t in ipairs(p.weaponPrefs or { p.weaponPref }) do
            if (RANGED_WEAPONS[t] == true) == ranged then table.insert(group, t) end
        end
        if #group == 0 then return nil end
        local i = indexOf(group, item.subclass)
        if i == nil then return false end
        return i
    end
    return nil
end

local function excluded(item, p)
    if U.preferred(item, p) ~= false then return false end
    if isBodyArmor(item) then return p.armorStrict == true end
    return p.weaponStrict == true
end

local function sortedKeys(t)
    local keys = {}
    for k in pairs(t) do table.insert(keys, k) end
    table.sort(keys)
    return keys
end

--- score, stat part, raw stat total, and the armor subclass when it's body
--- armor of a type they don't want (a "possible upgrade" at most), else nil (see
--- scoreItem in upgrades.ts).
function U.scoreItem(item, w, level, cls, rules, offHand, prefs)
    local stat, total = 0, 0
    -- Same order as the site's, so the sums match to the last bit.
    for _, key in ipairs(sortedKeys(item.stats or {})) do
        local value = item.stats[key]
        stat = stat + (w[key] or 0) * value
        total = total + math.abs(value) * ((rules.points and rules.points[key]) or 1)
    end
    local score = stat + (w.ARMOR or 0) * (item.armor or 0)
    if item.dps and item.dps ~= 0 then
        local key = "DPS"
        if RANGED_TYPES[item.invType] then key = "RANGED_DPS"
        elseif offHand or item.invType == "WEAPONOFFHAND" then key = "OFFHAND_DPS" end
        score = score + (w[key] or 0) * item.dps
    end
    local pref = U.preferred(item, prefs)
    local armor = isBodyArmor(item)
    local sub = item.subclass or 0
    local factor, off = 1, nil
    if pref == false then
        -- Not on their list: armor by level (offTypeFactors), weapons a fixed share.
        if armor then
            factor = U.offTypeFactor(rules, level)
            off = sub
        else
            factor = rules.preferBestFactor
        end
    elseif pref ~= nil and pref > 0 then
        -- Further down their list: a little less, never below another type.
        factor = 1 - (rules.preferStep or 0) * pref
        if factor < rules.preferBestFactor then factor = rules.preferBestFactor end
    elseif pref == nil and armor and sub < bestArmor(cls, level) then
        -- No list: two or more types below the class's best as if not on a
        -- list; one below a little less, from preferBestFrom.
        if topArmor(cls) - sub >= 2 then
            factor = U.offTypeFactor(rules, level)
            off = sub
        elseif level >= rules.preferBestFrom then
            factor = rules.preferBestFactor
        end
    end
    -- The score only: whether the stats suit the spec (stat, minFit) doesn't depend on the type.
    if factor ~= 1 then score = score * factor end
    return score, stat, total, off
end

local function contains(list, value)
    for _, v in ipairs(list or {}) do
        if v == value then return true end
    end
    return false
end

--- The stats' part (stat from scoreItem) as minFit sees it: a stat the spec
--- names (spec.fit, else spec.stats; spell power when spell damage or
--- healing is named) counts as a full stat point however low its weight
--- (fitOf in upgrades.ts).
function U.fitOf(item, spec, rules, stat)
    local named = spec.fit or spec.stats or {}
    local fit = stat
    for _, key in ipairs(sortedKeys(item.stats or {})) do
        local value = item.stats[key]
        local listed = contains(named, key)
            or (key == "SPELL_POWER" and (contains(named, "SPELL_DAMAGE_DONE") or contains(named, "SPELL_HEALING_DONE")))
        if listed and value > 0 then
            local full = value * ((rules.points and rules.points[key]) or 1)
            local counted = (spec.w[key] or 0) * value
            if full > counted then fit = fit + (full - counted) end
        end
    end
    return fit
end

--- Whether a spec has a use for the item at all (stat: U.fitOf's).
function U.suits(score, stat, total, rules)
    if total > 0 then return stat >= rules.minFit * total end
    return score > 0
end

--- The level from which the member can use the item, or nil.
function U.usableAt(item, m, rules, itemID)
    local cls = rules.classes[m.classId]
    if not cls or not SLOTS_BY_INV_TYPE[item.invType] then return nil end
    if item.classes and #item.classes > 0 and not contains(item.classes, m.classId) then return nil end
    if item.unique and itemID and contains(m.worn, itemID) then return nil end
    local at = item.reqLevel or 1
    if item.cls == 2 then
        local from = item.subclass and cls.weapons[item.subclass]
        if not from then return nil end
        at = math.max(at, from)
        if item.invType == "WEAPONOFFHAND" then
            if not cls.dualWield then return nil end
            at = math.max(at, cls.dualWield)
        end
    elseif item.invType ~= "CLOAK" and (item.subclass or 0) ~= 0 then
        local from = cls.armor[item.subclass]
        if not from then return nil end
        at = math.max(at, from)
    end
    if at > m.level + rules.levelsAhead then return nil end
    return math.max(at, 1)
end

--- What the item would replace: base score, slots compared against.
function U.baseline(item, slots, th, offHand)
    local function at(s) return slots[s] or 0 end
    local t = item.invType
    if t == "FINGER" then
        if at(11) <= at(12) then return at(11), { 11 } end
        return at(12), { 12 }
    elseif t == "TRINKET" then
        if at(13) <= at(14) then return at(13), { 13 } end
        return at(14), { 14 }
    elseif t == "2HWEAPON" then
        return at(16) + at(17), { 16, 17 }
    elseif t == "WEAPONOFFHAND" or t == "SHIELD" or t == "HOLDABLE" then
        if th then return at(16), { 16 } end
        return at(17), { 17 }
    elseif t == "WEAPON" then
        if offHand then return at(17), { 17 } end
        return at(16), { 16 }
    end
    local slot = SLOTS_BY_INV_TYPE[t][1]
    return at(slot), { slot }
end

local function gainFor(item, m, specKey, slots, rules)
    local spec = rules.specs[specKey]
    local cls = rules.classes[m.classId]
    if not spec or not cls then return nil end
    local options = { false }
    if item.invType == "WEAPON" and cls.dualWield and cls.dualWield <= m.level and not m.th then
        table.insert(options, true)
    end
    local best
    for _, offHand in ipairs(options) do
        local score, stat, total, off = U.scoreItem(item, spec.w, m.level, cls, rules, offHand, m)
        if U.suits(score, U.fitOf(item, spec, rules, stat), total, rules) then
            local base, against = U.baseline(item, slots, m.th, offHand)
            local gain = (score - base) / math.max(base, rules.minBase)
            local empty = true
            for _, slot in ipairs(against) do
                if slots[slot] ~= nil then empty = false end
            end
            if not best or gain > best.gain then
                best = { gain = gain, net = score - base, against = against, off = off, empty = empty }
            end
        end
    end
    return best
end

-- Armor with no stats at all (white and grey items): only for an empty slot.
local function plainArmor(item)
    return item.cls == 4 and next(item.stats or {}) == nil
end

-- Where a second copy can go next to a worn one: rings, trinkets, one-handers.
local PAIRED = { FINGER = true, TRINKET = true, WEAPON = true }

--- A priority stat's amount on an item: armor for ARMOR; spell power counts
--- toward spell damage and healing (keyValue in upgrades.ts).
function U.keyValue(item, stat)
    if stat == "ARMOR" then return item.armor or 0 end
    local own = (item.stats or {})[stat] or 0
    if stat == "SPELL_DAMAGE_DONE" or stat == "SPELL_HEALING_DONE" then
        return own + ((item.stats or {}).SPELL_POWER or 0)
    end
    return own
end

--- Whether the item has less of one of the spec's priority stats (spec.stats,
--- from the rules) than what it replaces (member keys; unknown items: none).
local function loses(item, m, stats, against)
    if type(stats) ~= "table" then return false end
    for _, k in ipairs(stats) do
        local worn = 0
        for _, slot in ipairs(against) do
            local values = m.keys and m.keys[slot]
            worn = worn + ((values and values[k]) or 0)
        end
        if U.keyValue(item, k) < worn then return true end
    end
    return false
end

-- A weapon type the class only uses when the player chooses it
-- (unlessChosen in the class rules: a hunter's thrown weapons).
local function unchosen(item, m, cls)
    if item.cls ~= 2 or not item.subclass or not cls or not contains(cls.unlessChosen, item.subclass) then
        return false
    end
    local chosen = m.weaponPrefs or (m.weaponPref and { m.weaponPref }) or {}
    return not contains(chosen, item.subclass)
end

local KIND_RANK = { upgrade = 0, maybe = 1, empty = 2 }

--- { kind = "upgrade"|"maybe"|"empty", gain, spec, at?, second?, against, off? } or nil.
function U.judge(item, m, rules, itemID)
    -- Removed by the player on the site (optional: older GuildieData.lua files lack it).
    if itemID and contains(m.dismissed, itemID) then return nil end
    if itemID and not PAIRED[item.invType] and contains(m.worn, itemID) then return nil end
    local at = U.usableAt(item, m, rules, itemID)
    if not at or excluded(item, m) or unchosen(item, m, rules.classes[m.classId]) then return nil end
    local later = at > m.level and at or nil
    local main = gainFor(item, m, m.spec, m.slots or {}, rules)
    if plainArmor(item) then
        -- Whatever they wear there has stats this would lose: only for nothing at all.
        if not main or not main.empty or main.net <= 0 then return nil end
        return { kind = "empty", gain = main.gain, spec = m.spec, against = main.against, at = later, off = main.off }
    end
    local minGain = rules.minGain or 0
    if main and main.gain >= rules.maybe and main.net >= minGain then
        -- Upgrade only when it's clear: anything else ("maybe") is a possible
        -- upgrade the player decides, including giving up a priority stat.
        local kind = "maybe"
        if main.gain >= rules.upgrade and not later and main.off == nil then
            local spec = rules.specs[m.spec]
            if not loses(item, m, spec and spec.stats, main.against) then kind = "upgrade" end
        end
        return { kind = kind, gain = main.gain, spec = m.spec, against = main.against, at = later, off = main.off }
    end
    if m.spec2 and m.slots2 then
        local second = gainFor(item, m, m.spec2, m.slots2, rules)
        if second and second.gain >= rules.maybe and second.net >= minGain then
            return {
                kind = "maybe", gain = second.gain, spec = m.spec2, second = true, against = second.against,
                at = later, off = second.off,
            }
        end
    end
    return nil
end

--- Who the item would help, upgrades first, then possible upgrades, then by gain: { { member, verdict }, ... }.
--- opts: now (seconds), skip (set of names), itemID, max.
function U.suggest(item, members, rules, opts)
    local out = {}
    for _, m in ipairs(members or {}) do
        local skip = opts.skip and opts.skip[m.name]
        local stale = opts.now - (m.seen or 0) > rules.activeDays * 86400
        if not skip and not stale then
            local verdict = U.judge(item, m, rules, opts.itemID)
            if verdict then table.insert(out, { member = m, verdict = verdict }) end
        end
    end
    table.sort(out, function(a, b)
        local ra, rb = KIND_RANK[a.verdict.kind], KIND_RANK[b.verdict.kind]
        if ra ~= rb then return ra < rb end
        if a.verdict.gain ~= b.verdict.gain then return a.verdict.gain > b.verdict.gain end
        return a.member.name < b.member.name
    end)
    local max = opts.max or 3
    while #out > max do table.remove(out) end
    return out
end

-- ---- The hovered item (game APIs) -----------------------------------------------

-- GetItemStats keys that aren't ITEM_MOD_<STAT>_SHORT.
local RESISTANCES = {
    RESISTANCE0_NAME = "ARMOR",
    RESISTANCE2_NAME = "FIRE_RESISTANCE", RESISTANCE3_NAME = "NATURE_RESISTANCE",
    RESISTANCE4_NAME = "FROST_RESISTANCE", RESISTANCE5_NAME = "SHADOW_RESISTANCE",
    RESISTANCE6_NAME = "ARCANE_RESISTANCE",
}

-- English stat names, for reading the tooltip when GetItemStats can't (the
-- same names as shared/itemInfo.ts).
local STAT_NAMES = {
    Strength = "STRENGTH", Agility = "AGILITY", Stamina = "STAMINA", Intellect = "INTELLECT", Spirit = "SPIRIT",
    ["Attack Power"] = "ATTACK_POWER", ["Spell Power"] = "SPELL_POWER", ["Spell Damage"] = "SPELL_DAMAGE_DONE",
    ["Spell Healing"] = "SPELL_HEALING_DONE", Defense = "DEFENSE_SKILL_RATING", Block = "BLOCK_RATING",
    ["Bonus Armor"] = "EXTRA_ARMOR", ["Health Per 5 Sec."] = "HEALTH_REGEN",
    ["Mana Regeneration per 5 sec"] = "MANA_REGENERATION", ["Critical Strike Rating"] = "CRIT_RATING",
    ["Crit Rating"] = "CRIT_RATING", ["Hit Rating"] = "HIT_RATING",
    ["Arcane Damage"] = "BONUS_STAT_ARCANE_DAMAGE_DONE", ["Fire Damage"] = "BONUS_STAT_FIRE_DAMAGE_DONE",
    ["Frost Damage"] = "BONUS_STAT_FROST_DAMAGE_DONE", ["Nature Damage"] = "BONUS_STAT_NATURE_DAMAGE_DONE",
    ["Shadow Damage"] = "BONUS_STAT_SHADOW_DAMAGE_DONE", ["Holy Damage"] = "BONUS_STAT_HOLY_DAMAGE_DONE",
    ["Fire Resistance"] = "FIRE_RESISTANCE", ["Nature Resistance"] = "NATURE_RESISTANCE",
    ["Frost Resistance"] = "FROST_RESISTANCE", ["Shadow Resistance"] = "SHADOW_RESISTANCE",
    ["Arcane Resistance"] = "ARCANE_RESISTANCE",
}

local CLASS_IDS = {
    WARRIOR = 1, PALADIN = 2, HUNTER = 3, ROGUE = 4, PRIEST = 5, SHAMAN = 7, MAGE = 8, WARLOCK = 9, DRUID = 11,
}
local ENGLISH_CLASSES = {
    Warrior = 1, Paladin = 2, Hunter = 3, Rogue = 4, Priest = 5, Shaman = 7, Mage = 8, Warlock = 9, Druid = 11,
}

--- Class names as the game shows them (any language) -> class id.
local function classIdByName(name)
    for _, names in ipairs({ LOCALIZED_CLASS_NAMES_MALE or {}, LOCALIZED_CLASS_NAMES_FEMALE or {} }) do
        for token, localized in pairs(names) do
            if localized == name then return CLASS_IDS[token] end
        end
    end
    return ENGLISH_CLASSES[name]
end

--- A global format string ("Classes: %s") as a Lua pattern capturing the %s.
local function patternOf(format, fallback)
    local text = type(format) == "string" and format or fallback
    -- Escape the pattern characters (not %), then %s and %d become captures.
    text = text:gsub("([%(%)%.%+%-%*%?%[%]%^%$])", "%%%1")
    text = text:gsub("%%s", "(.+)")
    text = text:gsub("%%d", "%%d+")
    return "^" .. text .. "$"
end

local function apiItemInfoInstant(link)
    if C_Item and C_Item.GetItemInfoInstant then return C_Item.GetItemInfoInstant(link) end
    if GetItemInfoInstant then return GetItemInfoInstant(link) end
end

local function apiItemInfo(link)
    if C_Item and C_Item.GetItemInfo then return C_Item.GetItemInfo(link) end
    if GetItemInfo then return GetItemInfo(link) end
end

local function apiItemStats(link)
    if C_Item and C_Item.GetItemStats then return C_Item.GetItemStats(link) end
    if GetItemStats then return GetItemStats(link) end
end

--- Whether the tooltip says nobody can trade the item: "Soulbound", "Binds
--- when picked up" (it binds to whoever loots or crafts it) or "Quest Item"
--- (as `untradeable` in itemInfo.ts). `lines`: the tooltip's text lines.
function U.untradeable(lines)
    return U.binding(lines) ~= nil
end

--- The tooltip line that makes the item untradeable ("Soulbound", "Binds
--- when picked up", "Quest Item"), or nil.
function U.binding(lines)
    local bound = {
        [ITEM_SOULBOUND or "Soulbound"] = true,
        [ITEM_BIND_ON_PICKUP or "Binds when picked up"] = true,
        [ITEM_BIND_QUEST or "Quest Item"] = true,
    }
    for i, text in ipairs(lines or {}) do
        if i > 1 and bound[text] then return text end
    end
    return nil
end

--- The hovered item as the decision wants it (same shape as ItemInfo in
--- itemInfo.ts), plus `soulbound` (it can't be traded: Soulbound, Binds when
--- picked up, Quest Item); nil when it isn't gear or not known yet.
--- `lines`: the tooltip's text lines (name first).
function U.readItem(link, lines)
    if not link then return nil end
    local _, _, _, equipLoc, _, classID, subclassID = apiItemInfoInstant(link)
    if type(equipLoc) ~= "string" or equipLoc == "" then return nil end
    local invType = equipLoc:gsub("^INVTYPE_", "")
    if not SLOTS_BY_INV_TYPE[invType] then return nil end
    if classID ~= 2 and classID ~= 4 then return nil end
    -- Required level; nil until the client has the item cached (the tooltip
    -- shows again when it arrives).
    local name, _, _, _, reqLevel = apiItemInfo(link)
    if not name then return nil end
    local item = { invType = invType, cls = classID, subclass = subclassID, stats = {}, reqLevel = (reqLevel and reqLevel > 0) and reqLevel or nil }
    local fromApi = false
    for key, value in pairs(apiItemStats(link) or {}) do
        if type(value) == "number" then
            fromApi = true
            local stat = RESISTANCES[key] or key:match("^ITEM_MOD_(.+)_SHORT$")
            if key == "ITEM_MOD_DAMAGE_PER_SECOND_SHORT" then
                item.dps = value
            elseif stat == "ARMOR" then
                item.armor = value
            elseif stat then
                item.stats[stat] = (item.stats[stat] or 0) + value
            end
        end
    end
    local classesPattern = patternOf(ITEM_CLASSES_ALLOWED, "Classes: %s")
    local unique = { [ITEM_UNIQUE or "Unique"] = true, [ITEM_UNIQUE_EQUIPPABLE or "Unique-Equipped"] = true }
    local uniqueMultiple = patternOf(ITEM_UNIQUE_MULTIPLE, "Unique (%d)")
    for i, text in ipairs(lines or {}) do
        if i > 1 and type(text) == "string" then
            local classes = text:match(classesPattern)
            if classes then
                item.classes = {}
                for className in classes:gmatch("[^,]+") do
                    local id = classIdByName((className:gsub("^%s+", ""):gsub("%s+$", "")))
                    if id then table.insert(item.classes, id) end
                end
            elseif unique[text] or text:match(uniqueMultiple) then
                item.unique = true
            elseif not fromApi then
                -- No GetItemStats: read the (English) tooltip instead.
                local value, statName = text:match("^([%+%-]%d+) (.+)$")
                if value and STAT_NAMES[statName] then
                    local stat = STAT_NAMES[statName]
                    item.stats[stat] = (item.stats[stat] or 0) + tonumber(value)
                end
                local armor = text:match("^(%d+) Armor$")
                if armor then item.armor = tonumber(armor) end
                local dps = text:match("^%(([%d%.]+) damage per second%)$")
                if dps then item.dps = tonumber(dps) end
            end
        end
    end
    if U.untradeable(lines) then item.soulbound = true end
    return item
end

-- ---- For you: the character you're on, with what you wear right now -----------------

local function round1(n) return math.floor(n * 10 + 0.5) / 10 end

--- Your own profile (GuildieData.upgrades.mine) with what you wear now
--- instead of what the site last saw: scores and priority stats per slot,
--- two-hander, worn ids, your level. `read(slot)` -> item id, item (as
--- readItem; nil while the client hasn't loaded it: the site's score is
--- kept for that slot). Same scoring as wornScores / wornKeys in upgrades.ts.
function U.liveMember(m, rules, level, read)
    local live = {}
    for k, v in pairs(m) do live[k] = v end
    live.level = level or m.level
    local cls = rules.classes[m.classId]
    local spec, spec2 = rules.specs[m.spec], m.spec2 and m.slots2 and rules.specs[m.spec2]
    if not cls or not spec then return live end
    local slots, slots2, keys, worn = {}, spec2 and {} or nil, {}, {}
    local th = nil
    for slot = 1, 18 do
        if slot ~= 4 then
            local id, item = read(slot)
            if id then
                table.insert(worn, id)
                if item then
                    local offHand = slot == 17 and item.cls == 2
                    slots[slot] = round1((U.scoreItem(item, spec.w, live.level, cls, rules, offHand, m)))
                    if spec2 then
                        slots2[slot] = round1((U.scoreItem(item, spec2.w, live.level, cls, rules, offHand, m)))
                    end
                    local values, any = {}, false
                    for _, k in ipairs(spec.stats or {}) do
                        local v = U.keyValue(item, k)
                        if v ~= 0 then values[k], any = v, true end
                    end
                    if any then keys[slot] = values end
                    if slot == 16 and item.invType == "2HWEAPON" then th = true end
                else
                    slots[slot] = m.slots and m.slots[slot]
                    if spec2 then slots2[slot] = m.slots2[slot] end
                    keys[slot] = m.keys and m.keys[slot]
                    if slot == 16 then th = m.th end
                end
            end
        end
    end
    live.slots, live.slots2, live.keys, live.worn, live.th = slots, slots2, keys, worn, th
    return live
end

local ARMOR_NAMES = { [1] = "cloth", [2] = "leather", [3] = "mail", [4] = "plate" }
local LABELS = { upgrade = "upgrade", maybe = "possible upgrade", empty = "empty slot" }

--- What the item is to you, as a row's right side: "upgrade",
--- "possible upgrade (cloth)", "empty slot", "not an upgrade",
--- "needs lvl 30", "can't use"; nil when you wear it.
function U.forYou(item, itemID, m, rules)
    if itemID and contains(m.worn, itemID) then return nil end
    local v = U.judge(item, m, rules, nil)
    if not v then
        if U.usableAt(item, m, rules, nil) then return "not an upgrade" end
        if item.reqLevel and item.reqLevel > m.level + rules.levelsAhead then
            -- Usable once you're old enough?
            local older = {}
            for k, val in pairs(m) do older[k] = val end
            older.level = item.reqLevel
            if U.usableAt(item, older, rules, nil) then return "needs lvl " .. item.reqLevel end
        end
        return "can't use"
    end
    local text = LABELS[v.kind] or "possible upgrade"
    -- No percent: the weights are a best guess, not precise enough to quote;
    -- the game's compare tooltip shows the actual stat changes.
    local notes = {}
    if v.second then
        local spec = rules.specs[v.spec]
        if spec then table.insert(notes, spec.name) end
    end
    if v.off and ARMOR_NAMES[v.off] then table.insert(notes, ARMOR_NAMES[v.off]) end
    if v.at then table.insert(notes, "lvl " .. v.at) end
    if #notes > 0 then text = text .. " (" .. table.concat(notes, ", ") .. ")" end
    return text
end

--- The item you have equipped in an inventory slot: id, item (readItem),
--- and true when it can't be read on this client at all (no GetItemStats, no
--- tooltip data: the site's score stands, rather than a stat-less item).
local function readEquipped(slot)
    local link = GetInventoryItemLink and GetInventoryItemLink("player", slot)
    local id = link and tonumber(link:match("item:(%d+)"))
    if not id then return nil end
    local data = C_TooltipInfo and C_TooltipInfo.GetInventoryItem and C_TooltipInfo.GetInventoryItem("player", slot)
    local hasStats = (C_Item and C_Item.GetItemStats) or GetItemStats
    if not hasStats and not (data and data.lines) then return id, nil, true end
    return id, U.readItem(link, U.tooltipLines(nil, data))
end

-- Your live profile, until your gear or level changes (or an item loads).
local liveCache
local watcher = CreateFrame and CreateFrame("Frame")
if watcher and watcher.RegisterEvent then
    for _, event in ipairs({ "PLAYER_EQUIPMENT_CHANGED", "PLAYER_LEVEL_UP", "GET_ITEM_INFO_RECEIVED" }) do
        pcall(watcher.RegisterEvent, watcher, event)
    end
    watcher:SetScript("OnEvent", function() liveCache = nil end)
end
function U.forgetLive() liveCache = nil end

-- ---- The tooltip rows ---------------------------------------------------------------

local function upgradeData()
    local data = GuildieData and GuildieData.upgrades
    if type(data) ~= "table" or data.version ~= 1 or type(data.rules) ~= "table" then return nil end
    return data
end

--- Your row, first under the Guildie header: { left = "You", right =
--- "upgrade" }, for the character you're on (GuildieData.upgrades.mine,
--- addon 0.19.0), or nil. Also for items that can't be traded: it's yours.
--- `color(name, classId)` colors a name.
function U.mineRow(item, itemID, color)
    local data = upgradeData()
    local me = UnitName and UnitName("player")
    if not data or not item or not me or type(data.mine) ~= "table" then return nil end
    local s = GuildieDB and GuildieDB.settings
    if s and s.showForYou == false then return nil end
    local m
    for _, c in ipairs(data.mine) do
        if c.name == me then m = c end
    end
    if not m then return nil end
    local live
    if liveCache and liveCache.member == m then
        live = liveCache.live
    else
        local level = UnitLevel and UnitLevel("player")
        local complete = true
        live = U.liveMember(m, data.rules, (level and level > 0) and level or nil, function(slot)
            local id, read, never = readEquipped(slot)
            if id and not read and not never then complete = false end
            return id, read
        end)
        -- Kept only once every worn item has loaded (else built again next time).
        if complete then liveCache = { member = m, live = live } end
    end
    local right = U.forYou(item, itemID, live, data.rules)
    if not right then return nil end
    return { left = color("You", m.classId), right = right }
end

--- Rows under the tooltip's Guildie header, one per person, upgrades first:
--- { left = "Brisket", right = "upgrade (Feral)" }, { left = "Pip", right =
--- "possible upgrade (Str/Int/Agi)" }, { left = "Miller", right = "possible upgrade (lvl 24)" },
--- { left = "Todd", right = "possible upgrade (Enhancement, cloth)" }, { left = "Skurg",
--- right = "empty slot (Arms)" }, or nil. `color(name, classId)` colors a name.
function U.lines(item, itemID, color)
    local data = upgradeData()
    if not data or not item or item.soulbound then return nil end
    local skip = {}
    for _, mine in ipairs(GuildieData.mine or {}) do skip[mine] = true end
    local me = UnitName and UnitName("player")
    if me then skip[me] = true end
    local now = (GetServerTime and GetServerTime()) or time()
    local picks = U.suggest(item, data.members, data.rules, { now = now, skip = skip, itemID = itemID, max = 3 })
    if #picks == 0 then return nil end
    local LABELS = { upgrade = "upgrade", maybe = "possible upgrade", empty = "empty slot" }
    local ARMOR_NAMES = { [1] = "cloth", [2] = "leather", [3] = "mail", [4] = "plate" }
    local rows = {}
    for _, p in ipairs(picks) do
        local v = p.verdict
        local spec = data.rules.specs[v.spec]
        -- "(Feral)", "(lvl 24)", "(Restoration, lvl 24)" when it's for their second
        -- spec, "(Enhancement, cloth)" for an armor type they don't want.
        local notes = {}
        if spec and (v.second or not v.at) then table.insert(notes, spec.name) end
        if v.off and ARMOR_NAMES[v.off] then table.insert(notes, ARMOR_NAMES[v.off]) end
        if v.at then table.insert(notes, "lvl " .. v.at) end
        local right = (LABELS[v.kind] or "possible upgrade") .. (#notes > 0 and (" (" .. table.concat(notes, ", ") .. ")") or "")
        -- Already in order (suggest): upgrades, then possible upgrades.
        table.insert(rows, { left = color(p.member.name, p.member.classId), right = right })
    end
    return rows
end

--- The tooltip's text lines: from tooltip data (modern clients), else its font strings.
function U.tooltipLines(tooltip, data)
    local lines = {}
    if data and data.lines then
        for _, line in ipairs(data.lines) do
            if line.args and line.leftText == nil and TooltipUtil and TooltipUtil.SurfaceArgs then
                TooltipUtil.SurfaceArgs(line)
            end
            table.insert(lines, line.leftText or "")
        end
        return lines
    end
    local name = tooltip and tooltip.GetName and tooltip:GetName()
    if not name or not tooltip.NumLines then return lines end
    for i = 1, tooltip:NumLines() do
        local left = _G[name .. "TextLeft" .. i]
        table.insert(lines, left and left:GetText() or "")
    end
    return lines
end
