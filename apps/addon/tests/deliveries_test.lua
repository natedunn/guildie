local wow = dofile("apps/addon/tests/wow.lua")
local ns = wow.load({guid = "Player-delivery", name = "Receiver-Last", level = 20})
local callbacks, clock, bags, cod, returned, sendCod = {}, 0, 0, 0, false, 0
hooksecurefunc = function(name, fn) callbacks[name] = fn end
SendMail, TakeInboxItem, AutoLootMailItem = function() end, function() end, function() end
GetTime = function() return clock end
GetInboxNumItems = function() return 1 end
GetInboxHeaderInfo = function() return nil, nil, "Sender-Last", "", 0, cod, 30, 1, false, returned, false, true, false end
GetInboxItem = function(_, slot) if slot == 1 then return "Cloth", 4306, nil, 7 end end
GetItemCount = function() return bags end
GetSendMailCOD = function() return sendCod end
GetSendMailItem = function(slot) if slot == 1 then return "Cloth", 4306, nil, 7 end end
C_Item = nil
GuildieData = {}
GuildieData.requests = {[4306] = {{requestId = "req1", kind = "item", name = "Receiver-Last", claimedBy = {name = "Sender-Last"}}}}
wow.fire("PLAYER_ENTERING_WORLD")
local function count() return #(ns.current().deliveries or {}) end
wow.fire("MAIL_SHOW")
callbacks.TakeInboxItem(1, 1)
wow.fire("MAIL_SUCCESS", 4306)
assert(count() == 0, "success event alone does not prove collection")
bags = 7
wow.fire("BAG_UPDATE_DELAYED")
assert(count() == 1 and ns.current().deliveries[1].kind == "mailReceived")
assert(ns.current().deliveries[1].reporterName == "Receiver-Last" and ns.current().deliveries[1].other == "Sender-Last", "both observed names captured")
wow.fire("MAIL_SUCCESS", 4306); wow.fire("BAG_UPDATE_DELAYED")
assert(count() == 1, "duplicate game events do not duplicate receipts")
callbacks.TakeInboxItem(1, 1)
wow.fire("MAIL_FAILED", 4306)
bags = 14; wow.fire("MAIL_SUCCESS", 4306); wow.fire("BAG_UPDATE_DELAYED")
assert(count() == 1, "failed take does not count")
returned = true; wow.fire("MAIL_INBOX_UPDATE"); callbacks.TakeInboxItem(1, 1)
bags = 21; wow.fire("MAIL_SUCCESS", 4306)
assert(count() == 1, "returned mail is excluded")
returned, cod = false, 20; wow.fire("MAIL_INBOX_UPDATE"); callbacks.TakeInboxItem(1, 1)
bags = 28; wow.fire("MAIL_SUCCESS", 4306)
assert(count() == 1, "COD excluded")
cod = 0; wow.fire("MAIL_INBOX_UPDATE")
callbacks.AutoLootMailItem(1); bags = 35; wow.fire("MAIL_SUCCESS", 4306)
assert(count() == 2, "open all collection supported")
callbacks.TakeInboxItem(1, 1); callbacks.TakeInboxItem(1, 1)
bags = 49; wow.fire("MAIL_SUCCESS", 4306)
assert(count() == 2, "ambiguous overlapping actions fail closed")
wow.fire("MAIL_CLOSED")
-- Send failure/success, excluding COD. Post-hook stores recipient passed to API, not a UI widget.
UnitName = function(unit) return unit == "NPC" and "Receiver-Last" or "Sender-Last" end
wow.fire("MAIL_SEND_INFO_UPDATE"); callbacks.SendMail("Receiver-Last")
wow.fire("MAIL_FAILED"); wow.fire("MAIL_SEND_SUCCESS")
assert(count() == 2)
wow.fire("MAIL_SEND_INFO_UPDATE"); callbacks.SendMail("Receiver-Last"); wow.fire("MAIL_SEND_SUCCESS")
assert(count() == 3 and ns.current().deliveries[3].kind == "mailSent")
sendCod = 10; callbacks.SendMail("Receiver-Last"); wow.fire("MAIL_SEND_SUCCESS"); assert(count() == 3)
-- Trade: count only the receiver's incoming items after explicit success. Both accept is not success.
UnitName = function(unit) return unit == "NPC" and "Sender-Last" or "Receiver-Last" end
GetTradeTargetItemInfo = function(slot) if slot == 1 or slot == 7 then return "Cloth", nil, 7 end end
GetTradeTargetItemLink = function(slot) if slot == 1 or slot == 7 then return "item:4306" end end
GetTradePlayerItemInfo = function() end
GetTradePlayerItemLink = function() end
ERR_TRADE_COMPLETE = "Trade complete."
wow.fire("TRADE_SHOW"); wow.fire("TRADE_ACCEPT_UPDATE", 1, 1); wow.fire("TRADE_CLOSED")
assert(count() == 3)
wow.fire("UI_INFO_MESSAGE", 1, ERR_TRADE_COMPLETE)
assert(count() == 4 and ns.current().deliveries[4].quantity == 7, "enchant slot excluded")
wow.fire("UI_INFO_MESSAGE", 1, ERR_TRADE_COMPLETE); assert(count() == 4)
wow.fire("TRADE_SHOW"); wow.fire("TRADE_ACCEPT_UPDATE", 1, 1); wow.fire("TRADE_REQUEST_CANCEL")
wow.fire("UI_INFO_MESSAGE", 1, ERR_TRADE_COMPLETE); assert(count() == 4)
wow.fire("TRADE_SHOW"); wow.fire("TRADE_ACCEPT_UPDATE", 1, 1); wow.fire("TRADE_CLOSED")
clock = 10; wow.fire("UI_INFO_MESSAGE", 1, ERR_TRADE_COMPLETE); assert(count() == 4, "stale trade ignored")
-- Ambiguous request cache requires manual confirmation.
GuildieData.requests[4306][2] = GuildieData.requests[4306][1]
wow.fire("TRADE_SHOW"); wow.fire("TRADE_ACCEPT_UPDATE", 1, 1); wow.fire("UI_INFO_MESSAGE", 1, ERR_TRADE_COMPLETE)
assert(count() == 4)
wow.fire("PLAYER_LOGOUT")
local saved = GuildieDB
local payload = wow.decode(saved.payload)
assert(payload.version == 6 and #payload.characters[1].deliveries == 4)
ns = wow.load({db = saved, guid = "Player-delivery", name = "Receiver-Last"})
wow.fire("PLAYER_ENTERING_WORLD")
assert(count() == 4, "retained across reload")
print("Delivery capture passed")
