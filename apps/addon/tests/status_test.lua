-- Tests the "is this character up to date on Guildie?" check (Status.lua)
-- and the window (UI.lua) with a stubbed WoW API.
--   luajit apps/addon/tests/status_test.lua
-- End to end, with a GuildieData.lua the app wrote: loads it, plays a
-- character named in it that has moved on in game (level, gear, a profession,
-- recipes) and prints the window's lines; "same" plays it exactly as
-- Guildie has it:
--   luajit apps/addon/tests/status_test.lua GuildieData.lua [name] [same]

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
local function has(text, part)
    if not tostring(text):find(part, 1, true) then error(string.format("%q not in %q", part, tostring(text)), 2) end
end
local function plain(text)
    return (tostring(text or ""):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""))
end

local NOW = 1794300000
local GUID = "Player-4904-004E2B22"

--- Lich in game: level 23, two items, Tailoring 155 with 3 recipes, 2 talents (8 points).
local function me(overrides)
    local c = {
        guid = GUID, name = "Lich", level = 23, classToken = "PRIEST", capturedAt = NOW,
        guild = { name = "Unbound" },
        talents = { { id = 300, rank = 3 }, { id = 200, rank = 5 } },
        equipment = { items = {
            { slot = 1, id = 9492, name = "Electromagnetic Gigaflux Reactivator" },
            { slot = 16, id = 2520, name = "Broadsword of the Eagle" },
            { slot = 4, id = 45, name = "Squire's Shirt" },
        } },
        professions = { skills = {
            { name = "Tailoring", rank = 155, max = 225 },
            { name = "Cooking", rank = 60, max = 75 },
            { name = "Staves", rank = 100, max = 115 },
        } },
        recipes = { { profession = "Tailoring", known = { { name = "A" }, { name = "B" }, { name = "C" } } } },
    }
    for k, v in pairs(overrides or {}) do c[k] = v end
    return c
end

--- Guildie's entry when it's all caught up with me().
local function entry(overrides)
    local e = {
        slug = "lich-braz", id = tonumber("004E2B22", 16), level = 23,
        talents = { total = 8, trees = { { name = "Discipline", points = 8 } }, ranks = "200:5,300:3" },
        gear = { [1] = 9492, [16] = 2520 },
        professions = { Tailoring = { skill = 155, recipes = 3 }, Cooking = { skill = 60 } },
        synced = { at = (NOW - 300) * 1000, from = "game" },
    }
    for k, v in pairs(overrides or {}) do e[k] = v end
    return e
end

local ns = wow.load({ db = {}, time = NOW, guid = GUID, name = "Lich", level = 23 })
local S = ns.status

test("caught up: no changes (shirt ignored, Staves isn't a profession)", function()
    eq(#S.compare(me(), entry()), 0, "changes")
end)

test("each kind of change, in order", function()
    local changes = S.compare(me({ level = 24, talents = { { id = 200, rank = 5 }, { id = 300, rank = 3 }, { id = 400, rank = 3 } } }), entry({
        level = 22,
        gear = { [1] = 1, [16] = 2 },
        professions = { Tailoring = { skill = 150, recipes = 1 }, Mining = { skill = 20 } },
    }))
    eq(#changes, 7, "changes: " .. table.concat(changes, " | "))
    eq(changes[1], "Level 24 (Guildie has 22)")
    eq(changes[2], "Talents: 3 more points")
    eq(changes[3], "2 gear changes")
    eq(changes[4], "Tailoring 155 (Guildie has 150)")
    eq(changes[5], "New profession: Cooking 60")
    eq(changes[6], "Mining unlearned")
    eq(changes[7], "2 new Tailoring recipes")
end)

test("one gear change names the item; level and skill never count down", function()
    local changes = S.compare(me(), entry({ level = 25, gear = { [1] = 9492, [16] = 1, [4] = 99 }, professions = { Tailoring = { skill = 160, recipes = 9 }, Cooking = { skill = 60 } } }))
    eq(#changes, 1, table.concat(changes, " | "))
    eq(changes[1], "New gear: Broadsword of the Eagle")
end)

test("talents: same points, other talents is a respec; an empty read says nothing", function()
    local changes = S.compare(me({ talents = { { id = 200, rank = 4 }, { id = 301, rank = 4 } } }), entry())
    eq(changes[1], "Talents changed (respec)")
    eq(#S.compare(me({ talents = {} }), entry()), 0, "empty read")
    eq(S.compare(me({ talents = { { id = 200, rank = 5 } } }), entry())[1], "Talents changed (respec)", "fewer points")
    -- No ranks from the site (a talent without an id): totals only.
    eq(#S.compare(me({ talents = { { id = 1, rank = 8 } } }), entry({ talents = { total = 8 } })), 0, "no ranks")
end)

test("a profession's recipes count only once its window was read", function()
    eq(#S.compare(me({ recipes = {} }), entry({ professions = { Tailoring = { skill = 155, recipes = 40 }, Cooking = { skill = 60 } } })), 0)
    eq(S.compare(me(), entry({ professions = { Tailoring = { skill = 155, recipes = 2 }, Cooking = { skill = 60 } } }))[1], "1 new Tailoring recipe")
end)

test("finding the entry: by Blizzard id, else by name; states", function()
    eq(S.idFromGuid(GUID), 5122850)
    local data = { generatedAt = NOW * 1000, characters = { Someone = entry(), Lich = entry({ id = 1, level = 1 }) } }
    eq(S.find(data, GUID, "Lich").level, 23, "by id first")
    eq(S.find({ characters = { Lich = entry({ id = 1 }) } }, "Player-1-FF", "Lich").id, 1, "by name")
    eq(S.check(me(), nil, GUID, "Lich").state, "nodata")
    eq(S.check(me(), { generatedAt = NOW * 1000 }, GUID, "Lich").state, "unknown", "older guild data: no characters")
    eq(S.check(me(), { generatedAt = NOW * 1000, characters = { Lich = entry() } }, GUID, "Lich").state, "current")
    local behind = S.check(me({ level = 24 }), { generatedAt = NOW * 1000, characters = { Lich = entry() } }, GUID, "Lich")
    eq(behind.state, "behind")
    eq(S.headline(behind), "1 change since the last Guildie update")
end)

test("times", function()
    eq(S.ago(NOW - 20, NOW), "just now")
    eq(S.ago(NOW - 300, NOW), "5 min ago")
    eq(S.ago(NOW - 3 * 3600, NOW), "3 hr ago")
    eq(S.ago(NOW - 3 * 86400, NOW), "3 days ago")
    eq(S.syncedText(entry(), NOW), "Last synced 5 min ago, from the game")
    eq(S.syncedText(entry({ synced = { at = (NOW - 86400 * 2) * 1000, from = "blizzard" } }), NOW), "Last synced 2 days ago, from Blizzard")
    local unsynced = entry()
    unsynced.synced = nil
    eq(S.syncedText(unsynced, NOW), nil)
end)

-- ---- The window -------------------------------------------------------------------

--- Lich in game, with GuildieData set; opens the window.
local function open(state, data)
    state = state or {}
    state.db = state.db or {}
    state.time = state.time or NOW
    state.guid = GUID
    state.name = "Lich"
    state.level = state.level or 24
    state.guild = { name = "Unbound", rank = "Member", rankIndex = 5 }
    state.gear = state.gear or { [16] = { id = 2520, name = "Broadsword of the Eagle", quality = 2 } }
    state.skillLines = state.skillLines or {
        { header = true, name = "Professions" },
        { name = "Tailoring", rank = 155, max = 225, abandonable = true },
    }
    local ns = wow.load(state)
    _G.GuildieData = data
    wow.fire("PLAYER_ENTERING_WORLD")
    ns.toggleWindow()
    local window = _G.GuildieWindow
    assert(window and window:IsShown(), "window shown")
    return ns, window
end

--- A region's left edge, following its TOPLEFT anchors up to the window.
local function left(region, window)
    local p = region.points[1]
    assert(p, "anchored")
    if p[2] == window then return p[4] end
    return left(p[2], window) + p[4]
end

local function data(e)
    return {
        generatedAt = (NOW - 600) * 1000, guilds = { "Unbound" }, reagents = { [2589] = {} },
        upgrades = { members = { {}, {} } }, characters = { Lich = e },
    }
end

test("window: only sync status, wide modal, and both tabs", function()
    local ns, w = open({}, data(entry({level = 22, gear = {[16] = 2520}, professions = {Tailoring = {skill = 150}}})))
    eq(w:GetWidth(), 620)
    eq(w.page, "status")
    has(plain(w.status:GetText()), "since the last Guildie update")
    eq(rawget(w, "guildData"), nil, "no guild overview on Status")
    eq(rawget(w, "requests"), nil, "no requests overview on Status")
    w.tabs.settings.scripts.OnClick()
    eq(w.page, "settings")
    eq(w.status:IsShown(), false)
    local c = w.preferences.showMinimap
    c:SetChecked(false); c.scripts.OnClick(c)
    eq(GuildieDB.settings.showMinimap, false)
    eq(GuildieMinimapButton:IsShown(), false)
    ns.openWindow("status")
    eq(w.preferences.syncEnabled:IsShown(), false)
    eq(w.status:IsShown(), true)
end)

test("scrolling happens only on overflow, switching pages resets offset", function()
    local _, w = open({screenHeight = 480}, data(nil))
    w:selectPage("settings")
    eq(w:GetHeight(), 400)
    eq(w.scroll.ScrollBar:IsShown(), true)
    w.scroll.scripts.OnMouseWheel(w.scroll, -100)
    eq(w.scroll:GetVerticalScroll(), w.body:GetHeight() - w.scroll:GetHeight())
    w:selectPage("status")
    eq(w.scroll:GetVerticalScroll(), 0)
    local _, large = open({}, data(nil))
    eq(large.scroll.ScrollBar:IsShown(), large.body:GetHeight() > large.scroll:GetHeight())
end)

test("pixel enablement cannot hide outdated data; errors and stale comparisons warn", function()
    local ns, w = open({}, data(entry({level = 20})))
    ns.livePixels.set("enabled", true)
    ns.onCapture()
    eq(ns.windowState().result.state, "behind")
    has(w.method:GetText(), "pixel")
    has(w.warning:GetText(), "differs")
    ns.refreshSyncWarning()
    eq(GuildieSyncWarning:IsShown(), true)
    has(GuildieSyncWarning.text:GetText(), "unobstructed")
    ns.livePixels.set("enabled", false)
    eq(GuildieSyncWarning:IsShown(), false)
    local stale = S.check(me(), {generatedAt = (NOW - 3600) * 1000, characters = {Lich = entry()}}, GUID, "Lich")
    eq(stale.state, "unverified")
    eq(S.warning(stale, {enabled = true, hasData = true, error = "Export stopped"}), "Export stopped")
    has(S.warning(stale, {enabled = true, hasData = false}), "No character data")
    has(S.warning(stale, {enabled = true, hasData = true, stalled = true}), "stopped")
    has(S.warning(stale, {enabled = true, hasData = true, cycleSeconds = 90}), "90 seconds")
end)

test("bags, bank, quests, completions and receipt reports compare actual content", function()
    local c = me({inventory = {bags = {items = {{id = 1, count = 7}}}, bank = {items = {{id = 2, count = 1}}}},
        quests = {list = {{id = 123, complete = true}}}, completedQuestIds = {456}, deliveries = {{id = "event1"}}})
    local e = entry({details = {bags = {{id = 1, count = 6}}, bank = {}, quests = {}, completedQuestIds = {}, deliveryIds = {}}})
    eq(#S.compare(c, e), 5)
    e.details = {bags = c.inventory.bags.items, bank = c.inventory.bank.items, quests = c.quests.list, completedQuestIds = {456}, deliveryIds = {"event1"}}
    eq(#S.compare(c, e), 0)
    e.details = nil
    eq(S.check(c, {generatedAt = NOW * 1000, characters = {Lich = e}}, GUID, "Lich").state, "unverified", "missing confirmations are not up-to-date")
end)

test("reload and edit controls respect combat", function()
    local state = {combat = true}
    local ns, w = open(state, nil)
    eq(w.upload.enabled, false)
    w.upload.scripts.OnClick()
    eq(state.reloads, nil)
    state.combat = false
    wow.fire("PLAYER_REGEN_ENABLED")
    eq(w.upload.enabled, true)
    w.upload.scripts.OnClick()
    eq(state.reloads, 1)
end)

test("dismissing sync warning persists without disabling export", function()
    local db = {}
    local ns = wow.load({db = db, time = NOW, guid = GUID})
    ns.livePixels.set("enabled", true)
    ns.refreshSyncWarning()
    local banner = _G.GuildieSyncWarning
    eq(banner:IsShown(), true)
    banner.close.scripts.OnClick()
    eq(banner:IsShown(), false)
    ns.refreshSyncWarning()
    eq(banner:IsShown(), false, "timer must not reopen dismissed warning")
    eq(ns.livePixels.get().enabled, true, "export stays enabled")
    ns = wow.load({db = db, time = NOW, guid = GUID})
    ns.refreshSyncWarning()
    eq(_G.GuildieSyncWarning:IsShown(), false, "dismissal survives reload")
    ns.settings().showSyncWarning = true
    ns.refreshSyncWarning()
    eq(_G.GuildieSyncWarning:IsShown(), true, "preference restores warning")
    ns.livePixels.set("enabled", false)
    ns.refreshSyncWarning()
    eq(_G.GuildieSyncWarning:IsShown(), false)
end)

-- ---- End to end ---------------------------------------------------------------------

local file = arg and arg[1]
if file then
    print(string.format("%d passed, %d failed", passed, failures))
    local chunk = assert(loadfile(file))
    local env = {}
    setfenv(chunk, env)
    chunk()
    local gd = env.GuildieData
    assert(gd and gd.characters, "no characters in " .. file)
    local name = arg[2]
    if not name then for n in pairs(gd.characters) do name = n break end end
    local e = assert(gd.characters[name], "no entry for " .. tostring(name))
    print(string.format("GuildieData: %d bytes; %s: level %d, %d talent points, %d gear slots", #io.open(file):read("*a"), name, e.level, e.talents.total,
        (function() local n = 0 for _ in pairs(e.gear) do n = n + 1 end return n end)()))
    -- In game: a level up, one item swapped, one profession up 5 with 4 new recipes.
    local moved = arg[3] ~= "same"
    local gear = {}
    local swapped = not moved
    for slot, id in pairs(e.gear) do
        if not swapped and slot ~= 4 and slot ~= 19 then
            gear[slot] = { id = 19019, name = "Thunderfury, Blessed Blade of the Windseeker", quality = 5 }
            swapped = true
        else
            gear[slot] = { id = id, name = "Item " .. id, quality = 2 }
        end
    end
    local skillLines = { { header = true, name = "Professions" } }
    local first
    for profession, p in pairs(e.professions) do
        local rank = p.skill or 1
        if not first then first = profession rank = rank + (moved and 5 or 0) end
        table.insert(skillLines, { name = profession, rank = rank, max = 300, abandonable = true })
    end
    local state = {
        db = {}, time = os.time(), guid = "Player-4904-" .. string.format("%X", e.id or 1), name = name,
        level = e.level + (moved and 1 or 0), guild = { name = (gd.guilds or {})[1] or "Guild" }, gear = gear, skillLines = skillLines,
    }
    local ns = wow.load(state)
    _G.GuildieData = gd
    wow.fire("PLAYER_ENTERING_WORLD")
    if first then
        local lines = {}
        for i = 1, ((e.professions[first].recipes) or 0) + (moved and 4 or 0) do table.insert(lines, { name = "Recipe " .. i }) end
        state.trade = { profession = first, lines = lines }
        wow.fire("TRADE_SKILL_SHOW")
        state.trade = nil
    end
    ns.toggleWindow()
    local w = _G.GuildieWindow
    print("")
    print(plain(w.name:GetText()) .. "  " .. plain(w.info:GetText()))
    for _, row in ipairs(w.rows) do
        if row.el:IsShown() then
            local t = rawget(row.el, "_text")
            if row.height == 1 then t = string.rep("-", 40) end
            if row.el == w.upload then t = "[ Sync now ]" end
            if row.el == w.afk then t = "[ ] Sync while I'm AFK" end
            if row.el == w.minimap then t = "[x] Show minimap button" end
            if type(t) == "string" then print(plain(t)) end
        end
    end
    os.exit(failures == 0 and 0 or 1)
end

print(string.format("%d passed, %d failed", passed, failures))
os.exit(failures == 0 and 0 or 1)
