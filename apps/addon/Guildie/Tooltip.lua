-- Adds lines to item tooltips: guild requests for this item ("Todd is
-- requesting 20"), guildmates whose known recipes use it (reagents), and
-- guildmates it might be a gear upgrade for (Upgrades.lua).
-- Suggestions, not certainties: knowing a recipe doesn't mean they're still
-- making it. Data comes from GuildieData.lua, which the helper downloads.

local ADDON, ns = ...

local GOLD = "|cffd9b45a"
local MAX_NAMES = 3

local function isMine(name)
    for _, mine in ipairs(GuildieData and GuildieData.mine or {}) do
        if mine == name then return true end
    end
    return name == UnitName("player")
end

-- Class colors as the game shows them; ours (from guildie.club) as a fallback.
local FALLBACK_COLORS = {
    [1] = "ffc69b6d", [2] = "fff48cba", [3] = "ffaad372", [4] = "fffff468", [5] = "ffffffff",
    [7] = "ff0070dd", [8] = "ff3fc7eb", [9] = "ff8788ee", [11] = "ffff7c0a",
}

local function classColored(name, classId)
    local color
    local info = classId and C_CreatureInfo and C_CreatureInfo.GetClassInfo and C_CreatureInfo.GetClassInfo(classId)
    local classColor = info and RAID_CLASS_COLORS and RAID_CLASS_COLORS[info.classFile]
    if classColor and classColor.colorStr then color = classColor.colorStr end
    color = color or (classId and FALLBACK_COLORS[classId])
    return color and ("|c" .. color .. name .. "|r") or name
end

local function suggestion(itemID)
    local entry = GuildieData and GuildieData.reagents and GuildieData.reagents[itemID]
    if not entry then return nil end
    local names, extra = {}, 0
    for _, user in ipairs(entry.users or {}) do
        if not isMine(user.name) then
            if #names < MAX_NAMES then
                table.insert(names, string.format("%s (%s)", classColored(user.name, user.classId), user.profession))
            else
                extra = extra + 1
            end
        end
    end
    if #names == 0 then return nil end
    local text = table.concat(names, ", ")
    if extra > 0 then text = text .. string.format(" +%d", extra) end
    return GOLD .. "Guildie|r might want this: " .. text
end
ns.reagentSuggestion = suggestion

--- "Guildie: Todd is requesting 20, claimed by Miller; you want this
--- crafted", from the guild's open requests (GuildieData.requests, addon
--- 0.8.0), or nil.
local function requestLine(itemID)
    local list = GuildieData and type(GuildieData.requests) == "table" and GuildieData.requests[itemID]
    if type(list) ~= "table" or #list == 0 then return nil end
    local parts = {}
    for _, r in ipairs(list) do
        if type(r) == "table" and r.name then
            local mine = isMine(r.name)
            local who = mine and "you" or classColored(r.name, r.classId)
            local text
            if r.kind == "craft" then
                text = who .. (mine and " want" or " wants") .. " this crafted"
                if (r.quantity or 1) > 1 then text = text .. string.format(" (%d)", r.quantity) end
            else
                text = who .. (mine and " are" or " is") .. string.format(" requesting %d", r.quantity or 1)
            end
            if type(r.claimedBy) == "table" and r.claimedBy.name then
                text = text .. ", claimed by " .. classColored(r.claimedBy.name, r.claimedBy.classId)
            end
            table.insert(parts, text)
        end
    end
    if #parts == 0 then return nil end
    local text = table.concat(parts, "; ")
    -- "you are requesting" reads oddly first in the line: capitalize.
    text = text:gsub("^you", "You")
    return GOLD .. "Guildie|r: " .. text
end
ns.requestLine = requestLine

--- The gear-upgrade line for the item in this tooltip, if any.
local function upgradeLine(tooltip, itemID, data)
    if not ns.upgrades or not tooltip.GetItem then return nil end
    local _, link = tooltip:GetItem()
    local item = ns.upgrades.readItem(link, ns.upgrades.tooltipLines(tooltip, data))
    return ns.upgrades.line(item, itemID, classColored)
end
ns.upgradeLine = upgradeLine

local function addTo(tooltip, itemID, data)
    if not itemID then return end
    -- Not our own hidden tooltip, which reads worn gear (Capture.lua).
    if tooltip.GetName and tooltip:GetName() == "GuildieScanTooltip" then return end
    local added = false
    local request = requestLine(itemID)
    if request then
        tooltip:AddLine(request, 1, 1, 1, true)
        added = true
    end
    local line = suggestion(itemID)
    if line then
        tooltip:AddLine(line, 1, 1, 1, true)
        added = true
    end
    local ok, upgrade = pcall(upgradeLine, tooltip, itemID, data)
    if ok and upgrade then
        tooltip:AddLine(upgrade, 1, 1, 1, true)
        added = true
    end
    if added then tooltip:Show() end
end
ns.addToTooltip = addTo

if TooltipDataProcessor and TooltipDataProcessor.AddTooltipPostCall and Enum and Enum.TooltipDataType then
    -- Modern client (WoW: Forever runs on it).
    TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Item, function(tooltip, data)
        if data and data.id then addTo(tooltip, data.id, data) end
    end)
else
    -- Older clients.
    local function onSetItem(tooltip)
        local _, link = tooltip:GetItem()
        local id = link and tonumber(link:match("item:(%d+)"))
        addTo(tooltip, id)
    end
    GameTooltip:HookScript("OnTooltipSetItem", onSetItem)
    ItemRefTooltip:HookScript("OnTooltipSetItem", onSetItem)
end
