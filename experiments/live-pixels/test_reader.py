import json
from pathlib import Path
import subprocess
import unittest

from reader import Assembler, decode, sample_values


class ProtocolTests(unittest.TestCase):
    def test_square_and_legacy_sampling(self):
        for columns in (16, 32):
            for cell in (2, 3, 4, 5, 8, 10):
                class Shot:
                    def pixel(self, x, y):
                        assert x % cell == cell // 2 and y % cell == cell // 2
                        assert 0 <= x < columns * cell
                        assert 0 <= y < (256 // columns) * cell
                        value = (y // cell) * columns + x // cell
                        return value, value, value
                self.assertEqual(sample_values(Shot(), cell, columns), list(range(256)))

    def test_amber_palette(self):
        class Shot:
            def pixel(self, x, y):
                value = (y // 2) * 16 + x // 2
                return value, int(value * 0.75 + 0.5), int(value * 0.45 + 0.5)
        self.assertEqual(sample_values(Shot(), 2, theme="amber"), list(range(256)))
        with self.assertRaises(ValueError):
            sample_values(Shot(), 2, theme="gray")

    def test_lua_encoder_python_decoder(self):
        protocol = Path(__file__).resolve().parents[2] / "apps/addon/Guildie/PixelProtocol.lua"
        script = 'dofile(arg[0]); for _, v in ipairs(GuildiePixelProtocol.encode(io.read("*a"))) do io.write(v, " ") end'
        # UTF-8 may be split across packet boundaries; decode only after assembly.
        payload = json.dumps({"text": "é" * 300}, ensure_ascii=False).encode()
        chunks = [payload[i:i + 180] for i in range(0, len(payload), 180)]
        assembler = Assembler()
        result = None
        for i in reversed(range(len(chunks))):
            packet = b"S|session-1|%d|%d|" % (i + 1, len(chunks)) + chunks[i]
            output = subprocess.check_output(["luajit", "-e", script, "--", str(protocol)], input=packet)
            values = list(map(int, output.split()))
            self.assertEqual(decode(values), packet)
            result = assembler.feed(decode(values))
            values[10] ^= 1
            with self.assertRaises(ValueError):
                decode(values)
        self.assertEqual(result["data"], json.loads(payload))
        self.assertIsNone(assembler.feed(packet))

    def test_incomplete_and_interleaved(self):
        assembler = Assembler()
        self.assertIsNone(assembler.feed(b'S|a|1|2|{"a":'))
        self.assertEqual(assembler.feed(b'L|b|1|1|{"health":5}')["channel"], "live")
        self.assertEqual(assembler.feed(b'S|a|2|2|1}')["data"], {"a": 1})
        with self.assertRaises(ValueError):
            assembler.feed(b'S|x|1|999999|x')

    def test_covered_square_replays_quest_completion_backlog(self):
        root = Path(__file__).resolve().parents[2]
        script = r"""
local wow = dofile("apps/addon/tests/wow.lua")
local ns = wow.load({guid = "Player-test", name = "Test", level = 26})
wow.fire("PLAYER_ENTERING_WORLD")
local panel
for _, f in ipairs(wow.frames) do
    if f.scripts.OnDragStop and f.scripts.OnUpdate and f.events.PLAYER_LOGIN then panel = f end
end
assert(panel)
local visible = true
local encode = GuildiePixelProtocol.encode
GuildiePixelProtocol.encode = function(packet)
    local values = encode(packet)
    if visible then
        for _, value in ipairs(values) do io.write(value, " ") end
        io.write("\n")
    end
    return values
end
ns.livePixels.set("enabled", true)
panel.scripts.OnUpdate(panel, 0.1) -- first packet of an incomplete snapshot
visible = false -- the reader misses frames while another UI covers the square
wow.fire("QUEST_TURNED_IN", 6981)
wow.fire("QUEST_TURNED_IN", 3369)
wow.fire("QUEST_TURNED_IN", 6981)
ns.current().deliveries = {{id = "Player-test:1:1", requestId = "request1", kind = "mailReceived", other = "Sender-Last", itemId = 4306, quantity = 7, at = GetServerTime()}}
for i = 1, 200 do panel.scripts.OnUpdate(panel, 0.1) end
visible = true
for i = 1, 400 do panel.scripts.OnUpdate(panel, 0.1) end
assert(#ns.current().completedQuestIds == 2, "transmitting does not delete confirmations")
"""
        output = subprocess.check_output(["luajit", "-e", script], cwd=root)
        assembler = Assembler()
        snapshots = []
        for line in output.splitlines():
            result = assembler.feed(decode(list(map(int, line.split()))))
            if result and result["channel"] == "snapshot":
                snapshots.append(result["data"])
        self.assertTrue(snapshots, "a complete snapshot arrives after the square is uncovered")
        self.assertEqual(snapshots[-1]["version"], 6)
        self.assertEqual(snapshots[-1]["characters"][0]["completedQuestIds"], [3369, 6981])
        self.assertEqual(snapshots[-1]["characters"][0]["deliveries"][0]["quantity"], 7)

    def test_live_export_omits_protected_values(self):
        addon = Path(__file__).resolve().parents[2] / "apps/addon/Guildie"
        script = r"""
dofile(arg[0])
local frame = {}
local noop = function() end
setmetatable(frame, {__index = function() return noop end})
frame.Show = function() frame.shown = true end
frame.Hide = function() frame.shown = false end
frame.EnableMouse = function(_, enabled) frame.mouse = enabled end
frame.CreateFontString = function()
    return {SetPoint = noop, SetText = noop, Show = noop, Hide = noop}
end
frame.scripts = {}
frame.SetScript = function(_, event, callback) frame.scripts[event] = callback end
local expectAmber = false
local colorCount = 0
local color = function(_, r, g, b, a)
    if expectAmber then
        local value = math.floor(r * 255 + 0.5)
        assert(math.abs(g * 255 - math.floor(value * 0.75 + 0.5)) < 0.00001)
        assert(math.abs(b * 255 - math.floor(value * 0.45 + 0.5)) < 0.00001)
        assert(a == 1)
        colorCount = colorCount + 1
    end
end
frame.CreateTexture = function()
    return {SetSize = noop, SetPoint = noop, ClearAllPoints = noop, SetColorTexture = color}
end
local expectedSize = 25.6
frame.GetWidth = function() return expectedSize end
frame.GetHeight = function() return expectedSize end
frame.SetSize = function(_, width, height) assert(width == expectedSize and height == expectedSize) end
CreateFrame = function(kind)
    if kind == "Button" then return setmetatable({}, {__index = function() return noop end}) end
    return frame
end
print = noop
UIParent = {GetEffectiveScale = function() return 1 end, GetHeight = function() return 500 end, GetLeft = function() return 0 end}
SlashCmdList = {}
GuildieDB = {version = 4, characters = {test = {talents = {}, inventory = {bags = {capturedAt = 1, items = {}}}}}}
local secret = {}
issecretvalue = function(value) return value == secret end
UnitHealth = function() return secret end
UnitGUID = function() return "test-guid" end
C_Map = {
    GetBestMapForUnit = function() return 42 end,
    GetPlayerMapPosition = function() return {GetXY = function() return secret, 0.5 end} end,
}
local encode = GuildiePixelProtocol.encode
local writePackets, packetCount = true, 0
GuildiePixelProtocol.encode = function(packet)
    packetCount = packetCount + 1
    if writePackets then
        for _, value in ipairs(encode(packet)) do io.write(value, " ") end
        io.write("\n")
    end
    return encode(packet)
end
assert(loadfile(arg[1]))("Guildie", {})
SlashCmdList.GUILDIELIVEPIXELS("edit")
frame.scripts.OnUpdate(frame, 1) -- editing must not emit any packets
frame.GetEffectiveScale = function() return 1 end
frame.GetLeft = function() return 23.4 end
frame.GetTop = function() return 477.2 end
UIParent.GetTop = function() return 500 end
frame.scripts.OnDragStop()
assert(GuildieDB.livePixels.x == 23 and GuildieDB.livePixels.y == -23)
frame.SetPoint = function(_, _, _, _, x, y) assert(x == 23 and y == -23) end
frame.scripts.OnEvent(frame, "ADDON_LOADED", "Guildie")
SlashCmdList.GUILDIELIVEPIXELS("lock")
expectedSize = 51.2
SlashCmdList.GUILDIELIVEPIXELS("on 3.2")
expectedSize = 38.4
SlashCmdList.GUILDIELIVEPIXELS("on 2.4")
expectedSize = 25.6
SlashCmdList.GUILDIELIVEPIXELS("on 1.6")
expectedSize = 25.6
SlashCmdList.GUILDIELIVEPIXELS("on")
SlashCmdList.GUILDIELIVEPIXELS("on compact")
SlashCmdList.GUILDIELIVEPIXELS("on") -- amber is now the default
expectAmber = true
for _ = 1, 3 do frame.scripts.OnUpdate(frame, 0.11) end
assert(colorCount >= 256)
writePackets, expectAmber = false, false
-- Blizzard's UI may load after this addon; attach once when it appears.
local hooks, hookCount = {}, 0
EditModeManagerFrame = {
    HookScript = function(_, event, callback) hooks[event] = callback; hookCount = hookCount + 1 end,
    IsShown = function() return false end,
}
frame.scripts.OnEvent(frame, "ADDON_LOADED", "Blizzard_EditMode")
frame.scripts.OnEvent(frame, "PLAYER_LOGIN")
assert(hookCount == 2)
hooks.OnShow()
assert(frame.shown and frame.mouse)
local before = packetCount
frame.scripts.OnUpdate(frame, 1)
assert(packetCount == before, "Edit Mode must pause all export")
SlashCmdList.GUILDIELIVEPIXELS("off") -- settings cannot restart/alter export during Edit Mode
frame.scripts.OnDragStart()
hooks.OnHide() -- closing while dragging must save and release it
assert(GuildieDB.livePixels.x == 23 and GuildieDB.livePixels.y == -23)
assert(frame.shown and not frame.mouse, "previously enabled export must resume")
frame.scripts.OnUpdate(frame, 0.11)
assert(packetCount == before + 1)
SlashCmdList.GUILDIELIVEPIXELS("off")
hooks.OnShow()
assert(frame.shown and frame.mouse, "disabled square must still be movable")
hooks.OnHide()
assert(not frame.shown and not frame.mouse, "Edit Mode must not enable disabled export")
"""
        output = subprocess.check_output([
            "luajit", "-e", script, "--", str(addon / "PixelProtocol.lua"), str(addon / "LivePixels.lua"),
        ])
        assembler = Assembler()
        records = [assembler.feed(decode(map(int, line.split()))) for line in output.splitlines()]
        records = [record for record in records if record is not None]
        self.assertEqual(records[0], {"channel": "snapshot", "data": {
            "version": 4, "characters": [{"talents": [], "inventory": {"bags": {"capturedAt": 1, "items": []}}}],
        }})
        self.assertEqual(records[-1], {"channel": "live", "data": {
            "version": 1, "guid": "test-guid", "mapId": 42, "y": 0.5,
        }})


if __name__ == "__main__":
    unittest.main()
