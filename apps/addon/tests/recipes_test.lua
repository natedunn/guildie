-- Recipe items in game (0.14.0): is this pattern worth sending someone?
-- GuildieData.recipes, the same rule as apps/web/convex/shared/recipeStatus.ts.
--   luajit apps/addon/tests/recipes_test.lua

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

-- Pattern: Red Linen Robe (2598): Tailoring 25, teaches recipe 2389.
local function data(crafters)
    return {
        generatedAt = (NOW - 600) * 1000, guilds = { "Unbound" }, mine = { "Lich" }, reagents = {},
        recipes = { items = { [2598] = { "Tailoring", 25, 2389 } }, crafters = crafters },
    }
end

test("now, later, has one, then who knows it; not the character you're on", function()
    local ns = load(data({
        { name = "Lich", classId = 5, skills = { Tailoring = 50 }, known = {}, has = {} },
        { name = "Ada", classId = 8, skills = { Tailoring = 200 }, known = { 2389 }, has = {} },
        { name = "Bo", classId = 1, skills = { Tailoring = 5 }, known = {}, has = {} },
        { name = "Cy", classId = 4, skills = { Tailoring = 80 }, known = {}, has = {} },
        { name = "Di", classId = 9, skills = { Tailoring = 1 }, known = {}, has = { 2598 } },
        { name = "Ed", classId = 1, skills = { Tailoring = -1 }, known = {}, has = {} },
        { name = "Fa", classId = 1, skills = { Mining = 300 }, known = {}, has = {} },
    }))
    local lines = hover(ns, 2598)
    eq(#lines, 5)
    eq(plain(lines[1]), "Cy | can learn it")
    eq(plain(lines[2]), "Ed | can learn it", "unknown skill counts as now")
    eq(plain(lines[3]), "Bo | at 25 (has 5)")
    eq(plain(lines[4]), "Di | has one already")
    eq(plain(lines[5]), "Known by Ada")
end)

test("known by: three names, then +N", function()
    local list = {}
    for _, n in ipairs({ "Ann", "Ben", "Cat", "Dan", "Eve" }) do
        table.insert(list, { name = n, classId = 1, skills = { Tailoring = 100 }, known = { 2389 }, has = {} })
    end
    eq(plain(hover(load(data(list)), 2598)[1]), "Known by Ann, Ben, Cat +2")
end)

test("nobody with the profession, or an older file without recipes", function()
    eq(plain(hover(load(data({})), 2598)[1]), "No guildmates have Tailoring")
    local ns = load({ generatedAt = 1, reagents = {} })
    eq(#ns.recipeRows(2598), 0)
end)

test("a cookbook with two recipes: known only with both", function()
    local ns = load({
        generatedAt = 1, reagents = {},
        recipes = {
            items = { [239021] = { "Cooking", 280, 52014, 52015 } },
            crafters = {
                { name = "Ada", classId = 8, skills = { Cooking = 300 }, known = { 52014 }, has = {} },
                { name = "Bo", classId = 1, skills = { Cooking = 300 }, known = { 52014, 52015 }, has = {} },
            },
        },
    })
    local lines = hover(ns, 239021)
    eq(plain(lines[1]), "Ada | can learn it")
    eq(plain(lines[2]), "Known by Bo")
end)

test("rank books: known once the max skill is there", function()
    local ns = load({
        generatedAt = 1, reagents = {},
        recipes = {
            items = {},
            ranks = { [16072] = { "Cooking", 125, 225 } },
            crafters = {
                { name = "Ada", classId = 8, skills = { Cooking = 140 }, max = { Cooking = 150 }, known = {}, has = {} },
                { name = "Bo", classId = 1, skills = { Cooking = 90 }, max = { Cooking = 150 }, known = {}, has = {} },
                { name = "Cy", classId = 4, skills = { Cooking = 200 }, max = { Cooking = 225 }, known = {}, has = {} },
                { name = "Di", classId = 9, skills = { Cooking = 140 }, known = {}, has = {} },
            },
        },
    })
    local lines = hover(ns, 16072)
    eq(#lines, 4)
    eq(plain(lines[1]), "Ada | can learn it")
    eq(plain(lines[2]), "Di | can learn it", "no max skill sent: the game will say")
    eq(plain(lines[3]), "Bo | at 125 (has 90)")
    eq(plain(lines[4]), "Known by Cy")
end)

print(string.format("%d passed, %d failed", passed, failures))
if failures > 0 then os.exit(1) end
