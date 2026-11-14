local wow = dofile("apps/addon/tests/wow.lua")
local printed = {}
local realPrint = print
print = function(line) printed[#printed + 1] = line end
local ns = wow.load({guid = "Player-n", name = "Todd", level = 20})
GuildieData = {notifications = {
    {id = "a", text = "Miller will craft your Silk Bandage ×2"},
    {id = "b", text = "Brenna sent your |cffff0000Thing|r"},
    {id = 3, text = "bad"},
}}
wow.fire("PLAYER_ENTERING_WORLD")
assert(#printed == 2, "each valid notification printed")
assert(printed[1]:find("Miller will craft your Silk Bandage", 1, true))
assert(printed[2]:find("||cffff0000Thing||r", 1, true), "codes from data are shown, not used")
wow.fire("PLAYER_ENTERING_WORLD")
assert(#printed == 2, "never twice")
GuildieData.notifications[3] = {id = "c", text = "Your request for 20 Silk Cloth is complete"}
wow.fire("PLAYER_ENTERING_WORLD")
assert(#printed == 3 and printed[3]:find("complete", 1, true), "a new one prints")
GuildieData.notifications = {{id = "c", text = "x"}}
wow.fire("PLAYER_ENTERING_WORLD")
assert(GuildieDB.notified.a == nil and GuildieDB.notified.c, "ids no longer offered are forgotten")
GuildieData = nil
wow.fire("PLAYER_ENTERING_WORLD")
assert(#printed == 3, "no guild data: nothing")
print = realPrint
print("Notifications passed")
