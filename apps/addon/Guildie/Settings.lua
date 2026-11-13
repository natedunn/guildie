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

-- Reusable rows inside the modal's scrolling Settings page.
function ns.buildSettingsRows(parent, width, changed)
    local rows, updates, controls = {}, {}, {}
    local function label(value, heading)
        local text = parent:CreateFontString(nil, "ARTWORK", heading and "GameFontNormal" or "GameFontHighlightSmall")
        text:SetWidth(width)
        text:SetJustifyH("LEFT")
        text:SetText(value)
        rows[#rows + 1] = {el = text, gap = heading and 22 or 8}
    end
    local function checkbox(title, key, get, set)
        local control = CreateFrame("CheckButton", nil, parent, "UICheckButtonTemplate")
        local text = control:CreateFontString(nil, "ARTWORK", "GameFontHighlight")
        text:SetPoint("LEFT", control, "RIGHT", 4, 0)
        text:SetWidth(width - 40)
        text:SetJustifyH("LEFT")
        text:SetText(title)
        control:SetHitRectInsets(0, -(width - 32), 0, 0)
        control:SetScript("OnClick", function(self) set(self:GetChecked() == true); changed() end)
        rows[#rows + 1] = {el = control, height = 32, gap = 8, dx = -4}
        updates[#updates + 1] = function() control:SetChecked(get()) end
        controls[key] = control
    end
    local function preference(title, key)
        checkbox(title, key, function() return ns.settings()[key] end, function(on)
            ns.settings()[key] = on
            if key == "showMinimap" then ns.updateMinimapButton() end
        end)
    end
    label("General", true)
    preference("Show minimap button", "showMinimap")
    preference("Explain empty tooltips", "sayWhyEmpty")
    preference("Reload while AFK (experimental)", "reloadWhenAfk")
    label("Saves for the app by reloading while AFK and out of combat, at most every 20 minutes.")
    label("Experimental pixel sync", true)
    label("The Guildie app reads character data from the colored square on your screen. Keep the whole square visible and unobstructed. Move it to a free corner, or use Edit Mode for a custom position.")
    checkbox("Enable experimental pixel sync", "syncEnabled", function() return ns.livePixels.get().enabled == true end,
        function(on) ns.livePixels.set("enabled", on) end)
    label("Reload once after enabling or disabling so the app can read your choice. Keep the app running. Bank and recipe data still require opening their windows.")
    checkbox("Show on-screen sync warning", "showSyncWarning", function() return ns.settings().showSyncWarning ~= false end,
        function(on) ns.settings().showSyncWarning = on; ns.refreshSyncWarning() end)
    label("Dismiss the on-screen warning with its close button. Sync details and warnings remain available on the Status tab.")
    checkbox("Larger square", "large", function() return (ns.livePixels.get().size or 1.6) > 1.6 end,
        function(on) ns.livePixels.set("size", on and 3.2 or 1.6) end)
    checkbox("Grayscale (troubleshooting)", "gray", function() return ns.livePixels.get().theme == "gray" end,
        function(on) ns.livePixels.set("theme", on and "gray" or "amber") end)
    local group = CreateFrame("Frame", nil, parent)
    group:SetSize(width, 28)
    for i, spec in ipairs({{"Move to top left", "top"}, {"Move to bottom left", "bottom"}, {"Open Edit Mode", "edit"}}) do
        local button = CreateFrame("Button", nil, group, "UIPanelButtonTemplate")
        button:SetPoint("TOPLEFT", (i - 1) * (width / 3), 0)
        button:SetSize(width / 3 - 8, 28)
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
    rows[#rows + 1] = {el = group, gap = 16, height = 28}
    label("Pixel output alone does not confirm a sync. Status compares actual data with the last server update loaded at login or reload; check the app for live capture and upload errors.")
    return rows, function() for _, update in ipairs(updates) do update() end end, controls
end
