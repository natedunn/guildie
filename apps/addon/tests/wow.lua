-- A stubbed WoW API, enough to load the addon outside the game and drive its
-- capture with plain Lua (luajit). Not shipped: the desktop app installs only
-- apps/addon/Guildie.
--
--   local wow = dofile("apps/addon/tests/wow.lua")
--   local ns = wow.load({ ... game state ... })

local wow = {}

local ROOT = (debug.getinfo(1, "S").source:match("^@(.*)tests/wow%.lua$") or "./") .. "Guildie/"

-- Frames, font strings and textures: anything not defined here is a no-op,
-- so UI.lua loads too. Each keeps its text and anchors, for the window tests.
local function frame(name)
    local f = { scripts = {}, events = {}, shown = false, points = {} }
    function f:RegisterEvent(event)
        if wow.state.unknownEvents and wow.state.unknownEvents[event] then error("unknown event " .. event) end
        self.events[event] = true
    end
    function f:SetScript(script, fn) self.scripts[script] = fn end
    function f:Show()
        local was = self.shown
        self.shown = true
        if not was and self.scripts.OnShow then self.scripts.OnShow(self) end
    end
    function f:Hide() self.shown = false end
    function f:SetShown(on) if on then self:Show() else self:Hide() end end
    function f:IsShown() return self.shown end
    function f:SetText(text) self._text = text end
    function f:GetText() return self._text end
    function f:SetPoint(point, relativeTo, relativePoint, x, y)
        table.insert(self.points, { point, relativeTo, relativePoint, x or 0, y or 0 })
    end
    function f:ClearAllPoints() self.points = {} end
    function f:CreateFontString() local fs = frame() fs.shown = true return fs end
    function f:CreateTexture() local t = frame() t.shown = true return t end
    if name then _G[name] = f end
    return setmetatable(f, { __index = function() return function() end end })
end
wow.frame = frame

local function fontString(text, color, shown)
    return {
        GetText = function() return text end,
        GetTextColor = function() return color[1], color[2], color[3], 1 end,
        IsShown = function() return shown ~= false end,
    }
end

-- A GameTooltip that "shows" wow.state.tooltips[slot]: { { left, {r,g,b}, right? }, ... }.
local function scanTooltip(name)
    local tip = frame(name)
    local lines = {}
    function tip:ClearLines() lines = {} end
    function tip:SetInventoryItem(_, slot)
        local item = wow.state.gear[slot]
        lines = { { item and item.name or "", { 1, 1, 1 } } }
        for _, line in ipairs(wow.state.tooltips[slot] or {}) do table.insert(lines, line) end
        -- Like the game: the font strings stay around, hidden lines keep old text.
        for i = 1, 40 do
            local l = lines[i]
            _G[name .. "TextLeft" .. i] = fontString(l and l[1] or "stale", l and l[2] or { 1, 1, 1 }, l ~= nil)
            _G[name .. "TextRight" .. i] = fontString(l and l[3] or "stale right", { 1, 1, 1 }, l ~= nil and l[3] ~= nil)
        end
    end
    function tip:NumLines() return #lines end
    return tip
end

local function link(item)
    return string.format("|cff0070dd|Hitem:%d:%d:0:0:0:0:%d:0:35|h[%s]|h|r", item.id, item.enchant or 0, item.suffix or 0, item.name)
end

function wow.reset(state)
    wow.state = state
    wow.frames = {}
    state.time = state.time or 1794300000
    state.gear = state.gear or {}
    state.tooltips = state.tooltips or {}
    _G.GuildieDB = state.db
    _G.GuildieData = nil
    _G.SlashCmdList = {}
    _G.UISpecialFrames = {}
    _G.tinsert = table.insert
    _G.C_Timer = nil
    _G.WorldFrame = frame()
    _G.UIParent = frame()
    _G.Minimap = frame()
    function _G.Minimap:GetWidth() return 140 end
    _G.GameTooltip = frame()
    _G.ItemRefTooltip = frame()
    _G.TooltipDataProcessor = nil
    -- Templates: state.missingTemplates errors like a client without them;
    -- PortraitFrameTemplate has its parts only with state.portrait (else
    -- it's a bare frame, as a client might hand back).
    _G.CreateFrame = function(kind, name, _, template)
        if template and state.missingTemplates and state.missingTemplates[template] then
            error("Couldn't find inherited node \"" .. template .. "\"")
        end
        local f = kind == "GameTooltip" and scanTooltip(name) or frame(name)
        f.template = template
        if template == "PortraitFrameTemplate" and state.portrait then
            f.NineSlice = frame()
            f.PortraitContainer = frame()
            f.PortraitContainer.portrait = frame()
            function f:SetTitle(title) self.title = title end
        end
        table.insert(wow.frames, f)
        return f
    end
    _G.GetTime = function() return 0 end
    _G.GetServerTime = function() return state.time end
    _G.UnitGUID = function() return state.guid end
    _G.UnitName = function() return state.name end
    _G.UnitLevel = function() return state.level end
    _G.UnitXP = function() return state.xp or 0 end
    _G.UnitXPMax = function() return state.xpMax or 0 end
    _G.UnitClass = function() return "Priest", "PRIEST", 5 end
    _G.UnitRace = function() return "Night Elf", "NightElf", 4 end
    _G.IsInGuild = function() return state.guild ~= nil end
    _G.GetGuildInfo = function()
        if state.guild and not state.guildLoading then return state.guild.name, state.guild.rank, state.guild.rankIndex end
    end
    _G.GetInventoryItemLink = function(_, slot) return state.gear[slot] and link(state.gear[slot]) end
    _G.GetInventoryItemID = function(_, slot) return state.gear[slot] and state.gear[slot].id end
    _G.GetInventoryItemQuality = function(_, slot) return state.gear[slot] and state.gear[slot].quality end
    _G.GetDetailedItemLevelInfo = function(l)
        for _, item in pairs(state.gear) do if link(item) == l then return item.itemLevel end end
    end
    _G.GetAverageItemLevel = state.average and function() return state.average + 1, state.average end or nil
    -- Skills: the classic API (a header, then its lines).
    _G.GetNumSkillLines = function() return #(state.skillLines or {}) end
    _G.GetSkillLineInfo = function(i)
        local s = state.skillLines[i]
        if s.header then return s.name, true, s.expanded ~= false end
        return s.name, false, false, s.rank, 0, 0, s.max, s.abandonable
    end
    _G.GetProfessions = nil
    _G.CanDualWield = state.canDualWield ~= nil and function() return state.canDualWield end or nil
    -- Trade skills (closed unless state.trade is set).
    _G.GetTradeSkillLine = function()
        if not state.trade then return "UNKNOWN", 0, 0 end
        return state.trade.profession, 1, 1
    end
    _G.GetNumTradeSkills = function() return state.trade and #state.trade.lines or 0 end
    _G.GetTradeSkillInfo = function(i)
        local l = state.trade.lines[i]
        return l.name, l.kind or "easy"
    end
    _G.GetTradeSkillItemLink = function(i)
        local l = state.trade.lines[i]
        return l.item and link({ id = l.item, name = l.name }) or nil
    end
    _G.GetCraftDisplaySkillLine = function()
        if state.craft then return state.craft.profession, 1, 1 end
    end
    _G.GetNumCrafts = function() return state.craft and #state.craft.lines or 0 end
    _G.GetCraftInfo = function(i)
        local l = state.craft.lines[i]
        return l.name, "", l.kind or "easy"
    end
    -- An item link for crafts that make one, else the enchant (spell) link.
    _G.GetCraftItemLink = function(i)
        local l = state.craft.lines[i]
        if l.item then return link({ id = l.item, name = l.name }) end
        return "|cffffffff|Henchant:" .. (7000 + i) .. "|h[" .. l.name .. "]|h|r"
    end
    -- Bags and bank: state.bags = { [bag] = { slots = n, [slot] = { id, count } } };
    -- state.containerApi "modern" (C_Container), "classic" (globals) or nil (none).
    state.bags = state.bags or {}
    _G.C_Container = nil
    _G.GetContainerNumSlots = nil
    _G.GetContainerItemInfo = nil
    local function slots(bag) return state.bags[bag] and state.bags[bag].slots or 0 end
    local function slotItem(bag, slot) local b = state.bags[bag] return b and b[slot] end
    if state.containerApi == "modern" then
        _G.C_Container = {
            GetContainerNumSlots = slots,
            GetContainerItemInfo = function(bag, slot)
                local item = slotItem(bag, slot)
                if item then return { itemID = item[1], stackCount = item[2] } end
            end,
        }
    elseif state.containerApi == "classic" then
        _G.GetContainerNumSlots = slots
        _G.GetContainerItemInfo = function(bag, slot)
            local item = slotItem(bag, slot)
            if not item then return nil end
            -- Older clients have no itemID return: only the link.
            return "icon", item[2], false, 1, false, false, link({ id = item[1], name = "x" })
        end
    end
    -- The quest log: state.quests = { { header = "Zone", collapsed = bool } or
    -- { id, title, level, tag, complete (1, -1 or nil), objectives = { { text, done } } }, ... };
    -- state.questApi "modern" (C_QuestLog), "classic" (GetQuestLogTitle) or nil (none).
    _G.C_QuestLog = nil
    _G.GetNumQuestLogEntries = nil
    _G.GetQuestLogTitle = nil
    _G.GetQuestTagInfo = nil
    _G.GetNumQuestLeaderBoards = nil
    _G.GetQuestLogLeaderBoard = nil
    local function quest(i) return (state.quests or {})[i] end
    local function byId(id)
        for _, q in ipairs(state.quests or {}) do if q.id == id then return q end end
    end
    if state.questApi == "modern" then
        _G.C_QuestLog = {
            GetNumQuestLogEntries = function() return #(state.quests or {}) end,
            GetInfo = function(i)
                local q = quest(i)
                if not q then return nil end
                if q.header then return { title = q.header, isHeader = true, isCollapsed = q.collapsed } end
                return { title = q.title, level = q.level, questID = q.id, isHeader = false }
            end,
            IsComplete = function(id) local q = byId(id) return q and q.complete == 1 or false end,
            IsFailed = function(id) local q = byId(id) return q and q.complete == -1 or false end,
            GetQuestTagInfo = function(id)
                local q = byId(id)
                if q and q.tag then return { tagID = 81, tagName = q.tag } end
            end,
            GetQuestObjectives = function(id)
                local out = {}
                for _, o in ipairs(byId(id) and byId(id).objectives or {}) do
                    table.insert(out, { text = o[1], finished = o[2] })
                end
                return out
            end,
        }
    elseif state.questApi == "classic" then
        _G.GetNumQuestLogEntries = function() return #(state.quests or {}), 0 end
        _G.GetQuestLogTitle = function(i)
            local q = quest(i)
            if not q then return nil end
            if q.header then return q.header, 0, nil, true, q.collapsed end
            return q.title, q.level, 0, false, false, q.complete, 0, q.id
        end
        _G.GetQuestTagInfo = function(id)
            local q = byId(id)
            if q and q.tag then return 81, q.tag end
        end
        _G.GetNumQuestLeaderBoards = function(i) return #(quest(i).objectives or {}) end
        _G.GetQuestLogLeaderBoard = function(j, i)
            local o = quest(i).objectives[j]
            return o[1], "monster", o[2]
        end
    end
    -- No talents API: talents keep their last read (or none).
    _G.C_Traits = nil
    _G.C_ClassTalents = nil
    _G.C_TooltipInfo = nil
end

--- The addon's files in load order, from Guildie.toc.
function wow.files()
    local files = {}
    for line in io.lines(ROOT .. "Guildie.toc") do
        if line:match("%.lua$") then table.insert(files, line) end
    end
    return files
end

--- Loads the addon's files as the game would (same `ns` for each).
function wow.load(state)
    wow.reset(state)
    local ns = {}
    for _, file in ipairs(wow.files()) do
        local chunk = assert(loadfile(ROOT .. file))
        chunk("Guildie", ns)
    end
    return ns
end

--- Sends an event to every frame registered for it.
function wow.fire(event, ...)
    for _, f in ipairs(wow.frames) do
        if f.events[event] and f.scripts.OnEvent then f.scripts.OnEvent(f, event, ...) end
    end
end

-- ---- JSON (decode only), to check the payload -----------------------------------

function wow.decode(text)
    local pos = 1
    local function ws() pos = text:find("[^%s]", pos) or #text + 1 end
    local value
    local function str()
        local out = {}
        pos = pos + 1
        while true do
            local c = text:sub(pos, pos)
            if c == '"' then pos = pos + 1 break end
            if c == "\\" then
                local e = text:sub(pos + 1, pos + 1)
                if e == "u" then
                    table.insert(out, string.char(tonumber(text:sub(pos + 2, pos + 5), 16)))
                    pos = pos + 6
                else
                    table.insert(out, ({ n = "\n", r = "\r", t = "\t" })[e] or e)
                    pos = pos + 2
                end
            else
                table.insert(out, c)
                pos = pos + 1
            end
        end
        return table.concat(out)
    end
    function value()
        ws()
        local c = text:sub(pos, pos)
        if c == "{" then
            local obj = {}
            pos = pos + 1
            ws()
            if text:sub(pos, pos) == "}" then pos = pos + 1 return obj end
            while true do
                ws()
                local k = str()
                ws()
                assert(text:sub(pos, pos) == ":", "expected : at " .. pos)
                pos = pos + 1
                obj[k] = value()
                ws()
                local d = text:sub(pos, pos)
                pos = pos + 1
                if d == "}" then return obj end
                assert(d == ",", "expected , at " .. pos)
            end
        elseif c == "[" then
            local arr = {}
            pos = pos + 1
            ws()
            if text:sub(pos, pos) == "]" then pos = pos + 1 return arr end
            while true do
                table.insert(arr, value())
                ws()
                local d = text:sub(pos, pos)
                pos = pos + 1
                if d == "]" then return arr end
                assert(d == ",", "expected , at " .. pos)
            end
        elseif c == '"' then
            return str()
        else
            local word = text:match("^[%w%.%-+]+", pos)
            pos = pos + #word
            if word == "true" then return true elseif word == "false" then return false elseif word == "null" then return nil end
            -- One value: assert would also return its message (table.insert(arr, n, msg)).
            return (assert(tonumber(word), "bad number " .. word))
        end
    end
    local out = value()
    ws()
    assert(pos > #text, "trailing data at " .. pos)
    return out
end

--- The SavedVariables file as the game writes it (only the fields the app reads).
function wow.savedVariables(db)
    local function q(s)
        return '"' .. s:gsub('[\\"\n\r]', { ["\\"] = "\\\\", ['"'] = '\\"', ["\n"] = "\\n", ["\r"] = "\\r" }) .. '"'
    end
    return "\nGuildieDB = {\n\t[\"version\"] = " .. tostring(db.version) .. ",\n\t[\"payload\"] = " .. q(db.payload)
        .. ",\n\t[\"lastReason\"] = " .. q(db.lastReason or "") .. ",\n}\n"
end

return wow
