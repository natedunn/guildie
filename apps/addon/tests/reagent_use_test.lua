-- Reagent tooltips (0.24.0): who'd get the most profession progress out of it
-- (GuildieData.reagentUse, built by apps/web/convex/reagentProgress.ts).
--   luajit apps/addon/tests/reagent_use_test.lua

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

--- Without colors; an arrow shows as its atlas's last word ("[High] ").
local function plain(text)
    return ((text or ""):gsub("|A:Professions%-Icon%-Skill%-(%a+):[^|]*|a", "[%1]"):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""))
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
    wow.guildieRows(added, ns)
    -- Our rows minus the block's own indent, so a guildmate's deeper one shows.
    local rows = {}
    for i = 3, #added do table.insert(rows, (added[i]:gsub("^   ", "", 1))) end
    return rows
end

local SILK = 4306

local function data(professions)
    return {
        generatedAt = (NOW - 600) * 1000, guilds = { "Unbound" }, mine = { "Lich" }, reagents = {},
        reagentUse = { [SILK] = { name = "Silk Cloth", professions = professions } },
    }
end

local TAILORING = {
    name = "Tailoring", from = 110, count = 5,
    users = {
        { name = "Todd", classId = 1, skill = 105, color = "orange" },
        { name = "Brenna", classId = 8, skill = 112, color = "yellow" },
        { name = "Sela", classId = 2, skill = 116, color = "green" },
    },
}

test("a profession, its best three with their skill in the window's colors, then +N more", function()
    local ns = load(data({ TAILORING }))
    local lines = hover(ns, SILK)
    eq(#lines, 5)
    eq(lines[1], "Tailoring", "no \"from\" when people are listed")
    eq(plain(lines[2]), "   Todd | 105")
    eq(plain(lines[3]), "   Brenna | 112")
    eq(plain(lines[4]), "   Sela | 116")
    eq(plain(lines[5]), "   +2 more")
    assert(lines[2]:find("|cffc69b6dTodd|r", 1, true), "class color: " .. lines[2])
    assert(lines[2]:find("|cffff8040105|r", 1, true), "orange: " .. lines[2])
    assert(lines[3]:find("|cffffff00112|r", 1, true), "yellow: " .. lines[3])
    assert(lines[4]:find("|cff40bf40116|r", 1, true), "green: " .. lines[4])
end)

test("the profession window's arrows, when the client has them", function()
    local ns = load(data({ TAILORING }))
    _G.C_Texture = { GetAtlasInfo = function(name) return name:find("^Professions%-Icon%-Skill") and {} or nil end }
    local lines = hover(ns, SILK)
    _G.C_Texture = nil
    eq(plain(lines[2]), "   Todd | [High] 105")
    eq(plain(lines[3]), "   Brenna | [Medium] 112")
    eq(plain(lines[4]), "   Sela | [Low] 116")
end)

test("nobody listed: what's missing, and who", function()
    local ns = load(data({
        { name = "Tailoring", from = 175, count = 0, users = {},
          needRecipe = { { name = "Todd", classId = 1 }, { name = "Lich", classId = 5 }, { name = "Brenna", classId = 8 } } },
        { name = "First Aid", from = 210, count = 0, users = {}, closest = { name = "Miller", classId = 11, skill = 160 } },
        { name = "Engineering", from = 150, count = 0, users = {}, nobody = true },
    }))
    local lines = hover(ns, SILK)
    eq(#lines, 6)
    eq(lines[1], "Tailoring", "no \"from\"")
    eq(plain(lines[2]), "   Needs a recipe: Todd, Brenna", "not my own characters")
    eq(lines[3], "First Aid")
    eq(plain(lines[4]), "   Needs 210 skill: Miller 160")
    eq(lines[5], "Engineering")
    eq(plain(lines[6]), "   No one in the guild")
end)

test("needs a recipe, but they're all on a request row: no block", function()
    local d = data({ { name = "Tailoring", from = 175, count = 0, users = {}, needRecipe = { { name = "Todd", classId = 1 } } } })
    d.requests = { [SILK] = { { kind = "item", ongoing = true, name = "Todd", classId = 1 } } }
    local lines = hover(load(d), SILK)
    eq(#lines, 1, "the request only")
end)

test("someone with a request for it is on the request row, not listed again", function()
    local d = data({ {
        name = "Tailoring", from = 110, count = 1,
        users = { { name = "Todd", classId = 1, skill = 105, color = "orange" } },
    } })
    d.requests = { [SILK] = { { kind = "item", ongoing = true, name = "Todd", classId = 1 } } }
    local ns = load(d)
    local lines = hover(ns, SILK)
    eq(#lines, 1, "the request only")
    eq(plain(lines[1]), "Todd | wants all you have")
end)

test("an older file (no reagentUse): the old \"might want\" rows", function()
    local d = data({})
    d.reagentUse = nil
    d.reagents = { [SILK] = { name = "Silk Cloth", users = { { name = "Brenna", classId = 8, profession = "Tailoring" } } } }
    local ns = load(d)
    eq(plain(hover(ns, SILK)[1]), "Brenna | might want (Tailoring)")
end)

test("everyone shown is on a request row, more aren't: just +N more", function()
    local d = data({ {
        name = "Tailoring", from = 110, count = 3,
        users = { { name = "Todd", classId = 1, skill = 105, color = "orange" } },
    } })
    d.requests = { [SILK] = { { kind = "item", ongoing = true, name = "Todd", classId = 1 } } }
    local lines = hover(load(d), SILK)
    eq(#lines, 3)
    eq(lines[2], "Tailoring")
    eq(plain(lines[3]), "   +2 more")
end)

test("not a reagent anyone uses: the usual empty line", function()
    local ns = load(data({ TAILORING }))
    eq(table.concat(hover(ns, 1234)), "No guildmates need this")
end)

local MINE = {
    { name = "Tailoring", users = {
        { name = "Lich", classId = 5, skill = 108, color = "orange" },
        { name = "Ivar", classId = 1, skill = 113, color = "yellow" },
    } },
    { name = "Cooking", users = { { name = "Ivar", classId = 1, skill = 40, color = "green" } } },
}

test("your characters: first under the profession, You and alts by name; professions only yours have after", function()
    local d = data({ TAILORING })
    d.reagentUseMine = { [SILK] = MINE }
    local lines = hover(load(d), SILK)
    eq(#lines, 9)
    eq(lines[1], "Tailoring")
    eq(plain(lines[2]), "   You | 108")
    eq(plain(lines[3]), "   Ivar | 113")
    eq(plain(lines[4]), "   Todd | 105")
    eq(plain(lines[7]), "   +2 more", "guildmates only")
    eq(lines[8], "Cooking")
    eq(plain(lines[9]), "   Ivar | 40")
end)

test("yours listed: no \"Needs\" line about guildmates", function()
    local d = data({ { name = "Tailoring", from = 175, count = 0, users = {}, closest = { name = "Miller", classId = 11, skill = 160 } } })
    d.reagentUseMine = { [SILK] = { MINE[1] } }
    local lines = hover(load(d), SILK)
    eq(#lines, 3)
    eq(plain(lines[2]), "   You | 108")
    eq(plain(lines[3]), "   Ivar | 113")
end)

test("only yours: the reagent shows even with nothing about guildmates", function()
    local d = data({})
    d.reagentUse = {}
    d.reagentUseMine = { [SILK] = { MINE[2] } }
    local lines = hover(load(d), SILK)
    eq(#lines, 2)
    eq(lines[1], "Cooking")
end)

test("the setting off: no rows of yours", function()
    local d = data({ TAILORING })
    d.reagentUseMine = { [SILK] = MINE }
    local ns, state = load(d)
    GuildieDB.settings = GuildieDB.settings or {}
    GuildieDB.settings.showMineReagents = false
    local lines = hover(ns, SILK)
    eq(#lines, 5)
    eq(plain(lines[2]), "   Todd | 105")
end)

print(string.format("%d passed, %d failed", passed, failures))
os.exit(failures == 0 and 0 or 1)
