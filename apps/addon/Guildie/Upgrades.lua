-- Gear-upgrade suggestions on item tooltips: which guildmates the hovered
-- item might help (rows under Guildie: "Brisket | upgrade (Feral)", "Pip | trade-off (Str/Int/Agi)",
-- "Miller | maybe (lvl 24)").
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

--- score, stat part, raw stat total (see scoreItem in upgrades.ts).
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
    local belowBest = pref == nil and isBodyArmor(item) and level >= rules.preferBestFrom
        and (item.subclass or 0) < bestArmor(cls, level)
    if pref == false or belowBest then
        score = score * rules.preferBestFactor
        stat = stat * rules.preferBestFactor
    elseif pref ~= nil and pref > 0 then
        -- Further down their list: a little less, never below another type.
        local factor = 1 - (rules.preferStep or 0) * pref
        if factor < rules.preferBestFactor then factor = rules.preferBestFactor end
        score = score * factor
        stat = stat * factor
    end
    return score, stat, total
end

function U.suits(score, stat, total, rules)
    if total > 0 then return stat >= rules.minFit * total end
    return score > 0
end

local function contains(list, value)
    for _, v in ipairs(list or {}) do
        if v == value then return true end
    end
    return false
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
        local score, stat, total = U.scoreItem(item, spec.w, m.level, cls, rules, offHand, m)
        if U.suits(score, stat, total, rules) then
            local base, against = U.baseline(item, slots, m.th, offHand)
            local gain = (score - base) / math.max(base, rules.minBase)
            if not best or gain > best.gain then best = { gain = gain, against = against } end
        end
    end
    return best
end

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

local KIND_RANK = { upgrade = 0, tradeoff = 1, maybe = 2 }

--- { kind = "upgrade"|"tradeoff"|"maybe", gain, spec, at?, second?, against } or nil.
function U.judge(item, m, rules, itemID)
    -- Removed by the player on the site (optional: older GuildieData.lua files lack it).
    if itemID and contains(m.dismissed, itemID) then return nil end
    local at = U.usableAt(item, m, rules, itemID)
    if not at or excluded(item, m) then return nil end
    local later = at > m.level and at or nil
    local main = gainFor(item, m, m.spec, m.slots or {}, rules)
    if main and main.gain >= rules.maybe then
        local kind = "maybe"
        if main.gain >= rules.upgrade and not later then
            local spec = rules.specs[m.spec]
            kind = loses(item, m, spec and spec.stats, main.against) and "tradeoff" or "upgrade"
        end
        return { kind = kind, gain = main.gain, spec = m.spec, against = main.against, at = later }
    end
    if m.spec2 and m.slots2 then
        local second = gainFor(item, m, m.spec2, m.slots2, rules)
        if second and second.gain >= rules.maybe then
            return { kind = "maybe", gain = second.gain, spec = m.spec2, second = true, against = second.against, at = later }
        end
    end
    return nil
end

--- Who the item would help, upgrades first, then trade-offs, then by gain: { { member, verdict }, ... }.
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

-- ---- The tooltip rows ---------------------------------------------------------------

local function upgradeData()
    local data = GuildieData and GuildieData.upgrades
    if type(data) ~= "table" or data.version ~= 1 or type(data.rules) ~= "table" then return nil end
    return data
end

--- Rows under the tooltip's Guildie header, one per person, upgrades first:
--- { left = "Brisket", right = "upgrade (Feral)" }, { left = "Pip", right =
--- "trade-off (Str/Int/Agi)" }, { left = "Miller", right = "maybe (lvl 24)" },
--- or nil. `color(name, classId)` colors a name.
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
    local LABELS = { upgrade = "upgrade", tradeoff = "trade-off", maybe = "maybe" }
    local rows = {}
    for _, p in ipairs(picks) do
        local v = p.verdict
        local spec = data.rules.specs[v.spec]
        -- "(Feral)", "(lvl 24)", or "(Restoration, lvl 24)" when it's for their second spec.
        local notes = {}
        if spec and (v.second or not v.at) then table.insert(notes, spec.name) end
        if v.at then table.insert(notes, "lvl " .. v.at) end
        local right = (LABELS[v.kind] or "maybe") .. (#notes > 0 and (" (" .. table.concat(notes, ", ") .. ")") or "")
        -- Already in order (suggest): upgrades, trade-offs, maybes.
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
