-- Accepted crafts (GuildieData.crafts): mats from the requester to the
-- crafter, the crafted item back, and an enchant over trade.
local wow = dofile("apps/addon/tests/wow.lua")
local callbacks, clock, bags = {}, 0, 0
local inbox = {}
local function load(name)
    callbacks = {}
    hooksecurefunc = function(n, fn) callbacks[n] = fn end
    SendMail, TakeInboxItem, AutoLootMailItem = function() end, function() end, function() end
    local ns = wow.load({guid = "Player-" .. name, name = name, level = 30})
    GetTime = function() return clock end
    GetUnitName = function(unit) return unit == "NPC" and _G.partner or (name == "Todd" and "Todd Bonzalezz" or "Miller Litesworth") end
    GetInboxNumItems = function() return #inbox end
    GetInboxHeaderInfo = function(i) return nil, nil, inbox[i].from, "", 0, 0, 30, 1, false, false, false, true, false end
    GetInboxItem = function(i, slot) local m = inbox[i]; if slot == 1 and m.count > 0 then return "x", m.id, nil, m.count end end
    GetItemCount = function() return bags end
    GetSendMailCOD = function() return 0 end
    C_Item = nil
    ERR_TRADE_COMPLETE = "Trade complete."
    GuildieData = {requests = {}, crafts = {
        {requestId = "bandage", itemId = 6450, reagents = {4306}, requester = {name = "Todd", slug = "todd-bonzalezz"},
            crafter = {name = "Miller", slug = "miller-litesworth"}},
        {requestId = "bracer", enchant = "Enchant Bracer - Minor Stamina", reagents = {10940},
            requester = {name = "Todd", slug = "todd-bonzalezz"}, crafter = {name = "Miller", slug = "miller-litesworth"}},
    }}
    wow.fire("PLAYER_ENTERING_WORLD")
    return ns
end
local function last(ns) local d = ns.current().deliveries or {}; return d[#d], #d end

-- Todd mails Miller 4 Silk Cloth: mats for the bandages.
local ns = load("Todd")
GetSendMailItem = function(slot) if slot == 1 then return "Silk Cloth", 4306, nil, 4 end end
wow.fire("MAIL_SEND_INFO_UPDATE"); callbacks.SendMail("Miller Litesworth"); wow.fire("MAIL_SEND_SUCCESS")
local d, n = last(ns)
assert(n == 1 and d.requestId == "bandage" and d.kind == "mailSent" and d.itemId == 4306 and d.quantity == 4, "mats sent")
-- Mailing them to someone else: nothing.
wow.fire("MAIL_SEND_INFO_UPDATE"); callbacks.SendMail("Brenna"); wow.fire("MAIL_SEND_SUCCESS")
assert(select(2, last(ns)) == 1, "mats to someone else")

-- Miller trades Todd 2 Silk Bandages: Todd's addon reports the crafted item.
_G.partner = "Miller Litesworth"
GetTradeTargetItemInfo = function(slot) if slot == 1 then return "Silk Bandage", nil, 2 end end
GetTradeTargetItemLink = function(slot) if slot == 1 then return "item:6450" end end
GetTradePlayerItemInfo = function() end
GetTradePlayerItemLink = function() end
wow.fire("TRADE_SHOW"); wow.fire("TRADE_ACCEPT_UPDATE", 0, 1); wow.fire("UI_INFO_MESSAGE", 1, ERR_TRADE_COMPLETE)
d, n = last(ns)
assert(n == 2 and d.requestId == "bandage" and d.kind == "tradeReceived" and d.itemId == 6450 and d.quantity == 2, "crafted item")

-- The enchant: Todd's bracers in slot 7, Miller casts on them.
GetTradeTargetItemInfo = function() end
GetTradeTargetItemLink = function() end
local enchant
GetTradePlayerItemInfo = function(slot)
    if slot == 7 then return "Sturdy Bracers", "Interface\\Icons\\INV_Bracer_07", 1, 2, enchant end
end
GetTradePlayerItemLink = function(slot) if slot == 7 then return "item:2453" end end
wow.fire("TRADE_SHOW")
enchant = "Minor Stamina"; wow.fire("TRADE_PLAYER_ITEM_CHANGED"); wow.fire("TRADE_ACCEPT_UPDATE", 1, 0)
wow.fire("TRADE_CLOSED"); wow.fire("UI_INFO_MESSAGE", 1, ERR_TRADE_COMPLETE)
d, n = last(ns)
assert(n == 3 and d.requestId == "bracer" and d.kind == "enchantReceived" and d.itemId == 2453 and d.quantity == 1, "enchant")
-- A different enchant, or none: nothing.
enchant = "Minor Spirit"
wow.fire("TRADE_SHOW"); wow.fire("TRADE_ACCEPT_UPDATE", 1, 0); wow.fire("UI_INFO_MESSAGE", 1, ERR_TRADE_COMPLETE)
assert(select(2, last(ns)) == 3, "another enchant")
enchant = nil
wow.fire("TRADE_SHOW"); wow.fire("TRADE_ACCEPT_UPDATE", 1, 0); wow.fire("UI_INFO_MESSAGE", 1, ERR_TRADE_COMPLETE)
assert(select(2, last(ns)) == 3, "no enchant: the texture path isn't one")
-- A cancelled enchant trade: nothing.
enchant = "Minor Stamina"
wow.fire("TRADE_SHOW"); wow.fire("TRADE_ACCEPT_UPDATE", 1, 0); wow.fire("TRADE_REQUEST_CANCEL")
wow.fire("UI_INFO_MESSAGE", 1, ERR_TRADE_COMPLETE)
assert(select(2, last(ns)) == 3, "cancelled")

-- Miller collects the Silk Cloth: his addon reports the mats arriving.
ns = load("Miller")
inbox = {{from = "Todd Bonzalezz", id = 4306, count = 4}}
wow.fire("MAIL_SHOW"); callbacks.TakeInboxItem(1, 1)
inbox[1].count = 0; wow.fire("MAIL_INBOX_UPDATE"); bags = 4; wow.fire("BAG_UPDATE_DELAYED")
d, n = last(ns)
assert(n == 1 and d.requestId == "bandage" and d.kind == "mailReceived" and d.quantity == 4, "mats received")
print("Crafts passed")
