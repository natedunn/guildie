-- "How out of date is this character on Guildie?": what the game shows now
-- (the last read, ns.current()) against what Guildie shows
-- (GuildieData.characters, written by the Guildie app from guildie.club and
-- loaded at login and /reload). Pure functions over plain tables, so the
-- window, the minimap tooltip and the tests share them.

local ADDON, ns = ...

local S = {}
ns.status = S

-- Shirt and tabard: cosmetic, and Blizzard's profile may leave them out,
-- which would read as a change that never goes away.
local IGNORED_SLOTS = { [4] = true, [19] = true }

local function plural(n, one, many)
    return string.format("%d %s", n, n == 1 and one or (many or one .. "s"))
end
S.plural = plural

--- Blizzard's character id: the hex number at the end of the GUID.
function S.idFromGuid(guid)
    local hex = type(guid) == "string" and guid:match("^Player%-%d+%-(%x+)$")
    return hex and tonumber(hex, 16) or nil
end

--- Guildie's entry for this character: by Blizzard id first, then by name.
function S.find(data, guid, name)
    local characters = type(data) == "table" and data.characters
    if type(characters) ~= "table" then return nil end
    local id = S.idFromGuid(guid)
    if id then
        for _, entry in pairs(characters) do
            if type(entry) == "table" and entry.id == id then return entry end
        end
    end
    return name and characters[name] or nil
end

--- "id:rank,..." sorted by id: the same string the site sends (addonView.ts).
function S.talentRanks(talents)
    local list = {}
    for _, t in ipairs(talents or {}) do table.insert(list, t) end
    table.sort(list, function(a, b) return a.id < b.id end)
    local parts = {}
    for _, t in ipairs(list) do table.insert(parts, t.id .. ":" .. t.rank) end
    return table.concat(parts, ",")
end

local function inventoryKey(items)
    local parts = {}
    for _, item in ipairs(items or {}) do parts[#parts + 1] = item.id .. ":" .. item.count end
    table.sort(parts)
    return table.concat(parts, ",")
end
--- `idsOnly`: Guildie shows Blizzard's quest list (ids, no progress), so
--- only which quests are in the log can be compared.
local function questKey(quests, idsOnly)
    local parts = {}
    for _, q in ipairs(quests or {}) do
        local value = tostring(q.id)
        if not idsOnly then
            value = value .. ":" .. tostring(q.complete == true) .. ":" .. tostring(q.failed == true)
            for _, o in ipairs(q.objectives or {}) do value = value .. ":" .. tostring(o.done == true) .. ":" .. (o.text or "") end
        end
        parts[#parts + 1] = value
    end
    table.sort(parts)
    return table.concat(parts, "\n")
end
local function missing(list, known, getID)
    local seen, count = {}, 0
    for _, id in ipairs(known or {}) do seen[id] = true end
    for _, value in ipairs(list or {}) do
        local id = getID and getID(value) or value
        if not seen[id] then count = count + 1 end
    end
    return count
end

--- What's different in game, as short lines. `me`: a saved character
--- (GuildieDB.characters[guid]); `entry`: Guildie's.
function S.compare(me, entry)
    local changes = {}
    local function add(text) table.insert(changes, text) end

    -- Level: only up (levels never drop; Guildie keeps the higher one).
    if me.level and entry.level and me.level > entry.level then
        add(string.format("Level %d (Guildie has %d)", me.level, entry.level))
    end

    -- Talents: an empty read is more likely the game not answering than a
    -- reset, so it says nothing.
    local talents = entry.talents or {}
    local points = ns.points(me)
    if points > 0 then
        local total = talents.total or 0
        if points > total then
            add(string.format("Talents: %s", plural(points - total, "more point")))
        elseif points < total or (talents.ranks and talents.ranks ~= S.talentRanks(me.talents)) then
            add("Talents changed (respec)")
        end
    end

    -- Gear: slots whose item differs.
    if me.equipment and me.equipment.items then
        local worn, names = {}, {}
        for _, item in ipairs(me.equipment.items) do
            worn[item.slot] = item.id
            names[item.slot] = item.name
        end
        local gear = entry.gear or {}
        local changed, last = 0, nil
        for slot = 1, 19 do
            if not IGNORED_SLOTS[slot] and (worn[slot] or 0) ~= (gear[slot] or 0) then
                changed = changed + 1
                last = slot
            end
        end
        if changed == 1 and names[last] then
            add("New gear: " .. names[last])
        elseif changed > 0 then
            add(plural(changed, "gear change"))
        end
    end

    -- Professions: skill gained, learned, unlearned (only names the site
    -- knows; it drops the rest, like Riding).
    local theirs = entry.professions or {}
    if me.professions and me.professions.skills then
        local mine = {}
        for _, skill in ipairs(me.professions.skills) do
            if ns.PROFESSIONS[skill.name] then
                mine[skill.name] = true
                local known = theirs[skill.name]
                if not known then
                    add(string.format("New profession: %s %d", skill.name, skill.rank or 0))
                elseif known.skill and (skill.rank or 0) > known.skill then
                    add(string.format("%s %d (Guildie has %d)", skill.name, skill.rank, known.skill))
                end
            end
        end
        local gone = {}
        for name in pairs(theirs) do
            if ns.PROFESSIONS[name] and not mine[name] then table.insert(gone, name) end
        end
        table.sort(gone)
        for _, name in ipairs(gone) do add(name .. " unlearned") end
    end

    -- Recipes: only professions whose window was opened (that's when the game
    -- lists them); fewer than Guildie's is a filtered window, not news.
    for _, section in ipairs(me.recipes or {}) do
        local known = theirs[section.profession]
        local new = #section.known - ((known and known.recipes) or 0)
        if new > 0 then add(string.format("%d new %s %s", new, section.profession, new == 1 and "recipe" or "recipes")) end
    end
    local details = entry.details or {}
    for _, part in ipairs({"bags", "bank"}) do
        local mine = me.inventory and me.inventory[part]
        if mine and details[part] and inventoryKey(mine.items) ~= inventoryKey(details[part]) then
            add(part == "bags" and "Bag contents changed" or "Bank contents changed")
        end
    end
    local idsOnly = details.questsFrom == "blizzard"
    if me.quests and details.quests and questKey(me.quests.list, idsOnly) ~= questKey(details.quests, idsOnly) then
        add("Quest log changed")
    end
    local completions = details.completedQuestIds and missing(me.completedQuestIds, details.completedQuestIds) or 0
    if completions > 0 then add(plural(completions, "quest completion") .. " awaiting confirmation") end
    local deliveries = details.deliveryIds and missing(me.deliveries, details.deliveryIds, function(e) return e.id end) or 0
    if deliveries > 0 then add(plural(deliveries, "delivery report") .. " awaiting confirmation") end
    return changes
end

--- Where this character stands: { state, changes, entry }. States: "nodata"
--- (no GuildieData yet), "unknown" (Guildie has no entry for it), "current",
--- "behind" (changes listed), "unverified" (old or incomplete comparison).
function S.check(me, data, guid, name)
    if type(data) ~= "table" or not data.generatedAt then return { state = "nodata", changes = {} } end
    local entry = S.find(data, guid, name)
    if not entry then return { state = "unknown", changes = {} } end
    if not me then return { state = "unverified", changes = {}, entry = entry } end
    local changes = S.compare(me, entry)
    local details = entry.details or {}
    local incomplete = (me.inventory and ((me.inventory.bags and not details.bags) or (me.inventory.bank and not details.bank)))
        or (me.quests and not details.quests) or (me.completedQuestIds and not details.completedQuestIds)
        or (me.deliveries and #me.deliveries > 0 and not details.deliveryIds)
    local stale = (GetServerTime() - data.generatedAt / 1000) > 15 * 60 or incomplete
    return { state = #changes > 0 and "behind" or (stale and "unverified" or "current"), changes = changes, entry = entry }
end

--- "just now", "5 min ago", "3 hr ago", "2 days ago". Both in seconds.
function S.ago(at, now)
    local s = math.max(0, now - at)
    if s < 60 then return "just now" end
    if s < 3600 then return string.format("%d min ago", math.floor(s / 60)) end
    if s < 48 * 3600 then return string.format("%d hr ago", math.floor(s / 3600)) end
    return plural(math.floor(s / 86400), "day") .. " ago"
end

--- "Last synced 5 min ago, from the game", or nil.
function S.syncedText(entry, now)
    local synced = entry and entry.synced
    if type(synced) ~= "table" or not synced.at then return nil end
    return string.format("Last synced %s, from %s", S.ago(math.floor(synced.at / 1000), now),
        synced.from == "game" and "the game" or "Blizzard")
end

--- One line for the minimap button's tooltip.
function S.headline(result)
    if result.state == "behind" then
        return plural(#result.changes, "change") .. " since the last Guildie update"
    elseif result.state == "current" then
        return "Matches the last Guildie update"
    elseif result.state == "unverified" then
        return "Sync status needs verification"
    elseif result.state == "unknown" then
        return "Guildie doesn't know this character yet"
    end
    return "No data from the Guildie app yet"
end


function S.warning(result, health)
    if not health.enabled then return nil end
    if health.error then return health.error end
    if health.editing then return "Pixel export is paused in Edit Mode. Close Edit Mode to resume." end
    if not health.hasData then return "No character data is available to export yet. Reload after the character has loaded." end
    if health.stalled then return "Pixel output has stopped updating. Check the square and use reload/logout sync if needed." end
    if health.cycleSeconds and health.cycleSeconds > 30 then
        return string.format("A full data cycle takes about %d seconds. Keep the entire square uncovered; check the app for incomplete captures.", health.cycleSeconds)
    end
    if result.state == "behind" then return "Local data differs from the last server update. Live receipt cannot be verified here; check the app." end
    if result.state ~= "current" then return "No recent matching server data is available. Check the app, then reload to refresh this comparison." end
end
