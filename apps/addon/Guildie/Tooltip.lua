-- Adds a Guildie block to item tooltips: how many more of a reagent your
-- tracked crafts need ("You | need 6 more"), whether it's an upgrade for you
-- ("You | upgrade", Upgrades.lua), guild requests for this item ("Todd
-- wants all you have" for ongoing ones, "Miller requesting 20"), guildmates
-- whose known recipes use it (reagents), who could learn it (recipe items:
-- patterns, plans, formulas), and guildmates it might be a gear upgrade
-- for (Upgrades.lua).
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
--- "+2 more" past MAX_NAMES people. `skip`: names already on a request row
--- (someone who wants all of it doesn't also "might want" it).
local function reagentRows(itemID, skip)
    local entry = GuildieData and GuildieData.reagents and GuildieData.reagents[itemID]
    if not entry then return {} end
    local rows, byName, extra = {}, {}, 0
    for _, user in ipairs(entry.users or {}) do
        if not isMine(user.name) and not (skip and skip[user.name]) then
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

-- The profession window's skill-up colors and arrows (Blizzard_ProfessionsRecipeList):
-- orange always gives a skill-up, yellow and green a falling chance.
local SKILL_UP = {
    orange = { color = "ffff8040", atlas = "Professions-Icon-Skill-High" },
    yellow = { color = "ffffff00", atlas = "Professions-Icon-Skill-Medium" },
    green = { color = "ff40bf40", atlas = "Professions-Icon-Skill-Low" },
}
local SUB = "   "

--- The arrow as inline text, when the client has the atlas.
local arrows = {}
local function arrow(color)
    local s = SKILL_UP[color]
    if not s then return "" end
    if arrows[color] == nil then
        local has = false
        if C_Texture and C_Texture.GetAtlasInfo then
            local ok, info = pcall(C_Texture.GetAtlasInfo, s.atlas)
            has = ok and info ~= nil
        end
        arrows[color] = has and ("|A:" .. s.atlas .. ":12:10|a ") or ""
    end
    return arrows[color]
end

--- A guildmate's skill in the color (and with the arrow) their profession
--- window shows their best recipe for this reagent in: "|A..|a |cffff8040131|r".
local function skillText(user)
    local s = SKILL_UP[user.color]
    local n = tostring(user.skill or "?")
    if not s then return n end
    return arrow(user.color) .. "|c" .. s.color .. n .. "|r"
end
ns.skillText = skillText

--- Your own characters' rows for a reagent (GuildieData.reagentUseMine,
--- addon 0.25.0), by profession, unless "Show your characters on reagents"
--- is off: "You | ^^ 131" for the one you're on, "Ivar | ^ 112".
local function mineUse(itemID)
    local s = GuildieDB and GuildieDB.settings
    if s and s.showMineReagents == false then return {} end
    local data = GuildieData and type(GuildieData.reagentUseMine) == "table" and GuildieData.reagentUseMine
    local entry = data and data[itemID]
    local out = {}
    if type(entry) ~= "table" then return out end
    local me = UnitName("player")
    for _, p in ipairs(entry) do
        if type(p) == "table" and p.name and type(p.users) == "table" then
            local rows = {}
            for _, user in ipairs(p.users) do
                if user.name then
                    local left = classColored(user.name == me and "You" or user.name, user.classId)
                    table.insert(rows, { left = SUB .. left, right = skillText(user) })
                end
            end
            if #rows > 0 then out[p.name] = rows end
        end
    end
    return out
end

--- Who'd get the most profession progress out of this reagent
--- (GuildieData.reagentUse, addon 0.24.0; reagentProgress.ts): per profession
--- whose recipes use it, "Tailoring", then your own characters (mineUse),
--- then the best few guildmates with their skill ("Todd | ^^ 131", in the
--- window's colors), "+2 more", or, with none of yours listed either, what's
--- missing: "Needs a recipe: Todd, Brenna" (in range, none has one),
--- "Needs 140 skill: Miller 110" (the closest), "No one in the guild".
--- `skip`: names already on a request row.
local function useRows(itemID, skip)
    local data = GuildieData and type(GuildieData.reagentUse) == "table" and GuildieData.reagentUse
    local entry = data and data[itemID]
    local mine = mineUse(itemID)
    local professions = type(entry) == "table" and type(entry.professions) == "table" and entry.professions or {}
    local rows = {}
    local done = {}
    for _, p in ipairs(professions) do
        if type(p) == "table" and p.name then
            done[p.name] = true
            local header = { left = p.name }
            table.insert(rows, header)
            local own = mine[p.name] or {}
            for _, row in ipairs(own) do table.insert(rows, row) end
            local shown, hidden = #own, 0
            for _, user in ipairs(type(p.users) == "table" and p.users or {}) do
                if isMine(user.name) or (skip and skip[user.name]) then
                    hidden = hidden + 1
                else
                    shown = shown + 1
                    table.insert(rows, { left = SUB .. classColored(user.name, user.classId), right = skillText(user) })
                end
            end
            local more = (tonumber(p.count) or 0) - (shown - #own) - hidden
            if more > 0 then
                table.insert(rows, { left = SUB .. string.format("+%d more", more) })
            elseif shown == 0 then
                local why
                if type(p.needRecipe) == "table" then
                    local names = {}
                    for _, m in ipairs(p.needRecipe) do
                        if m.name and not isMine(m.name) and not (skip and skip[m.name]) then
                            table.insert(names, classColored(m.name, m.classId))
                        end
                    end
                    if #names > 0 then why = "Needs a recipe: " .. table.concat(names, ", ") end
                elseif type(p.closest) == "table" and p.closest.name and p.from then
                    why = string.format("Needs %s skill: %s %s", tostring(p.from),
                        classColored(p.closest.name, p.closest.classId), tostring(p.closest.skill))
                elseif p.nobody then
                    why = "No one in the guild"
                end
                if why then
                    table.insert(rows, { left = SUB .. why })
                else
                    -- Everyone it'd name is already on a request row above.
                    table.remove(rows)
                end
            end
        end
    end
    -- Professions only yours would level with it (guildmates are past it, or don't have it).
    local rest = {}
    for name in pairs(mine) do
        if not done[name] then table.insert(rest, name) end
    end
    table.sort(rest)
    for _, name in ipairs(rest) do
        table.insert(rows, { left = name })
        for _, row in ipairs(mine[name]) do table.insert(rows, row) end
    end
    return rows
end
ns.useRows = useRows

--- A list as a set, cached per list (GuildieData is replaced only on /reload).
local sets = setmetatable({}, { __mode = "k" })
local function asSet(list)
    if type(list) ~= "table" then return {} end
    local set = sets[list]
    if not set then
        set = {}
        for _, v in ipairs(list) do set[v] = true end
        sets[list] = set
    end
    return set
end

-- How many names a recipe row lists before "+N".
local MAX_KNOWN = 3

--- Is this recipe item worth sending someone? (GuildieData.recipes, addon
--- 0.14.0; the same rule as apps/web/convex/shared/recipeStatus.ts.) For
--- each guild character with the profession: can learn it now, later
--- (skill too low), already has one unlearned, or knows it. Rows: one per
--- character who could use it ("Brenna | can learn it", "Miller | requires lvl
--- 125 (at lvl 90)", "Todd | has one already"), then "Known by Lich, Isai +2".
--- Leaves out the character you're on: the game's own tooltip says.
--- 0.15.0: a cookbook teaches several recipes (ids 3..n: knows it with all
--- of them), and rank books (`ranks`: { profession, skill, max skill it
--- unlocks }) count as known once their max skill is there.
local function recipeRows(itemID)
    local data = GuildieData and type(GuildieData.recipes) == "table" and GuildieData.recipes
    local item = data and type(data.items) == "table" and data.items[itemID]
    local rank
    if type(item) ~= "table" then
        item = data and type(data.ranks) == "table" and data.ranks[itemID]
        if type(item) ~= "table" then return {} end
        rank = item[3]
    end
    local profession, need = item[1], item[2] or 0
    local function knows(c)
        if rank then
            local max = type(c.max) == "table" and c.max[profession] or nil
            return type(max) == "number" and max >= rank
        end
        local known = asSet(c.known)
        for i = 3, #item do
            if not known[item[i]] then return false end
        end
        return #item >= 3
    end
    local groups = { now = {}, later = {}, has = {}, knows = {} }
    local me = UnitName and UnitName("player")
    for _, c in ipairs(type(data.crafters) == "table" and data.crafters or {}) do
        local skill = type(c.skills) == "table" and c.skills[profession]
        if skill and c.name ~= me then
            local state
            if knows(c) then
                state = "knows"
            elseif asSet(c.has)[itemID] then
                state = "has"
            elseif skill >= 0 and need > 0 and skill < need then
                state = "later"
            else
                state = "now"
            end
            table.insert(groups[state], { name = c.name, classId = c.classId, skill = skill })
        end
    end
    -- Closest to learning it first.
    for _, list in pairs(groups) do
        table.sort(list, function(a, b)
            if a.skill ~= b.skill then return a.skill > b.skill end
            return a.name < b.name
        end)
    end
    local rows, extra = {}, 0
    local function add(list, right)
        for _, c in ipairs(list) do
            if #rows < MAX_NAMES then
                table.insert(rows, { left = classColored(c.name, c.classId), right = right(c) })
            else
                extra = extra + 1
            end
        end
    end
    add(groups.now, function() return "can learn it" end)
    add(groups.later, function(c)
        if c.skill >= 0 then return string.format("requires lvl %d (at lvl %d)", need, c.skill) end
        return "skill too low"
    end)
    add(groups.has, function() return "has one already" end)
    if extra > 0 then table.insert(rows, { left = string.format("+%d more could use it", extra) }) end
    local known = groups.knows
    if #known > 0 then
        local names = {}
        for i = 1, math.min(#known, MAX_KNOWN) do
            table.insert(names, classColored(known[i].name, known[i].classId))
        end
        local text = "Known by " .. table.concat(names, ", ")
        if #known > MAX_KNOWN then text = text .. string.format(" +%d", #known - MAX_KNOWN) end
        table.insert(rows, { left = text })
    end
    if #rows == 0 then table.insert(rows, { left = "No guildmates have " .. tostring(profession) }) end
    return rows
end
ns.recipeRows = recipeRows

--- One two-column row per open request for this item (GuildieData.requests,
--- addon 0.8.0): { left = "Todd", right = "requesting 20, claimed by Miller" }.
--- Ongoing requests (no quantity, never claimed) come first: "Todd
--- wants all you have". Also returns the names with an ongoing request.
local function requestRows(itemID)
    local list = GuildieData and type(GuildieData.requests) == "table" and GuildieData.requests[itemID]
    if type(list) ~= "table" then return {}, {} end
    local rows, later, ongoing = {}, {}, {}
    for _, r in ipairs(list) do
        if type(r) == "table" and r.name then
            local mine = isMine(r.name)
            local right
            if r.ongoing then
                right = mine and "collecting" or "wants all you have"
                ongoing[r.name] = true
            elseif r.kind == "craft" then
                right = mine and "want it crafted" or "wants it crafted"
                if (r.quantity or 1) > 1 then right = right .. string.format(" (%d)", r.quantity) end
            else
                right = string.format("requesting %d", r.quantity or 1)
            end
            if type(r.claimedBy) == "table" and r.claimedBy.name then
                right = right .. ", claimed by " .. classColored(r.claimedBy.name, r.claimedBy.classId)
            end
            local row = { left = mine and "You" or classColored(r.name, r.classId), right = right }
            table.insert(r.ongoing and rows or later, row)
        end
    end
    for _, row in ipairs(later) do table.insert(rows, row) end
    return rows, ongoing
end
ns.requestRows = requestRows

--- Reagents for your tracked crafts (GuildieData.tracked, addon 0.23.0):
--- "You | need 6 more (4/10) for Greater Healing Potion ×5", or "You | have
--- all 10 for ...". The character you're on counts live (bags, and the bank
--- as the game last saw it); your other characters as Guildie last read
--- them. Setting: "Say how many you need for tracked crafts" (showTracked).
local function trackedRow(itemID)
    local s = GuildieDB and GuildieDB.settings
    if s and s.showTracked == false then return nil end
    local all = GuildieData and type(GuildieData.tracked) == "table" and GuildieData.tracked
    local entry = all and all[itemID]
    if type(entry) ~= "table" or type(entry.need) ~= "number" then return nil end
    local counts = type(entry.have) == "table" and entry.have or {}
    local me = UnitName and UnitName("player")
    local have = 0
    for name, count in pairs(counts) do
        if name ~= me and type(count) == "number" then have = have + count end
    end
    local get = C_Item and C_Item.GetItemCount or GetItemCount
    local ok, live = pcall(function() return get and get(itemID, true) end)
    if ok and type(live) == "number" then
        have = have + live
    elseif type(counts[me]) == "number" then
        have = have + counts[me]
    end
    local right
    if have >= entry.need then
        right = string.format("have all %d", entry.need)
    else
        right = string.format("need %d more (%d/%d)", entry.need - have, have, entry.need)
    end
    local crafts = type(entry.crafts) == "table" and entry.crafts or {}
    if type(crafts[1]) == "string" then
        right = right .. " for " .. crafts[1]
        if #crafts > 1 then right = right .. string.format(" +%d", #crafts - 1) end
    end
    return { left = "You", right = right }
end
ns.trackedRow = trackedRow

--- The item in this tooltip, read for the gear rules (Upgrades.lua), or nil.
local function gearItem(tooltip, data, link, lines)
    if not ns.upgrades then return nil end
    if not link and tooltip.GetItem then
        local _, l = tooltip:GetItem()
        link = l
    end
    if not link and data then link = data.hyperlink end
    return link and ns.upgrades.readItem(link, lines)
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
--- `link`: the item's link when the tooltip can't say (another addon's).
local function rowsFor(tooltip, itemID, data, link)
    local lines = ns.upgrades and ns.upgrades.tooltipLines(tooltip, data) or {}
    local okItem, item = pcall(gearItem, tooltip, data, link, lines)
    if not okItem then item = nil end
    local rows = {}
    -- Your tracked crafts' reagents first: what you're out gathering.
    local okTracked, tracked = pcall(trackedRow, itemID)
    if okTracked and tracked then table.insert(rows, tracked) end
    -- Yours first: it's for you whether or not it can be traded (quest rewards, loot rolls).
    local okMine, mine = pcall(function() return item and ns.upgrades.mineRow(item, itemID, classColored) end)
    if okMine and mine then table.insert(rows, mine) end
    local requests, ongoing = requestRows(itemID)
    for _, row in ipairs(requests) do table.insert(rows, row) end
    -- Guildmates' recipes use it, but nobody can hand over a bound one.
    local binding = ns.upgrades and ns.upgrades.binding(lines)
    local bound = binding ~= nil
    if not bound then
        for _, row in ipairs(recipeRows(itemID)) do table.insert(rows, row) end
        -- Who'd progress most with it; a file from before 0.24.0 has only "might want".
        local use = GuildieData and type(GuildieData.reagentUse) == "table"
        for _, row in ipairs(use and useRows(itemID, ongoing) or reagentRows(itemID, ongoing)) do
            table.insert(rows, row)
        end
    end
    local ok, upgrades = pcall(function() return item and ns.upgrades.lines(item, itemID, classColored) end)
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

--- Adds the block; true when it added something. `link`: the item's link
--- for tooltips that can't say (Dialogue UI's); `noShow`: the caller shows
--- the tooltip itself.
local function addTo(tooltip, itemID, data, link, noShow)
    if not itemID then return false end
    -- Not our own hidden tooltip, which reads worn gear (Capture.lua).
    if tooltip.GetName and tooltip:GetName() == "GuildieScanTooltip" then return false end
    local rows = rowsFor(tooltip, itemID, data, link)
    if #rows == 0 then return false end
    -- Dialogue UI's tooltip has a shorter blank line of its own.
    if tooltip.AddBlankLine then tooltip:AddBlankLine() else tooltip:AddLine(" ") end
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
    if not noShow then tooltip:Show() end
    return true
end
ns.addToTooltip = addTo

--- Dialogue UI (Peterodox's quest window) draws its own tooltips, which the
--- game's tooltip hooks never see. Its public API takes item tooltip
--- processors: ours adds the same Guildie block (experimental; Settings:
--- "Guildie in Dialogue UI tooltips"). Returns true when it hooked in.
local function hookDialogueUI()
    local api = _G.DialogueUIAPI
    if type(api) ~= "table" or type(api.AddItemTooltipProcessorExternal) ~= "function" then return false end
    api.AddItemTooltipProcessorExternal(function(tooltip, itemID, link)
        local s = GuildieDB and GuildieDB.settings
        if (s and s.dialogueUI == false) or not tooltip or not itemID then return false end
        local ok, added = pcall(addTo, tooltip, itemID, tooltip.tooltipData, link, true)
        return ok and added == true
    end)
    return true
end
ns.hookDialogueUI = hookDialogueUI

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
    pcall(hookDialogueUI)
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
