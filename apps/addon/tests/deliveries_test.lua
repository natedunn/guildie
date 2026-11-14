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
assert(ns.livePixels.get().enabled ~= true, "delivery capture works with live export disabled")
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
-- Live export and SavedVariables carry the same receipts, not separate deductions.
GuildieData.requests[4306][2] = nil
local originalId = ns.current().deliveries[1].id
local frame
for _, f in ipairs(wow.frames) do
    if f.scripts.OnDragStop and f.scripts.OnUpdate and f.events.PLAYER_LOGIN then frame = f end
end
assert(frame, "live export frame exists")
local encode, chunks, livePayload = GuildiePixelProtocol.encode, {}, nil
GuildiePixelProtocol.encode = function(packet)
    local channel, _, part, total, body = packet:match("^(%a)|([^|]+)|(%d+)|(%d+)|(.*)$")
    if channel == "S" then
        chunks[tonumber(part)] = body
        if part == total then livePayload = wow.decode(table.concat(chunks)) end
    end
    return encode(packet)
end
ns.livePixels.set("enabled", true)
for _ = 1, 1000 do
    if livePayload then break end
    frame.scripts.OnUpdate(frame, 0.1)
end
GuildiePixelProtocol.encode = encode
assert(livePayload and #livePayload.characters[1].deliveries == 4, "live snapshots include retained receipts")
assert(livePayload.characters[1].deliveries[1].id == originalId, "live export preserves receipt identity")
ns.livePixels.set("enabled", false)
assert(count() == 4, "switching transport neither consumes nor duplicates receipts")
wow.fire("PLAYER_LOGOUT")
local saved = GuildieDB
local payload = wow.decode(saved.payload)
assert(payload.version == 7 and #payload.characters[1].deliveries == 4)
for i, receipt in ipairs(payload.characters[1].deliveries) do
    local liveReceipt = livePayload.characters[1].deliveries[i]
    for key, value in pairs(receipt) do
        assert(liveReceipt[key] == value, "live and logout uploads carry identical receipt fields")
    end
end
ns = wow.load({db = saved, guid = "Player-delivery", name = "Receiver-Last"})
wow.fire("PLAYER_ENTERING_WORLD")
assert(count() == 4, "retained across reload")
assert(ns.current().deliveries[1].id == originalId, "reload preserves the deduplication key")
assert(ns.livePixels.get().enabled ~= true, "reload/logout path stays available without live export")
print("Delivery capture passed")

-- More than one wire window survives until the server acknowledges each event.
local c = ns.current()
GuildieDB.deliveryOutbox = {}
c.deliveries = {}
for i = 1, 205 do c.deliveries[i] = {id = "event-" .. i, at = GetServerTime()} end
ns.reconcileDeliveries(c)
assert(#c.deliveries == 200)
assert(#GuildieDB.deliveryOutbox[c.guid] == 205, "no eviction by age or window size")
GuildieData = {characters = {[c.name] = {details = {deliveryIds = {"event-1", "event-2"}}}}}
ns.reconcileDeliveries(c)
assert(#GuildieDB.deliveryOutbox[c.guid] == 203)
assert(c.deliveries[1].id == "event-3")
assert(c.deliveries[200].id == "event-202", "acknowledgements advance wire window")

-- Unacknowledged events past the server's 30 days go; recent ones stay.
GuildieDB.deliveryOutbox[c.guid][1].at = GetServerTime() - 32 * 86400
ns.reconcileDeliveries(c)
assert(#GuildieDB.deliveryOutbox[c.guid] == 202, "events the server would ignore are pruned")
print("Delivery outbox passed")

-- Forever names: Blizzard's name is the first name, the slug has the surname,
-- and the game may show either. Both match the request; another name doesn't.
local function fresh(name)
    ns = wow.load({guid = "Player-names", name = name, level = 20})
    callbacks = {}
    hooksecurefunc = function(n, fn) callbacks[n] = fn end
    wow.fire("PLAYER_ENTERING_WORLD")
end
local function receiveTrade(from)
    UnitName = function(unit) return unit == "NPC" and from or ns.current() and ns.current().name end
    GetTradeTargetItemInfo = function(slot) if slot == 1 then return "Cloth", nil, 3 end end
    GetTradeTargetItemLink = function(slot) if slot == 1 then return "item:4306" end end
    wow.fire("TRADE_SHOW"); wow.fire("TRADE_ACCEPT_UPDATE", 1, 0)
    wow.fire("UI_INFO_MESSAGE", 1, ERR_TRADE_COMPLETE)
    return #(ns.current().deliveries or {})
end
for _, case in ipairs({
    {me = "Bung", from = "Todd", n = 1},
    {me = "Bung Dingus", from = "Todd Bonzalezz", n = 1},
    {me = "Bung", from = "Todd-Bonzalezz", n = 1},
    {me = "Bung", from = "Toddy", n = 0},
    {me = "Bungo", from = "Todd", n = 0},
    {me = "Bung Other", from = "Todd", n = 0},
}) do
    fresh(case.me)
    GuildieData = {requests = {[4306] = {{requestId = "req2", kind = "item", name = "Bung", slug = "bung-dingus",
        claimedBy = {name = "Todd", slug = "todd-bonzalezz"}}}}}
    assert(receiveTrade(case.from) == case.n, case.me .. " from " .. case.from)
end
print("Delivery names passed")

-- Trades: "Trade complete" is the proof, even when both accepting is never
-- reported, and the accepted offer counts even if the window empties first.
-- Unrelated UI errors don't drop the trade; cancelled ones still don't count.
fresh("Bung")
GuildieData = {requests = {[4306] = {{requestId = "req2", kind = "item", name = "Bung", slug = "bung-dingus"}}}}
UnitName = function(unit) return unit == "NPC" and "Todd" or "Bung" end
local offer = 5
GetTradeTargetItemInfo = function(slot) if slot == 1 and offer > 0 then return "Cloth", nil, offer end end
GetTradeTargetItemLink = function(slot) if slot == 1 and offer > 0 then return "item:4306" end end
wow.fire("TRADE_SHOW"); wow.fire("TRADE_ACCEPT_UPDATE", 0, 1)
wow.fire("UI_ERROR_MESSAGE", 50, "Out of range.")
offer = 0; wow.fire("TRADE_TARGET_ITEM_CHANGED"); wow.fire("TRADE_CLOSED")
wow.fire("UI_INFO_MESSAGE", 1, ERR_TRADE_COMPLETE)
assert(#ns.current().deliveries == 1 and ns.current().deliveries[1].quantity == 5, "accepted offer counts")
offer = 5
wow.fire("TRADE_SHOW"); wow.fire("TRADE_ACCEPT_UPDATE", 1, 0); wow.fire("TRADE_ACCEPT_UPDATE", 0, 0)
offer = 2; wow.fire("TRADE_TARGET_ITEM_CHANGED")
wow.fire("UI_INFO_MESSAGE", 1, ERR_TRADE_COMPLETE)
assert(#ns.current().deliveries == 2 and ns.current().deliveries[2].quantity == 2, "a changed offer counts as changed")
wow.fire("TRADE_SHOW"); wow.fire("TRADE_ACCEPT_UPDATE", 1, 0); wow.fire("TRADE_REQUEST_CANCEL")
wow.fire("UI_INFO_MESSAGE", 1, ERR_TRADE_COMPLETE)
assert(#ns.current().deliveries == 2, "cancelled trade")
print("Delivery trades passed")

-- The trace: off by default, logs steps and decisions when on, never uploaded.
assert(not (GuildieDB.deliveryTrace and GuildieDB.deliveryTrace.enabled))
local printed = {}
print = function(line) printed[#printed + 1] = line end
SlashCmdList.GUILDIE("trace")
wow.fire("TRADE_SHOW"); wow.fire("TRADE_ACCEPT_UPDATE", 1, 0)
wow.fire("UI_INFO_MESSAGE", 1, ERR_TRADE_COMPLETE)
SlashCmdList.GUILDIE("trace")
print = _G.realPrint or io.write
local lines = table.concat(GuildieDB.deliveryTrace.lines, "\n")
assert(lines:find("identity") and lines:find("\"Bung\""), "identity logged")
assert(lines:find('"TRADE_ACCEPT_UPDATE" 1 0', 1, true) and lines:find("tradeReceived") and lines:find("request req2"), "steps and decision logged")
assert(table.concat(printed, "\n"):find("request req2"), "decisions printed")
assert(not GuildieDB.deliveryTrace.enabled)
wow.fire("PLAYER_LOGOUT")
assert(not GuildieDB.payload:find("identity"), "trace is not part of the upload")
io.write("Delivery trace passed\n")
