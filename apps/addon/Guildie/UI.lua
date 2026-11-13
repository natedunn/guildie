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

local function settings() return ns.settings() end

-- ---- Window ------------------------------------------------------------------
-- The game's own look: PortraitFrameTemplate (the logo in the portrait ring,
-- like the character window) where the client has it, else the inset frame
-- earlier versions used, else a dialog-box backdrop. Everything in the body
-- shares one left edge; rows stack in a scrollable body. The window grows
-- to fit them until it reaches the screen height, keeping the footer visible.

local ICON = "Interface\\AddOns\\Guildie\\icon"
local WIDTH = 620
local MARGIN = 20
local TEXT_WIDTH = WIDTH - 2 * MARGIN - 20 -- room for the scrollbar
local BODY_TOP = 140 -- below the character header
local FOOTER_HEIGHT = 36

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
            -- The portrait sits about 2px right of and below the ring's
            -- center (measured in game), so shift the logo up and left
            -- inside it. The icon's edges are transparent, so the shifted
            -- texture coordinates show nothing extra.
            local size = (portrait.GetWidth and portrait:GetWidth()) or 0
            local shift = size > 0 and (2 / size) or 0
            portrait:SetTexCoord(shift, 1 + shift, shift, 1 + shift)
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
    -- The template's scroll bar only when there's something to scroll.
    local bar = rawget(window.scroll, "ScrollBar")
    if type(bar) == "table" then
        local scrolls = height > viewport
        if bar.SetShown then bar:SetShown(scrolls) elseif scrolls then bar:Show() else bar:Hide() end
    end
end

local function classColor(token)
    local c = token and RAID_CLASS_COLORS and RAID_CLASS_COLORS[token]
    if c and c.colorStr then return "|c" .. c.colorStr end
    if c and c.r then return string.format("|cff%02x%02x%02x", c.r * 255, c.g * 255, c.b * 255) end
    return "|cffffffff"
end

local function setRow(fs, value)
    fs:SetText(value or "")
    for _, row in ipairs(window.statusRows or window.rows) do
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
        s.status = GOLD .. ns.status.plural(n, "change") .. " since the last Guildie update|r"
        local lines = {}
        for _, change in ipairs(result.changes) do
            table.insert(lines, GREY .. "-|r " .. change)
        end
        s.changes = table.concat(lines, "\n")
    elseif result.state == "current" then
        s.status = GREEN .. "Matches the last Guildie update|r"
    elseif result.state == "unverified" then
        s.status = GOLD .. "Sync status needs verification|r"
        s.changes = "The loaded server data is old or incomplete. Reload to load the latest comparison, or check the Guildie app."
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

    s.method = ns.livePixels.get().enabled and "Method: experimental pixel sync" or "Method: reload / logout sync"
    if ns.livePixels.get().enabled then
        s.next = "The app can read the square without reloading. This window cannot verify live receipt; its server comparison refreshes at login or reload."
    end
    s.verified = type(GuildieData) == "table" and GuildieData.generatedAt
        and ("Server comparison updated " .. ns.status.ago(math.floor(GuildieData.generatedAt / 1000), now))
        or "No server comparison loaded."
    s.warning = ns.status.warning(result, ns.livePixels.health())
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
    setRow(window.method, s.method)
    setRow(window.verified, s.verified)
    setRow(window.warning, s.warning)
    if window.refreshSettings then window.refreshSettings() end
    local inCombat = InCombatLockdown and InCombatLockdown()
    window.upload:SetEnabled(not inCombat)
    window.uploadHint:SetText(inCombat and "Available after combat." or "Saves data and refreshes this comparison. Keep the Guildie app running.")
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
    -- Lets the template hide its bar too when the scroll range is 0.
    window.scroll.scrollBarHideable = true
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
    window.method = text("GameFontHighlight")
    window.verified = text("GameFontDisableSmall")
    window.warning = text("GameFontNormal")

    local upload = CreateFrame("Button", nil, window.body, "UIPanelButtonTemplate")
    upload:SetSize(144, 26)
    upload:SetText("Save & reload")
    upload:SetScript("OnClick", function()
        if InCombatLockdown and InCombatLockdown() then return end
        ns.capture("upload-button")
        ReloadUI()
    end)
    window.upload = upload
    window.uploadHint = text("GameFontDisableSmall")

    local footerRule = rule(window, WIDTH - 2 * MARGIN)
    footerRule:SetPoint("BOTTOMLEFT", window, "BOTTOMLEFT", MARGIN, FOOTER_HEIGHT - 4)
    local foot = window:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
    foot:SetPoint("BOTTOMLEFT", window, "BOTTOMLEFT", MARGIN, 12)
    foot:SetText("Guildie app required \194\183 guildie.club")

    window.statusRows = {
        { el = heading("Character sync"), gap = 0 },
        { el = window.status, gap = 10 },
        { el = window.changes, gap = 8 },
        { el = window.synced, gap = 6 },
        { el = window.verified, gap = 6 },
        { el = window.method, gap = 18 },
        { el = window.next, gap = 8 },
        { el = window.warning, gap = 12 },
        { el = upload, gap = 16, height = 26 },
        { el = window.uploadHint, gap = 6 },
    }
    window.settingsRows, window.refreshSettings, window.preferences = ns.buildSettingsRows(window.body, TEXT_WIDTH, refresh)
    window.tabs = {}
    function window:selectPage(page)
        self.page = page == "settings" and "settings" or "status"
        for _, list in ipairs({self.statusRows, self.settingsRows}) do
            for _, row in ipairs(list) do row.el:Hide() end
        end
        self.rows = self.page == "status" and self.statusRows or self.settingsRows
        self.scroll:SetVerticalScroll(0)
        for key, tab in pairs(self.tabs) do tab:SetEnabled(key ~= self.page) end
        refresh()
    end
    for i, key in ipairs({"status", "settings"}) do
        local tab = CreateFrame("Button", nil, window, "UIPanelButtonTemplate")
        tab:SetPoint("TOPLEFT", window, "TOPLEFT", MARGIN + (i - 1) * 132, -100)
        tab:SetSize(124, 26)
        tab:SetText(key == "status" and "Status" or "Settings")
        tab:SetScript("OnClick", function() window:selectPage(key) end)
        window.tabs[key] = tab
    end
    window.page, window.rows = "status", window.statusRows
    for _, row in ipairs(window.settingsRows) do row.el:Hide() end
    window.tabs.status:SetEnabled(false)
    window:SetScript("OnShow", refresh)
end
ns.buildWindow = function()
    if not window then buildWindow() end
    return window
end

function ns.openWindow(page)
    ns.buildWindow()
    window:Show()
    window:selectPage(page or "status")
end

function ns.toggleWindow()
    ns.buildWindow()
    if window:IsShown() then window:Hide() else window:Show() end
end

-- Entry in the minimap's add-on menu, where the client has one.
function Guildie_OnAddonCompartmentClick()
    ns.openWindow("status")
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
    background:SetPoint("TOPLEFT", 7, -6)

    -- Centered in the tracking border's ring, whose center is at (17, -16)
    -- from the button's top left (measured in game; the usual 7, -6 sat a
    -- pixel up and left).
    local icon = button:CreateTexture(nil, "ARTWORK")
    icon:SetTexture("Interface\\AddOns\\Guildie\\icon")
    icon:SetSize(18, 18)
    icon:SetPoint("TOPLEFT", 8, -7)

    local border = button:CreateTexture(nil, "OVERLAY")
    border:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")
    border:SetSize(53, 53)
    border:SetPoint("TOPLEFT")

    button:SetScript("OnClick", function() ns.openWindow("status") end)
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
        GameTooltip:AddLine("Click to open Guildie. Drag to move.", 0.6, 0.6, 0.6)
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
        if C_Timer and C_Timer.NewTicker then
            C_Timer.NewTicker(60, maybeReloadWhileAfk)
            C_Timer.NewTicker(5, function() refresh(); ns.refreshSyncWarning() end)
        end
        ns.refreshSyncWarning()
    elseif event == "PLAYER_REGEN_DISABLED" or event == "PLAYER_REGEN_ENABLED" then
        refresh()
    elseif addon == ADDON and action and tostring(action):find("ReloadUI") then
        settings().reloadWhenAfk = false
        print(GOLD .. "Guildie|r: the game doesn't let addons reload the UI on their own, so \"Sync while I'm AFK\" is off. Uploads still happen when you log out.")
    end
end)


-- A dismissible reminder away from the pixel square. This reports
-- local export health and cached comparison freshness, never inferred receipt.
local warning = CreateFrame("Frame", "GuildieSyncWarning", UIParent)
warning:SetSize(520, 54)
warning:SetPoint("TOP", UIParent, "TOP", 0, -80)
warning:SetFrameStrata("HIGH")
warning:SetClampedToScreen(true)
warning:EnableMouse(false)
warning.text = warning:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
warning.text:SetPoint("TOPLEFT", warning, "TOPLEFT", 0, -4)
warning.text:SetPoint("TOPRIGHT", warning, "TOPRIGHT", -28, -4)
warning.text:SetJustifyH("CENTER")
warning.close = CreateFrame("Button", nil, warning, "UIPanelCloseButton")
warning.close:SetSize(28, 28)
warning.close:SetPoint("TOPRIGHT", warning, "TOPRIGHT", 0, 0)
warning.close:SetScript("OnClick", function()
    settings().showSyncWarning = false
    warning:Hide()
    refresh()
end)
warning:Hide()
function ns.refreshSyncWarning()
    if not ns.livePixels.get().enabled or settings().showSyncWarning == false then warning:Hide(); return end
    local state = ns.windowState()
    warning.text:SetText("Guildie experimental sync: keep the whole square visible and unobstructed.\n"
        .. (state.warning or "Pixel output does not confirm receipt. Check the app for live sync status."))
    warning:SetHeight(math.max(54, warning.text:GetStringHeight() + 8))
    warning:Show()
end
