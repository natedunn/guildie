local wow = dofile("apps/addon/tests/wow.lua")
local ns = wow.load({})
local registered = 0
Settings = {
    RegisterCanvasLayoutCategory = function(panel, name)
        assert(panel == GuildieSettingsPanel and name == "Guildie")
        return {id = 1}
    end,
    RegisterAddOnCategory = function(category) assert(category.id == 1); registered = registered + 1 end,
}
wow.fire("ADDON_LOADED", "Guildie")
wow.fire("ADDON_LOADED", "Other")
assert(registered == 1, "settings register once")
assert(ns.livePixels.get().enabled ~= true, "disabled by default")
ns.openSettings()
local control = GuildieWindow.preferences.syncEnabled
assert(control, "in-game enable checkbox exists")
control:SetChecked(true)
control.scripts.OnClick(control)
assert(ns.livePixels.get().enabled == true, "UI enables export")
ns.livePixels.set("theme", "gray")
ns.livePixels.set("size", 3.2)
assert(ns.livePixels.get().theme == "gray" and ns.livePixels.get().size == 3.2)
local saved = GuildieDB
ns = wow.load({db = saved})
wow.fire("ADDON_LOADED", "Guildie")
assert(ns.livePixels.get().enabled == true and ns.livePixels.get().theme == "gray", "preferences survive reload")
ns.livePixels.set("enabled", false)
assert(not GuildieDB.livePixels.enabled)
print("Live pixel settings passed")

-- The UI scale can change after the pixel frame was constructed. Both supported
-- sizes must still occupy whole physical pixels, including after a display event.
local pixelFrame
for _, f in ipairs(wow.frames) do
    if f.scripts.OnDragStop and f.scripts.OnUpdate and f.events.PLAYER_LOGIN then pixelFrame = f end
end
assert(pixelFrame, "pixel export frame exists")
assert(pixelFrame.points[1][4] > 0 and pixelFrame.points[1][5] < 0,
    "fresh default is inset from screen edges")
ns.livePixels.set("enabled", true)
ns.livePixels.reset()
assert(GuildieDB.livePixels.enabled == true, "settings reset preserves export preference")
assert(GuildieDB.livePixels.x > 0 and GuildieDB.livePixels.y < 0,
    "reset uses an inset position")
GuildieDB.livePixels.corner = nil
GuildieDB.livePixels.x, GuildieDB.livePixels.y = 123, -234
wow.fire("ADDON_LOADED", "Guildie")
assert(pixelFrame.points[1][4] == 123 and pixelFrame.points[1][5] == -234,
    "saved custom position is preserved")
SlashCmdList.GUILDIELIVEPIXELS("reset")
assert(GuildieDB.livePixels.x > 0 and GuildieDB.livePixels.y < 0,
    "slash reset uses the same inset default")
assert(GuildieDB.livePixels.enabled == false, "slash reset still disables export")
GetPhysicalScreenSize = function() return 2578, 1462 end
UIParent.GetWidth = function() return 2061.3420410156 end
UIParent.GetEffectiveScale = function() return 0.65697175264359 end
local ratio = 2578 / (UIParent:GetWidth() * UIParent:GetEffectiveScale())
UIParent.GetHeight = function() return 1462 / (ratio * UIParent:GetEffectiveScale()) end
for _, actualScale in ipairs({0.65697175264359, 1, 1.25}) do
    pixelFrame.GetEffectiveScale = function() return actualScale end
    ns.livePixels.reset()
    assert(math.abs(GuildieDB.livePixels.x * ratio * actualScale - 12) < 0.00001,
        "default inset stays twelve physical pixels at different scales")
    assert(math.abs(GuildieDB.livePixels.y + GuildieDB.livePixels.x) < 0.00001, "equal top and left inset")
    for _, size in ipairs({1.6, 3.2}) do
        ns.livePixels.set("size", size)
        local expected = size == 1.6 and 32 or 64
        assert(math.abs(pixelFrame:GetWidth() * ratio * actualScale - expected) < 0.00001,
            "square dimensions account for actual frame scale")
    end
end
pixelFrame.GetEffectiveScale = function() return 0.8 end
wow.fire("UI_SCALE_CHANGED")
assert(math.abs(pixelFrame:GetWidth() * ratio * 0.8 - 64) < 0.00001, "resizes after UI scale changes")
GetPhysicalScreenSize = nil
print("Live pixel physical sizing passed")

ns.livePixels.set("enabled", true)
ns.livePixels.corner("bottom")
local bottomY = GuildieDB.livePixels.y
assert(bottomY < -GuildieDB.livePixels.x, "bottom left sits below top left")
ns.livePixels.corner("top")
assert(math.abs(GuildieDB.livePixels.y + GuildieDB.livePixels.x) < 0.00001, "top left uses inset")
assert(GuildieDB.livePixels.enabled, "moving preserves export preference")
Guildie_OnAddonCompartmentClick()
assert(GuildieWindow:IsShown() and GuildieWindow.page == "status", "addon compartment opens Status")
ns.updateMinimapButton()
ns.openSettings()
GuildieMinimapButton.scripts.OnClick()
assert(GuildieWindow.page == "status", "minimap opens the same Status window")
GuildieSettingsPanel.openButton.scripts.OnClick()
assert(GuildieWindow.page == "status", "Options launcher opens the same window")
-- Offset UIParent origins and resolution changes: verify actual physical edges.
GetPhysicalScreenSize = function() return 1920, 1080 end
UIParent.GetWidth = function() return 1600 end
UIParent.GetHeight = function() return 900 end
UIParent.GetEffectiveScale = function() return 0.75 end
UIParent.GetLeft = function() return -8 end
UIParent.GetTop = function() return 908 end
local ratio = 1920 / (1600 * 0.75)
for _, scale in ipairs({0.6, 1, 1.25}) do
    pixelFrame.GetEffectiveScale = function() return scale end
    for _, size in ipairs({1.6, 3.2}) do
        ns.livePixels.set("size", size)
        for _, edge in ipairs({"top", "bottom"}) do
            ns.livePixels.corner(edge)
            local x, y = GuildieDB.livePixels.x, GuildieDB.livePixels.y
            local left = (-8 * 0.75 + x * scale) * ratio
            local top = (908 * 0.75 + y * scale) * ratio
            assert(math.abs(left - 12) < 0.00001, "physical left inset")
            if edge == "top" then assert(math.abs(top - 1068) < 0.00001, "physical top inset")
            else assert(math.abs(top - pixelFrame:GetHeight() * scale * ratio - 12) < 0.00001, "physical bottom inset") end
        end
        wow.fire("DISPLAY_SIZE_CHANGED")
        assert(GuildieDB.livePixels.corner == "bottom", "corner survives resize")
    end
end
GuildieDB.livePixels.corner, GuildieDB.livePixels.x, GuildieDB.livePixels.y = nil, -9999, 9999
wow.fire("UI_SCALE_CHANGED")
assert(GuildieDB.livePixels.x > 0 and GuildieDB.livePixels.y < 0, "unsafe saved position is clamped")
GetPhysicalScreenSize = nil
-- Fallback editing must not silently disable the saved export setting.
EditModeManagerFrame = nil
ns.livePixels.set("enabled", true)
ns.livePixels.position()
assert(ns.livePixels.get().enabled and ns.livePixels.health().editing)
for _, f in ipairs(wow.frames) do
    if rawget(f, "_text") == "Done" and f.scripts.OnClick then f.scripts.OnClick() end
end
assert(ns.livePixels.get().enabled and not ns.livePixels.health().editing)
-- Export failures surface in game, rather than looking successfully connected.
GuildieDB.characters = {test = {oversize = string.rep("x", 1048577)}}
ns.livePixels.set("enabled", true)
for i = 1, 4 do
    if not ns.livePixels.health().error then pixelFrame.scripts.OnUpdate(pixelFrame, 0.1) end
end
assert(ns.livePixels.health().error, "oversize snapshots report a local failure")
ns.refreshSyncWarning()
assert(GuildieSyncWarning.text:GetText():find("Too much data", 1, true))
