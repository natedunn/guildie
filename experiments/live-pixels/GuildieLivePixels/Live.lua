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
    if #value > 0 then
        for i = 1, #value do parts[#parts + 1] = json(value[i]) end
        return "[" .. table.concat(parts, ",") .. "]"
    end
    for key, entry in pairs(value) do parts[#parts + 1] = json(tostring(key)) .. ":" .. json(entry) end
    table.sort(parts)
    return "{" .. table.concat(parts, ",") .. "}"
end
local function read(fn, ...)
    if type(fn) ~= "function" then return nil end
    local ok, value = pcall(fn, ...)
    if ok then return value end
end
local panel = CreateFrame("Frame", nil, UIParent)
panel:SetFrameStrata("TOOLTIP")
panel:SetScale(1 / UIParent:GetEffectiveScale())
panel:SetSize(256, 64)
panel:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 0, 0)
local cells = {}
for i = 1, 256 do
    local cell = panel:CreateTexture(nil, "OVERLAY")
    cell:SetSize(8, 8)
    cell:SetPoint("TOPLEFT", panel, "TOPLEFT", ((i - 1) % 32) * 8, -math.floor((i - 1) / 32) * 8)
    cells[i] = cell
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
        if ok then x, y = px, py end
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
        cells[i]:SetColorTexture(value / 255, value / 255, value / 255, 1)
    end
end)
SLASH_GUILDIELIVEPIXELS1 = "/guildiepixels"
SlashCmdList.GUILDIELIVEPIXELS = function(command)
    if command == "on" then
        snapshot, live = nil, nil
        panel:Show()
        print("Guildie pixels: experimental screen export enabled.")
    else
        panel:Hide()
        print("Guildie pixels: disabled. Use /guildiepixels on to enable.")
    end
end
