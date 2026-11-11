-- Tests the addon's gear-upgrade suggestions (Upgrades.lua) with a stubbed
-- WoW API: the shared cases in upgrade_vectors.json (the site's TypeScript
-- runs the same file: apps/web/convex/upgrades.test.ts), reading a hovered
-- item from the game's item APIs, and the tooltip line.
--   luajit apps/addon/tests/upgrades_test.lua
-- End to end, with a GuildieData.lua the app wrote and items to hover (JSON:
-- [{ "id", "name", "link"?, "equipLoc", "classID", "subclassID", "reqLevel",
-- "stats": { ITEM_MOD_..._SHORT: n }, "lines": [ ... ] }]), prints each line:
--   luajit apps/addon/tests/upgrades_test.lua GuildieData.lua items.json [now]

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
local function close(actual, expected, what)
    if type(actual) ~= "number" or math.abs(actual - expected) > 1e-9 then
        error(string.format("%s: expected %s, got %s", what or "value", tostring(expected), tostring(actual)), 2)
    end
end

local function readFile(path)
    local f = assert(io.open(path, "rb"))
    local text = f:read("*a")
    f:close()
    return text
end

--- JSON objects keyed by numbers ("11") become Lua number keys, the way the
--- app writes GuildieData.lua (packages/sync/src/luaData.ts).
local function numericKeys(value)
    if type(value) ~= "table" then return value end
    local out = {}
    for k, v in pairs(value) do
        local key = (type(k) == "string" and k:match("^%d+$")) and tonumber(k) or k
        out[key] = numericKeys(v)
    end
    return out
end

local function list(t)
    local parts = {}
    for _, v in ipairs(t or {}) do table.insert(parts, tostring(v)) end
    return table.concat(parts, ",")
end

local ns = wow.load({ db = {} })
local U = ns.upgrades
local vectors = numericKeys(wow.decode(readFile(here .. "upgrade_vectors.json")))
local rules = vectors.rules

test("shared vectors: judge", function()
    for _, c in ipairs(vectors.judge) do
        local v = U.judge(vectors.items[c.item], vectors.members[c.member], rules, c.itemId)
        if c.expect == nil then
            eq(v, nil, c.name)
        else
            assert(v, c.name .. ": no verdict")
            eq(v.kind, c.expect.kind, c.name .. " kind")
            close(v.gain, c.expect.gain, c.name .. " gain")
            eq(v.spec, c.expect.spec, c.name .. " spec")
            eq(v.at, c.expect.at, c.name .. " at")
            eq(v.second or false, c.expect.second, c.name .. " second")
            eq(list(v.against), list(c.expect.against), c.name .. " against")
        end
    end
end)

test("shared vectors: scores, usable levels, suggestions", function()
    for _, c in ipairs(vectors.scores) do
        local score, stat, total = U.scoreItem(vectors.items[c.item], rules.specs[c.spec].w, c.level, rules.classes[c.classId], rules, c.offHand)
        close(score, c.expect.score, c.item .. " score")
        close(stat, c.expect.stat, c.item .. " stat")
        eq(total, c.expect.total, c.item .. " total")
    end
    for _, c in ipairs(vectors.usable) do
        eq(U.usableAt(vectors.items[c.item], vectors.members[c.member], rules), c.expect, c.item .. " for " .. c.member)
    end
    local members = {}
    for _, name in ipairs({ "Brisket", "Miller", "Rage", "Frosty", "Arrow", "Stale" }) do
        table.insert(members, vectors.members[name])
    end
    for _, c in ipairs(vectors.suggest) do
        local skip = {}
        for _, name in ipairs(c.skip or {}) do skip[name] = true end
        local got = {}
        for _, p in ipairs(U.suggest(vectors.items[c.item], members, rules, { now = c.now, skip = skip, max = c.max })) do
            table.insert(got, p.member.name .. ":" .. p.verdict.kind)
        end
        eq(table.concat(got, ","), table.concat(c.expect, ","), c.name)
    end
end)

-- ---- The game side --------------------------------------------------------------

--- Stubs the item APIs for `items` (by link) and returns a tooltip that
--- records added lines.
local function stubItems(items)
    local byLink = {}
    for _, item in ipairs(items) do
        item.link = item.link or string.format("|cff1eff00|Hitem:%d::::::::35|h[%s]|h|r", item.id, item.name)
        byLink[item.link] = item
    end
    _G.GetItemInfoInstant = function(link)
        local item = byLink[link]
        if item then return item.id, "Armor", "Leather", item.equipLoc, 0, item.classID, item.subclassID end
    end
    _G.GetItemInfo = function(link)
        local item = byLink[link]
        if item and not item.uncached then return item.name, link, 2, 20, item.reqLevel or 0 end
    end
    _G.GetItemStats = function(link)
        local item = byLink[link]
        return item and item.stats
    end
    _G.GetServerTime = function() return wow.state.time end
    _G.UnitName = function() return "Me" end
    return byLink
end

local function hover(item)
    local added = {}
    local tooltip = {
        GetName = function() return "GameTooltip" end,
        GetItem = function() return item.name, item.link end,
        AddLine = function(_, text) table.insert(added, text) end,
        AddDoubleLine = function(_, left, right) table.insert(added, left .. " | " .. right) end,
        Show = function() end,
    }
    local lines = { { leftText = item.name } }
    for _, l in ipairs(item.lines or {}) do table.insert(lines, { leftText = l }) end
    ns.addToTooltip(tooltip, item.id, { id = item.id, lines = lines })
    return wow.guildieRows(added, ns)
end

local function plain(text)
    return (text or ""):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")
end

local GLOVES = {
    id = 4253, name = "Toughened Leather Gloves", equipLoc = "INVTYPE_HAND", classID = 4, subclassID = 2, reqLevel = 20,
    stats = { ITEM_MOD_AGILITY_SHORT = 6, ITEM_MOD_STAMINA_SHORT = 4, RESISTANCE0_NAME = 60 },
    lines = { "Binds when equipped", "Hands", "60 Armor", "+6 Agility", "+4 Stamina", "Requires Level 20" },
}

test("reads the hovered item from the item APIs and the tooltip", function()
    stubItems({ GLOVES })
    local item = U.readItem(GLOVES.link, { GLOVES.name, "Soulbound", "Unique-Equipped", "Classes: Druid, Rogue" })
    eq(item.invType, "HAND")
    eq(item.cls, 4)
    eq(item.subclass, 2)
    eq(item.stats.AGILITY, 6)
    eq(item.stats.STAMINA, 4)
    eq(item.armor, 60)
    eq(item.reqLevel, 20)
    eq(item.soulbound, true)
    eq(item.unique, true)
    eq(list(item.classes), "11,4")
end)

test("no GetItemStats: reads the English tooltip; weapons' DPS", function()
    local axe = {
        id = 3, name = "Axe", equipLoc = "INVTYPE_2HWEAPON", classID = 2, subclassID = 1,
        lines = { "Two-Hand", "20 - 30 Damage", "(12.5 damage per second)", "+5 Strength", "Unique (2)" },
    }
    stubItems({ axe })
    _G.GetItemStats = nil
    local lines = { axe.name }
    for _, l in ipairs(axe.lines) do table.insert(lines, l) end
    local item = U.readItem(axe.link, lines)
    eq(item.invType, "2HWEAPON")
    eq(item.dps, 12.5)
    eq(item.stats.STRENGTH, 5)
    eq(item.unique, true)
end)

test("not gear, or not cached yet: nothing", function()
    local potion = { id = 118, name = "Minor Healing Potion", equipLoc = "", classID = 0, subclassID = 0 }
    local uncached = { id = 7, name = "Later", equipLoc = "INVTYPE_HEAD", classID = 4, subclassID = 1, uncached = true }
    stubItems({ potion, uncached })
    eq(U.readItem(potion.link, {}), nil)
    eq(U.readItem(uncached.link, {}), nil)
end)

--- GuildieData with the vectors' rules and a few guildmates.
local function guildData(members)
    return {
        version = 1,
        mine = { "Alt" },
        reagents = {},
        upgrades = { version = 1, rules = rules, members = members },
    }
end

test("tooltip line: upgrades first, class colors, own characters and soulbound items skipped", function()
    local now = vectors.members.Brisket.seen + 60
    wow.state.time = now
    stubItems({ GLOVES })
    local alt = numericKeys(wow.decode(readFile(here .. "upgrade_vectors.json"))).members.Brisket
    alt.name = "Alt"
    _G.GuildieData = guildData({ vectors.members.Brisket, vectors.members.Miller, vectors.members.Frosty, alt })
    local added = hover(GLOVES)
    eq(#added, 1, "one row")
    eq(plain(added[1]), "Upgrade for Miller (Arms), Brisket (Feral)")
    assert(added[1]:find("|cffff7c0aBrisket|r", 1, true), "druid orange: " .. added[1])
    -- Soulbound to the viewer: can't be traded, so no suggestions.
    local bound = {}
    for k, v in pairs(GLOVES) do bound[k] = v end
    bound.lines = { "Soulbound", "Hands", "+6 Agility" }
    eq(#hover(bound), 0, "soulbound")
end)

test("nothing that can't be traded: Binds when picked up, Quest Item; reagent line too", function()
    wow.state.time = vectors.members.Brisket.seen + 60
    stubItems({ GLOVES })
    _G.GuildieData = guildData({ vectors.members.Brisket, vectors.members.Miller })
    GuildieData.reagents[GLOVES.id] = { name = GLOVES.name, users = { { name = "Brenna", classId = 8, profession = "Tailoring" } } }
    eq(#hover(GLOVES), 2, "tradeable: reagent and upgrade rows")
    for _, binding in ipairs({ "Binds when picked up", "Quest Item", "Soulbound" }) do
        local bound = {}
        for k, v in pairs(GLOVES) do bound[k] = v end
        bound.lines = { binding, "Hands", "60 Armor", "+6 Agility", "+4 Stamina" }
        eq(#hover(bound), 0, binding)
    end
    -- "Binds when equipped" trades until it's worn.
    eq(U.untradeable({ GLOVES.name, "Binds when equipped" }), false)
    eq(U.untradeable({ GLOVES.name, "Binds when picked up" }), true)
end)

test("tooltip line: maybe (at 24) and second spec; nothing when nobody qualifies", function()
    wow.state.time = vectors.members.Brisket.seen + 60
    local helm = {
        id = 5, name = "Spellweaver Cowl", equipLoc = "INVTYPE_HEAD", classID = 4, subclassID = 1, reqLevel = 33,
        stats = { ITEM_MOD_INTELLECT_SHORT = 8, ITEM_MOD_SPELL_POWER_SHORT = 5, RESISTANCE0_NAME = 30 },
    }
    local sword = {
        id = 6, name = "Greatsword", equipLoc = "INVTYPE_2HWEAPON", classID = 2, subclassID = 8, reqLevel = 25,
        stats = { ITEM_MOD_STRENGTH_SHORT = 10, ITEM_MOD_STAMINA_SHORT = 6, ITEM_MOD_DAMAGE_PER_SECOND_SHORT = 20.5 },
    }
    local resist = {
        id = 7, name = "Fire Cloak", equipLoc = "INVTYPE_CLOAK", classID = 4, subclassID = 1,
        stats = { RESISTANCE2_NAME = 10, RESISTANCE0_NAME = 20 },
    }
    stubItems({ helm, sword, resist })
    _G.GuildieData = guildData({ vectors.members.Brisket, vectors.members.Miller, vectors.members.Frosty, vectors.members.Rage })
    eq(plain(hover(helm)[1]), "Maybe Frosty (at 33), Brisket (Restoration, at 33)")
    local sword_rows = hover(sword)
    eq(#sword_rows, 2, "upgrade and maybe rows")
    eq(plain(sword_rows[1]), "Upgrade for Rage (Fury)")
    eq(plain(sword_rows[2]), "Maybe Miller (at 25)")
    eq(#hover(resist), 0, "nobody")
    -- Older data without `upgrades`: just the reagent line, if any.
    _G.GuildieData = { version = 1, mine = {}, reagents = {} }
    eq(#hover(sword), 0)
end)

-- ---- End to end: real guild data, items to hover ------------------------------

local dataPath, itemsPath = arg and arg[1], arg and arg[2]
if dataPath and itemsPath then
    local chunk = assert(loadfile(dataPath))
    chunk()
    local data = _G.GuildieData
    local items = wow.decode(readFile(itemsPath))
    local now = tonumber(arg[3]) or os.time()
    wow.state.time = now
    stubItems(items)
    print(string.format("\n%s: %d guildmates for upgrades", dataPath, #(data.upgrades and data.upgrades.members or {})))
    for _, item in ipairs(items) do
        local added = hover(item)
        _G.GuildieData = data
        print(string.format("%-34s %s", item.name, #added > 0 and plain(added[#added]) or "(no line)"))
    end
end

print(string.format("%d passed, %d failed", passed, failures))
os.exit(failures == 0 and 0 or 1)
