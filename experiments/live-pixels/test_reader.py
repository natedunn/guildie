import json
from pathlib import Path
import subprocess
import unittest

from reader import Assembler, decode


class ProtocolTests(unittest.TestCase):
    def test_lua_encoder_python_decoder(self):
        protocol = Path(__file__).parent / "GuildieLivePixels/Protocol.lua"
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

    def test_live_export_omits_protected_values(self):
        addon = Path(__file__).parent / "GuildieLivePixels"
        script = """
dofile(arg[0])
local frame = {}
local noop = function() end
setmetatable(frame, {__index = function() return noop end})
frame.SetScript = function(_, _, update) frame.update = update end
frame.CreateTexture = function() return {SetSize = noop, SetPoint = noop, SetColorTexture = noop} end
CreateFrame = function() return frame end
UIParent = {GetEffectiveScale = function() return 1 end}
SlashCmdList = {}
local secret = {}
issecretvalue = function(value) return value == secret end
UnitHealth = function() return secret end
UnitGUID = function() return "test-guid" end
C_Map = {
    GetBestMapForUnit = function() return 42 end,
    GetPlayerMapPosition = function() return {GetXY = function() return secret, 0.5 end} end,
}
local encode = GuildiePixelProtocol.encode
GuildiePixelProtocol.encode = function(packet)
    if packet:sub(1, 1) == "L" then
        for _, value in ipairs(encode(packet)) do io.write(value, " ") end
    end
    return encode(packet)
end
dofile(arg[1])
for _ = 1, 3 do frame:update(0.11) end
"""
        output = subprocess.check_output([
            "luajit", "-e", script, "--", str(addon / "Protocol.lua"), str(addon / "Live.lua"),
        ])
        result = Assembler().feed(decode(map(int, output.split())))
        self.assertEqual(result, {"channel": "live", "data": {
            "version": 1, "guid": "test-guid", "mapId": 42, "y": 0.5,
        }})


if __name__ == "__main__":
    unittest.main()
