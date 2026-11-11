-- Guildie's window and minimap button. The window answers "is this
-- character up to date on Guildie?" (Status.lua compares the game with what
-- guildie.club shows, from GuildieData.lua) and says what happens next;
-- "Upload now" reloads the UI, which is when the game writes addon data to
-- disk for the Guildie app.

local ADDON, ns = ...

local GOLD = "|cffd9b45a"
local GREEN = "|cff40e040"
local GREY = "|cff9d9d9d"
local AFK_INTERVAL = 20 * 60 -- seconds between automatic reloads, at most

local function settings()
    GuildieDB.settings = GuildieDB.settings or {}
    local s = GuildieDB.settings
    if s.minimapAngle == nil then s.minimapAngle = 220 end
    if s.showMinimap == nil then s.showMinimap = true end
    if s.reloadWhenAfk == nil then s.reloadWhenAfk = false end
    return s
end

-- ---- Window ------------------------------------------------------------------
-- The game's own look: PortraitFrameTemplate (the logo in the portrait ring,
-- like the character window) where the client has it, else the inset frame
-- earlier versions used, else a dialog-box backdrop. Everything in the body
-- shares one left edge; rows stack in a scrollable body. The window grows
-- to fit them until it reaches the screen height, keeping the footer visible.

local ICON = "Interface\\AddOns\\Guildie\\icon"
local WIDTH = 400
local MARGIN = 20
local TEXT_WIDTH = WIDTH - 2 * MARGIN - 20 -- room for the scrollbar
local BODY_TOP = 104 -- below the character header
local FOOTER_HEIGHT = 36
local MAX_CHANGES = 6

local window

--- t[k] when it's a table (frames are tables; the test stub answers
--- every other key with a function).
local function child(t, k)
    local v = type(t) == "table" and t[k] or nil
    return type(v) == "table" and v or nil
end

local function tryTemplate(template)
    local ok, f = pcall(CreateFrame, "Frame", "GuildieWindow", UIParent, template)
    if ok and f then return f end
end

--- The frame and its chrome; returns the frame and where the header text starts.
local function makeFrame()
    local f = tryTemplate("PortraitFrameTemplate")
    -- A client without the template may still hand back a bare frame.
    if f and (child(f, "NineSlice") or child(f, "PortraitContainer") or child(f, "portrait")) then
        local portrait = (f.GetPortrait and f:GetPortrait())
            or child(child(f, "PortraitContainer"), "portrait") or child(f, "portrait")
        if portrait then
            -- The logo is gold line art on transparency: a dark disc behind it.
            local parent = portrait.GetParent and portrait:GetParent() or f
            local disc = parent:CreateTexture(nil, "BORDER")
            disc:SetTexture("Interface\\CharacterFrame\\TempPortraitAlphaMask")
            disc:SetVertexColor(0.06, 0.06, 0.06)
            disc:SetAllPoints(portrait)
            portrait:SetTexture(ICON)
            portrait:SetTexCoord(0, 1, 0, 1)
        end
        if f.SetTitle then
            f:SetTitle("Guildie")
        else
            local title = child(f, "TitleText") or child(child(f, "TitleContainer"), "TitleText")
            if title then title:SetText("Guildie") end
        end
        return f, 64
    end
    if f then f:Hide() end

    f = tryTemplate("BasicFrameTemplateWithInset")
    if not f then
        f = CreateFrame("Frame", "GuildieWindow", UIParent, BackdropTemplateMixin and "BackdropTemplate" or nil)
        if f.SetBackdrop then
            f:SetBackdrop({
                bgFile = "Interface\\DialogFrame\\UI-DialogBox-Background",
                edgeFile = "Interface\\DialogFrame\\UI-DialogBox-Border",
                tile = true, tileSize = 32, edgeSize = 32,
                insets = { left = 11, right = 12, top = 12, bottom = 11 },
            })
        end
        local close = CreateFrame("Button", nil, f, "UIPanelCloseButton")
        close:SetPoint("TOPRIGHT", f, "TOPRIGHT", -4, -4)
    end
    local title = f:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
    title:SetPoint("TOP", f, "TOP", 0, -5)
    title:SetText("Guildie")
    local logo = f:CreateTexture(nil, "ARTWORK")
    logo:SetTexture(ICON)
    logo:SetSize(36, 36)
    logo:SetPoint("TOPLEFT", f, "TOPLEFT", MARGIN - 4, -28)
    return f, MARGIN + 38
end

local function text(template, width)
    local fs = window.body:CreateFontString(nil, "OVERLAY", template)
    fs:SetJustifyH("LEFT")
    if fs.SetJustifyV then fs:SetJustifyV("TOP") end
    fs:SetWidth(width or TEXT_WIDTH)
    if fs.SetWordWrap then fs:SetWordWrap(true) end
    return fs
end

local function checkbox(label, get, set)
    local cb = CreateFrame("CheckButton", nil, window.body, "UICheckButtonTemplate")
    cb:SetSize(24, 24)
    local fs = cb:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    fs:SetPoint("LEFT", cb, "RIGHT", 2, 0)
    fs:SetWidth(TEXT_WIDTH - 26)
    fs:SetJustifyH("LEFT")
    fs:SetText(label)
    -- Clicking the label toggles it too.
    cb:SetHitRectInsets(0, -((fs:GetStringWidth() or 200) + 4), 0, 0)
    cb:SetScript("OnShow", function(self) self:SetChecked(get()) end)
    cb:SetScript("OnClick", function(self) set(self:GetChecked() and true or false) end)
    return cb
end

local function heightOf(row)
    if row.height then return row.height end
    local h = row.el.GetStringHeight and row.el:GetStringHeight()
    if h and h > 0 then return h end
    -- Not measured yet (or outside the game): ~12px a line.
    local _, breaks = (row.el:GetText() or ""):gsub("\n", "")
    return 12 * (breaks + 1)
end

--- Stacks the visible rows. Each row's left edge is MARGIN + its own `dx`
--- (checkboxes sit 4px left so their box, not their padding, lines up);
--- offsets never carry over from one row to the next.
local function layout()
    local prev, prevDx = nil, 0
    local height = 0
    for _, row in ipairs(window.rows) do
        local shown = row.shown ~= false
        if row.el.SetShown then row.el:SetShown(shown) elseif shown then row.el:Show() else row.el:Hide() end
        if shown then
            local dx = row.dx or 0
            row.el:ClearAllPoints()
            if prev then
                row.el:SetPoint("TOPLEFT", prev, "BOTTOMLEFT", dx - prevDx, -row.gap)
                height = height + row.gap
            else
                row.el:SetPoint("TOPLEFT", window.body, "TOPLEFT", dx, 0)
            end
            height = height + heightOf(row)
            row.x = MARGIN + dx
            prev, prevDx = row.el, dx
        end
    end
    height = height + 12
    window.body:SetHeight(height)
    local available = (UIParent:GetHeight() or 800) - 80
    local frameHeight = math.min(BODY_TOP + height + FOOTER_HEIGHT, math.max(240, available))
    window:SetHeight(frameHeight)
    local viewport = frameHeight - BODY_TOP - FOOTER_HEIGHT
    window.scroll:SetHeight(viewport)
    window.scroll:SetVerticalScroll(math.min(window.scroll:GetVerticalScroll() or 0, math.max(0, height - viewport)))
end

local function classColor(token)
    local c = token and RAID_CLASS_COLORS and RAID_CLASS_COLORS[token]
    if c and c.colorStr then return "|c" .. c.colorStr end
    if c and c.r then return string.format("|cff%02x%02x%02x", c.r * 255, c.g * 255, c.b * 255) end
    return "|cffffffff"
end

local function setRow(fs, value)
    fs:SetText(value or "")
    for _, row in ipairs(window.rows) do
        if row.el == fs then row.shown = value ~= nil and value ~= "" end
    end
end

--- What the window shows now, as plain values (the tests read these).
function ns.windowState()
    local me = ns.current()
    local result = ns.status.check(me, GuildieData, UnitGUID("player"), UnitName("player"))
    local now = GetServerTime()
    local s = { result = result }

    local className = UnitClass("player")
    s.name = classColor(me and me.classToken or select(2, UnitClass("player"))) .. ((me and me.name) or UnitName("player") or "") .. "|r"
    local guild = me and me.guild and me.guild.name
    s.info = string.format("Level %d %s", (me and me.level) or UnitLevel("player") or 0, className or "")
    s.guild = guild and (GREY .. "<" .. guild .. ">|r") or ""

    if result.state == "behind" then
        local n = #result.changes
        s.status = GOLD .. ns.status.plural(n, "change") .. " not on Guildie yet|r"
        local lines = {}
        for i, change in ipairs(result.changes) do
            if i > MAX_CHANGES - 1 and n > MAX_CHANGES then
                table.insert(lines, GREY .. string.format("and %d more", n - i + 1) .. "|r")
                break
            end
            table.insert(lines, GREY .. "-|r " .. change)
        end
        s.changes = table.concat(lines, "\n")
    elseif result.state == "current" then
        s.status = GREEN .. "Up to date with Guildie|r"
    elseif result.state == "unknown" then
        s.status = GOLD .. "Connect this character|r"
        s.changes = GREY .. "Claim it on guildie.club (level 10 or higher) with the Guildie app running; it shows here after your next /reload.|r"
    else
        s.status = GOLD .. "Waiting for the Guildie app|r"
        s.changes = GREY .. "Open the Guildie app and sign in, then reload WoW to load your guild's data.|r"
    end
    s.synced = ns.status.syncedText(result.entry, now)
    if s.synced then s.synced = GREY .. s.synced .. "|r" end

    if result.state == "behind" and not ns.dirty then
        -- Nothing new since this UI loaded: the game wrote it to disk then and
        -- the app uploads it, but GuildieData.lua was read before that, so
        -- this view only catches up at the next /reload.
        s.next = "Saved at your last /reload for the app to upload. Reload again to refresh this status."
    elseif result.state == "behind" then
        s.next = "Reload to save these changes for the Guildie app to upload. Logging out saves them too."
    else
        s.next = "Changes save for the app to upload when you log out or reload."
    end

    if type(GuildieData) == "table" and GuildieData.generatedAt then
        local reagents = 0
        for _ in pairs(GuildieData.reagents or {}) do reagents = reagents + 1 end
        local upgrades = GuildieData.upgrades and GuildieData.upgrades.members
        local guilds = table.concat(GuildieData.guilds or {}, ", ")
        s.guildData = string.format("%s\n%s \194\183 %s for upgrades",
            guilds ~= "" and guilds or "No guild",
            ns.status.plural(reagents, "reagent"),
            ns.status.plural(type(upgrades) == "table" and #upgrades or 0, "guildmate"))
        s.guildUpdated = GREY .. "Updated " .. ns.status.ago(math.floor(GuildieData.generatedAt / 1000), now) .. "|r"
    else
        s.guildData = "No guild data yet. Keep the Guildie app running, then reload to load tooltip hints."
    end

    -- Guild requests (0.8.0): yours, with a nudge when some went quiet.
    local mine = type(GuildieData) == "table" and type(GuildieData.myRequests) == "table" and GuildieData.myRequests
    if mine and (mine.open or 0) > 0 then
        local stale = mine.stale or 0
        s.requests = string.format("%d open", mine.open)
            .. (stale > 0 and string.format(" (%d stale)", stale) or "")
        s.requestsHint = GREY .. (stale > 0
            and "Still need them? Keep or close them on guildie.club (Requests)."
            or "Manage them on guildie.club (Requests).") .. "|r"
    end
    return s
end

local function refresh()
    if not window or not window:IsShown() then return end
    local s = ns.windowState()
    window.name:SetText(s.name)
    window.info:SetText(s.info)
    window.guild:SetText(s.guild)
    setRow(window.status, s.status)
    setRow(window.changes, s.changes)
    setRow(window.synced, s.synced)
    setRow(window.next, s.next)
    setRow(window.guildData, s.guildData)
    setRow(window.guildUpdated, s.guildUpdated)
    setRow(window.requestsHeading, s.requests and "Your requests" or nil)
    setRow(window.requests, s.requests)
    setRow(window.requestsHint, s.requestsHint)
    local inCombat = InCombatLockdown and InCombatLockdown()
    window.upload:SetEnabled(not inCombat)
    window.uploadHint:SetText(inCombat and "Available after combat." or "Reloads your UI. Keep the Guildie app running.")
    layout()
end
ns.onCapture = refresh

local function heading(label)
    local fs = text("GameFontHighlight")
    fs:SetText(label)
    return fs
end

local function rule(parent, width)
    local line = parent:CreateTexture(nil, "ARTWORK")
    line:SetSize(width, 1)
    if line.SetColorTexture then line:SetColorTexture(1, 1, 1, 0.10) else line:SetTexture(1, 1, 1, 0.10) end
    return line
end

local function buildWindow()
    local headerX
    window, headerX = makeFrame()
    window:SetWidth(WIDTH)
    window:SetPoint("CENTER")
    window:SetMovable(true)
    window:SetClampedToScreen(true)
    window:EnableMouse(true)
    window:RegisterForDrag("LeftButton")
    window:SetScript("OnDragStart", window.StartMoving)
    window:SetScript("OnDragStop", window.StopMovingOrSizing)
    window:SetFrameStrata("DIALOG")
    window:Hide()
    tinsert(UISpecialFrames, "GuildieWindow") -- Escape closes it

    -- Header: the character, beside the logo.
    window.name = window:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
    window.name:SetPoint("TOPLEFT", window, "TOPLEFT", headerX, -32)
    window.name:SetJustifyH("LEFT")
    window.info = window:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    window.info:SetPoint("TOPLEFT", window.name, "BOTTOMLEFT", 0, -3)
    window.info:SetJustifyH("LEFT")
    window.name:SetWidth(WIDTH - headerX - MARGIN)
    window.name:SetWordWrap(false)
    window.info:SetWidth(WIDTH - headerX - MARGIN)
    window.guild = window:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
    window.guild:SetPoint("TOPLEFT", window.info, "BOTTOMLEFT", 0, -5)
    window.guild:SetWidth(WIDTH - headerX - MARGIN)
    window.guild:SetWordWrap(false)
    window.guild:SetJustifyH("LEFT")

    local headerRule = rule(window, WIDTH - 2 * MARGIN)
    headerRule:SetPoint("TOPLEFT", window, "TOPLEFT", MARGIN, -BODY_TOP + 12)
    local ok, scroll = pcall(CreateFrame, "ScrollFrame", nil, window, "UIPanelScrollFrameTemplate")
    window.scroll = ok and scroll or CreateFrame("ScrollFrame", nil, window)
    window.scroll:SetPoint("TOPLEFT", window, "TOPLEFT", MARGIN, -BODY_TOP)
    window.scroll:SetWidth(TEXT_WIDTH)
    window.body = CreateFrame("Frame", nil, window.scroll)
    window.body:SetSize(TEXT_WIDTH, 1)
    window.scroll:SetScrollChild(window.body)
    window.scroll:EnableMouseWheel(true)
    window.scroll:SetScript("OnMouseWheel", function(self, delta)
        local limit = math.max(0, window.body:GetHeight() - self:GetHeight())
        self:SetVerticalScroll(math.max(0, math.min(limit, self:GetVerticalScroll() - delta * 32)))
    end)

    window.status = text("GameFontHighlight")
    window.changes = text("GameFontHighlightSmall")
    window.synced = text("GameFontHighlightSmall")
    window.next = text("GameFontHighlightSmall")
    window.guildData = text("GameFontHighlightSmall")
    window.guildUpdated = text("GameFontDisableSmall")
    window.requestsHeading = heading("Your requests")
    window.requests = text("GameFontHighlightSmall")
    window.requestsHint = text("GameFontHighlightSmall")

    local upload = CreateFrame("Button", nil, window.body, "UIPanelButtonTemplate")
    upload:SetSize(144, 26)
    upload:SetText("Sync now")
    upload:SetScript("OnClick", function()
        if InCombatLockdown and InCombatLockdown() then return end
        ns.capture("upload-button")
        ReloadUI()
    end)
    window.upload = upload
    window.uploadHint = text("GameFontDisableSmall")

    window.afk = checkbox("Sync while I'm AFK",
        function() return settings().reloadWhenAfk end,
        function(on) settings().reloadWhenAfk = on end)
    window.minimap = checkbox("Show minimap button",
        function() return settings().showMinimap end,
        function(on)
            settings().showMinimap = on
            if ns.updateMinimapButton then ns.updateMinimapButton() end
        end)

    local afkHint = text("GameFontDisableSmall", TEXT_WIDTH - 26)
    afkHint:SetText("Experimental. Reloads your UI while AFK, out of combat, at most every 20 minutes.")
    local footerRule = rule(window, WIDTH - 2 * MARGIN)
    footerRule:SetPoint("BOTTOMLEFT", window, "BOTTOMLEFT", MARGIN, FOOTER_HEIGHT - 4)
    local foot = window:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
    foot:SetPoint("BOTTOMLEFT", window, "BOTTOMLEFT", MARGIN, 12)
    foot:SetText("Guildie app required \194\183 guildie.club")

    window.rows = {
        { el = heading("Character sync"), gap = 0 },
        { el = window.status, gap = 10 },
        { el = window.changes, gap = 8 },
        { el = window.synced, gap = 6 },
        { el = window.next, gap = 8 },
        { el = upload, gap = 12, height = 26 },
        { el = window.uploadHint, gap = 6 },
        { el = rule(window.body, TEXT_WIDTH), gap = 18, height = 1 },
        { el = heading("Guild tooltips"), gap = 14 },
        { el = window.guildData, gap = 10 },
        { el = window.guildUpdated, gap = 6 },
        { el = window.requestsHeading, gap = 18 },
        { el = window.requests, gap = 10 },
        { el = window.requestsHint, gap = 4 },
        { el = rule(window.body, TEXT_WIDTH), gap = 18, height = 1 },
        { el = heading("Preferences"), gap = 14 },
        { el = window.minimap, gap = 6, dx = -4, height = 24 },
        { el = window.afk, gap = 2, dx = -4, height = 24 },
        { el = afkHint, gap = 0, dx = 26 },
    }
    window:SetScript("OnShow", refresh)
end
ns.buildWindow = function()
    if not window then buildWindow() end
    return window
end

function ns.toggleWindow()
    ns.buildWindow()
    if window:IsShown() then window:Hide() else window:Show() end
end

-- Entry in the minimap's add-on menu, where the client has one.
function Guildie_OnAddonCompartmentClick()
    ns.toggleWindow()
end

-- ---- Minimap button ------------------------------------------------------------

local button

local function placeButton()
    local angle = math.rad(settings().minimapAngle)
    local radius = (Minimap:GetWidth() / 2) + 10
    button:ClearAllPoints()
    button:SetPoint("CENTER", Minimap, "CENTER", math.cos(angle) * radius, math.sin(angle) * radius)
end

local function buildButton()
    button = CreateFrame("Button", "GuildieMinimapButton", Minimap)
    button:SetSize(31, 31)
    button:SetFrameStrata("MEDIUM")
    button:SetFrameLevel(8)
    button:RegisterForClicks("LeftButtonUp", "RightButtonUp")
    button:RegisterForDrag("LeftButton")
    button:SetHighlightTexture("Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight")

    local background = button:CreateTexture(nil, "BACKGROUND")
    background:SetTexture("Interface\\Minimap\\UI-Minimap-Background")
    background:SetSize(20, 20)
    background:SetPoint("TOPLEFT", 7, -5)

    local icon = button:CreateTexture(nil, "ARTWORK")
    icon:SetTexture("Interface\\AddOns\\Guildie\\icon")
    icon:SetSize(18, 18)
    icon:SetPoint("TOPLEFT", 7, -6)

    local border = button:CreateTexture(nil, "OVERLAY")
    border:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")
    border:SetSize(53, 53)
    border:SetPoint("TOPLEFT")

    button:SetScript("OnClick", function() ns.toggleWindow() end)
    button:SetScript("OnEnter", function(self)
        GameTooltip:SetOwner(self, "ANCHOR_LEFT")
        GameTooltip:AddLine("Guildie")
        -- The window's headline, and the first few changes.
        local result = ns.status.check(ns.current(), GuildieData, UnitGUID("player"), UnitName("player"))
        if result.state == "current" then
            GameTooltip:AddLine(ns.status.headline(result), 0.25, 0.88, 0.25)
        else
            GameTooltip:AddLine(ns.status.headline(result), 0.85, 0.71, 0.35)
        end
        for i, change in ipairs(result.changes) do
            if i > 3 then break end
            GameTooltip:AddLine(change, 1, 1, 1)
        end
        if #result.changes > 3 then GameTooltip:AddLine(string.format("and %d more", #result.changes - 3), 0.6, 0.6, 0.6) end
        GameTooltip:AddLine("Click to open. Drag to move.", 0.6, 0.6, 0.6)
        GameTooltip:Show()
    end)
    button:SetScript("OnLeave", function() GameTooltip:Hide() end)
    button:SetScript("OnDragStart", function(self)
        self:SetScript("OnUpdate", function()
            local mx, my = Minimap:GetCenter()
            local scale = Minimap:GetEffectiveScale()
            local cx, cy = GetCursorPosition()
            settings().minimapAngle = math.deg(math.atan2(cy / scale - my, cx / scale - mx))
            placeButton()
        end)
    end)
    button:SetScript("OnDragStop", function(self) self:SetScript("OnUpdate", nil) end)
end

function ns.updateMinimapButton()
    if not button then buildButton() end
    placeButton()
    button:SetShown(settings().showMinimap)
end

-- ---- Upload while AFK (opt-in, experimental) -----------------------------------
-- Reloads the UI only when: the option is on, you're flagged AFK, you're out of
-- combat, something changed since the last upload, and it's been 20 minutes
-- since the UI last loaded. If the game doesn't let an addon reload by itself,
-- the option turns off and says so.

local loadedAt = GetTime()

local function maybeReloadWhileAfk()
    local s = settings()
    if not s.reloadWhenAfk or not ns.dirty then return end
    if not UnitIsAFK("player") or InCombatLockdown() then return end
    if GetTime() - loadedAt < AFK_INTERVAL then return end
    ns.capture("afk-reload")
    ReloadUI()
end

local events = CreateFrame("Frame")
events:RegisterEvent("PLAYER_LOGIN")
events:RegisterEvent("PLAYER_REGEN_DISABLED")
events:RegisterEvent("PLAYER_REGEN_ENABLED")
events:RegisterEvent("ADDON_ACTION_BLOCKED")
events:RegisterEvent("ADDON_ACTION_FORBIDDEN")
events:SetScript("OnEvent", function(_, event, addon, action)
    if event == "PLAYER_LOGIN" then
        ns.updateMinimapButton()
        if C_Timer and C_Timer.NewTicker then C_Timer.NewTicker(60, maybeReloadWhileAfk) end
    elseif event == "PLAYER_REGEN_DISABLED" or event == "PLAYER_REGEN_ENABLED" then
        refresh()
    elseif addon == ADDON and action and tostring(action):find("ReloadUI") then
        settings().reloadWhenAfk = false
        print(GOLD .. "Guildie|r: the game doesn't let addons reload the UI on their own, so \"Sync while I'm AFK\" is off. Uploads still happen when you log out.")
    end
end)
