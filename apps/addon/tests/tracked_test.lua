-- Tracked crafts in game (0.23.0): the "You | need 6 more" row on a reagent's
-- tooltip, from GuildieData.tracked, with the character you're on counted live.
--   luajit apps/addon/tests/tracked_test.lua

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
local live = {}

local function plain(text)
    return (text or ""):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")
end

local function load(data, settings)
    local state = {
        db = { settings = settings }, time = NOW, guid = "Player-4904-004E2B22", name = "Lich", level = 24,
        guild = { name = "Unbound", rank = "Member", rankIndex = 5 },
    }
    local ns = wow.load(state)
    _G.GuildieData = data
    GetItemCount = function(id, includeBank)
        assert(includeBank == true, "counts the bank too")
        return live[id] or 0
    end
    return ns
end

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
    mine = { "Lich", "Pip" },
    reagents = {
        [2453] = { name = "Bruiseweed", users = { { name = "Brenna", profession = "Alchemy", classId = 8 } } },
    },
    tracked = {
        -- Lich's count is stale on the site (2); the game says 3.
        [2453] = { need = 10, have = { Lich = 2, Pip = 1 }, crafts = { "Greater Healing Potion ×5" } },
        [3820] = { need = 4, have = { Pip = 4 }, crafts = { "Greater Healing Potion ×5", "Elixir of Fortitude" } },
    },
}

test("need more: the rest, live for you, the site for your other characters", function()
    live = { [2453] = 3 }
    local lines = hover(load(DATA), 2453)
    eq(plain(lines[1]), "You | need 6 more (4/10) for Greater Healing Potion ×5")
    eq(plain(lines[2]), "Brenna | might want (Alchemy)", "guildmates after")
end)

test("have all, and several crafts", function()
    live = {}
    local lines = hover(load(DATA), 3820)
    eq(#lines, 1)
    eq(plain(lines[1]), "You | have all 4 for Greater Healing Potion ×5 +1")
end)

test("not tracked: no row", function()
    live = {}
    eq(#hover(load(DATA), 9999) > 0 and plain(hover(load(DATA), 9999)[1]):find("^You") == nil, true)
end)

test("the setting turns it off", function()
    live = { [2453] = 3 }
    local lines = hover(load(DATA, { showTracked = false }), 2453)
    eq(plain(lines[1]), "Brenna | might want (Alchemy)")
end)

test("no live count: the site's count for you", function()
    live = { [2453] = 3 }
    local ns = load(DATA)
    GetItemCount = nil
    eq(plain(hover(ns, 2453)[1]), "You | need 7 more (3/10) for Greater Healing Potion ×5")
end)

print(string.format("%d passed, %d failed", passed, failures))
os.exit(failures == 0 and 0 or 1)
