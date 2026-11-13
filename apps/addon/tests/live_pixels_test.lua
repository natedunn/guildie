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
