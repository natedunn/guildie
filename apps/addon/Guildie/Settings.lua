local ADDON, ns = ...
function ns.settings()
    GuildieDB.settings = GuildieDB.settings or {}
    local s = GuildieDB.settings
    if s.minimapAngle == nil then s.minimapAngle = 220 end
    if s.showMinimap == nil then s.showMinimap = true end
    if s.reloadWhenAfk == nil then s.reloadWhenAfk = false end
    if s.sayWhyEmpty == nil then s.sayWhyEmpty = true end
    return s
end

-- Blizzard's category is only a launcher. All controls live in Guildie's window.
local root = CreateFrame("Frame", "GuildieSettingsPanel", UIParent)
root.name = "Guildie"
root:Hide()
local logo = root:CreateTexture(nil, "ARTWORK")
logo:SetTexture("Interface\\AddOns\\Guildie\\icon")
logo:SetSize(64, 64)
logo:SetPoint("TOPLEFT", 24, -24)
local name = root:CreateFontString(nil, "ARTWORK", "GameFontNormalLarge")
name:SetPoint("LEFT", logo, "RIGHT", 16, 8)
name:SetText("Guildie")
local description = root:CreateFontString(nil, "ARTWORK", "GameFontHighlight")
description:SetPoint("TOPLEFT", logo, "BOTTOMLEFT", 0, -20)
description:SetWidth(420)
description:SetJustifyH("LEFT")
description:SetText("Check your character's sync status and manage all Guildie settings in one window.")
local open = CreateFrame("Button", nil, root, "UIPanelButtonTemplate")
open:SetPoint("TOPLEFT", description, "BOTTOMLEFT", 0, -20)
open:SetSize(180, 28)
open:SetText("Open Guildie")
open:SetScript("OnClick", function()
    if SettingsPanel then SettingsPanel:Hide() end
    if InterfaceOptionsFrame then InterfaceOptionsFrame:Hide() end
    ns.openWindow("status")
end)
root.openButton = open
local registered
root:RegisterEvent("ADDON_LOADED")
root:SetScript("OnEvent", function()
    if registered then return end
    if Settings and Settings.RegisterCanvasLayoutCategory and Settings.RegisterAddOnCategory then
        Settings.RegisterAddOnCategory(Settings.RegisterCanvasLayoutCategory(root, "Guildie"))
        registered = true
    elseif InterfaceOptions_AddCategory then
        InterfaceOptions_AddCategory(root)
        registered = true
    end
end)
function ns.openSettings() ns.openWindow("settings") end

-- The Settings page: three sections (Sync, Live square, Display), each a
-- gold title over its rows. The sync method is one choice; rows that only
-- apply to one method show only with it.
function ns.buildSettingsRows(parent, width, changed)
    local rows, updates, controls = {}, {}, {}
    local function live() return ns.livePixels.get().enabled == true end
    local function section(title, visible)
        rows[#rows + 1] = {el = ns.sectionTitle(parent, title, width), height = 22, gap = #rows == 0 and 0 or 24, visible = visible}
    end
    local function note(value, visible, indent)
        local text = parent:CreateFontString(nil, "ARTWORK", "GameFontDisableSmall")
        text:SetWidth(width - (indent or 0))
        text:SetJustifyH("LEFT")
        if text.SetWordWrap then text:SetWordWrap(true) end
        text:SetText(value)
        rows[#rows + 1] = {el = text, gap = 2, visible = visible, dx = indent}
    end
    local function toggle(template, title, key, get, set, visible, indent)
        local ok, control = pcall(CreateFrame, "CheckButton", nil, parent, template)
        if not ok then control = CreateFrame("CheckButton", nil, parent, "UICheckButtonTemplate") end
        local text = control:CreateFontString(nil, "ARTWORK", "GameFontHighlight")
        text:SetPoint("LEFT", control, "RIGHT", 4, 0)
        text:SetWidth(width - 40 - (indent or 0))
        text:SetJustifyH("LEFT")
        text:SetText(title)
        control:SetHitRectInsets(0, -(width - 32 - (indent or 0)), 0, 0)
        control:SetScript("OnClick", function(self) set(self:GetChecked() == true); changed() end)
        rows[#rows + 1] = {el = control, height = 26, gap = 6, dx = (indent or 0) - 4, visible = visible}
        updates[#updates + 1] = function() control:SetChecked(get()) end
        controls[key] = control
    end
    local function preference(title, key, visible, indent)
        toggle("UICheckButtonTemplate", title, key, function() return ns.settings()[key] end, function(on)
            ns.settings()[key] = on
            if key == "showMinimap" then ns.updateMinimapButton() end
        end, visible, indent)
    end

    section("Sync")
    note("How your character gets to Guildie. The Guildie app must be running either way.")
    toggle("UIRadioButtonTemplate", "Live, as you play", "methodLive", live, function() ns.livePixels.set("enabled", true) end)
    note("The app reads a small square in a corner of your screen. Experimental.", nil, 24)
    toggle("UIRadioButtonTemplate", "When you reload or log out", "methodReload", function() return not live() end,
        function() ns.livePixels.set("enabled", false) end)
    preference("Also reload while AFK", "reloadWhenAfk", function() return not live() end, 24)
    note("Out of combat, at most every 20 minutes.", function() return not live() end, 52)
    note("Reload once after switching so the app picks up your choice.")
    -- The old checkbox's name, for anything still pointing at it.
    controls.syncEnabled = controls.methodLive

    section("Live square", live)
    note("Keep the whole square on screen and uncovered. Bank and recipes still need their windows opened.", live)
    note("Drag to move: drag the square, then Done. It also moves in the game's Edit Mode.", live)
    local group = CreateFrame("Frame", nil, parent)
    group:SetSize(width, 26)
    for i, spec in ipairs({{"Top left", "top"}, {"Bottom left", "bottom"}, {"Drag to move", "edit"}}) do
        local button = CreateFrame("Button", nil, group, "UIPanelButtonTemplate")
        button:SetPoint("TOPLEFT", (i - 1) * 132, 0)
        button:SetSize(i == 3 and 150 or 124, 24)
        button:SetText(spec[1])
        local action = spec[2]
        button:SetScript("OnClick", function()
            if InCombatLockdown and InCombatLockdown() then return end
            if action == "edit" then ns.buildWindow():Hide(); ns.livePixels.position()
            else ns.livePixels.corner(action) end
            changed()
        end)
        updates[#updates + 1] = function() button:SetEnabled(not (InCombatLockdown and InCombatLockdown())) end
    end
    rows[#rows + 1] = {el = group, gap = 10, height = 26, visible = live}
    toggle("UICheckButtonTemplate", "Larger square", "large", function() return (ns.livePixels.get().size or 1.6) > 1.6 end,
        function(on) ns.livePixels.set("size", on and 3.2 or 1.6) end, live)
    toggle("UICheckButtonTemplate", "Warn on screen when live sync stops", "showSyncWarning",
        function() return ns.settings().showSyncWarning ~= false end,
        function(on) ns.settings().showSyncWarning = on; ns.refreshSyncWarning() end, live)
    toggle("UICheckButtonTemplate", "Grayscale square (troubleshooting)", "gray", function() return ns.livePixels.get().theme == "gray" end,
        function(on) ns.livePixels.set("theme", on and "gray" or "amber") end, live)

    section("Display")
    preference("Minimap button", "showMinimap")
    preference("Explain empty item tooltips", "sayWhyEmpty")
    return rows, function() for _, update in ipairs(updates) do update() end end, controls
end
