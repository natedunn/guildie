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


if __name__ == "__main__":
    unittest.main()
