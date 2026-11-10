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
        Show = function() end,
    }
    ns.addToTooltip(tooltip, itemID)
    return added
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
    eq(#lines, 1, "one line")
    eq(plain(lines[1]), "Guildie: Todd is requesting 20")
    assert(lines[1]:find("|cffc69b6dTodd|r", 1, true), "warrior color for Todd: " .. lines[1])
end)

test("claimed, and your own request, on one line", function()
    local ns = load(DATA)
    eq(plain(ns.requestLine(4306)), "Guildie: Todd is requesting 5, claimed by Miller; you are requesting 1")
end)

test("crafts: wants this crafted, with how many", function()
    local ns = load(DATA)
    eq(plain(ns.requestLine(4245)), "Guildie: Brenna wants this crafted (2)")
    eq(plain(ns.requestLine(4246)), "Guildie: You want this crafted")
end)

test("nothing requested, no data, or an older file without requests: no line", function()
    local ns = load(DATA)
    eq(ns.requestLine(1234), nil, "not requested")
    eq(#hover(ns, 1234), 0)
    ns = load(nil)
    eq(ns.requestLine(2589), nil, "no GuildieData")
    ns = load({ generatedAt = 1, reagents = {} })
    eq(ns.requestLine(2589), nil, "file from before 0.8.0")
end)

test("the request line comes before the reagent line", function()
    local data = {}
    for k, v in pairs(DATA) do data[k] = v end
    data.reagents = { [2589] = { name = "Linen Cloth", users = { { name = "Brenna", classId = 8, profession = "Tailoring" } } } }
    local ns = load(data)
    local lines = hover(ns, 2589)
    eq(#lines, 2)
    eq(plain(lines[1]), "Guildie: Todd is requesting 20")
    eq(plain(lines[2]), "Guildie might want this: Brenna (Tailoring)")
end)

test("window: your requests, with the stale nudge", function()
    local ns = load(DATA)
    wow.fire("PLAYER_ENTERING_WORLD")
    local s = ns.windowState()
    eq(s.requests, "Your requests: 2 open (1 stale)")
    eq(plain(s.requestsHint), "Still need them? Keep or close them on guildie.club (Requests).")
    local fresh = {}
    for k, v in pairs(DATA) do fresh[k] = v end
    fresh.myRequests = { open = 3, stale = 0 }
    ns = load(fresh)
    s = ns.windowState()
    eq(s.requests, "Your requests: 3 open")
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
    eq(plain(window.requests:GetText()), "Your requests: 2 open (1 stale)")
    local shown
    for _, row in ipairs(window.rows) do
        if row.el == window.requests then shown = row.shown end
    end
    eq(shown, true, "requests row shown")
end)

print(string.format("%d passed, %d failed", passed, failures))
os.exit(failures == 0 and 0 or 1)
