local wow = dofile("apps/addon/tests/wow.lua")

local function pixelFrame()
    for _, f in ipairs(wow.frames) do
        if f.scripts.OnDragStop and f.scripts.OnUpdate and f.events.PLAYER_LOGIN then return f end
    end
    error("pixel export frame missing")
end

local ns = wow.load({})
UIParent.GetWidth = function() return 2560 end
UIParent.GetHeight = function() return 1440 end
UIParent.GetLeft = function() return 0 end
UIParent.GetTop = function() return 1440 end
UIParent.GetEffectiveScale = function() return 1 end
ns.livePixels.set("enabled", true)
ns.livePixels.corner("bottom")
local panel = pixelFrame()
panel.GetEffectiveScale = function() return 1 end
panel.GetLeft = function() return 1979 end
panel.GetTop = function() return 514 end
local hooks = {}
EditModeManagerFrame = {
    HookScript = function(_, event, fn) hooks[event] = fn end,
    IsShown = function() return false end,
}
wow.fire("PLAYER_LOGIN")
hooks.OnShow()
panel.scripts.OnDragStart(panel)
panel.scripts.OnDragStop(panel)
hooks.OnHide()
assert(GuildieDB.livePixels.corner == nil, "dragging clears the corner preset")
assert(GuildieDB.livePixels.x == 1979 and GuildieDB.livePixels.y == -926, "drag saves custom position")

local saved = GuildieDB
EditModeManagerFrame = nil
-- During reload, UIParent can still have smaller dimensions than at login.
ns = wow.load({db = saved, screenHeight = 768})
UIParent.GetWidth = function() return 1024 end
wow.fire("ADDON_LOADED", "Guildie")
panel = pixelFrame()
assert(panel.points[1][4] < 1024 and panel.points[1][5] > -768,
    "the square stays visible while screen dimensions are temporary")
assert(saved.livePixels.x == 1979 and saved.livePixels.y == -926,
    "restoring against temporary bounds must not overwrite the saved position")
UIParent.GetWidth = function() return 2560 end
UIParent.GetHeight = function() return 1440 end
wow.fire("PLAYER_LOGIN")
assert(panel.points[1][4] == 1979 and panel.points[1][5] == -926,
    "login restores the original dragged position")

-- A smaller display may clamp the frame, but returning to the original display
-- must restore the player's choice, including after preferences are changed.
UIParent.GetWidth = function() return 1024 end
UIParent.GetHeight = function() return 768 end
wow.fire("DISPLAY_SIZE_CHANGED")
ns.livePixels.set("size", 3.2)
ns.livePixels.set("enabled", false)
ns.livePixels.set("enabled", true)
assert(saved.livePixels.x == 1979 and saved.livePixels.y == -926, "preferences preserve the desired position")
UIParent.GetWidth = function() return 2560 end
UIParent.GetHeight = function() return 1440 end
wow.fire("DISPLAY_SIZE_CHANGED")
assert(panel.points[1][4] == 1979 and panel.points[1][5] == -926, "display changes restore the desired position")
print("Live pixel position persistence passed")
