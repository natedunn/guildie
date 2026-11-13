local ADDON, ns = ...
GuildieLivePixelsIntegrated = true
local function options()
    GuildieDB = GuildieDB or {}
    if type(GuildieDB.livePixels) ~= "table" then GuildieDB.livePixels = {} end
    return GuildieDB.livePixels
end
local protocol = GuildiePixelProtocol
local function json(value)
    local kind = type(value)
    if kind == "nil" then return "null" end
    if kind == "boolean" then return tostring(value) end
    if kind == "number" then
        if value ~= value or value == math.huge or value == -math.huge then return "null" end
        return tostring(value)
    end
    if kind == "string" then
        return '"' .. value:gsub('[%z\1-\31\\"]', function(c)
            return string.format("\\u%04x", string.byte(c))
        end) .. '"'
    end
    assert(kind == "table", "unsupported telemetry value")
    local parts = {}
    if #value > 0 or next(value) == nil then
        for i = 1, #value do parts[#parts + 1] = json(value[i]) end
        return "[" .. table.concat(parts, ",") .. "]"
    end
    for key, entry in pairs(value) do parts[#parts + 1] = json(tostring(key)) .. ":" .. json(entry) end
    table.sort(parts)
    return "{" .. table.concat(parts, ",") .. "}"
end
local function publicValue(value)
    if type(issecretvalue) == "function" and issecretvalue(value) then return nil end
    return value
end
local function read(fn, ...)
    if type(fn) ~= "function" then return nil end
    local ok, value = pcall(fn, ...)
    if ok then return publicValue(value) end
end
-- Keep the default header clear of client borders and screen-edge clipping.
local DEFAULT_INSET_PIXELS = 12
local panel = CreateFrame("Frame", nil, UIParent)
panel:SetFrameStrata("TOOLTIP")
panel:SetScale(1 / (read(UIParent.GetEffectiveScale, UIParent) or 1))
panel:SetMovable(true)
panel:SetClampedToScreen(true)
if panel.SetClampRectInsets then panel:SetClampRectInsets(0, 0, 0, 0) end
panel:EnableMouse(false)
panel:RegisterForDrag("LeftButton")
local editing, nativeEditing, exportEnabled, dragging = false, false, false, false
local attachEditMode, applyOptions
local DEFAULT_CELL_SIZE = 1.6
local cellSize = DEFAULT_CELL_SIZE
local theme = "amber"
-- Convert the actual screen rectangle into this frame's anchor coordinates.
-- UIParent can have a nonzero origin, and parent/frame scale need not match.
local function bounds()
    local scale = read(panel.GetEffectiveScale, panel) or 1
    local ps = read(UIParent.GetEffectiveScale, UIParent) or 1
    local pw = read(UIParent.GetWidth, UIParent) or 1024
    local ph = read(UIParent.GetHeight, UIParent) or 768
    if pw <= 0 then pw = 1024 end
    if ph <= 0 then ph = 768 end
    if scale <= 0 then scale = 1 end
    if ps <= 0 then ps = 1 end
    local physicalW, physicalH
    if type(GetPhysicalScreenSize) == "function" then
        local ok, w, h = pcall(GetPhysicalScreenSize)
        if ok then physicalW, physicalH = w, h end
    end
    local ratio = physicalW and pw > 0 and ps > 0 and physicalW / (pw * ps) or 1
    if ratio < 0.25 or ratio > 4 then ratio = 1 end
    local inset = DEFAULT_INSET_PIXELS / (ratio * scale)
    local screenW = physicalW and physicalW / (ratio * scale) or pw * ps / scale
    local screenH = physicalH and physicalH / (ratio * scale) or ph * ps / scale
    local originX = -(read(UIParent.GetLeft, UIParent) or 0) * ps / scale
    local originY = screenH - (read(UIParent.GetTop, UIParent) or ph) * ps / scale
    return originX + inset, originY - screenH + panel:GetHeight() + inset,
        originX + screenW - panel:GetWidth() - inset, originY - inset
end
local function place(x, y)
    local left, bottom, right, top = bounds()
    x, y = math.max(left, math.min(right, x)), math.max(bottom, math.min(top, y))
    panel:ClearAllPoints()
    panel:SetPoint("TOPLEFT", UIParent, "TOPLEFT", x, y)
    return x, y
end
local function defaultPosition()
    local left, _, _, top = bounds()
    return left, top
end
place(defaultPosition())
local function restorePosition()
    local position = options()
    if position.corner == "top" or position.corner == "bottom" then
        local left, bottom, _, top = bounds()
        position.x, position.y = place(left, position.corner == "bottom" and bottom or top)
    elseif type(position) == "table" and type(position.x) == "number" and type(position.y) == "number" then
        position.x, position.y = place(position.x, position.y)
    else
        place(defaultPosition())
    end
end
panel:RegisterEvent("ADDON_LOADED")
panel:RegisterEvent("PLAYER_LOGIN")
pcall(panel.RegisterEvent, panel, "UI_SCALE_CHANGED")
pcall(panel.RegisterEvent, panel, "DISPLAY_SIZE_CHANGED")
panel:SetScript("OnEvent", function(_, event, name)
    if name == ADDON then
        restorePosition()
        if applyOptions then applyOptions() end
    end
    if applyOptions and (event == "PLAYER_LOGIN" or event == "UI_SCALE_CHANGED" or event == "DISPLAY_SIZE_CHANGED") then
        applyOptions()
    end
    if attachEditMode then attachEditMode() end
end)
panel:SetScript("OnDragStart", function()
    if editing and not read(InCombatLockdown) then
        dragging = true
        panel:StartMoving()
    end
end)
local function savePosition()
    dragging = false
    panel:StopMovingOrSizing()
    local scale = panel:GetEffectiveScale()
    local parentScale = UIParent:GetEffectiveScale()
    local x = math.floor(panel:GetLeft() - (UIParent:GetLeft() or 0) * parentScale / scale + 0.5)
    local y = math.floor(panel:GetTop() - UIParent:GetTop() * parentScale / scale + 0.5)
    options().corner = nil
    options().x, options().y = place(x, y)
end
panel:SetScript("OnDragStop", savePosition)
local cells, displayed = {}, {}
for i = 1, 256 do
    cells[i] = panel:CreateTexture(nil, "OVERLAY")
end
local function layout(size)
    cellSize = size
    -- Snap cells to whole physical pixels when the client exposes its dimensions.
    local width = read(GetPhysicalScreenSize)
    local parentWidth = read(UIParent.GetWidth, UIParent)
    local parentScale = read(UIParent.GetEffectiveScale, UIParent)
    -- UIParent may finish changing scale after this frame is created. Use the
    -- current effective scale, not the assumption that our initial reciprocal
    -- SetScale still cancels it out.
    local panelScale = read(panel.GetEffectiveScale, panel) or 1
    local drawSize = size
    if width and parentWidth and parentWidth > 0 and parentScale and parentScale > 0 then
        local ratio = width / (parentWidth * parentScale)
        if ratio >= 0.25 and ratio <= 4 and panelScale > 0 then
            drawSize = math.max(2, math.floor(size * 1.25 + 0.5)) / (ratio * panelScale)
        end
    end
    panel:SetSize(16 * drawSize, 16 * drawSize)
    for i, cell in ipairs(cells) do
        cell:ClearAllPoints()
        cell:SetSize(drawSize, drawSize)
        cell:SetPoint("TOPLEFT", panel, "TOPLEFT",
            ((i - 1) % 16) * drawSize, -math.floor((i - 1) / 16) * drawSize)
    end
end
panel:Hide()
local session = tostring(read(GetServerTime) or 0) .. "-" .. tostring(math.floor((read(GetTime) or 0) * 1000))
local serial, index, ticks, elapsed = 0, 1, 0, 0
local snapshot, snapshotId, live, liveId
local previousSnapshot
local exportError, lastPacketAt, snapshotBytes
local startedAt = read(GetTime) or 0
local function nextId()
    serial = serial + 1
    return session .. "-" .. serial
end
local function liveState()
    local map = C_Map and read(C_Map.GetBestMapForUnit, "player")
    local position = map and C_Map and read(C_Map.GetPlayerMapPosition, map, "player")
    local x, y
    if position and position.GetXY then
        local ok, px, py = pcall(position.GetXY, position)
        if ok then x, y = publicValue(px), publicValue(py) end
    end
    return json({version = 1, capturedAt = read(GetServerTime), guid = read(UnitGUID, "player"),
        health = read(UnitHealth, "player"), maxHealth = read(UnitHealthMax, "player"),
        power = read(UnitPower, "player"), maxPower = read(UnitPowerMax, "player"),
        powerType = read(UnitPowerType, "player"), xp = read(UnitXP, "player"),
        maxXp = read(UnitXPMax, "player"), zone = read(GetZoneText),
        subzone = read(GetSubZoneText), mapId = map, x = x, y = y,
        combat = read(UnitAffectingCombat, "player"), dead = read(UnitIsDeadOrGhost, "player")})
end
local liveIndex = 1
local function render(_, delta)
    if editing then return end
    elapsed = elapsed + delta
    if elapsed < 0.1 then return end
    elapsed = 0
    ticks = ticks + 1
    local channel, data, id, part
    if ticks % 3 == 0 then
        if not live then live, liveId, liveIndex = liveState(), nextId(), 1 end
        channel, data, id, part = "L", live, liveId, liveIndex
        liveIndex = liveIndex + 1
        if liveIndex > math.ceil(#live / 180) then live = nil end
    else
        if not snapshot then
            local characters = {}
            for _, character in pairs(GuildieDB and GuildieDB.characters or {}) do
                characters[#characters + 1] = character
            end
            snapshot = json({version = GuildieDB and GuildieDB.version or 4, characters = characters})
            snapshotBytes = #snapshot
            if #snapshot > 1048576 then
                exportError = "Too much data for pixel sync. Use reload/logout sync."
                print("Guildie: " .. exportError)
                exportEnabled = false
                panel:Hide()
                return
            end
            if snapshot ~= previousSnapshot then snapshotId = nextId() end
            previousSnapshot, index = snapshot, 1
        end
        channel, data, id, part = "S", snapshot, snapshotId, index
        index = index + 1
        if index > math.ceil(#snapshot / 180) then snapshot = nil end
    end
    local packet = channel .. "|" .. id .. "|" .. part .. "|" .. math.ceil(#data / 180) .. "|" .. data:sub((part - 1) * 180 + 1, part * 180)
    for i, value in ipairs(protocol.encode(packet)) do
        if displayed[i] ~= value then
            local shade = value / 255
            local green = theme == "amber" and math.floor(value * 0.75 + 0.5) / 255 or shade
            local blue = theme == "amber" and math.floor(value * 0.45 + 0.5) / 255 or shade
            cells[i]:SetColorTexture(shade, green, blue, 1)
            displayed[i] = value
        end
    end
    lastPacketAt = read(GetTime) or 0
end
panel:SetScript("OnUpdate", function(self, delta)
    local ok = pcall(render, self, delta)
    if not ok then
        exportError = "Pixel export stopped because game data could not be encoded. Use reload/logout sync."
        exportEnabled = false
        panel:Hide()
    end
end)
local editLabel = panel:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
editLabel:SetPoint("LEFT", panel, "RIGHT", 4, 0)
editLabel:SetText("Guildie sync")
editLabel:Hide()
local doneEditing = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
doneEditing:SetPoint("TOPLEFT", panel, "BOTTOMLEFT", 0, -8)
doneEditing:SetSize(90, 24)
doneEditing:SetText("Done")
doneEditing:Hide()
local cancelEditing = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
cancelEditing:SetPoint("LEFT", doneEditing, "RIGHT", 6, 0)
cancelEditing:SetSize(90, 24)
cancelEditing:SetText("Cancel")
cancelEditing:Hide()
-- Where the square was when Guildie's own move began (Cancel puts it back).
local before
local function beginEditing()
    editing = true
    layout(cellSize)
    for i, cell in ipairs(cells) do
        local edge = i <= 16 or i > 240 or i % 16 == 0 or i % 16 == 1
        local shade = edge and 0.65 or 0.16
        cell:SetColorTexture(shade, shade * 0.75, shade * 0.45, 1)
    end
    displayed = {}
    editLabel:Show()
    doneEditing:SetShown(not nativeEditing)
    cancelEditing:SetShown(not nativeEditing)
    panel:EnableMouse(true)
    panel:Show()
end
local function endEditing()
    if dragging then savePosition() end
    panel:StopMovingOrSizing()
    editing = false
    editLabel:Hide()
    doneEditing:Hide()
    cancelEditing:Hide()
    before = nil
    panel:EnableMouse(false)
    displayed = {}
    snapshot, live = nil, nil
    elapsed = 0
    if exportEnabled then panel:Show() else panel:Hide() end
end
doneEditing:SetScript("OnClick", endEditing)
cancelEditing:SetScript("OnClick", function()
    if dragging then panel:StopMovingOrSizing(); dragging = false end
    if before then
        local o = options()
        o.corner, o.x, o.y = before.corner, before.x, before.y
        restorePosition()
    end
    endEditing()
end)
-- Guildie never opens Blizzard's Edit Mode itself: entering it from addon
-- code taints its setup (TargetUnit/FocusUnit get blocked and the UI is left
-- half in Edit Mode). Moving the square from Guildie uses the square's own
-- drag mode; players who open Edit Mode themselves can drag it there too.
-- Follow the manager's visibility, as LibEditMode does, without touching
-- Blizzard's protected system registrations. Retry when its load-on-demand UI loads.
local hookedManager
attachEditMode = function()
    local manager = EditModeManagerFrame
    if not manager or manager == hookedManager or type(manager.HookScript) ~= "function" then return end
    hookedManager = manager
    local function enter()
        if nativeEditing then return end
        nativeEditing = true
        beginEditing()
    end
    manager:HookScript("OnShow", enter)
    manager:HookScript("OnHide", function()
        if not nativeEditing then return end
        nativeEditing = false
        endEditing()
    end)
    if read(manager.IsShown, manager) then enter() end
end
attachEditMode()
SLASH_GUILDIELIVEPIXELS1 = "/guildiepixels"
SlashCmdList.GUILDIELIVEPIXELS = function(command)
    if nativeEditing then
        print("Guildie pixels: close Edit Mode before changing export settings.")
        return
    end
    command = command:lower():match("^%s*(.-)%s*$")
    if dragging then savePosition() end
    panel:StopMovingOrSizing()
    editing = false
    exportEnabled = false
    editLabel:Hide()
    doneEditing:Hide()
    panel:EnableMouse(false)
    local requestedTheme = command:match(" (amber)$") or command:match(" (gray)$")
    if requestedTheme then command = command:sub(1, #command - #requestedTheme - 1) end
    local requestedSize = tonumber(command:match("^on (%d+%.?%d*)$"))
    local validSize = requestedSize and requestedSize >= 1 and requestedSize <= 8
    if command == "on" or command == "on compact" or command == "on large" or validSize then
        exportEnabled = true
        options().enabled = true
        theme = requestedTheme or "amber"
        displayed = {}
        snapshot, live = nil, nil
        elapsed = 0
        layout(validSize and requestedSize or (command == "on large" and 8 or DEFAULT_CELL_SIZE))
        restorePosition()
        options().theme, options().size = theme, cellSize
        panel:Show()
        print("Guildie pixels: " .. theme .. " export enabled. Match reader --theme and recalibrate after moving or resizing.")
    elseif command == "edit" then
        options().enabled = false
        beginEditing()
        print("Guildie pixels: drag the square. /guildiepixels lock hides it; /guildiepixels on starts export.")
    elseif command == "reset" then
        options().corner = "top"
        options().enabled = false
        options().x, options().y = defaultPosition()
        place(options().x, options().y)
        panel:Hide()
        print("Guildie pixels: position reset; export disabled.")
    else
        options().enabled = false
        panel:Hide()
        print("Guildie pixels: disabled. Commands: on, on amber, on <cell size 1-8> amber, on large, edit, lock, off, reset.")
    end
end

-- Settings are owned by the addon; the desktop capture consent is separate.
applyOptions = function()
    local config = options()
    exportError, lastPacketAt, startedAt = nil, nil, read(GetTime) or 0
    theme = config.theme == "gray" and "gray" or "amber"
    cellSize = type(config.size) == "number" and math.max(1.6, math.min(8, config.size)) or DEFAULT_CELL_SIZE
    exportEnabled = config.enabled == true
    displayed, snapshot, live, elapsed = {}, nil, nil, 0
    if nativeEditing then beginEditing() else
        layout(cellSize)
        restorePosition()
        endEditing()
    end
end
ns.livePixels = {
    get = options,
    health = function()
        local now = read(GetTime) or 0
        local hasData = ns.current and ns.current() ~= nil
        return {enabled = options().enabled == true, editing = editing,
            error = exportError, hasData = hasData,
            stalled = exportEnabled and not editing and now - (lastPacketAt or startedAt) > 5,
            cycleSeconds = snapshotBytes and math.ceil(snapshotBytes / 180 / (10 * 2 / 3)) or nil}
    end,
    set = function(key, value)
        if key == "enabled" and type(value) == "boolean" then options().enabled = value
        elseif key == "theme" and (value == "amber" or value == "gray") then options().theme = value
        elseif key == "size" and type(value) == "number" and value >= 1.6 and value <= 8 then options().size = value
        else return end
        applyOptions()
        if ns.refreshSyncWarning then ns.refreshSyncWarning() end
    end,
    -- Guildie's own move: drag the square, then Done (or Cancel). Never
    -- Blizzard's Edit Mode (see above). Already in Edit Mode: it's draggable.
    position = function()
        if read(InCombatLockdown) or editing then return end
        local o = options()
        before = { corner = o.corner, x = o.x, y = o.y }
        beginEditing()
    end,
    corner = function(edge)
        if read(InCombatLockdown) then return end
        options().corner = edge == "bottom" and "bottom" or "top"
        restorePosition()
    end,
    reset = function()
        options().corner = "top"
        options().x, options().y = defaultPosition()
        place(options().x, options().y)
    end,
}
