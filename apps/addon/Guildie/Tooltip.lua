-- Adds a Guildie block to item tooltips: guild requests for this item ("Todd
-- requesting 20"), guildmates whose known recipes use it (reagents), and
-- guildmates it might be a gear upgrade for (Upgrades.lua).
-- Suggestions, not certainties: knowing a recipe doesn't mean they're still
-- making it. Data comes from GuildieData.lua, which the helper downloads.

local ADDON, ns = ...

-- The site sends at most 8 per reagent (apps/web/convex/helper.ts); show them all.
local MAX_NAMES = 8

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

--- One row per guildmate whose known recipes use it, with their professions
--- merged: { left = "Brenna", right = "might want (Tailoring)" }, then
--- "+2 more" past MAX_NAMES people.
local function reagentRows(itemID)
    local entry = GuildieData and GuildieData.reagents and GuildieData.reagents[itemID]
    if not entry then return {} end
    local rows, byName, extra = {}, {}, 0
    for _, user in ipairs(entry.users or {}) do
        if not isMine(user.name) then
            local row = byName[user.name]
            if row then
                table.insert(row.professions, user.profession)
            elseif #rows < MAX_NAMES then
                row = { left = classColored(user.name, user.classId), professions = { user.profession } }
                byName[user.name] = row
                table.insert(rows, row)
            elseif not byName[user.name .. "+"] then
                byName[user.name .. "+"] = true
                extra = extra + 1
            end
        end
    end
    for _, row in ipairs(rows) do
        row.right = "might want (" .. table.concat(row.professions, ", ") .. ")"
        row.professions = nil
    end
    if extra > 0 then table.insert(rows, { left = string.format("+%d more", extra) }) end
    return rows
end
ns.reagentRows = reagentRows

--- One two-column row per open request for this item (GuildieData.requests,
--- addon 0.8.0): { left = "Todd", right = "requesting 20, claimed by Miller" }.
local function requestRows(itemID)
    local list = GuildieData and type(GuildieData.requests) == "table" and GuildieData.requests[itemID]
    if type(list) ~= "table" then return {} end
    local rows = {}
    for _, r in ipairs(list) do
        if type(r) == "table" and r.name then
            local mine = isMine(r.name)
            local right
            if r.kind == "craft" then
                right = mine and "want it crafted" or "wants it crafted"
                if (r.quantity or 1) > 1 then right = right .. string.format(" (%d)", r.quantity) end
            else
                right = string.format("requesting %d", r.quantity or 1)
            end
            if type(r.claimedBy) == "table" and r.claimedBy.name then
                right = right .. ", claimed by " .. classColored(r.claimedBy.name, r.claimedBy.classId)
            end
            table.insert(rows, { left = mine and "You" or classColored(r.name, r.classId), right = right })
        end
    end
    return rows
end
ns.requestRows = requestRows

--- The gear-upgrade rows for the item in this tooltip, if any.
local function upgradeRows(tooltip, itemID, data)
    if not ns.upgrades or not tooltip.GetItem then return nil end
    local _, link = tooltip:GetItem()
    local item = ns.upgrades.readItem(link, ns.upgrades.tooltipLines(tooltip, data))
    return ns.upgrades.lines(item, itemID, classColored)
end

--- Why there's nothing to say, for the "Say why tooltips have nothing"
--- setting (on by default): no guild data yet, it can't be traded, or
--- nobody needs it.
local function emptyReason(binding)
    if not GuildieData then return "No guild data yet (needs the Guildie app)" end
    if binding then return binding .. ", can't be traded" end
    return "No guildmates need this"
end
ns.emptyReason = emptyReason

local function explainEmpty()
    local s = GuildieDB and GuildieDB.settings
    return not s or s.sayWhyEmpty ~= false
end

--- Everything Guildie has to say about this item, as rows (no header).
local function rowsFor(tooltip, itemID, data)
    local rows = requestRows(itemID)
    -- Guildmates' recipes use it, but nobody can hand over a bound one.
    local binding = ns.upgrades and ns.upgrades.binding(ns.upgrades.tooltipLines(tooltip, data))
    local bound = binding ~= nil
    if not bound then
        for _, row in ipairs(reagentRows(itemID)) do table.insert(rows, row) end
    end
    local ok, upgrades = pcall(upgradeRows, tooltip, itemID, data)
    if ok and upgrades then
        for _, row in ipairs(upgrades) do table.insert(rows, row) end
    end
    if #rows == 0 and explainEmpty() then table.insert(rows, { left = emptyReason(binding) }) end
    return rows
end

-- Our block, set apart from the item's own lines: a blank line, a gold
-- "Guildie" header with the addon's icon, then one indented row per person:
-- their class-colored name on the left, what Guildie knows in muted grey on
-- the right. One short row each, so nothing wraps.
local HEADER = "|TInterface\\AddOns\\Guildie\\icon:0|t Guildie"
local HEADER_COLOR = { 0.85, 0.71, 0.35 }
local MUTED = { 0.66, 0.66, 0.66 }
local INDENT = "   "
ns.TOOLTIP_HEADER = HEADER

local function addTo(tooltip, itemID, data)
    if not itemID then return end
    -- Not our own hidden tooltip, which reads worn gear (Capture.lua).
    if tooltip.GetName and tooltip:GetName() == "GuildieScanTooltip" then return end
    local rows = rowsFor(tooltip, itemID, data)
    if #rows == 0 then return end
    tooltip:AddLine(" ")
    tooltip:AddLine(HEADER, HEADER_COLOR[1], HEADER_COLOR[2], HEADER_COLOR[3])
    local m = MUTED
    for _, row in ipairs(rows) do
        if row.right and tooltip.AddDoubleLine then
            tooltip:AddDoubleLine(INDENT .. row.left, row.right, 1, 1, 1, m[1], m[2], m[3])
        elseif row.right then
            tooltip:AddLine(INDENT .. row.left .. " " .. row.right, m[1], m[2], m[3], true)
        else
            tooltip:AddLine(INDENT .. row.left, m[1], m[2], m[3], true)
        end
    end
    tooltip:Show()
end
ns.addToTooltip = addTo

-- Hooked at PLAYER_LOGIN, once every addon has loaded: tooltip hooks run
-- in the order they were added, so ours comes after other addons' lines
-- (an "Item Level" line, say) and the Guildie block ends the tooltip.
local function hookTooltips()
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
end

if IsLoggedIn and IsLoggedIn() then
    hookTooltips()
else
    local login = CreateFrame("Frame")
    login:RegisterEvent("PLAYER_LOGIN")
    login:SetScript("OnEvent", function(self)
        self:UnregisterEvent("PLAYER_LOGIN")
        hookTooltips()
    end)
end
