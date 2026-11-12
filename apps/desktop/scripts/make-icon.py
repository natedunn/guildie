"""Draws guildie's mark (apps/web/icons/mark.svg: the shield in a gold
gradient) on the chrome color, with a faint legendary glow, into assets/guildie.ico at 16, 32, 48 and 256 px, the same tile
as the site's app icons (apps/web/scripts/gen-icons.mjs). Pure Python, no
image libraries:
  python3 scripts/make-icon.py   (from apps/desktop)
"""
import struct, zlib, os

BG = (0x13, 0x11, 0x0E)  # --chrome
GLOW = (0xFF, 0x80, 0x00)  # --glow, at most 22% over the tile (gen-icons.mjs)
# mark.svg's gold, top (v = 4) to bottom (v = 27.6) of the shield.
GOLD = [(0, (0xFF, 0xDD, 0x8F)), (0.5, (0xFF, 0xB6, 0x48)), (1, (0xE9, 0x78, 0x1C))]

RADIUS = 0.22 * 32  # tile corner, like icon-512.png
MARK = 0.75  # the mark's share of the tile


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


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def gold(v):
    t = min(max((v - 4) / 23.6, 0), 1)
    for (o1, c1), (o2, c2) in zip(GOLD, GOLD[1:]):
        if t <= o2:
            return mix(c1, c2, (t - o1) / (o2 - o1))
    return GOLD[-1][1]


def tile(u, v):
    """The chrome with the glow: centered, 28% down, fading out over 53% of the tile."""
    d = ((u - 16) ** 2 + (v - 0.28 * 32) ** 2) ** 0.5 / (0.53 * 32)
    return mix(BG, GLOW, 0.22 * max(0, 1 - d))


def pixel(u, v):
    """Color at (u, v) in the 32-unit tile, or None for transparent."""
    r = RADIUS
    cx, cy = min(max(u, r), 32 - r), min(max(v, r), 32 - r)
    if (u - cx) ** 2 + (v - cy) ** 2 > r * r:
        return None
    # Into the mark's own 32-unit viewBox, centered in the tile.
    at = 32 * (1 - MARK) / 2
    mu, mv = (u - at) / MARK, (v - at) / MARK
    if not inside(SHIELD, mu, mv):
        return tile(u, v)
    # The cross: 2.25 wide strokes with round caps, cut out of the shield.
    half = 2.25 / 2
    if dist_to_segment(mu, mv, 16, 10.5, 16, 21.5) <= half or dist_to_segment(mu, mv, 10.5, 16, 21.5, 16) <= half:
        return BG
    return gold(mv)


def png(size):
    ss = 4  # supersampling
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    c = pixel((x + (sx + 0.5) / ss) * 32 / size, (y + (sy + 0.5) / ss) * 32 / size)
                    if c:
                        acc[0] += round(c[0]); acc[1] += round(c[1]); acc[2] += round(c[2]); acc[3] += 255
            n = ss * ss
            a = acc[3] // n
            row += bytes([acc[0] // max(1, acc[3] // 255), acc[1] // max(1, acc[3] // 255), acc[2] // max(1, acc[3] // 255), a] if a else [0, 0, 0, 0])
        rows.append(bytes(row))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b"")

sizes = [16, 32, 48, 256]
images = [png(s) for s in sizes]
header = struct.pack("<HHH", 0, 1, len(sizes))
offset = 6 + 16 * len(sizes)
entries = b""
for s, img in zip(sizes, images):
    entries += struct.pack("<BBBBHHII", s % 256, s % 256, 0, 0, 1, 32, len(img), offset)
    offset += len(img)
out = os.path.join(os.path.dirname(__file__), "..", "assets", "guildie.ico")
with open(out, "wb") as f:
    f.write(header + entries + b"".join(images))
with open(os.path.join(os.path.dirname(__file__), "..", "assets", "guildie-256.png"), "wb") as f:
    f.write(images[-1])
print("wrote", out)
