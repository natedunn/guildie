-- Tests the addon's capture and payload with a stubbed WoW API.
--   luajit apps/addon/tests/capture_test.lua
-- With an output path, also writes the SavedVariables file the game would
-- (used by the end-to-end check):
--   luajit apps/addon/tests/capture_test.lua /tmp/Guildie.lua

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

local GREEN = { 0, 1, 0 }
local WHITE = { 1, 1, 1 }

--- Lich, a level 23 priest with a couple of items, two professions and Cooking.
local function lich(overrides)
    local state = {
        db = {},
        guid = "Player-4904-004E2B22",
        name = "Lich",
        level = 23,
        xp = 1200,
        xpMax = 15000,
        guild = { name = "Unbound", rank = "Member", rankIndex = 5 },
        average = 21.47,
        gear = {
            [1] = { id = 9492, name = "Electromagnetic Gigaflux Reactivator", quality = 3, itemLevel = 36 },
            [16] = { id = 2520, name = "Broadsword of the Eagle", quality = 2, itemLevel = 24, enchant = 241, suffix = 852 },
        },
        tooltips = {
            [1] = {
                { "Binds when picked up", WHITE },
                { "Head", WHITE, "Cloth" },
                { "43 Armor", WHITE },
                { "Durability 47 / 50", WHITE },
                { "Equip: Increases damage and healing done by magical spells and effects by up to 8.", GREEN },
            },
            [16] = {
                { "Two-Hand", WHITE, "Sword" },
                { "|cffffffff+3 Agility|r", WHITE },
                { "Crusader", GREEN },
                { "", WHITE },
                { "Item Level 24", { 1, 0.82, 0 } },
            },
        },
        skillLines = {
            { header = true, name = "Professions" },
            { name = "Tailoring", rank = 120, max = 150, abandonable = true },
            { name = "Enchanting", rank = 98, max = 150, abandonable = true },
            { header = true, name = "Secondary Skills" },
            { name = "Cooking", rank = 60, max = 75, abandonable = true },
            { header = true, name = "Weapon Skills" },
            { name = "Staves", rank = 100, max = 115 },
        },
    }
    for k, v in pairs(overrides or {}) do state[k] = v end
    return state
end

local function payload(db)
    return wow.decode(db.payload)
end

test("captures level, XP, guild, gear and professions on login", function()
    local state = lich()
    wow.load(state)
    wow.fire("PLAYER_ENTERING_WORLD")
    local p = payload(state.db)
    eq(p.version, 4, "version")
    eq(#p.characters, 1, "characters")
    local c = p.characters[1]
    eq(c.guid, "Player-4904-004E2B22")
    eq(c.level, 23, "level")
    eq(c.xp, 1200, "xp")
    eq(c.xpMax, 15000, "xpMax")
    eq(c.classToken, "PRIEST")
    eq(c.raceToken, "NightElf")
    eq(c.capturedAt, state.time, "capturedAt")
    eq(c.guild.name, "Unbound")
    eq(c.guild.rank, "Member")
    eq(c.guild.rankIndex, 5)
    eq(#c.talents, 0, "talents (no talent API stubbed)")
    eq(c.equipment.capturedAt, state.time, "equipment time")
    eq(c.equipment.averageItemLevel, 21.47, "average item level")
    eq(#c.equipment.items, 2, "items")
    local head, weapon = c.equipment.items[1], c.equipment.items[2]
    eq(head.slot, 1)
    eq(head.id, 9492)
    eq(head.name, "Electromagnetic Gigaflux Reactivator")
    eq(head.quality, 3)
    eq(head.itemLevel, 36)
    eq(head.enchant, nil, "no enchant")
    eq(#head.tooltip, 5, "head tooltip lines (name line skipped)")
    eq(head.tooltip[1].left, "Binds when picked up")
    eq(head.tooltip[1].color, nil, "white isn't sent")
    eq(head.tooltip[2].right, "Cloth")
    eq(head.tooltip[5].color, "#00ff00")
    eq(weapon.slot, 16)
    eq(weapon.name, "Broadsword of the Eagle", "random suffix name from the link")
    eq(weapon.enchant, 241)
    eq(weapon.suffix, 852)
    eq(weapon.tooltip[2].left, "+3 Agility", "inline color codes stripped")
    eq(weapon.tooltip[2].color, "#ffffff", "inline color kept when the line is white")
    eq(#weapon.tooltip, 4, "blank lines dropped")
    eq(weapon.tooltip[4].left, "Item Level 24", "kept; the site drops it")
    eq(weapon.tooltip[1].right, "Sword")
    eq(weapon.tooltip[3].right, nil, "hidden right text isn't read")
    local skills = c.professions.skills
    eq(#skills, 3, "professions (weapon skills left out)")
    eq(skills[1].name, "Tailoring")
    eq(skills[1].rank, 120)
    eq(skills[1].max, 150)
    eq(skills[3].name, "Cooking")
    eq(c.recipes, nil, "no recipes until a window opens")
end)

test("level up and gear change show up, and mark it changed since load", function()
    local state = lich()
    local ns = wow.load(state)
    wow.fire("PLAYER_ENTERING_WORLD")
    eq(ns.dirty, false, "fresh")
    state.level = 24
    state.time = state.time + 60
    wow.fire("PLAYER_LEVEL_UP")
    eq(payload(state.db).characters[1].level, 24)
    eq(ns.dirty, true, "dirty after level up")
    state.gear[16] = nil
    wow.fire("PLAYER_EQUIPMENT_CHANGED")
    eq(#payload(state.db).characters[1].equipment.items, 1)
    -- Nothing readable (inventory not loaded): the last read stays, with its time.
    local at = payload(state.db).characters[1].equipment.capturedAt
    state.gear = {}
    state.time = state.time + 60
    wow.fire("PLAYER_ENTERING_WORLD")
    eq(#payload(state.db).characters[1].equipment.items, 1)
    eq(payload(state.db).characters[1].equipment.capturedAt, at)
end)

test("recipes: trade skill window, kept per profession, merged on later reads", function()
    local state = lich()
    wow.load(state)
    wow.fire("PLAYER_ENTERING_WORLD")
    state.trade = {
        profession = "Tailoring",
        lines = {
            { name = "Cloth", kind = "header" },
            { name = "Bolt of Linen Cloth", item = 2996 },
            { name = "Brown Linen Vest", item = 2568 },
        },
    }
    state.time = state.time + 10
    wow.fire("TRADE_SKILL_SHOW")
    local c = payload(state.db).characters[1]
    eq(#c.recipes, 1, "one profession")
    eq(c.recipes[1].profession, "Tailoring")
    eq(c.recipes[1].capturedAt, state.time)
    eq(#c.recipes[1].known, 2, "headers skipped")
    eq(c.recipes[1].known[1].item, 2996)
    -- A filtered view later: what it hides is kept.
    state.trade.lines = { { name = "Linen Bag", item = 4238 } }
    state.time = state.time + 10
    wow.fire("TRADE_SKILL_UPDATE")
    c = payload(state.db).characters[1]
    eq(#c.recipes[1].known, 3, "merged")
    eq(c.recipes[1].capturedAt, state.time)
    -- Window closed: nothing changes.
    local before = c.recipes[1].capturedAt
    state.trade = nil
    state.time = state.time + 10
    wow.fire("TRADE_SKILL_UPDATE")
    eq(payload(state.db).characters[1].recipes[1].capturedAt, before, "closed window isn't a read")
end)

test("recipes: Enchanting through the craft API, other professions keep their time", function()
    local state = lich()
    wow.load(state)
    wow.fire("PLAYER_ENTERING_WORLD")
    state.trade = { profession = "Tailoring", lines = { { name = "Bolt of Linen Cloth", item = 2996 } } }
    wow.fire("TRADE_SKILL_SHOW")
    local tailoringAt = state.time
    state.trade = nil
    state.time = state.time + 100
    state.craft = {
        profession = "Enchanting",
        lines = { { name = "Enchant Bracer - Minor Health" }, { name = "Runed Copper Rod", item = 6218 } },
    }
    wow.fire("CRAFT_SHOW")
    local c = payload(state.db).characters[1]
    eq(#c.recipes, 2)
    local byName = {}
    for _, s in ipairs(c.recipes) do byName[s.profession] = s end
    eq(byName.Tailoring.capturedAt, tailoringAt, "tailoring keeps its time")
    eq(byName.Enchanting.capturedAt, state.time)
    eq(byName.Enchanting.known[1].item, nil, "enchant links aren't items")
    eq(byName.Enchanting.known[2].item, 6218)
end)

test("an unlearned profession drops its recipes; a collapsed header doesn't", function()
    local state = lich()
    wow.load(state)
    wow.fire("PLAYER_ENTERING_WORLD")
    state.trade = { profession = "Tailoring", lines = { { name = "Bolt of Linen Cloth", item = 2996 } } }
    wow.fire("TRADE_SKILL_SHOW")
    state.trade = nil
    -- Collapsed Professions header: Tailoring isn't visible but is still known.
    state.skillLines = {
        { header = true, name = "Professions", expanded = false },
        { header = true, name = "Secondary Skills" },
        { name = "Cooking", rank = 61, max = 75, abandonable = true },
    }
    wow.fire("SKILL_LINES_CHANGED")
    local c = payload(state.db).characters[1]
    eq(#c.professions.skills, 3, "kept what the header hides")
    eq(#c.recipes, 1, "recipes kept")
    -- Tailoring unlearned.
    state.skillLines = {
        { header = true, name = "Professions" },
        { name = "Enchanting", rank = 98, max = 150, abandonable = true },
        { header = true, name = "Secondary Skills" },
        { name = "Cooking", rank = 61, max = 75, abandonable = true },
    }
    wow.fire("SKILL_LINES_CHANGED")
    c = payload(state.db).characters[1]
    eq(#c.professions.skills, 2)
    eq(#c.recipes, 0, "tailoring's recipes dropped")
end)

test("weapon and armor skills, with dual wield; a collapsed header keeps the last", function()
    local state = lich({ canDualWield = false })
    state.skillLines = {
        { header = true, name = "Professions" },
        { name = "Tailoring", rank = 120, max = 150, abandonable = true },
        { header = true, name = "Weapon Skills" },
        { name = "Staves", rank = 100, max = 115 },
        { name = "Daggers", rank = 80, max = 115 },
        { name = "Some New Weapon", rank = 1, max = 115 },
        { header = true, name = "Armor Proficiencies" },
        { name = "Cloth", rank = 1, max = 1 },
        { header = true, name = "Languages" },
        { name = "Language: Darnassian", rank = 300, max = 300 },
    }
    wow.load(state)
    wow.fire("PLAYER_ENTERING_WORLD")
    local p = payload(state.db).characters[1].proficiencies
    eq(p.capturedAt, state.time, "capturedAt")
    eq(p.level, 23, "level read at")
    eq(table.concat(p.skills, ","), "Cloth,Daggers,Some New Weapon,Staves", "skills (sorted, no languages or professions)")
    eq(p.dualWield, false, "dual wield")
    -- Collapsed weapon header: what it hides is kept.
    state.canDualWield = true
    state.skillLines = {
        { header = true, name = "Weapon Skills", expanded = false },
        { header = true, name = "Armor Proficiencies" },
        { name = "Cloth", rank = 1, max = 1 },
    }
    wow.load(state)
    wow.fire("PLAYER_ENTERING_WORLD")
    p = payload(state.db).characters[1].proficiencies
    eq(table.concat(p.skills, ","), "Cloth,Daggers,Dual Wield,Some New Weapon,Staves", "kept, plus Dual Wield")
    eq(p.dualWield, true)
end)

test("no skill list: no proficiencies", function()
    local state = lich({ skillLines = {} })
    wow.load(state)
    wow.fire("PLAYER_ENTERING_WORLD")
    eq(payload(state.db).characters[1].proficiencies, nil)
end)

test("guild unknown right after login keeps the last; leaving clears it", function()
    local state = lich()
    wow.load(state)
    wow.fire("PLAYER_ENTERING_WORLD")
    state.guildLoading = true
    wow.fire("PLAYER_ENTERING_WORLD")
    eq(payload(state.db).characters[1].guild.name, "Unbound")
    state.guild = nil
    wow.fire("PLAYER_GUILD_UPDATE")
    eq(payload(state.db).characters[1].guild, nil)
end)

test("a version 1 saved character upgrades and keeps its talents", function()
    local state = lich({
        db = {
            version = 1,
            characters = {
                ["Player-4904-004E2B22"] = {
                    guid = "Player-4904-004E2B22", name = "Lich", level = 22, classToken = "PRIEST",
                    capturedAt = 1794200000, talents = { { id = 134214, rank = 5, name = "Wand Specialization" } },
                },
            },
        },
    })
    wow.load(state)
    wow.fire("PLAYER_ENTERING_WORLD")
    local c = payload(state.db).characters[1]
    eq(c.level, 23)
    eq(c.talents[1].id, 134214, "talents kept when they can't be read")
    eq(#c.equipment.items, 2)
end)

test("logout saves at once; unknown events don't break loading", function()
    local state = lich({ unknownEvents = { CRAFT_SHOW = true, CRAFT_UPDATE = true, TRADE_SKILL_LIST_UPDATE = true } })
    wow.load(state)
    _G.C_Timer = { After = function() error("logout must not wait") end }
    wow.fire("PLAYER_LOGOUT")
    eq(state.db.lastReason, "PLAYER_LOGOUT")
end)

test("events in a burst read once", function()
    local state = lich()
    wow.load(state)
    local timers = {}
    _G.C_Timer = { After = function(_, fn) table.insert(timers, fn) end }
    wow.fire("PLAYER_EQUIPMENT_CHANGED")
    wow.fire("PLAYER_EQUIPMENT_CHANGED")
    wow.fire("SKILL_LINES_CHANGED")
    state.trade = { profession = "Tailoring", lines = { { name = "Bolt of Linen Cloth", item = 2996 } } }
    wow.fire("TRADE_SKILL_UPDATE")
    eq(#timers, 2, "one character read and one window read pending")
    for _, fn in ipairs(timers) do fn() end
    eq(#payload(state.db).characters[1].recipes, 1)
end)

test("modern clients: C_TooltipInfo and GetProfessions", function()
    local state = lich()
    local ns = wow.load(state)
    _G.C_TooltipInfo = {
        GetInventoryItem = function(_, slot)
            if slot ~= 1 then return nil end
            return { lines = {
                { leftText = "Electromagnetic Gigaflux Reactivator", leftColor = { r = 0, g = 0.44, b = 0.87 } },
                { leftText = "Soulbound", leftColor = { r = 1, g = 1, b = 1 } },
                { leftText = "Equip: Restores 3 mana per 5 sec.", leftColor = { r = 0, g = 1, b = 0 } },
                { leftText = "Head", rightText = "Cloth", leftColor = { r = 1, g = 1, b = 1 } },
            } }
        end,
    }
    _G.GetProfessions = function() return 3, nil, nil, 7, 5, nil end
    _G.GetProfessionInfo = function(i)
        local p = ({ [3] = { "Tailoring", 120, 150, 197 }, [5] = { "Cooking", 60, 75, 185 }, [7] = { "Fishing", 1, 75, 356 } })[i]
        return p[1], "icon", p[2], p[3], 0, 0, p[4]
    end
    wow.fire("PLAYER_ENTERING_WORLD")
    local c = payload(state.db).characters[1]
    local head = c.equipment.items[1]
    eq(#head.tooltip, 3)
    eq(head.tooltip[1].left, "Soulbound")
    eq(head.tooltip[2].color, "#00ff00")
    eq(head.tooltip[3].right, "Cloth")
    eq(#c.professions.skills, 3)
    eq(c.professions.skills[1].id, 197, "skill line id")
    eq(c.professions.skills[3].name, "Cooking")
    assert(ns.current())
end)

test("encoder: escapes, NaN, empty lists", function()
    local ns = wow.load(lich())
    eq(ns.encode({ a = 'x"\\\n\1' }), '{"a":"x\\"\\\\\\n\\u0001"}')
    eq(ns.encode({ n = 0 / 0 }), '{"n":null}')
    eq(ns.encode({}), "[]")
    eq(ns.encode({ 1, 2 }), "[1,2]")
    local decoded = wow.decode(ns.encode({ s = "Ðawn \"q\"", list = { { left = "a" } } }))
    eq(decoded.s, "Ðawn \"q\"")
    eq(decoded.list[1].left, "a")
end)

-- The end-to-end check's input: a SavedVariables file like the game's, for
-- Lich with gear, professions and recipes (some the catalog knows, one it
-- doesn't). Arguments: output path, level, game time, GUID.
-- ---- Bags and bank (0.8.0, guild requests) ---------------------------------------

--- Lich's bags: linen in two stacks, thread; the bank holds more linen.
local function withBags(api)
    return lich({
        containerApi = api,
        bags = {
            [0] = { slots = 16, [1] = { 2589, 20 }, [2] = { 2589, 5 }, [5] = { 2320, 4 } },
            [1] = { slots = 6, [1] = { 2996, 2 } },
            [-1] = { slots = 28, [3] = { 2589, 40 } },
            [5] = { slots = 10, [1] = { 4306, 7 } },
        },
    })
end

local function counts(part)
    local out = {}
    for _, item in ipairs(part and part.items or {}) do out[item.id] = item.count end
    return out
end

test("bags: summed by item on every read, in payload version 3", function()
    local state = withBags("modern")
    wow.load(state)
    wow.fire("PLAYER_ENTERING_WORLD")
    local c = payload(state.db).characters[1]
    local bags = counts(c.inventory.bags)
    eq(bags[2589], 25, "two linen stacks")
    eq(bags[2320], 4, "thread")
    eq(bags[2996], 2, "bag 1")
    eq(bags[4306], nil, "bank bags aren't bags")
    eq(c.inventory.bags.capturedAt, state.time)
    eq(c.inventory.bank, nil, "bank never opened")
end)

test("bags: the classic API (item id from the link) works too", function()
    local state = withBags("classic")
    wow.load(state)
    wow.fire("PLAYER_ENTERING_WORLD")
    eq(counts(payload(state.db).characters[1].inventory.bags)[2589], 25)
end)

test("bags: no container API means no inventory, not an empty one", function()
    local state = withBags(nil)
    wow.load(state)
    wow.fire("PLAYER_ENTERING_WORLD")
    eq(payload(state.db).characters[1].inventory, nil)
end)

test("bag changes update the save; the payload catches up on logout; never 'not on Guildie'", function()
    local state = withBags("modern")
    local ns = wow.load(state)
    wow.fire("PLAYER_ENTERING_WORLD")
    state.bags[0][1] = { 2589, 1 }
    state.time = state.time + 30
    wow.fire("BAG_UPDATE", 0)
    local saved = state.db.characters[state.guid].inventory.bags
    eq(counts(saved)[2589], 6, "saved read updated")
    eq(saved.capturedAt, state.time)
    eq(counts(payload(state.db).characters[1].inventory.bags)[2589], 25, "payload not re-encoded on loot")
    eq(ns.dirty, false, "bags aren't a change to upload")
    wow.fire("PLAYER_LOGOUT")
    eq(counts(payload(state.db).characters[1].inventory.bags)[2589], 6, "logout writes it")
end)

test("bank: read only while open, kept with its time after closing", function()
    local state = withBags("modern")
    local ns = wow.load(state)
    wow.fire("PLAYER_ENTERING_WORLD")
    wow.fire("PLAYERBANKSLOTS_CHANGED")
    eq(state.db.characters[state.guid].inventory.bank, nil, "closed: not read")
    local openedAt = state.time + 60
    state.time = openedAt
    wow.fire("BANKFRAME_OPENED")
    eq(ns.bankOpen, true)
    local bank = state.db.characters[state.guid].inventory.bank
    eq(counts(bank)[2589], 40, "bank slots")
    eq(counts(bank)[4306], 7, "bank bags")
    eq(counts(bank)[2320], nil, "bags aren't the bank")
    eq(bank.capturedAt, openedAt)
    wow.fire("BANKFRAME_CLOSED")
    eq(ns.bankOpen, false)
    state.time = state.time + 3600
    state.bags[-1][3] = nil
    wow.fire("PLAYER_LOGOUT")
    local c = payload(state.db).characters[1]
    eq(counts(c.inventory.bank)[2589], 40, "last bank read kept")
    eq(c.inventory.bank.capturedAt, openedAt, "with when it was read")
    eq(c.inventory.bags.capturedAt, state.time, "bags read again on logout")
end)

local out = arg and arg[1]
if out then
    local state = lich({ level = tonumber(arg[2]) or 36, time = tonumber(arg[3]) or os.time(), guid = arg[4] or "Player-4904-004E2BA2" })
    state.containerApi = "modern"
    state.bags = { [0] = { slots = 16, [1] = { 2589, 20 }, [2] = { 2321, 6 } } }
    state.skillLines = {
        { header = true, name = "Professions" },
        { name = "Tailoring", rank = 215, max = 225, abandonable = true },
        { name = "Enchanting", rank = 225, max = 225, abandonable = true },
        { header = true, name = "Secondary Skills" },
        { name = "Cooking", rank = 194, max = 225, abandonable = true },
        { name = "Fishing", rank = 150, max = 225, abandonable = true },
    }
    wow.load(state)
    wow.fire("PLAYER_ENTERING_WORLD")
    state.trade = {
        profession = "Tailoring",
        lines = {
            { name = "Cloth", kind = "header" },
            { name = "Bolt of Silk Cloth", item = 4305 },
            { name = "Red Linen Vest", item = 6239 },
            { name = "Not In The Catalog", item = 999999 },
        },
    }
    wow.fire("TRADE_SKILL_SHOW")
    state.trade = nil
    state.craft = { profession = "Enchanting", lines = { { name = "Enchant Bracer - Agility" }, { name = "Runed Copper Rod", item = 6218 } } }
    wow.fire("CRAFT_SHOW")
    local file = assert(io.open(out, "w"))
    file:write(wow.savedVariables(state.db))
    file:close()
    print("wrote " .. out)
end

-- ---- Quests ----------------------------------------------------------------------

local function withQuests(api)
    return lich({
        questApi = api,
        quests = {
            { header = "The Deadmines" },
            {
                id = 166, title = "The Defias Brotherhood", level = 22, tag = "Dungeon",
                objectives = { { "Edwin VanCleef's head: 0/1", false } },
            },
            { id = 214, title = "|cffffff00Red Silk Bandanas|r", level = 17, tag = "Dungeon", complete = 1 },
            { header = "Westfall" },
            { id = 12, title = "The People's Militia", level = 14, objectives = { { "Defias Trapper slain: 15/15", true }, { "Defias Smuggler slain: 3/15", false } } },
            { id = 99, title = "Failed escort", level = 0, complete = -1 },
        },
    })
end

local function byId(list)
    local out = {}
    for _, q in ipairs(list or {}) do out[q.id] = q end
    return out
end

for _, api in ipairs({ "modern", "classic" }) do
    test("quests (" .. api .. " API): titles, levels, tags, zones, complete, objectives", function()
        local state = withQuests(api)
        wow.load(state)
        wow.fire("QUEST_LOG_UPDATE")
        wow.fire("PLAYER_ENTERING_WORLD")
        local c = payload(state.db).characters[1]
        eq(c.quests.capturedAt, state.time)
        eq(#c.quests.list, 4, "headers aren't quests")
        local q = byId(c.quests.list)
        eq(q[166].title, "The Defias Brotherhood")
        eq(q[166].tag, "Dungeon")
        eq(q[166].zone, "The Deadmines")
        eq(q[166].level, 22)
        eq(q[166].complete, nil)
        eq(q[166].objectives[1].text, "Edwin VanCleef's head: 0/1")
        eq(q[166].objectives[1].done, false)
        eq(q[214].title, "Red Silk Bandanas", "color codes stripped")
        eq(q[214].complete, true)
        eq(q[12].zone, "Westfall")
        eq(q[12].tag, nil)
        eq(q[12].objectives[1].done, true)
        eq(#q[12].objectives, 2)
        eq(q[99].level, nil, "no level for scaling quests")
        eq(q[99].failed, true)
    end)
end

test("quests: an empty log at login isn't read until the game loads it", function()
    local state = lich({ questApi = "modern", quests = {} })
    wow.load(state)
    wow.fire("PLAYER_ENTERING_WORLD")
    eq(payload(state.db).characters[1].quests, nil, "not loaded yet")
    wow.fire("QUEST_LOG_UPDATE")
    wow.fire("PLAYER_LOGOUT")
    eq(#payload(state.db).characters[1].quests.list, 0, "an empty log, once loaded, is a real answer")
end)

test("quests: no quest log API means no quests, not an empty log", function()
    local state = lich({})
    wow.load(state)
    wow.fire("QUEST_LOG_UPDATE")
    wow.fire("PLAYER_ENTERING_WORLD")
    eq(payload(state.db).characters[1].quests, nil)
end)

test("quests: changes update the save; a collapsed header keeps its quests; logout writes the payload", function()
    local state = withQuests("classic")
    local ns = wow.load(state)
    wow.fire("QUEST_LOG_UPDATE")
    wow.fire("PLAYER_ENTERING_WORLD")
    -- Turn in the bandanas, collapse Westfall (its quests disappear from the API).
    state.time = state.time + 60
    state.quests = {
        { header = "The Deadmines" },
        { id = 166, title = "The Defias Brotherhood", level = 22, tag = "Dungeon" },
        { header = "Westfall", collapsed = true },
    }
    wow.fire("QUEST_LOG_UPDATE")
    local saved = byId(state.db.characters[state.guid].quests.list)
    eq(saved[214], nil, "turned in")
    eq(saved[12] ~= nil, true, "under a collapsed header: kept")
    eq(saved[99] ~= nil, true, "under a collapsed header: kept")
    eq(state.db.characters[state.guid].quests.capturedAt, state.time)
    eq(byId(payload(state.db).characters[1].quests.list)[214] ~= nil, true, "payload not re-encoded on every change")
    eq(ns.dirty, false, "quests aren't a change to upload")
    wow.fire("PLAYER_LOGOUT")
    eq(byId(payload(state.db).characters[1].quests.list)[214], nil, "logout writes it")
end)

print(string.format("%d passed, %d failed", passed, failures))
os.exit(failures == 0 and 0 or 1)
