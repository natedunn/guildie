local ADDON, ns = ...
local function settings()
    GuildieDB.settings = GuildieDB.settings or {}
    local s = GuildieDB.settings
    if s.minimapAngle == nil then s.minimapAngle = 220 end
    if s.showMinimap == nil then s.showMinimap = true end
    if s.reloadWhenAfk == nil then s.reloadWhenAfk = false end
    if s.sayWhyEmpty == nil then s.sayWhyEmpty = true end
    return s
end
ns.settings = settings

local root = CreateFrame("Frame", "GuildieSettingsPanel", UIParent)
local panel = CreateFrame("Frame", nil, root)
panel:SetAllPoints(root)
root.name = "Guildie"
root:Hide()
local function text(value, y, font)
    local label = panel:CreateFontString(nil, "ARTWORK", font or "GameFontHighlightSmall")
    label:SetPoint("TOPLEFT", 20, y)
    label:SetWidth(520)
    label:SetJustifyH("LEFT")
    label:SetText(value)
    return label
end

text("Experimental sync without reloading", -58, "GameFontNormal")
text("The square shows your character data as colors that the Guildie app reads from your screen. Keep it visible and uncovered; move it to a free corner or use Edit Mode for a custom position. Reload once after enabling or disabling sync so the app can read your choice.", -84)
local refresh
local function checkbox(label, y, get, set)
    local control = CreateFrame("CheckButton", nil, panel, "UICheckButtonTemplate")
    control:SetPoint("TOPLEFT", 16, y)
    local title = control:CreateFontString(nil, "ARTWORK", "GameFontHighlight")
    title:SetPoint("LEFT", control, "RIGHT", 4, 0)
    title:SetText(label)
    control:SetHitRectInsets(0, -(title:GetStringWidth() + 8), 0, 0)
    control:SetScript("OnClick", function(self) set(self:GetChecked() == true); refresh() end)
    return control, function() control:SetChecked(get()) end
end
local enabled, updateEnabled = checkbox("Enable experimental sync", -158,
    function() return ns.livePixels.get().enabled == true end,
    function(on) ns.livePixels.set("enabled", on) end)
root.syncEnabled = enabled
text("After changing this setting, type /reload. Once enabled, updates sync live without further reloads. Bank and recipe updates still need their windows opened.", -200)
local gray, updateGray = checkbox("Use grayscale (troubleshooting)", -245,
    function() return ns.livePixels.get().theme == "gray" end,
    function(on) ns.livePixels.set("theme", on and "gray" or "amber") end)
local large, updateLarge = checkbox("Larger square", -283,
    function() return (ns.livePixels.get().size or 1.6) > 1.6 end,
    function(on) ns.livePixels.set("size", on and 3.2 or 1.6) end)
text("Amber is the default. Use the larger square if capture is unreliable. The app finds its position and appearance automatically.", -325)
local function button(label, x, y, click)
    local control = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
    control:SetPoint("TOPLEFT", x, y)
    control:SetSize(180, 26)
    control:SetText(label)
    control:SetScript("OnClick", click)
    return control
end
local move = button("Open Edit Mode", 20, -411, function()
    if SettingsPanel and SettingsPanel.Hide then SettingsPanel:Hide() end
    if InterfaceOptionsFrame and InterfaceOptionsFrame.Hide then InterfaceOptionsFrame:Hide() end
    ns.livePixels.position()
end)
local top = button("Move to top left", 20, -375, function() ns.livePixels.corner("top") end)
local bottom = button("Move to bottom left", 212, -375, function() ns.livePixels.corner("bottom") end)
local status = text("", -455)
refresh = function()
    updateEnabled(); updateGray(); updateLarge()
    local combat = InCombatLockdown and InCombatLockdown()
    move:SetEnabled(not combat)
    top:SetEnabled(not combat)
    bottom:SetEnabled(not combat)
    status:SetText(ns.livePixels.get().enabled and "Export enabled. Check the Guildie app for capture and upload status."
        or "Export disabled. Normal sync on logout or reload remains available.")
end
panel:SetScript("OnShow", refresh)
root:RegisterEvent("PLAYER_REGEN_DISABLED")
root:RegisterEvent("PLAYER_REGEN_ENABLED")
root:RegisterEvent("ADDON_LOADED")
local registered, categoryID
root:SetScript("OnEvent", function()
    if not registered then
        if Settings and Settings.RegisterCanvasLayoutCategory and Settings.RegisterAddOnCategory then
            local category = Settings.RegisterCanvasLayoutCategory(root, "Guildie")
            Settings.RegisterAddOnCategory(category)
            categoryID = category.GetID and category:GetID() or category.ID or category.id
            registered = true
        elseif InterfaceOptions_AddCategory then
            InterfaceOptions_AddCategory(root)
            registered = true
        end
    end
    if panel:IsShown() then refresh() end
end)

-- Keep all preferences in Blizzard's addon settings, with two compact pages.
local syncPanel = panel
local general = CreateFrame("Frame", nil, root)
general:SetAllPoints(root)
panel = general
text("General", -58, "GameFontNormal")
local updates = {}
root.preferences = {}
local function preference(label, y, key, changed)
    local control, update = checkbox(label, y,
        function() return ns.settings()[key] end,
        function(on)
            ns.settings()[key] = on
            if changed then changed() end
        end)
    root.preferences[key] = control
    updates[#updates + 1] = update
end
preference("Show minimap button", -92, "showMinimap", function() ns.updateMinimapButton() end)
preference("Say why tooltips have nothing", -132, "sayWhyEmpty")
preference("Sync while I'm AFK (experimental)", -172, "reloadWhenAfk")
text("Reloads your UI while AFK, out of combat, at most every 20 minutes. Keep the Guildie app running.", -216)
button("Character sync status", 20, -270, function()
    if SettingsPanel then SettingsPanel:Hide() end
    if InterfaceOptionsFrame then InterfaceOptionsFrame:Hide() end
    ns.toggleWindow()
end)
general:SetScript("OnShow", function() for _, update in ipairs(updates) do update() end end)
local generalTab, syncTab
local function selectPage(live)
    general:SetShown(not live)
    syncPanel:SetShown(live)
    if generalTab then generalTab:SetEnabled(live); syncTab:SetEnabled(not live) end
end
panel = root
generalTab = button("General", 20, -16, function() selectPage(false) end)
syncTab = button("Experimental sync", 212, -16, function() selectPage(true) end)
selectPage(false)
function ns.openSettings()
    selectPage(false)
    if Settings and Settings.OpenToCategory and categoryID then
        Settings.OpenToCategory(categoryID)
    elseif InterfaceOptionsFrame_OpenToCategory then
        InterfaceOptionsFrame_OpenToCategory(root)
    end
end
