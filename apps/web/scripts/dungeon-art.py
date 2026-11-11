#!/usr/bin/env python3
"""Dungeon card art: each dungeon's loading screen from WoW: Forever's game
files (via wago.tools), cropped and converted to JPEG, uploaded to the R2
bucket behind assets.guildie.club as dungeons/<key>.jpg. Which file belongs
to which dungeon is in convex/shared/dungeons.generated.ts (gen-dungeons.mjs).

The art is Blizzard's; it's kept out of the repository and served from R2.

Needs Pillow (reads BLP) and Wrangler logged in to the account with the
bucket:

    python3 -m venv /tmp/art && /tmp/art/bin/pip install pillow
    CLOUDFLARE_ACCOUNT_ID=<account> /tmp/art/bin/python apps/web/scripts/dungeon-art.py [--only key,key] [--dry-run]
"""

import io
import json
import re
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
GENERATED = HERE.parent / "convex" / "shared" / "dungeons.generated.ts"
BUCKET = "guildie-assets"
WIDTH = 1600
USER_AGENT = "Guildie dungeon art (https://github.com/natedunn/guildie)"


def dungeons():
    text = GENERATED.read_text()
    match = re.search(r"GENERATED_DUNGEONS: GeneratedDungeon\[\] = (\[.*\]);", text, re.S)
    if not match:
        sys.exit(f"Can't read {GENERATED}")
    # The file is Biome-formatted TypeScript: quote keys and drop trailing commas to read it as JSON.
    body = re.sub(r"([{,]\s*)([A-Za-z_]+):", r'\1"\2":', match.group(1))
    body = re.sub(r",(\s*[\]}])", r"\1", body)
    return json.loads(body)


def download(file_id):
    url = f"https://wago.tools/api/casc/{file_id}?download&branch=wowf"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read()


def crop_bars(im):
    """Trim flat letterbox bars (Forever's 16:9 screens have grey ones above and below)."""
    rgb = im.convert("RGB")
    w, h = rgb.size
    small = rgb.resize((64, h))

    def flat(y):
        row = [small.getpixel((x, y)) for x in range(64)]
        first = row[0]
        return all(sum(abs(a - b) for a, b in zip(p, first)) < 12 for p in row)

    top, bottom = 0, h - 1
    while top < h // 3 and flat(top):
        top += 1
    while bottom > h * 2 // 3 and flat(bottom):
        bottom -= 1
    return rgb.crop((0, top, w, bottom + 1))


def crop_frame(im):
    """The original loading screens: a square texture shown at 4:3, with the
    game's frame and logo painted over the top and bottom. Back to 4:3, then
    just the painting between the frame (and below the logo)."""
    w = im.width
    im = im.resize((w, round(w * 0.75)), Image.LANCZOS)
    h = im.height
    return im.crop((round(w * 0.012), round(h * 0.24), round(w * 0.988), round(h * 0.795)))


def main():
    args = sys.argv[1:]
    only = set(args[args.index("--only") + 1].split(",")) if "--only" in args else None
    dry = "--dry-run" in args
    out = Path(tempfile.mkdtemp(prefix="dungeon-art-"))
    for d in dungeons():
        if only and d["key"] not in only:
            continue
        art = d.get("art")
        if not art:
            print(f"{d['name']}: no art")
            continue
        im = Image.open(io.BytesIO(download(art["fileId"]))).convert("RGB")
        im = crop_bars(im) if art["wide"] else crop_frame(im)
        if im.width > WIDTH:
            im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
        path = out / f"{d['key']}.jpg"
        im.save(path, "JPEG", quality=82, optimize=True, progressive=True)
        print(f"{d['name']}: {im.width}x{im.height}, {path.stat().st_size // 1024} KB")
        if not dry:
            subprocess.run(
                [
                    "npx", "wrangler", "r2", "object", "put", f"{BUCKET}/dungeons/{d['key']}.jpg",
                    "--file", str(path), "--content-type", "image/jpeg",
                    "--cache-control", "public, max-age=604800", "--remote",
                ],
                check=True,
                stdout=subprocess.DEVNULL,
            )
    print(f"Images in {out}")


if __name__ == "__main__":
    main()
