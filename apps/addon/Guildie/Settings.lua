local ADDON, ns = ...
local panel = CreateFrame("Frame", "GuildieSettingsPanel", UIParent)
panel.name = "Guildie"
panel:Hide()
local function text(value, y, font)
    local label = panel:CreateFontString(nil, "ARTWORK", font or "GameFontHighlightSmall")
    label:SetPoint("TOPLEFT", 20, y)
    label:SetWidth(520)
    label:SetJustifyH("LEFT")
    label:SetText(value)
    return label
end
text("Guildie", -20, "GameFontNormalLarge")
text("Experimental sync without reloading", -58, "GameFontNormal")
text("Keeps your character data current through a small amber square. Enable capture in the Guildie app too. Bank and recipe updates still require opening their windows.", -84)
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
local enabled, updateEnabled = checkbox("Enable experimental sync", -132,
    function() return ns.livePixels.get().enabled == true end,
    function(on) ns.livePixels.set("enabled", on) end)
text("Remembered across logins. Turning this off hides the square; turn capture off in the app to stop screen capture entirely.", -173)
local gray, updateGray = checkbox("Use grayscale (troubleshooting)", -222,
    function() return ns.livePixels.get().theme == "gray" end,
    function(on) ns.livePixels.set("theme", on and "gray" or "amber") end)
local large, updateLarge = checkbox("Larger square", -260,
    function() return (ns.livePixels.get().size or 1.6) > 1.6 end,
    function(on) ns.livePixels.set("size", on and 3.2 or 1.6) end)
text("Amber is the default. Use the larger square if capture is unreliable. The app finds its position and appearance automatically.", -302)
local function button(label, x, y, click)
    local control = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
    control:SetPoint("TOPLEFT", x, y)
    control:SetSize(180, 26)
    control:SetText(label)
    control:SetScript("OnClick", click)
    return control
end
local move = button("Move in Edit Mode", 20, -356, function()
    if SettingsPanel and SettingsPanel.Hide then SettingsPanel:Hide() end
    if InterfaceOptionsFrame and InterfaceOptionsFrame.Hide then InterfaceOptionsFrame:Hide() end
    ns.livePixels.position()
end)
local reset = button("Reset position", 212, -356, function() ns.livePixels.reset() end)
local status = text("", -408)
refresh = function()
    updateEnabled(); updateGray(); updateLarge()
    local combat = InCombatLockdown and InCombatLockdown()
    move:SetEnabled(not combat)
    reset:SetEnabled(not combat)
    status:SetText(ns.livePixels.get().enabled and "Export enabled. Check the Guildie app for capture and upload status."
        or "Export disabled. Normal sync on logout or reload remains available.")
end
panel:SetScript("OnShow", refresh)
panel:RegisterEvent("PLAYER_REGEN_DISABLED")
panel:RegisterEvent("PLAYER_REGEN_ENABLED")
panel:RegisterEvent("ADDON_LOADED")
local registered
panel:SetScript("OnEvent", function()
    if not registered then
        if Settings and Settings.RegisterCanvasLayoutCategory and Settings.RegisterAddOnCategory then
            local category = Settings.RegisterCanvasLayoutCategory(panel, "Guildie")
            Settings.RegisterAddOnCategory(category)
            registered = true
        elseif InterfaceOptions_AddCategory then
            InterfaceOptions_AddCategory(panel)
            registered = true
        end
    end
    if panel:IsShown() then refresh() end
end)
