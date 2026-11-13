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
local panel = CreateFrame("Frame", nil, UIParent)
panel:SetFrameStrata("TOOLTIP")
panel:SetScale(1 / (read(UIParent.GetEffectiveScale, UIParent) or 1))
panel:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 0, 0)
panel:SetMovable(true)
panel:SetClampedToScreen(true)
panel:EnableMouse(false)
panel:RegisterForDrag("LeftButton")
local editing, nativeEditing, exportEnabled, dragging = false, false, false, false
local attachEditMode, applyOptions
local DEFAULT_CELL_SIZE = 1.6
local cellSize = DEFAULT_CELL_SIZE
local theme = "amber"
local function place(x, y)
    panel:ClearAllPoints()
    panel:SetPoint("TOPLEFT", UIParent, "TOPLEFT", x, y)
end
local function restorePosition()
    local position = options()
    if type(position) == "table" and type(position.x) == "number" and type(position.y) == "number" then
        place(position.x, position.y)
    end
end
panel:RegisterEvent("ADDON_LOADED")
panel:RegisterEvent("PLAYER_LOGIN")
panel:SetScript("OnEvent", function(_, _, name)
    if name == ADDON then
        restorePosition()
        if applyOptions then applyOptions() end
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
    local x = math.floor(panel:GetLeft() + 0.5)
    local y = math.floor(panel:GetTop() - UIParent:GetTop() * parentScale / scale + 0.5)
    options().x, options().y = x, y
    place(x, y)
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
    local drawSize = size
    if width and parentWidth and parentWidth > 0 and parentScale and parentScale > 0 then
        local ratio = width / (parentWidth * parentScale)
        if ratio >= 0.25 and ratio <= 4 then
            drawSize = math.max(2, math.floor(size * 1.25 + 0.5)) / ratio
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
panel:SetScript("OnUpdate", function(_, delta)
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
            if #snapshot > 1048576 then
                print("Guildie pixels: snapshot exceeds 1 MiB; experiment stopped.")
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
end)
local editLabel = panel:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
editLabel:SetPoint("LEFT", panel, "RIGHT", 4, 0)
editLabel:SetText("Guildie sync")
editLabel:Hide()
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
    panel:EnableMouse(true)
    panel:Show()
end
local function endEditing()
    if dragging then savePosition() end
    panel:StopMovingOrSizing()
    editing = false
    editLabel:Hide()
    panel:EnableMouse(false)
    displayed = {}
    snapshot, live = nil, nil
    elapsed = 0
    if exportEnabled then panel:Show() else panel:Hide() end
end
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
        options().theme, options().size = theme, cellSize
        panel:Show()
        print("Guildie pixels: " .. theme .. " export enabled. Match reader --theme and recalibrate after moving or resizing.")
    elseif command == "edit" then
        options().enabled = false
        beginEditing()
        print("Guildie pixels: drag the square. /guildiepixels lock hides it; /guildiepixels on starts export.")
    elseif command == "reset" then
        options().enabled = false
        options().x, options().y = 0, 0
        place(0, 0)
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
    theme = config.theme == "gray" and "gray" or "amber"
    cellSize = type(config.size) == "number" and math.max(1.6, math.min(8, config.size)) or DEFAULT_CELL_SIZE
    exportEnabled = config.enabled == true
    displayed, snapshot, live, elapsed = {}, nil, nil, 0
    if nativeEditing then beginEditing() else
        layout(cellSize)
        endEditing()
    end
end
ns.livePixels = {
    get = options,
    set = function(key, value)
        if key == "enabled" and type(value) == "boolean" then options().enabled = value
        elseif key == "theme" and (value == "amber" or value == "gray") then options().theme = value
        elseif key == "size" and type(value) == "number" and value >= 1.6 and value <= 8 then options().size = value
        else return end
        applyOptions()
    end,
    position = function()
        if read(InCombatLockdown) then return end
        if EditModeManagerFrame and type(EditModeManagerFrame.EnterEditMode) == "function" then
            EditModeManagerFrame:EnterEditMode()
        else
            SlashCmdList.GUILDIELIVEPIXELS("edit")
        end
    end,
    reset = function()
        options().x, options().y = 0, 0
        place(0, 0)
    end,
}
