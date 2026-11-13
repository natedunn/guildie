-- Observe completed mail/trades; never send mail, collect items, or accept trades.
local _, ns = ...
local MAX_RECORDS, MAX_AGE = 200, 30 * 86400
local function nameKey(name)
    if type(name) ~= "string" then return nil end
    return name:match("^%s*(.-)%s*$"):lower():gsub(" ", "-")
end
local function itemID(link)
    return type(link) == "string" and tonumber(link:match("item:(%d+)")) or nil
end
local function requestsFor(id, recipient, sender)
    local matches = {}
    local rows = GuildieData and GuildieData.requests and GuildieData.requests[id] or {}
    for _, r in ipairs(rows) do
        if r.kind == "item" and r.requestId and nameKey(r.name) == nameKey(recipient)
            and (not r.claimedBy or nameKey(r.claimedBy.name) == nameKey(sender)) then
            matches[#matches + 1] = r.requestId
        end
    end
    -- Ambiguity or stale/missing guild data: use manual completion instead.
    return #matches == 1 and matches[1] or nil
end
local function record(kind, other, items)
    local guid, me = UnitGUID("player"), UnitName("player")
    if not guid or not nameKey(other) or other == "" then return end
    local c = GuildieDB.characters and GuildieDB.characters[guid]
    if not c then ns.capture("delivery"); c = GuildieDB.characters and GuildieDB.characters[guid] end
    if not c then return end
    local received = kind == "mailReceived" or kind == "tradeReceived"
    local now, records = GetServerTime(), {}
    for _, e in ipairs(c.deliveries or {}) do
        if now - e.at <= MAX_AGE then records[#records + 1] = e end
    end
    for id, quantity in pairs(items) do
        local requestId = requestsFor(id, received and me or other, received and other or me)
        if requestId and quantity > 0 then
            c.deliverySequence = (c.deliverySequence or 0) + 1
            records[#records + 1] = {id = guid .. ":" .. now .. ":" .. c.deliverySequence,
                requestId = requestId, kind = kind, reporterName = me, other = other, itemId = id, quantity = quantity, at = now}
        end
    end
    while #records > MAX_RECORDS do table.remove(records, 1) end
    c.deliveries = records
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
local function prepareTake(index, slot)
    if pendingTake and GetTime() - pendingTake.started < 30 then
        -- Concurrent operations cannot be attributed safely. Fail closed.
        pendingTake = {started = GetTime(), ambiguous = true}
        return
    end
    pendingTake = nil
    local mail = inbox[index]
    if not mail then return end
    local items, before = {}, {}
    for n, entry in pairs(mail.slots) do
        if not slot or n == slot then add(items, entry.id, entry.quantity) end
    end
    for id in pairs(items) do
        before[id] = bagCount(id)
        if before[id] == nil then return end
    end
    pendingTake = {sender = mail.sender, items = items, before = before, success = {}, started = GetTime()}
end
local function finishTake()
    local p = pendingTake
    if not p or p.ambiguous then return end
    if GetTime() - p.started > 30 then pendingTake = nil; return end
    for id, quantity in pairs(p.items) do
        local count = bagCount(id)
        if p.success[id] and count and count - p.before[id] >= quantity then
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
    return {other = UnitName("NPC"), incoming = incoming, sent = sent, started = GetTime()}
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
        if type(GetSendMailCOD) ~= "function" or GetSendMailCOD() > 0 then return end
        pendingSend = {other = recipient, items = outgoing, started = GetTime()}
    end)
    hook("TakeInboxItem", prepareTake)
    hook("AutoLootMailItem", function(index) prepareTake(index) end)
end
local f = CreateFrame("Frame")
local function onEvent(event, a, b)
    if event == "PLAYER_ENTERING_WORLD" or event == "ADDON_LOADED" then installHooks()
    elseif event == "MAIL_SHOW" or event == "MAIL_INBOX_UPDATE" then refreshInbox()
    elseif event == "MAIL_SEND_INFO_UPDATE" then refreshSend()
    elseif event == "MAIL_SEND_SUCCESS" then
        local p = pendingSend; pendingSend = nil
        if p and GetTime() - p.started <= 30 then record("mailSent", p.other, p.items) end
    elseif event == "MAIL_SUCCESS" then
        if pendingTake and not pendingTake.ambiguous and a then pendingTake.success[a] = true end
        finishTake()
    elseif event == "BAG_UPDATE_DELAYED" then finishTake()
    elseif event == "MAIL_FAILED" or event == "MAIL_CLOSED" then
        pendingSend, pendingTake = nil, nil
    elseif event == "TRADE_SHOW" or event == "TRADE_PLAYER_ITEM_CHANGED" or event == "TRADE_TARGET_ITEM_CHANGED" then
        trade = readTrade()
    elseif event == "TRADE_ACCEPT_UPDATE" then
        trade = readTrade()
        if trade then trade.accepted = a == 1 and b == 1 end
    elseif event == "TRADE_CLOSED" then
        if trade and trade.accepted then trade.closedAt = GetTime() else trade = nil end
    elseif event == "TRADE_REQUEST_CANCEL" or event == "UI_ERROR_MESSAGE" then trade = nil
    elseif event == "UI_INFO_MESSAGE" and ERR_TRADE_COMPLETE and b == ERR_TRADE_COMPLETE then
        local t = trade; trade = nil
        if t and t.accepted and (not t.closedAt or GetTime() - t.closedAt <= 5) then
            record("tradeReceived", t.other, t.incoming)
            record("tradeSent", t.other, t.sent)
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
