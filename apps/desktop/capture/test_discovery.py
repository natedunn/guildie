import unittest
from discovery import (candidates, RegionShot, is_wow_title, frontmost_mac, foreground_x11, capture_problem,
                       capture_scale, square_region, is_blank, wayland_session)
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
    def test_exits_without_capture_when_parent_is_gone(self):
        class Capture:
            def grab(self, _):
                raise AssertionError("must not capture after parent exits")
        with patch.object(reader, "foreground_wow", side_effect=AssertionError("must exit first")):
            reader.automatic(Capture(), lambda: False)

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

        with patch.object(reader, "foreground_wow", foreground), patch.object(reader, "capture_problem", lambda: None), \
             patch.object(reader, "wayland_session", lambda: False), patch.object(reader.time, "monotonic", lambda: clock[0]), \
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


def run_automatic(capture, foreground, problem=lambda: None, wayland=lambda: False, until=8):
    """Drive reader.automatic on a fake clock; returns the emitted records."""
    clock = [0.0]
    output = []

    def timed_foreground():
        if clock[0] >= until:
            raise KeyboardInterrupt()
        return foreground()

    def timed_problem():
        if clock[0] >= until:
            raise KeyboardInterrupt()
        return problem()

    with patch.object(reader, "foreground_wow", timed_foreground), patch.object(reader, "capture_problem", timed_problem), \
         patch.object(reader, "wayland_session", wayland), patch.object(reader.time, "monotonic", lambda: clock[0]), \
         patch.object(reader.time, "sleep", lambda delay: clock.__setitem__(0, clock[0] + delay)), \
         patch.object(reader, "emit", lambda channel, data: output.append((channel, data))):
        try:
            reader.automatic(capture)
        except KeyboardInterrupt:
            pass
    return output


def states(output):
    return [data["state"] for channel, data in output if channel == "status"]


class PlatformTests(unittest.TestCase):
    def test_title_rule_matches_the_app(self):
        self.assertTrue(is_wow_title("World of Warcraft"))
        self.assertTrue(is_wow_title("world of warcraft classic"))
        for title in ("", "World of Warcraft - Google Chrome", "World of Warcraft \u2014 Mozilla Firefox",
                      "World of Warcraft \u2013 Wowhead", "Wowhead: World of Warcraft", "Battle.net"):
            self.assertFalse(is_wow_title(title), title)

    def test_mac_frontmost_window(self):
        def window(owner, title=None, x=10, y=40, width=1280, height=800, layer=0, alpha=1):
            entry = {"kCGWindowOwnerName": owner, "kCGWindowLayer": layer, "kCGWindowAlpha": alpha,
                     "kCGWindowBounds": {"X": x, "Y": y, "Width": width, "Height": height}}
            if title is not None:
                entry["kCGWindowName"] = title
            return entry
        rect = {"left": 10, "top": 40, "width": 1280, "height": 800}
        menubar = window("Window Server", "Menubar", layer=24)
        # Native client: the owner name is enough (titles need Screen Recording).
        self.assertEqual(frontmost_mac([menubar, window("World of Warcraft")]), rect)
        self.assertEqual(frontmost_mac([window("World of Warcraft Classic", "World of Warcraft")]), rect)
        # Wine/CrossOver: the title decides.
        self.assertEqual(frontmost_mac([window("wine64-preloader", "World of Warcraft")]), rect)
        self.assertEqual(frontmost_mac([window("WowClassic.exe", "World of Warcraft")]), rect)
        self.assertIsNone(frontmost_mac([window("wine64-preloader")]))
        # A browser showing a WoW page is not the game, even with a bare title.
        self.assertIsNone(frontmost_mac([window("Safari", "World of Warcraft")]))
        self.assertIsNone(frontmost_mac([window("Google Chrome", "World of Warcraft - Google Chrome")]))
        # Only the frontmost normal window counts; invisible or tiny ones are skipped.
        self.assertIsNone(frontmost_mac([window("Discord", "general"), window("World of Warcraft")]))
        self.assertEqual(frontmost_mac([window("Overlay", alpha=0), window("Helper", width=1, height=1),
                                        window("World of Warcraft")]), rect)
        self.assertEqual(frontmost_mac([window("World of Warcraft", x=10.4, y=39.6, width=1279.6)]), rect)
        self.assertIsNone(frontmost_mac([]))

    def test_x11_active_window_in_root_coordinates(self):
        class Property:
            def __init__(self, value):
                self.value = value

        class Window:
            def __init__(self, title, utf8=True):
                self.title, self.utf8 = title, utf8

            def get_full_text_property(self, atom, kind):
                assert atom == "_NET_WM_NAME" and kind == "UTF8_STRING"
                return self.title if self.utf8 else None

            def get_wm_name(self):
                return self.title

            def get_geometry(self):
                return type("Geometry", (), {"x": 0, "y": 0, "width": 1600, "height": 900})()

        class Root:
            def __init__(self, active):
                self.active = active

            def get_full_property(self, atom, kind):
                assert atom == "_NET_ACTIVE_WINDOW"
                return None if self.active is None else Property([self.active])

            def translate_coords(self, window, x, y):
                assert isinstance(window, Window) and (x, y) == (0, 0)
                return type("Coords", (), {"x": 1920 + 4, "y": 28})()

        class Display:
            def __init__(self, active, window):
                self.root, self.window = Root(active), window

            def screen(self):
                return type("Screen", (), {"root": self.root})()

            def intern_atom(self, name):
                return name

            def create_resource_object(self, kind, xid):
                assert kind == "window" and xid == 0x2a00007
                return self.window

        rect = {"left": 1924, "top": 28, "width": 1600, "height": 900}
        self.assertEqual(foreground_x11(Display(0x2a00007, Window("World of Warcraft"))), rect)
        self.assertEqual(foreground_x11(Display(0x2a00007, Window("World of Warcraft", utf8=False))), rect)
        self.assertIsNone(foreground_x11(Display(0x2a00007, Window("World of Warcraft - Mozilla Firefox"))))
        self.assertIsNone(foreground_x11(Display(None, Window("World of Warcraft"))))
        self.assertIsNone(foreground_x11(Display(0, Window("World of Warcraft"))))

    def test_capture_problems_per_platform(self):
        self.assertIsNone(capture_problem("win32", {}))
        self.assertEqual(capture_problem("darwin", {}, lambda: False), "permission")
        self.assertIsNone(capture_problem("darwin", {}, lambda: True))
        self.assertIsNone(capture_problem("linux", {"DISPLAY": ":0"}))
        # XWayland: try, and let blank grabs decide.
        self.assertIsNone(capture_problem("linux", {"DISPLAY": ":0", "XDG_SESSION_TYPE": "wayland"}))
        self.assertEqual(capture_problem("linux", {"XDG_SESSION_TYPE": "wayland", "WAYLAND_DISPLAY": "wayland-0"}),
                         "unsupported")
        self.assertTrue(wayland_session({"XDG_SESSION_TYPE": "wayland"}))
        self.assertTrue(wayland_session({"WAYLAND_DISPLAY": "wayland-0"}))
        self.assertFalse(wayland_session({"XDG_SESSION_TYPE": "x11", "DISPLAY": ":0"}))

    def test_blank_images(self):
        image = type("Image", (), {})()
        for alpha in (0, 255):
            image.bgra = bytes((0, 0, 0, alpha)) * 64
            self.assertTrue(is_blank(image))
            image.bgra = bytes((0, 0, 0, alpha)) * 63 + bytes((0, 1, 0, alpha))
            self.assertFalse(is_blank(image))
        self.assertFalse(is_blank(Shot()))

    def test_retina_regions_cover_the_square(self):
        window = {"left": 100, "top": 50, "width": 80, "height": 75}
        retina = type("Image", (), {"width": 160})()
        plain = type("Image", (), {"width": 80})()
        self.assertEqual(capture_scale(window, retina), 2)
        self.assertEqual(capture_scale(window, plain), 1)
        # Same region as before on Windows and X11.
        self.assertEqual(square_region(window, plain, 7, 11, 3),
                         ({"left": 107, "top": 61, "width": 48, "height": 48}, 0, 0))
        # Points on a Retina Mac: odd pixels round outwards and keep an offset.
        self.assertEqual(square_region(window, retina, 7, 11, 3),
                         ({"left": 103, "top": 55, "width": 25, "height": 25}, 1, 1))
        self.assertEqual(square_region(window, retina, 8, 10, 2),
                         ({"left": 104, "top": 55, "width": 16, "height": 16}, 0, 0))

    def test_automatic_on_retina(self):
        # A 80x75 point window drawn at 2x; the square sits on odd pixels with odd cells.
        window = {"left": 0, "top": 0, "width": 80, "height": 75}
        serial = [0]

        class Capture:
            def grab(self, region):
                serial[0] += 1
                shot = Shot(cell=3, left=7, top=11, serial=serial[0])
                if region == window:
                    return shot
                return RegionShot(shot, region["left"] * 2, region["top"] * 2)

        output = run_automatic(Capture(), lambda: window)
        self.assertEqual(states(output), ["searching", "calibrating", "receiving"])
        self.assertTrue(any(channel == "live" for channel, _ in output))

    def test_reports_missing_permission_without_capturing(self):
        class Capture:
            def grab(self, _):
                raise AssertionError("must not capture without permission")

        def foreground():
            raise AssertionError("must not look for WoW without permission")

        self.assertEqual(states(run_automatic(Capture(), foreground, problem=lambda: "permission")), ["permission"])

    def test_blank_wayland_grabs_report_unsupported(self):
        window = {"left": 0, "top": 0, "width": 160, "height": 150}

        class Capture:
            def grab(self, region):
                black = type("Image", (), {})()
                black.width, black.height, black.bgra = 160, 150, bytes(160 * 150 * 4)
                return black

        self.assertEqual(states(run_automatic(Capture(), lambda: window, wayland=lambda: True)),
                         ["searching", "unsupported"])
        # On X11 a black window is just a window without the square yet.
        self.assertEqual(states(run_automatic(Capture(), lambda: window, wayland=lambda: False)), ["searching"])


if __name__ == "__main__":
    unittest.main()
