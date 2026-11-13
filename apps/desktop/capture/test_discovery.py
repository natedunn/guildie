import unittest
from discovery import candidates, RegionShot
from reader import decode, sample_values
import zlib
from unittest.mock import patch
import reader


class Shot:
    def __init__(self, cell=2, theme="amber", left=7, top=11, corrupt=False, serial=0):
        self.width, self.height = 160, 150
        self.bgra = bytearray(self.width * self.height * 4)
        packet = ('L|test%d|1|1|{"health":5}' % serial).encode()
        body = b"GLP\x01" + bytes([len(packet)]) + packet
        data = body + zlib.adler32(body).to_bytes(4, "big")
        data = data.ljust(256, b"\x00")
        if corrupt:
            data = data[:10] + bytes([data[10] ^ 1]) + data[11:]
        for i, v in enumerate(data):
            rgb = (v, int(v * .75 + .5), int(v * .45 + .5)) if theme == "amber" else (v, v, v)
            for dy in range(cell):
                for dx in range(cell):
                    x, y = left + (i % 16) * cell + dx, top + (i // 16) * cell + dy
                    offset = (y * self.width + x) * 4
                    self.bgra[offset:offset + 4] = bytes((*reversed(rgb), 0))

    def pixel(self, x, y):
        offset = (y * self.width + x) * 4
        return tuple(reversed(self.bgra[offset:offset + 3]))


class DiscoveryTests(unittest.TestCase):
    def test_automatic_reacquires_and_does_not_capture_other_apps(self):
        clock = [0.0]
        serial = [0]
        output = []
        window = {"left": 0, "top": 0, "width": 160, "height": 150}

        def foreground():
            if clock[0] >= 8:
                raise KeyboardInterrupt()
            return None if 3 <= clock[0] < 4 else window

        class Capture:
            def grab(self, region):
                assert not 3 <= clock[0] < 4, "must not capture when WoW is not foreground"
                serial[0] += 1
                shot = Shot(left=7 if clock[0] < 2 else 19, serial=serial[0])
                return shot if region == window else RegionShot(shot, region["left"], region["top"])

        with patch.object(reader, "foreground_wow", foreground), patch.object(reader.time, "monotonic", lambda: clock[0]), \
             patch.object(reader.time, "sleep", lambda delay: clock.__setitem__(0, clock[0] + delay)), \
             patch.object(reader, "emit", lambda channel, data: output.append((channel, data))):
            with self.assertRaises(KeyboardInterrupt):
                reader.automatic(Capture())
        states = [data["state"] for channel, data in output if channel == "status"]
        self.assertGreaterEqual(states.count("receiving"), 2)
        self.assertIn("waiting-game", states)
        self.assertTrue(any(channel == "live" for channel, _ in output))

    def test_locates_exact_origin_across_themes_sizes_and_positions(self):
        for theme in ("amber", "gray"):
            for cell in (2, 3, 4, 8):
                for left, top in ((0, 0), (7, 11)):
                    shot = Shot(cell, theme, left, top)
                    found = list(candidates(shot))
                    self.assertIn((left, top, cell, theme), found)
                    valid = []
                    for x, y, size, palette in found:
                        try:
                            decode(sample_values(RegionShot(shot, x, y), size, theme=palette))
                            valid.append((x, y, size, palette))
                        except ValueError:
                            pass
                    self.assertEqual(valid, [(left, top, cell, theme)])

    def test_header_alone_is_not_a_valid_capture(self):
        shot = Shot(corrupt=True)
        for x, y, cell, theme in candidates(shot):
            with self.assertRaises(ValueError):
                decode(sample_values(RegionShot(shot, x, y), cell, theme=theme))


if __name__ == "__main__":
    unittest.main()
