-- Waylaid Crates and Supplies (0.26.0): who can fill them
-- (GuildieData.waylaid and waylaidMine, built by apps/web/convex/waylaidUse.ts).
--   luajit apps/addon/tests/waylaid_test.lua

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

local CRATE = 248686
local BRONZE = 211819

local HERBALISM = {
    name = "Herbalism", how = "gathers", of = 5, count = 4,
    users = {
        { name = "Healing Optional", classId = 2, skill = 183, covers = 5 },
        { name = "Todd", classId = 1, skill = 100, covers = 2 },
    },
}

local function data(waylaid, mine)
    return {
        generatedAt = (NOW - 600) * 1000, guilds = { "Unbound" }, mine = { "Lich" }, reagents = {}, reagentUse = {},
        waylaid = waylaid, waylaidMine = mine,
    }
end

test("a crate: the profession, its people as the site sorted them (all of it first), +N more", function()
    local lines = hover(load(data({ [CRATE] = { professions = { HERBALISM } } })), CRATE)
    eq(#lines, 4)
    eq(lines[1], "Herbalism")
    eq(plain(lines[2]), "   Healing Optional | 183")
    eq(plain(lines[3]), "   Todd | 100", "no count of what they can gather")
    eq(plain(lines[4]), "   +2 more")
end)

test("makers: skill in the profession window's color", function()
    local lines = hover(load(data({ [BRONZE] = { professions = { {
        name = "Mining", how = "makes", of = 1, count = 1,
        users = { { name = "Ivar", classId = 1, skill = 70, color = "orange", covers = 1 } },
    } } } })), BRONZE)
    eq(#lines, 2)
    assert(lines[2]:find("|cffff804070|r", 1, true), "orange: " .. lines[2])
end)

test("nobody can yet: who's closest, or nobody has it", function()
    local lines = hover(load(data({ [CRATE] = { professions = {
        { name = "Herbalism", how = "gathers", of = 5, count = 0, users = {},
          closest = { name = "Miller", classId = 11, skill = 60, need = 85 } },
        { name = "Mining", how = "gathers", of = 2, count = 0, users = {}, nobody = true },
    } } })), CRATE)
    eq(#lines, 4)
    eq(plain(lines[2]), "   Needs 85 skill: Miller 60")
    eq(plain(lines[4]), "   No one in the guild")
end)

test("your characters first, then guildmates; a profession only yours have after", function()
    local lines = hover(load(data(
        { [CRATE] = { professions = { HERBALISM } } },
        { [CRATE] = {
            { name = "Herbalism", how = "gathers", of = 5, users = { { name = "Lich", classId = 5, skill = 125, covers = 5 } } },
            { name = "Enchanting", how = "gathers", of = 4, users = { { name = "Ivar", classId = 1, skill = 30, covers = 2 } } },
        } }
    )), CRATE)
    eq(#lines, 7)
    eq(plain(lines[2]), "   You | 125")
    eq(plain(lines[3]), "   Healing Optional | 183")
    eq(lines[6], "Enchanting")
    eq(plain(lines[7]), "   Ivar | 30")
end)

test("bound Supplies still show who can fill them", function()
    local ns = load(data({ [BRONZE] = { professions = { {
        name = "Mining", how = "makes", of = 1, count = 1,
        users = { { name = "Ivar", classId = 1, skill = 70, covers = 1 } },
    } } } }))
    local added = {}
    local tooltip = {
        GetName = function() return "GameTooltip" end,
        AddLine = function(_, text) table.insert(added, text) end,
        AddDoubleLine = function(_, left, right) table.insert(added, left .. " | " .. right) end,
        Show = function() end,
    }
    ns.addToTooltip(tooltip, BRONZE, { lines = { { leftText = "Waylaid Supplies: Bronze Bars" }, { leftText = "Binds when picked up" } } })
    local text = table.concat(added, "\n")
    assert(text:find("Mining", 1, true), text)
end)

test("an older file (no waylaid): the usual empty line", function()
    eq(table.concat(hover(load(data(nil)), CRATE)), "No guildmates need this")
end)

print(string.format("%d passed, %d failed", passed, failures))
os.exit(failures == 0 and 0 or 1)
