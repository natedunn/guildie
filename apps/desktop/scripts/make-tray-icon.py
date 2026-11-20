"""Draws the tray icons from guildie's mark (apps/web/icons/mark.svg: the
shield with a cross cut out of it), with no tile behind it:
  assets/tray-mac-Template.png, @2x  macOS menu bar: black with alpha, a
                                     template image (macOS tints it)
  assets/tray-linux.png, @2x         Linux tray: the mark's gold
Pure Python, no image libraries:
  python3 scripts/make-tray-icon.py   (from apps/desktop)
"""
import os, struct, zlib

# mark.svg's gold, top (v = 4) to bottom (v = 27.6) of the shield.
GOLD = [(0, (0xFF, 0xDD, 0x8F)), (0.5, (0xFF, 0xB6, 0x48)), (1, (0xE9, 0x78, 0x1C))]


def bezier(p0, p1, p2, p3, n=24):
    out = []
    for i in range(1, n + 1):
        t = i / n
        a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out


# mark.svg's shield: M16 4l10 4.2v7.3c0 6-4.1 10.4-10 12.1-5.9-1.7-10-6.1-10-12.1V8.2z
SHIELD = (
    [(16, 4), (26, 8.2), (26, 15.5)]
    + bezier((26, 15.5), (26, 21.5), (21.9, 25.9), (16, 27.6))
    + bezier((16, 27.6), (10.1, 25.9), (6, 21.5), (6, 15.5))
    + [(6, 8.2)]
)


def inside(poly, x, y):
    c = False
    for i in range(len(poly)):
        (x1, y1), (x2, y2) = poly[i], poly[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def dist_to_segment(x, y, x1, y1, x2, y2):
    dx, dy = x2 - x1, y2 - y1
    t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    return ((x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2) ** 0.5


def gold(v):
    t = min(max((v - 4) / 23.6, 0), 1)
    for (o1, c1), (o2, c2) in zip(GOLD, GOLD[1:]):
        if t <= o2:
            k = (t - o1) / (o2 - o1)
            return tuple(c1[i] + (c2[i] - c1[i]) * k for i in range(3))
    return GOLD[-1][1]


def covered(u, v):
    """Whether (u, v) in the mark's 32-unit viewBox is ink: the shield minus the cross."""
    if not inside(SHIELD, u, v):
        return False
    half = 2.25 / 2
    return not (dist_to_segment(u, v, 16, 10.5, 16, 21.5) <= half or dist_to_segment(u, v, 10.5, 16, 21.5, 16) <= half)


# The square of the viewBox the icon shows: the shield (20 x 23.6) with a little room.
SIDE = 25.6
LEFT, TOP = 16 - SIDE / 2, 15.8 - SIDE / 2


def png(size, color):
    ss = 4
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            hits = 0
            for sy in range(ss):
                for sx in range(ss):
                    u = LEFT + (x + (sx + 0.5) / ss) * SIDE / size
                    v = TOP + (y + (sy + 0.5) / ss) * SIDE / size
                    hits += covered(u, v)
            a = round(255 * hits / (ss * ss))
            r, g, b = color(TOP + (y + 0.5) * SIDE / size)
            row += bytes([round(r), round(g), round(b), a] if a else [0, 0, 0, 0])
        rows.append(bytes(row))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b"")


assets = os.path.join(os.path.dirname(__file__), "..", "assets")
black = lambda v: (0, 0, 0)
for name, size, color in [
    ("tray-mac-Template.png", 18, black),
    ("tray-mac-Template@2x.png", 36, black),
    ("tray-linux.png", 24, gold),
    ("tray-linux@2x.png", 48, gold),
]:
    with open(os.path.join(assets, name), "wb") as f:
        f.write(png(size, color))
    print("wrote", name)
