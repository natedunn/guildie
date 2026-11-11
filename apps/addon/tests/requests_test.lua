-- Guild requests in game (0.8.0): the tooltip line from GuildieData.requests
-- and the window's "Your requests" row.
--   luajit apps/addon/tests/requests_test.lua

local here = debug.getinfo(1, "S").source:match("^@(.*/)") or "./"
local wow = dofile(here .. "wow.lua")

local failures, passed = 0, 0
local function test(name, fn)
    local ok, err = pcall(fn)
    if ok then
        passed = passed + 1
    else
        failures = failures + 1
        print("FAIL " .. name .. ": " .. tostring(err))
    end
end
local function eq(actual, expected, what)
    if actual ~= expected then
        error(string.format("%s: expected %s, got %s", what or "value", tostring(expected), tostring(actual)), 2)
    end
end

local NOW = 1794300000

local function plain(text)
    return (text or ""):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")
end

local function load(data)
    local state = {
        db = {}, time = NOW, guid = "Player-4904-004E2B22", name = "Lich", level = 24,
        guild = { name = "Unbound", rank = "Member", rankIndex = 5 },
    }
    local ns = wow.load(state)
    _G.GuildieData = data
    return ns, state
end

--- What the addon adds to a tooltip for `itemID` (no upgrade data: only our lines).
local function hover(ns, itemID)
    local added = {}
    local tooltip = {
        GetName = function() return "GameTooltip" end,
        AddLine = function(_, text) table.insert(added, text) end,
        AddDoubleLine = function(_, left, right) table.insert(added, left .. " | " .. right) end,
        Show = function() end,
    }
    ns.addToTooltip(tooltip, itemID)
    return wow.guildieRows(added, ns)
end

local DATA = {
    generatedAt = (NOW - 600) * 1000,
    guilds = { "Unbound" },
    mine = { "Lich" },
    reagents = {},
    requests = {
        [2589] = { { kind = "item", quantity = 20, name = "Todd", classId = 1 } },
        [4306] = {
            { kind = "item", quantity = 5, name = "Todd", classId = 1, claimedBy = { name = "Miller", classId = 4 } },
            { kind = "item", quantity = 1, name = "Lich", classId = 5 },
        },
        [4245] = { { kind = "craft", quantity = 2, name = "Brenna", classId = 8 } },
        [4246] = { { kind = "craft", quantity = 1, name = "Lich", classId = 5 } },
    },
    myRequests = { open = 2, stale = 1 },
}

test("an item request: who and how many, class-colored", function()
    local ns = load(DATA)
    local lines = hover(ns, 2589)
    eq(#lines, 1, "one row")
    eq(plain(lines[1]), "Todd | requesting 20")
    assert(lines[1]:find("|cffc69b6dTodd|r", 1, true), "warrior color for Todd: " .. lines[1])
end)

test("claimed, and your own request: a row each", function()
    local ns = load(DATA)
    local lines = hover(ns, 4306)
    eq(#lines, 2)
    eq(plain(lines[1]), "Todd | requesting 5, claimed by Miller")
    eq(plain(lines[2]), "You | requesting 1")
end)

test("crafts: wants this crafted, with how many", function()
    local ns = load(DATA)
    eq(plain(hover(ns, 4245)[1]), "Brenna | wants it crafted (2)")
    eq(plain(hover(ns, 4246)[1]), "You | want it crafted")
end)

test("nothing requested, no data, or an older file without requests: no line", function()
    local ns = load(DATA)
    eq(#ns.requestRows(1234), 0, "not requested")
    eq(#hover(ns, 1234), 0)
    ns = load(nil)
    eq(#ns.requestRows(2589), 0, "no GuildieData")
    eq(#hover(ns, 2589), 0)
    ns = load({ generatedAt = 1, reagents = {} })
    eq(#ns.requestRows(2589), 0, "file from before 0.8.0")
end)

test("the request rows come before the reagent row", function()
    local data = {}
    for k, v in pairs(DATA) do data[k] = v end
    data.reagents = { [2589] = { name = "Linen Cloth", users = { { name = "Brenna", classId = 8, profession = "Tailoring" } } } }
    local ns = load(data)
    local lines = hover(ns, 2589)
    eq(#lines, 2)
    eq(plain(lines[1]), "Todd | requesting 20")
    eq(plain(lines[2]), "Brenna | might want (Tailoring)")
end)

test("reagents: a row per person, professions merged, up to 8, then +N more", function()
    local data = {}
    for k, v in pairs(DATA) do data[k] = v end
    data.reagents = { [765] = { name = "Silverleaf", users = {
        { name = "Healing", classId = 5, profession = "Alchemy" },
        { name = "Lich", classId = 5, profession = "Alchemy" },
        { name = "Hoofing", classId = 11, profession = "Herbalism" },
        { name = "Healing", classId = 5, profession = "Herbalism" },
        { name = "Brenna", classId = 8, profession = "Tailoring" },
        { name = "Corwin", classId = 4, profession = "Alchemy" },
        { name = "Dax", classId = 1, profession = "Alchemy" },
        { name = "Dax", classId = 1, profession = "Cooking" },
    } } }
    local ns = load(data)
    local lines = hover(ns, 765)
    eq(#lines, 5, "everyone, not your own character")
    eq(plain(lines[1]), "Healing | might want (Alchemy, Herbalism)")
    eq(plain(lines[2]), "Hoofing | might want (Herbalism)")
    eq(plain(lines[3]), "Brenna | might want (Tailoring)")
    eq(plain(lines[5]), "Dax | might want (Alchemy, Cooking)")
    for _, name in ipairs({ "Ezra", "Fen", "Gus", "Hob", "Ivy" }) do
        table.insert(data.reagents[765].users, { name = name, classId = 1, profession = "Mining" })
    end
    lines = hover(ns, 765)
    eq(#lines, 9, "8 people, then the rest")
    eq(plain(lines[8]), "Gus | might want (Mining)")
    eq(plain(lines[9]), "+2 more")
end)

test("hooks item tooltips at PLAYER_LOGIN, after every addon has loaded", function()
    local ns = load(DATA)
    -- (wow.load clears these; the hook looks for them at login.)
    local calls = {}
    _G.Enum = { TooltipDataType = { Item = 0 } }
    _G.TooltipDataProcessor = { AddTooltipPostCall = function(kind, fn) table.insert(calls, { kind = kind, fn = fn }) end }
    eq(#calls, 0, "not while loading")
    wow.fire("PLAYER_LOGIN")
    eq(#calls, 1, "once at login")
    eq(calls[1].kind, 0)
    local added = {}
    calls[1].fn({
        GetName = function() return "GameTooltip" end,
        AddLine = function(_, text) table.insert(added, text) end,
        AddDoubleLine = function(_, left, right) table.insert(added, left .. " | " .. right) end,
        Show = function() end,
    }, { id = 2589 })
    eq(plain(wow.guildieRows(added, ns)[1]), "Todd | requesting 20")
    _G.TooltipDataProcessor, _G.Enum = nil, nil
end)

test("window: your requests, with the stale nudge", function()
    local ns = load(DATA)
    wow.fire("PLAYER_ENTERING_WORLD")
    local s = ns.windowState()
    eq(s.requests, "2 open (1 stale)")
    eq(plain(s.requestsHint), "Still need them? Keep or close them on guildie.club (Requests).")
    local fresh = {}
    for k, v in pairs(DATA) do fresh[k] = v end
    fresh.myRequests = { open = 3, stale = 0 }
    ns = load(fresh)
    s = ns.windowState()
    eq(s.requests, "3 open")
    eq(plain(s.requestsHint), "Manage them on guildie.club (Requests).")
    fresh.myRequests = { open = 0, stale = 0 }
    eq(ns.windowState().requests, nil, "none open: no row")
    _G.GuildieData = nil
    eq(ns.windowState().requests, nil, "no data: no row")
end)

test("window: the rows show and hide", function()
    local ns = load(DATA)
    wow.fire("PLAYER_ENTERING_WORLD")
    ns.toggleWindow()
    local window = _G.GuildieWindow
    eq(plain(window.requests:GetText()), "2 open (1 stale)")
    local shown
    for _, row in ipairs(window.rows) do
        if row.el == window.requests then shown = row.shown end
    end
    eq(shown, true, "requests row shown")
end)

print(string.format("%d passed, %d failed", passed, failures))
os.exit(failures == 0 and 0 or 1)
