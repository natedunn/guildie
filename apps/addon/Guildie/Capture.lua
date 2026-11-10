-- Reads what Guildie uploads besides talents: gear (with each item's tooltip
-- as the game shows it), professions, weapon and armor skills, and known
-- recipes. Each reader returns
-- nil when the game can't answer right now, so Guildie.lua keeps the last good
-- read (and its time) instead of uploading a hole.
--
-- Written against both the classic-era API (GetSkillLineInfo, GetTradeSkillInfo,
-- the Craft API Enchanting uses) and the modern one (GetProfessions,
-- C_TradeSkillUI, C_TooltipInfo), whichever the client has.

local ADDON, ns = ...

local SLOTS = 19 -- INVSLOT_HEAD (1) .. INVSLOT_TABARD (19)
local MAX_TOOLTIP_LINES = 40
local MAX_TEXT = 300

-- ---- Text --------------------------------------------------------------------

local function hex(r, g, b)
    if type(r) ~= "number" or type(g) ~= "number" or type(b) ~= "number" then return nil end
    -- White is the default on the site, so it isn't sent.
    if r > 0.99 and g > 0.99 and b > 0.99 then return nil end
    local function byte(x) return math.max(0, math.min(255, math.floor(x * 255 + 0.5))) end
    return string.format("#%02x%02x%02x", byte(r), byte(g), byte(b))
end

--- A tooltip line's text without the game's inline markup (colors, textures,
--- atlases), and the color it starts with, if any (set lists color names inline).
local function clean(text)
    if type(text) ~= "string" then return nil end
    local color = text:match("^|c%x%x(%x%x%x%x%x%x)")
    text = text:gsub("|c%x%x%x%x%x%x%x%x", "")
    text = text:gsub("|r", "")
    text = text:gsub("|T.-|t", "")
    text = text:gsub("|A.-|a", "")
    text = text:gsub("^%s+", "")
    text = text:gsub("%s+$", "")
    if #text > MAX_TEXT then text = text:sub(1, MAX_TEXT) end
    return text, color and ("#" .. color:lower())
end
ns.cleanText = clean

local function addLine(lines, leftText, leftRGB, rightText, rightShown)
    local left, inline = clean(leftText)
    local right = rightShown and clean(rightText) or nil
    if right == "" then right = nil end
    if (not left or left == "") and not right then return end
    if #lines >= MAX_TOOLTIP_LINES then return end
    -- The line's own color, else the inline color it starts with (set pieces).
    local color = leftRGB and hex(leftRGB[1], leftRGB[2], leftRGB[3])
    table.insert(lines, { left = left or "", right = right, color = color or inline })
end

local function rgbOf(color)
    if type(color) ~= "table" then return nil end
    if color.r then return { color.r, color.g, color.b } end
    if color.GetRGB then return { color:GetRGB() } end
end

-- ---- Gear ----------------------------------------------------------------------

local scanner

--- The item's tooltip lines after its name, as the game shows them on this character.
local function tooltipLines(slot)
    -- Modern clients hand tooltip data over without a frame.
    if C_TooltipInfo and C_TooltipInfo.GetInventoryItem then
        local data = C_TooltipInfo.GetInventoryItem("player", slot)
        if data and data.lines then
            local lines = {}
            for i, line in ipairs(data.lines) do
                if line.args and line.leftText == nil and TooltipUtil and TooltipUtil.SurfaceArgs then
                    TooltipUtil.SurfaceArgs(line)
                end
                if i > 1 then
                    addLine(lines, line.leftText, rgbOf(line.leftColor), line.rightText, line.rightText ~= nil)
                end
            end
            return lines
        end
    end
    -- Classic clients: a hidden tooltip, read line by line.
    if not scanner then
        scanner = CreateFrame("GameTooltip", "GuildieScanTooltip", nil, "GameTooltipTemplate")
    end
    scanner:SetOwner(WorldFrame, "ANCHOR_NONE")
    scanner:ClearLines()
    scanner:SetInventoryItem("player", slot)
    local lines = {}
    for i = 2, scanner:NumLines() do
        local left = _G["GuildieScanTooltipTextLeft" .. i]
        local right = _G["GuildieScanTooltipTextRight" .. i]
        if left then
            addLine(lines, left:GetText(), { left:GetTextColor() },
                right and right:GetText(), right and right:IsShown())
        end
    end
    scanner:Hide()
    return lines
end

local function itemLevelOf(link)
    if GetDetailedItemLevelInfo then
        local level = GetDetailedItemLevelInfo(link)
        if level and level > 0 then return level end
    end
    if C_Item and C_Item.GetDetailedItemLevelInfo then
        local level = C_Item.GetDetailedItemLevelInfo(link)
        if level and level > 0 then return level end
    end
    if GetItemInfo then
        local level = select(4, GetItemInfo(link))
        if level and level > 0 then return level end
    end
end

local function qualityOf(slot, link)
    local quality = GetInventoryItemQuality and GetInventoryItemQuality("player", slot)
    if quality then return quality end
    if GetItemInfo then return (select(3, GetItemInfo(link))) end
end

--- One worn item, or nil for an empty slot.
local function readSlot(slot)
    local link = GetInventoryItemLink("player", slot)
    if not link then return nil end
    -- item:id:enchant:gem1:gem2:gem3:gem4:suffix:...
    local fields = link:match("item:([%-%d:]+)")
    local parts = {}
    for n in ((fields or "") .. ":"):gmatch("(%-?%d*):") do table.insert(parts, tonumber(n) or 0) end
    local id = (GetInventoryItemID and GetInventoryItemID("player", slot)) or parts[1]
    if not id or id == 0 then return nil end
    local ok, lines = pcall(tooltipLines, slot)
    return {
        slot = slot,
        id = id,
        -- The link's text: the name as worn, random suffix included ("of the Eagle").
        name = link:match("|h%[(.-)%]|h") or (GetItemInfo and GetItemInfo(link)) or ("Item " .. id),
        quality = qualityOf(slot, link),
        itemLevel = itemLevelOf(link),
        enchant = (parts[2] and parts[2] ~= 0) and parts[2] or nil,
        suffix = (parts[7] and parts[7] ~= 0) and parts[7] or nil,
        tooltip = ok and lines or {},
    }
end

--- { averageItemLevel?, items = { ... } }; nil if the inventory can't be read yet.
function ns.readEquipment()
    if not GetInventoryItemLink then return nil end
    local items = {}
    for slot = 1, SLOTS do
        local item = readSlot(slot)
        if item then table.insert(items, item) end
    end
    -- Nothing worn at all is far more likely the inventory not being loaded
    -- yet (right after login) than a naked character: keep the last read.
    if #items == 0 then return nil end
    local average
    if GetAverageItemLevel then
        local _, equipped = GetAverageItemLevel()
        if equipped and equipped > 0 then average = math.floor(equipped * 100 + 0.5) / 100 end
    end
    return { averageItemLevel = average, items = items }
end

-- ---- Professions -----------------------------------------------------------------

-- English names, for clients without skill line IDs; anything the site doesn't
-- recognise is dropped there.
local PROFESSIONS = {
    Alchemy = true, Blacksmithing = true, Enchanting = true, Engineering = true,
    Herbalism = true, Leatherworking = true, Mining = true, Skinning = true,
    Tailoring = true, Jewelcrafting = true, Inscription = true,
    Cooking = true, ["First Aid"] = true, Fishing = true,
}
ns.PROFESSIONS = PROFESSIONS

--- { { name, id?, rank, max }, ... }, and whether the list is complete (a
--- collapsed skill header hides what's under it); nil if unreadable.
function ns.readProfessions()
    if GetProfessions and GetProfessionInfo then
        local skills = {}
        -- prof1, prof2, archaeology, fishing, cooking, first aid: nil where
        -- missing, so not ipairs.
        local indexes = { n = 6, GetProfessions() }
        for i = 1, indexes.n do
            local index = indexes[i]
            if index then
                local name, _, rank, max, _, _, skillLine = GetProfessionInfo(index)
                if name then table.insert(skills, { name = name, id = skillLine, rank = rank, max = max }) end
            end
        end
        return skills, true
    end
    if not GetNumSkillLines or not GetSkillLineInfo then return nil end
    local skills, complete = {}, true
    for i = 1, GetNumSkillLines() do
        local name, isHeader, isExpanded, rank, _, _, max, isAbandonable = GetSkillLineInfo(i)
        if isHeader then
            if not isExpanded then complete = false end
        elseif name and (PROFESSIONS[name] or isAbandonable) then
            table.insert(skills, { name = name, rank = rank or 0, max = max or 0 })
        end
    end
    return skills, complete
end

-- ---- Weapon and armor skills ---------------------------------------------------------
-- What the character has trained, as the game's skill list names them
-- (English). The site checks these against its rules for who can use what
-- (apps/web/convex/shared/proficiencies.ts); a skill the rules say a class
-- can't have is how a wrong rule shows up.

local COMBAT_SKILLS = {
    Cloth = true, Leather = true, Mail = true, ["Plate Mail"] = true, Shield = true,
    Axes = true, ["Two-Handed Axes"] = true, Maces = true, ["Two-Handed Maces"] = true,
    Swords = true, ["Two-Handed Swords"] = true, Polearms = true, Staves = true,
    Daggers = true, ["Fist Weapons"] = true, Bows = true, Guns = true, Crossbows = true,
    Thrown = true, Wands = true, ["Dual Wield"] = true, ["Feral Combat"] = true,
    Defense = true, Unarmed = true,
}
local COMBAT_HEADERS = { ["Weapon Skills"] = true, ["Armor Proficiencies"] = true }

--- { skills = { name, ... } (sorted), dualWield = bool? }, and whether the
--- list is complete (a collapsed header hides what's under it); nil if the
--- client has no skill list.
function ns.readProficiencies()
    if not GetNumSkillLines or not GetSkillLineInfo then return nil end
    local skills, seen, complete, header = {}, {}, true, nil
    for i = 1, GetNumSkillLines() do
        local name, isHeader, isExpanded = GetSkillLineInfo(i)
        if isHeader then
            header = name
            if not isExpanded and COMBAT_HEADERS[name] then complete = false end
        elseif name and not seen[name] and not PROFESSIONS[name]
            and (COMBAT_SKILLS[name] or COMBAT_HEADERS[header]) then
            seen[name] = true
            table.insert(skills, name)
        end
    end
    local dualWield = nil
    if CanDualWield then
        local ok, can = pcall(CanDualWield)
        if ok then dualWield = can and true or false end
    end
    if dualWield and not seen["Dual Wield"] then table.insert(skills, "Dual Wield") end
    table.sort(skills)
    return { skills = skills, dualWield = dualWield }, complete
end

-- ---- Known recipes -----------------------------------------------------------------
-- Only readable while the profession's window is open, so each profession's
-- list is captured when the player opens it and kept until next time.

local function itemIdOf(link)
    return link and tonumber(link:match("item:(%d+)")) or nil
end

--- The open trade skill window: profession name and { { name, item? }, ... }.
local function readTradeSkill()
    if GetTradeSkillLine and GetNumTradeSkills and GetTradeSkillInfo then
        local profession = GetTradeSkillLine()
        if not profession or profession == "UNKNOWN" then return nil end
        local known = {}
        for i = 1, GetNumTradeSkills() do
            local name, kind = GetTradeSkillInfo(i)
            if name and kind ~= "header" and kind ~= "subheader" then
                table.insert(known, { name = name, item = itemIdOf(GetTradeSkillItemLink and GetTradeSkillItemLink(i)) })
            end
        end
        return profession, known
    end
    if C_TradeSkillUI and C_TradeSkillUI.GetAllRecipeIDs then
        local info = C_TradeSkillUI.GetBaseProfessionInfo and C_TradeSkillUI.GetBaseProfessionInfo()
        local profession = info and info.professionName
        if not profession and C_TradeSkillUI.GetTradeSkillLine then
            profession = select(2, C_TradeSkillUI.GetTradeSkillLine())
        end
        if not profession then return nil end
        local known = {}
        for _, recipeID in ipairs(C_TradeSkillUI.GetAllRecipeIDs() or {}) do
            local recipe = C_TradeSkillUI.GetRecipeInfo(recipeID)
            if recipe and recipe.learned and recipe.name then
                local link = C_TradeSkillUI.GetRecipeItemLink and C_TradeSkillUI.GetRecipeItemLink(recipeID)
                table.insert(known, { name = recipe.name, item = itemIdOf(link) })
            end
        end
        return profession, known
    end
end

--- The open craft window (Enchanting on classic-era clients).
local function readCraft()
    if not (GetCraftDisplaySkillLine and GetNumCrafts and GetCraftInfo) then return nil end
    local profession = GetCraftDisplaySkillLine()
    if not profession then return nil end
    local known = {}
    for i = 1, GetNumCrafts() do
        local name, _, kind = GetCraftInfo(i)
        if name and kind ~= "header" then
            table.insert(known, { name = name, item = itemIdOf(GetCraftItemLink and GetCraftItemLink(i)) })
        end
    end
    return profession, known
end

--- profession, known recipes for the window that's open ("trade" or "craft").
function ns.readRecipes(which)
    if which == "craft" then return readCraft() end
    return readTradeSkill()
end
