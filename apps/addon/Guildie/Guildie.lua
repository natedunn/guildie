-- guildie: saves this character as the game sees it (level, guild, gear with
-- its tooltips, professions, known recipes, talents, bags and bank, the quest
-- log) so the Guildie desktop
-- app can upload it to guildie.club. Addons can't use the
-- internet; the game writes GuildieDB to disk on /reload and on logout, and the
-- helper watches that file. Source: https://github.com/natedunn/guildie
--
-- Talents are read the way the WowSims exporter reads WoW: Forever's (MIT,
-- https://github.com/wowsims/exporter): C_ClassTalents / C_Traits. Each talent
-- is sent as its TraitDefinition ID, which is the same ID Blizzard's web API
-- uses, so guildie.club knows its class and tree.

local ADDON, ns = ...
-- The payload's format. 2 added guild, XP, gear, professions and recipes;
-- 3 (0.8.0) bags and the last bank read; 4 (0.10.0) the quest log. The site
-- accepts all four.
local VERSION = 4

GuildieDB = GuildieDB or {}

local function activeConfigID()
    if C_ClassTalents and C_ClassTalents.GetActiveConfigID then
        return C_ClassTalents.GetActiveConfigID()
    end
    if C_SpecializationInfo and C_SpecializationInfo.GetCombatConfigIDForSpecGroup then
        local group = C_SpecializationInfo.GetActiveSpecGroup and C_SpecializationInfo.GetActiveSpecGroup() or 1
        return C_SpecializationInfo.GetCombatConfigIDForSpecGroup(group)
    end
end

local function talentName(configID, definitionID)
    local def = C_Traits.GetDefinitionInfo and C_Traits.GetDefinitionInfo(definitionID)
    if not def then return nil end
    if def.overrideName and def.overrideName ~= "" then return def.overrideName end
    local spellID = def.spellID or def.overriddenSpellID
    if not spellID then return nil end
    if C_Spell and C_Spell.GetSpellName then return C_Spell.GetSpellName(spellID) end
    if GetSpellInfo then return (GetSpellInfo(spellID)) end
end

--- Talents with points: { { id = definitionID, rank = n, name = "..." }, ... }, or nil if unreadable.
local function readTalents()
    if not C_Traits then return nil end
    local configID = activeConfigID()
    if not configID then return nil end
    local config = C_Traits.GetConfigInfo(configID)
    if not config or not config.treeIDs then return nil end
    local talents = {}
    for _, treeID in ipairs(config.treeIDs) do
        for _, nodeID in ipairs(C_Traits.GetTreeNodes(treeID) or {}) do
            local node = C_Traits.GetNodeInfo(configID, nodeID)
            local rank = node and (node.currentRank or node.ranksPurchased) or 0
            if rank > 0 and node.activeEntry then
                local entry = C_Traits.GetEntryInfo(configID, node.activeEntry.entryID)
                if entry and entry.definitionID then
                    table.insert(talents, {
                        id = entry.definitionID,
                        rank = rank,
                        name = talentName(configID, entry.definitionID),
                    })
                end
            end
        end
    end
    return talents
end

-- Minimal JSON encoder: strings, numbers, booleans, arrays and string-keyed tables.
local function encode(value)
    local t = type(value)
    if t == "string" then
        return '"' .. value:gsub('[%c"\\]', function(c)
            local map = { ['"'] = '\\"', ["\\"] = "\\\\", ["\n"] = "\\n", ["\r"] = "\\r", ["\t"] = "\\t" }
            return map[c] or string.format("\\u%04x", c:byte())
        end) .. '"'
    elseif t == "number" then
        -- JSON has no NaN or infinity.
        if value ~= value or value == math.huge or value == -math.huge then return "null" end
        return tostring(value)
    elseif t == "boolean" then
        return value and "true" or "false"
    elseif t == "table" then
        local parts = {}
        if #value > 0 or next(value) == nil then
            for _, v in ipairs(value) do table.insert(parts, encode(v)) end
            return "[" .. table.concat(parts, ",") .. "]"
        end
        for k, v in pairs(value) do
            table.insert(parts, encode(tostring(k)) .. ":" .. encode(v))
        end
        return "{" .. table.concat(parts, ",") .. "}"
    end
    return "null"
end
ns.encode = encode

--- A short fingerprint of what we'd upload, to tell whether it changed.
--- Bags and bank are left out: they change all the time, and they're not
--- what "changes not on Guildie yet" is about.
local function fingerprint(character)
    local parts = { "level=" .. tostring(character.level), "guild=" .. tostring(character.guild and character.guild.name) }
    for _, t in ipairs(character.talents or {}) do table.insert(parts, "t" .. t.id .. ":" .. t.rank) end
    for _, item in ipairs(character.equipment and character.equipment.items or {}) do
        table.insert(parts, "g" .. item.slot .. ":" .. item.id .. ":" .. tostring(item.enchant) .. ":" .. tostring(item.suffix))
    end
    for _, skill in ipairs(character.professions and character.professions.skills or {}) do
        table.insert(parts, "p" .. skill.name .. ":" .. tostring(skill.rank) .. "/" .. tostring(skill.max))
    end
    for _, section in ipairs(character.recipes or {}) do
        table.insert(parts, "r" .. section.profession .. ":" .. #section.known)
    end
    for _, skill in ipairs(character.proficiencies and character.proficiencies.skills or {}) do
        table.insert(parts, "s" .. skill)
    end
    table.sort(parts)
    return table.concat(parts, ",")
end
ns.fingerprint = fingerprint

local function byName(list)
    local set = {}
    for _, entry in ipairs(list or {}) do set[entry.name] = entry end
    return set
end

--- Professions: a collapsed skill header hides what's under it, so a partial
--- read keeps the previous entries it couldn't see.
local function mergeSkills(previous, skills, complete)
    if complete or not previous then return skills end
    local seen = byName(skills)
    for _, skill in ipairs(previous.skills or {}) do
        if not seen[skill.name] then table.insert(skills, skill) end
    end
    return skills
end

--- Weapon and armor skills are never lost, so a partial read (a collapsed
--- header) adds to the last.
local function mergeNames(previous, names, complete)
    if complete or not previous then return names end
    local seen, out = {}, {}
    for _, name in ipairs(names) do seen[name] = true; table.insert(out, name) end
    for _, name in ipairs(previous.skills or {}) do
        if not seen[name] then seen[name] = true; table.insert(out, name) end
    end
    table.sort(out)
    return out
end

--- Known recipes for one profession: recipes are only ever lost with the
--- profession, so a new read adds to the last (a filter or a collapsed header
--- in the window can hide some).
local function mergeRecipes(sections, profession, known, now)
    local out, merged = {}, nil
    for _, section in ipairs(sections or {}) do
        if section.profession == profession then merged = section else table.insert(out, section) end
    end
    local list, seen = {}, {}
    for _, recipe in ipairs(known) do
        if not seen[recipe.name] then
            seen[recipe.name] = true
            table.insert(list, recipe)
        end
    end
    for _, recipe in ipairs(merged and merged.known or {}) do
        if not seen[recipe.name] then
            seen[recipe.name] = true
            table.insert(list, recipe)
        end
    end
    table.insert(out, { profession = profession, capturedAt = now, known = list })
    return out
end
ns.mergeRecipes = mergeRecipes

--- The quest log on top of `previous`: quests under a collapsed header aren't
--- listed by the game, so the last read's quests under it are kept (as far
--- as we know they're still in the log). nil when it can't be read now.
function ns.readQuestLog(previous, now)
    local ok, list, collapsed = pcall(ns.readQuests)
    if not ok or not list then return previous end
    if previous and collapsed and next(collapsed) then
        local seen = {}
        for _, q in ipairs(list) do seen[q.id] = true end
        for _, q in ipairs(previous.list or {}) do
            if q.zone and collapsed[q.zone] and not seen[q.id] then
                seen[q.id] = true
                table.insert(list, q)
            end
        end
    end
    return { capturedAt = now, list = list }
end

local function readGuild(previous)
    if IsInGuild and not IsInGuild() then return nil end
    local name, rank, rankIndex = GetGuildInfo("player")
    -- Right after login the guild can be unknown for a moment: keep the last one.
    if not name then return previous end
    return { name = name, rank = rank, rankIndex = rankIndex }
end

--- Read everything readable now and rebuild the payload. `recipes`: a
--- profession window's read, { profession, known }.
local function capture(reason, recipes)
    local guid = UnitGUID("player")
    if not guid then return end
    local now = GetServerTime()
    GuildieDB.characters = GuildieDB.characters or {}
    local previous = GuildieDB.characters[guid] or {}
    local okTalents, talents = pcall(readTalents)
    local okGear, equipment = pcall(ns.readEquipment)
    local okSkills, skills, complete = pcall(ns.readProfessions)
    local okProf, prof, profComplete = pcall(ns.readProficiencies)
    local _, classToken = UnitClass("player")
    local _, raceToken = UnitRace("player")
    local character = {
        guid = guid,
        name = UnitName("player"),
        level = UnitLevel("player"),
        xp = UnitXP and UnitXP("player") or nil,
        xpMax = UnitXPMax and UnitXPMax("player") or nil,
        classToken = classToken,
        raceToken = raceToken,
        capturedAt = now,
        guild = readGuild(previous.guild),
        -- Keep the last good read of anything that can't be read right now
        -- (with its own capturedAt, so the site knows how old it is).
        talents = (okTalents and talents) or previous.talents or {},
        equipment = previous.equipment,
        professions = previous.professions,
        recipes = previous.recipes,
        proficiencies = previous.proficiencies,
        inventory = previous.inventory,
        quests = previous.quests,
    }
    if okGear and equipment then
        equipment.capturedAt = now
        character.equipment = equipment
    end
    if okSkills and skills then
        character.professions = { capturedAt = now, skills = mergeSkills(previous.professions, skills, complete) }
    end
    if okProf and prof and #prof.skills > 0 then
        character.proficiencies = {
            capturedAt = now,
            -- The level they were read at: the site compares skills with
            -- what the class can have at that level.
            level = character.level,
            skills = mergeNames(previous.proficiencies, prof.skills, profComplete),
            dualWield = prof.dualWield,
        }
    end
    character.inventory = ns.readInventory(character.inventory, now)
    character.quests = ns.readQuestLog(character.quests, now)
    if recipes and recipes.profession and recipes.known then
        character.recipes = mergeRecipes(character.recipes, recipes.profession, recipes.known, now)
    end
    -- An unlearned profession takes its recipes with it.
    if character.recipes and character.professions then
        local has = byName(character.professions.skills)
        local kept = {}
        for _, section in ipairs(character.recipes) do
            if has[section.profession] then table.insert(kept, section) end
        end
        character.recipes = kept
    end
    GuildieDB.characters[guid] = character
    -- What the helper uploads, as-is: { version, characters = [ ... ] }.
    local list = {}
    for _, c in pairs(GuildieDB.characters) do table.insert(list, c) end
    GuildieDB.version = VERSION
    GuildieDB.payload = encode({ version = VERSION, characters = list })
    GuildieDB.lastReason = reason
    -- The game wrote GuildieDB to disk when this session's UI loaded; anything
    -- different since then reaches the helper only at the next /reload or logout.
    local fp = fingerprint(character)
    ns.loadedFingerprint = ns.loadedFingerprint or fp
    ns.dirty = fp ~= ns.loadedFingerprint
    if ns.onCapture then ns.onCapture() end
end
ns.capture = capture

--- Bags (and the bank while it's open) on top of `previous`, each with the
--- time it was read; a part that can't be read keeps its last read.
function ns.readInventory(previous, now)
    local inventory = { bags = previous and previous.bags, bank = previous and previous.bank }
    local okBags, bags = pcall(ns.readBags)
    if okBags and bags then inventory.bags = { capturedAt = now, items = bags } end
    if ns.bankOpen then
        local okBank, bank = pcall(ns.readBank)
        if okBank and bank then inventory.bank = { capturedAt = now, items = bank } end
    end
    if not inventory.bags and not inventory.bank then return nil end
    return inventory
end

--- Bags or bank changed: update the saved read only. The payload is rebuilt
--- at the next full read (at the latest on logout or /reload, right before
--- the game saves), so looting doesn't re-encode everything.
local function captureInventory()
    local guid = UnitGUID("player")
    local character = guid and GuildieDB.characters and GuildieDB.characters[guid]
    if not character then return capture("inventory") end
    character.inventory = ns.readInventory(character.inventory, GetServerTime())
end
ns.captureInventory = captureInventory

--- The quest log changed: update the saved read only (like bags; the
--- payload catches up at the next full read, at the latest on logout).
local function captureQuests()
    local guid = UnitGUID("player")
    local character = guid and GuildieDB.characters and GuildieDB.characters[guid]
    if not character then return capture("quests") end
    character.quests = ns.readQuestLog(character.quests, GetServerTime())
end
ns.captureQuests = captureQuests

--- A profession window is open: read its recipes, then save.
local function captureRecipes(which, reason)
    local ok, profession, known = pcall(ns.readRecipes, which)
    -- An empty list means the window hasn't filled in yet.
    if not ok or not profession or not known or #known == 0 then return end
    capture(reason, { profession = profession, known = known })
end
ns.captureRecipes = captureRecipes

--- What the window shows for the current character.
function ns.current()
    return GuildieDB.characters and GuildieDB.characters[UnitGUID("player")]
end

function ns.points(character)
    local points = 0
    for _, t in ipairs(character and character.talents or {}) do points = points + t.rank end
    return points
end

-- What sets off a read, and which: "all" reads the character, "trade" and
-- "craft" read the open profession window (and then the character).
local EVENTS = {
    PLAYER_ENTERING_WORLD = "all",
    TRAIT_CONFIG_UPDATED = "all",
    ACTIVE_COMBAT_CONFIG_CHANGED = "all",
    PLAYER_LEVEL_UP = "all",
    PLAYER_EQUIPMENT_CHANGED = "all",
    SKILL_LINES_CHANGED = "all",
    PLAYER_GUILD_UPDATE = "all",
    TRADE_SKILL_SHOW = "trade",
    TRADE_SKILL_UPDATE = "trade",
    TRADE_SKILL_LIST_UPDATE = "trade",
    CRAFT_SHOW = "craft",
    CRAFT_UPDATE = "craft",
    BAG_UPDATE = "inventory",
    BAG_UPDATE_DELAYED = "inventory",
    BANKFRAME_OPENED = "inventory",
    PLAYERBANKSLOTS_CHANGED = "inventory",
    PLAYERBANKBAGSLOTS_CHANGED = "inventory",
    BANKFRAME_CLOSED = "bankClosed",
    QUEST_LOG_UPDATE = "quests",
    PLAYER_LOGOUT = "all",
}

-- Events come in bursts (gear swaps, crafting); one read a second is plenty.
local pending = {}
local function run(kind, event)
    if kind == "all" then
        capture(event)
    elseif kind == "inventory" then
        captureInventory()
    elseif kind == "quests" then
        captureQuests()
    else
        captureRecipes(kind, event)
    end
end

local frame = CreateFrame("Frame")
for event in pairs(EVENTS) do
    -- Not every client has every event, and registering an unknown one errors.
    pcall(frame.RegisterEvent, frame, event)
end
frame:SetScript("OnEvent", function(_, event)
    local kind = EVENTS[event]
    -- The bank answers only while it's open: track that right away.
    if event == "BANKFRAME_OPENED" then ns.bankOpen = true end
    -- At login the quest log is empty until the game has loaded it.
    if event == "QUEST_LOG_UPDATE" then ns.questLogReady = true end
    if kind == "bankClosed" then
        ns.bankOpen = false
        return
    end
    -- PLAYER_LOGOUT (also sent on /reload) can't wait: the game saves right after.
    if event == "PLAYER_LOGOUT" or not C_Timer then
        run(kind, event)
        return
    end
    if pending[kind] then return end
    pending[kind] = true
    -- Talent and window data can lag the event a moment.
    C_Timer.After(1, function()
        pending[kind] = nil
        run(kind, event)
    end)
end)

SLASH_GUILDIE1 = "/guildie"
SlashCmdList.GUILDIE = function()
    capture("slash")
    if ns.toggleWindow then ns.toggleWindow() end
end
