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
local control
for _, f in ipairs(wow.frames) do
    for _, point in ipairs(f.points) do
        -- Settings checkbox uses the short SetPoint overload in the stub.
        if point[1] == "TOPLEFT" and point[2] == 16 and point[3] == -132 then control = f end
    end
end
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
GetPhysicalScreenSize = function() return 2578, 1462 end
UIParent.GetWidth = function() return 2061.3420410156 end
UIParent.GetEffectiveScale = function() return 0.65697175264359 end
local ratio = 2578 / (UIParent:GetWidth() * UIParent:GetEffectiveScale())
for _, actualScale in ipairs({0.65697175264359, 1, 1.25}) do
    pixelFrame.GetEffectiveScale = function() return actualScale end
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
