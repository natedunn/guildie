-- Observe completed mail/trades; never send mail, collect items, or accept trades.
local _, ns = ...
local MAX_RECORDS = 200
-- The server ignores events older than 30 days, so older unacknowledged ones
-- (a character that never synced again) can go.
local MAX_AGE = 31 * 86400
local TRACE_LINES = 400

-- `/guildie trace`: a local log of every mail and trade step and each match
-- decision, kept in SavedVariables (GuildieDB.deliveryTrace, written at
-- /reload or logout) and never uploaded. For checking what Forever's client
-- actually does; decisions are also printed to chat.
local function traceOn()
    return GuildieDB and GuildieDB.deliveryTrace and GuildieDB.deliveryTrace.enabled
end
local function trace(loud, ...)
    if not traceOn() then return end
    local parts = {}
    for i = 1, select("#", ...) do
        local v = select(i, ...)
        parts[#parts + 1] = type(v) == "string" and string.format("%q", v) or tostring(v)
    end
    local line = table.concat(parts, " ")
    local lines = GuildieDB.deliveryTrace.lines
    lines[#lines + 1] = (date and date("%H:%M:%S") or "") .. " " .. line
    while #lines > TRACE_LINES do table.remove(lines, 1) end
    if loud and print then print("Guildie trace: " .. line) end
end
ns.deliveryTrace = trace
function ns.toggleDeliveryTrace()
    GuildieDB.deliveryTrace = GuildieDB.deliveryTrace or {lines = {}}
    local t = GuildieDB.deliveryTrace
    t.lines = t.lines or {}
    t.enabled = not t.enabled
    if t.enabled then
        print("Guildie: delivery trace on. Mail and trades are logged to SavedVariables at /reload; /guildie trace again turns it off.")
        -- How this client names characters (does UnitName include the surname?).
        trace(true, "identity", "UnitName", UnitName("player"),
            "GetUnitName", GetUnitName and GetUnitName("player", true) or nil,
            "UnitFullName", UnitFullName and table.concat({tostring((UnitFullName("player"))), tostring(select(2, UnitFullName("player")))}, " / ") or nil,
            "guid", UnitGUID("player"))
    else
        print("Guildie: delivery trace off.")
    end
end
-- Saved independently of the transmitted window: unacknowledged events do not
-- expire or get pushed out by newer mail. Acknowledgements load on login/reload.
function ns.reconcileDeliveries(c)
    GuildieDB.deliveryOutbox = GuildieDB.deliveryOutbox or {}
    local records = GuildieDB.deliveryOutbox[c.guid] or c.deliveries or {}
    local entry = ns.status and ns.status.find(GuildieData, c.guid, c.name)
    local acknowledged = {}
    for _, id in ipairs(entry and entry.details and entry.details.deliveryIds or {}) do acknowledged[id] = true end
    local kept, window = {}, {}
    local oldest = GetServerTime and GetServerTime() - MAX_AGE or 0
    for _, event in ipairs(records) do
        if not acknowledged[event.id] and (event.at or oldest) >= oldest then
            kept[#kept + 1] = event
            if #window < MAX_RECORDS then window[#window + 1] = event end
        end
    end
    GuildieDB.deliveryOutbox[c.guid] = kept
    c.deliveries = window
    return kept
end
local function nameKey(name)
    if type(name) ~= "string" then return nil end
    local key = name:match("^%s*(.-)%s*$"):lower():gsub(" ", "-")
    return key ~= "" and key or nil
end
-- Blizzard's name for a Forever character is the first name only and its
-- slug is `{name}-{surname}`; the game may show either. Same rule as the
-- server's `sameCharacter` (shared/requests.ts).
local function sameCharacter(observed, name, slug)
    local key = nameKey(observed)
    return key ~= nil and (key == nameKey(name) or (type(slug) == "string" and key == slug:lower()))
end
local function itemID(link)
    return type(link) == "string" and tonumber(link:match("item:(%d+)")) or nil
end
local function requestsFor(id, recipient, sender)
    local matches = {}
    local rows = GuildieData and GuildieData.requests and GuildieData.requests[id] or {}
    for _, r in ipairs(rows) do
        local claim = r.claimedBy
        if r.kind == "item" and r.requestId and sameCharacter(recipient, r.name, r.slug)
            and (not claim or sameCharacter(sender, claim.name, claim.slug)) then
            matches[#matches + 1] = r.requestId
        end
    end
    -- Ambiguity or stale/missing guild data: use manual completion instead.
    return #matches == 1 and matches[1] or nil, #rows, #matches
end
-- Forever: UnitName gives the first name, GetUnitName(unit, true) the full
-- "Name Surname" (both match; the full one is exact and reads better in the feed).
local function fullName(unit)
    local name = GetUnitName and GetUnitName(unit, true)
    if type(name) ~= "string" or name == "" then name = UnitName(unit) end
    return name
end
local function record(kind, other, items)
    local guid, me = UnitGUID("player"), fullName("player")
    if not guid or not nameKey(other) or other == "" then return end
    local c = GuildieDB.characters and GuildieDB.characters[guid]
    if not c then ns.capture("delivery"); c = GuildieDB.characters and GuildieDB.characters[guid] end
    if not c then return end
    local received = kind == "mailReceived" or kind == "tradeReceived"
    local now, records = GetServerTime(), ns.reconcileDeliveries(c)
    for id, quantity in pairs(items) do
        local recipient, sender = received and me or other, received and other or me
        local requestId, requests, matches = requestsFor(id, recipient, sender)
        trace(true, kind, "item", id, "x" .. quantity, "from", sender, "to", recipient,
            requestId and ("-> request " .. requestId)
                or ("-> no match (" .. requests .. " requests for this item, " .. matches .. " matched)"))
        if requestId and quantity > 0 then
            c.deliverySequence = (c.deliverySequence or 0) + 1
            records[#records + 1] = {id = guid .. ":" .. now .. ":" .. c.deliverySequence,
                requestId = requestId, kind = kind, reporterName = me, other = other, itemId = id, quantity = quantity, at = now}
        end
    end
    GuildieDB.deliveryOutbox[c.guid] = records
    ns.reconcileDeliveries(c)
end
local function add(items, id, count)
    if type(id) == "number" and id > 0 and type(count) == "number" and count > 0 then
        items[id] = (items[id] or 0) + count
    end
end
local function bagCount(id)
    local get = C_Item and C_Item.GetItemCount or GetItemCount
    return get and get(id, false) or nil
end
local inbox, outgoing, pendingSend, pendingTake, trade = {}, {}, nil, nil, nil
local hooks = {}
local function refreshInbox()
    inbox = {}
    if not GetInboxNumItems or not GetInboxHeaderInfo or not GetInboxItem then return end
    local count = GetInboxNumItems()
    for i = 1, count do
        local _, _, sender, _, _, cod, _, _, _, wasReturned, _, canReply, isGM = GetInboxHeaderInfo(i)
        -- Player mail only; returned items and COD are not ordinary fulfillment.
        if sender and not wasReturned and canReply and not isGM and (cod or 0) == 0 then
            local slots = {}
            for slot = 1, (ATTACHMENTS_MAX_RECEIVE or 16) do
                local _, id, _, quantity = GetInboxItem(i, slot)
                if id and quantity then slots[slot] = {id = id, quantity = quantity} end
            end
            inbox[i] = {sender = sender, slots = slots}
        end
    end
end
-- How many of an item mail from this sender in the inbox holds now (live,
-- so it holds up when mail is removed and the indexes shift).
local function inboxCount(sender, id)
    local total = 0
    for i = 1, GetInboxNumItems() do
        local _, _, from = GetInboxHeaderInfo(i)
        if from == sender then
            for slot = 1, (ATTACHMENTS_MAX_RECEIVE or 16) do
                local _, itemId, _, quantity = GetInboxItem(i, slot)
                if itemId == id and quantity then total = total + quantity end
            end
        end
    end
    return total
end
local finishTake
local function prepareTake(index, slot)
    -- Open All takes the next mail as soon as the last one moved: settle that first.
    if pendingTake then finishTake() end
    if pendingTake and GetTime() - pendingTake.started < 30 then
        -- Concurrent operations cannot be attributed safely. Fail closed.
        trace(true, "take", index, slot, "-> ignored: another collection is still pending")
        pendingTake = {started = GetTime(), ambiguous = true}
        return
    end
    pendingTake = nil
    local mail = inbox[index]
    trace(false, "take", index, slot, "sender", mail and mail.sender or "(not player mail, COD or returned)")
    if not mail then return end
    local items, before, inboxBefore = {}, {}, {}
    for n, entry in pairs(mail.slots) do
        if not slot or n == slot then add(items, entry.id, entry.quantity) end
    end
    for id in pairs(items) do
        before[id] = bagCount(id)
        if before[id] == nil then trace(true, "take", "-> no bag count API"); return end
        inboxBefore[id] = inboxCount(mail.sender, id)
        trace(false, "take", "item", id, "x" .. items[id], "bags before", before[id], "inbox before", inboxBefore[id])
    end
    pendingTake = {sender = mail.sender, items = items, before = before, inboxBefore = inboxBefore, started = GetTime()}
end
-- Forever's MAIL_SUCCESS carries no item ID, so a collection counts when both
-- sides show it: the items left this sender's mail and arrived in the bags,
-- each by the full amount. A failed take (bags full) moves neither.
finishTake = function()
    local p = pendingTake
    if not p or p.ambiguous then return end
    if GetTime() - p.started > 30 then pendingTake = nil; return end
    for id, quantity in pairs(p.items) do
        local count, left = bagCount(id), p.inboxBefore[id] - inboxCount(p.sender, id)
        trace(false, "collect", "item", id, "left inbox", left, "bags now", count)
        if left >= quantity and count and count - p.before[id] >= quantity then
            record("mailReceived", p.sender, {[id] = quantity})
            p.items[id] = nil
        end
    end
    if not next(p.items) then pendingTake = nil end
end
local function refreshSend()
    outgoing = {}
    if not GetSendMailItem then return end
    for slot = 1, (ATTACHMENTS_MAX_SEND or 12) do
        local _, id, _, count = GetSendMailItem(slot)
        add(outgoing, id, count)
    end
end
local function readTrade()
    if not GetTradeTargetItemInfo or not GetTradePlayerItemInfo or not GetTradeTargetItemLink or not GetTradePlayerItemLink then return nil end
    local incoming, sent = {}, {}
    for slot = 1, 6 do -- Excludes the enchant/service slot.
        local _, _, count = GetTradeTargetItemInfo(slot)
        add(incoming, itemID(GetTradeTargetItemLink(slot)), count)
        local _, _, given = GetTradePlayerItemInfo(slot)
        add(sent, itemID(GetTradePlayerItemLink(slot)), given)
    end
    return {other = fullName("NPC"), incoming = incoming, sent = sent, started = GetTime()}
end
local function describe(items)
    local parts = {}
    for id, n in pairs(items) do parts[#parts + 1] = id .. "x" .. n end
    return #parts > 0 and table.concat(parts, ",") or "-"
end
-- Re-read the window, keeping who it's with and what was on offer when
-- someone last accepted: an accept is undone by any change to the items, so
-- that offer is the one that completes, even if the window empties first.
local function rereadTrade(previous)
    local t = readTrade()
    if not t then return previous end
    t.other = t.other or (previous and previous.other)
    t.locked = previous and previous.locked
    return t
end
local function hook(name, fn)
    if not hooks[name] and type(_G[name]) == "function" and hooksecurefunc then
        local ok = pcall(hooksecurefunc, name, function(...) pcall(fn, ...) end)
        hooks[name] = ok
    end
end
local function installHooks()
    hook("SendMail", function(recipient)
        pendingSend = nil
        local cod = type(GetSendMailCOD) == "function" and GetSendMailCOD() or nil
        trace(false, "send", "to", recipient, "items", describe(outgoing), "cod", cod)
        if not cod or cod > 0 then return end
        pendingSend = {other = recipient, items = outgoing, started = GetTime()}
    end)
    hook("TakeInboxItem", prepareTake)
    hook("AutoLootMailItem", function(index) prepareTake(index) end)
end
local f = CreateFrame("Frame")
local function onEvent(event, a, b)
    if event == "PLAYER_ENTERING_WORLD" or event == "ADDON_LOADED" then installHooks()
    elseif event == "MAIL_SHOW" or event == "MAIL_INBOX_UPDATE" then
        if pendingTake then finishTake() end
        refreshInbox()
    elseif event == "MAIL_SEND_INFO_UPDATE" then refreshSend()
    elseif event == "MAIL_SEND_SUCCESS" then
        local p = pendingSend; pendingSend = nil
        trace(false, event, p and "pending send" or "no pending send")
        if p and GetTime() - p.started <= 30 then record("mailSent", p.other, p.items) end
    elseif event == "MAIL_SUCCESS" then
        trace(false, event, a)
        finishTake()
    elseif event == "BAG_UPDATE_DELAYED" then
        if pendingTake then finishTake() end
    elseif event == "MAIL_FAILED" or event == "MAIL_CLOSED" then
        if pendingSend or pendingTake then trace(false, event, a) end
        pendingSend, pendingTake = nil, nil
    elseif event == "TRADE_SHOW" then
        trade = readTrade()
        trace(false, event, "with", trade and trade.other)
    elseif event == "TRADE_PLAYER_ITEM_CHANGED" or event == "TRADE_TARGET_ITEM_CHANGED" then
        trade = rereadTrade(trade)
        trace(false, event, trade and describe(trade.incoming), trade and describe(trade.sent))
    elseif event == "TRADE_ACCEPT_UPDATE" then
        trade = rereadTrade(trade)
        if trade then
            local offer = next(trade.incoming) or next(trade.sent)
            if a ~= 1 and b ~= 1 then trade.locked = nil
            elseif offer then trade.locked = {incoming = trade.incoming, sent = trade.sent} end
        end
        trace(false, event, a, b, "in", trade and describe(trade.incoming), "out", trade and describe(trade.sent))
    elseif event == "TRADE_CLOSED" then
        if trade then trade.closedAt = trade.closedAt or GetTime() end
        trace(false, event)
    elseif event == "TRADE_REQUEST_CANCEL" then
        trace(false, event); trade = nil
    elseif event == "UI_ERROR_MESSAGE" then
        -- A failed trade (bags full, too far) never says "Trade complete", so
        -- an error is only noted; a new trade starts a fresh read.
        if trade then trace(false, event, b) end
    elseif event == "UI_INFO_MESSAGE" and ERR_TRADE_COMPLETE and b == ERR_TRADE_COMPLETE then
        -- "Trade complete" is the proof; both accepting isn't always reported.
        local t = trade; trade = nil
        local fresh = t and (not t.closedAt or GetTime() - t.closedAt <= 5)
        trace(false, "trade complete", fresh and "with " .. tostring(t.other) or "-> no recent trade window")
        if fresh then
            local offer = t.locked or t
            record("tradeReceived", t.other, offer.incoming)
            record("tradeSent", t.other, offer.sent)
        end
    end
end
for _, event in ipairs({"PLAYER_ENTERING_WORLD", "ADDON_LOADED", "MAIL_SHOW", "MAIL_INBOX_UPDATE",
    "MAIL_SEND_INFO_UPDATE", "MAIL_SEND_SUCCESS", "MAIL_SUCCESS", "MAIL_FAILED", "MAIL_CLOSED",
    "BAG_UPDATE_DELAYED", "TRADE_SHOW", "TRADE_PLAYER_ITEM_CHANGED", "TRADE_TARGET_ITEM_CHANGED",
    "TRADE_ACCEPT_UPDATE", "TRADE_CLOSED", "TRADE_REQUEST_CANCEL", "UI_INFO_MESSAGE", "UI_ERROR_MESSAGE"}) do
    pcall(f.RegisterEvent, f, event)
end
f:SetScript("OnEvent", function(_, ...) pcall(onEvent, ...) end)
installHooks()
