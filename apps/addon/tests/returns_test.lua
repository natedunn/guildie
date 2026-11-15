-- Mail that comes back unopened: the sender's addon reports it against the
-- request it was sent for, even after that send was settled and acknowledged.
local wow = dofile("apps/addon/tests/wow.lua")
local ns = wow.load({guid = "Player-todd", name = "Todd", level = 20})
local callbacks, clock, bags = {}, 0, 0
local inboxQuantity, returned, from = 0, true, "Healing Optional"
hooksecurefunc = function(name, fn) callbacks[name] = fn end
SendMail, TakeInboxItem, AutoLootMailItem = function() end, function() end, function() end
GetTime = function() return clock end
GetInboxNumItems = function() return inboxQuantity > 0 and 1 or 0 end
-- A returned mail: canReply is false, and the sender is who it was for.
GetInboxHeaderInfo = function() return nil, nil, from, "", 0, 0, 30, 1, false, returned, false, not returned, false end
GetInboxItem = function(_, slot) if slot == 1 and inboxQuantity > 0 then return "Earthroot", 2449, nil, inboxQuantity end end
GetItemCount = function() return bags end
GetSendMailCOD = function() return 0 end
GetSendMailItem = function(slot) if slot == 1 then return "Earthroot", 2449, nil, 4 end end
UnitName = function(unit) return unit == "NPC" and "Healing" or "Todd" end
C_Item = nil
GuildieData = {requests = {[2449] = {{requestId = "earthroot", kind = "item", name = "Healing", slug = "healing-optional"}}}}
wow.fire("PLAYER_ENTERING_WORLD")
local function deliveries() return ns.current().deliveries or {} end

-- Todd mails 4 Earthroot; the request leaves GuildieData once the send fills it.
wow.fire("MAIL_SEND_INFO_UPDATE"); callbacks.SendMail("Healing"); wow.fire("MAIL_SEND_SUCCESS")
assert(#deliveries() == 1 and deliveries()[1].kind == "mailSent")
GuildieData.requests = {}

-- It comes back unopened ("Healing Optional" as the game shows it).
local function takeBack(n)
    inboxQuantity = n; wow.fire("MAIL_SHOW"); wow.fire("MAIL_INBOX_UPDATE")
    callbacks.TakeInboxItem(1, 1)
    inboxQuantity = 0; bags = bags + n; wow.fire("MAIL_SUCCESS"); wow.fire("MAIL_INBOX_UPDATE"); wow.fire("BAG_UPDATE_DELAYED")
    wow.fire("MAIL_CLOSED")
end
takeBack(4)
local back = deliveries()[2]
assert(back and back.kind == "mailReturned", "returned mail is reported")
assert(back.requestId == "earthroot" and back.other == "Healing Optional" and back.quantity == 4)
takeBack(4)
assert(#deliveries() == 2, "only what was sent comes back")

-- Mail returned from someone Todd never sent it to, and ordinary mail, are not returns.
GetSendMailItem = function(slot) if slot == 1 then return "Earthroot", 2449, nil, 2 end end
GuildieData.requests = {[2449] = {{requestId = "earthroot", kind = "item", name = "Healing", slug = "healing-optional"}}}
callbacks.SendMail("Healing"); wow.fire("MAIL_SEND_SUCCESS")
assert(#deliveries() == 3)
from = "Somebody Else"; takeBack(2)
assert(#deliveries() == 3, "no send to them on record")
from, returned = "Healing Optional", false; takeBack(2)
assert(#deliveries() == 3, "ordinary mail from the requester is not Todd's own request")
io.write("Delivery returns passed\n")
