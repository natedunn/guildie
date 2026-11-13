"""Explicit screen-region capture; outputs validated messages as JSON lines."""
import argparse
import json
import time
import zlib
from discovery import candidates, RegionShot, foreground_wow, parent_watch


def decode(values):
    raw = bytes(values)
    if len(raw) != 256 or raw[:4] != b"GLP\x01" or raw[4] > 240:
        raise ValueError("invalid header")
    end = 5 + raw[4]
    if zlib.adler32(raw[:end]) != int.from_bytes(raw[end:end + 4], "big"):
        raise ValueError("checksum mismatch")
    return raw[5:end]


class Assembler:
    def __init__(self):
        self.streams = {}
        self.completed = {}

    def feed(self, packet):
        channel, identity, part, total, chunk = packet.split(b"|", 4)
        part, total = int(part), int(total)
        if channel not in (b"L", b"S") or not 1 <= part <= total <= 5826:
            raise ValueError("invalid packet bounds")
        if len(identity) > 48 or len(chunk) > 180:
            raise ValueError("invalid packet size")
        if self.completed.get(channel) == identity:
            return None
        state = self.streams.get(channel)
        if state is None or state[0] != identity:
            state = (identity, total, {})
            self.streams[channel] = state
        if total != state[1]:
            raise ValueError("inconsistent chunk count")
        state[2][part] = chunk
        if len(state[2]) != total:
            return None
        payload = b"".join(state[2][i] for i in range(1, total + 1))
        if len(payload) > 1048576:
            raise ValueError("payload too large")
        value = json.loads(payload.decode("utf-8"))
        self.completed[channel] = identity
        del self.streams[channel]
        return {"channel": "snapshot" if channel == b"S" else "live", "data": value}


def sample_values(shot, cell, columns=16, theme="gray"):
    if theme not in ("gray", "amber"):
        raise ValueError("unknown theme")
    values = []
    for i in range(256):
        x = (i % columns) * cell + cell // 2
        y = (i // columns) * cell + cell // 2
        red, green, blue = shot.pixel(x, y)
        expected_green = int(red * 0.75 + 0.5) if theme == "amber" else red
        expected_blue = int(red * 0.45 + 0.5) if theme == "amber" else red
        if abs(green - expected_green) > 2 or abs(blue - expected_blue) > 2:
            raise ValueError("cell does not match theme")
        values.append(red)
    return values


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--auto", action="store_true", help="Find and follow the square in foreground WoW")
    parser.add_argument("--parent-pid", type=int, help="Exit if the owning desktop process exits")
    parser.add_argument("--left", type=int)
    parser.add_argument("--top", type=int)
    parser.add_argument("--cell", type=int, default=2,
                        help="Actual captured pixels per cell, including display scaling")
    parser.add_argument("--columns", type=int, choices=(16, 32), default=16,
                        help="16 for square; 32 for older strip addons")
    parser.add_argument("--theme", choices=("gray", "amber"), default="amber",
                        help="Must match the addon palette")
    args = parser.parse_args()
    if not 2 <= args.cell <= 64:
        parser.error("cell must be between 2 and 64")
    import mss
    if args.auto:
        parent_alive = parent_watch(args.parent_pid)
        if not parent_alive():
            return
        with mss.mss() as capture:
            try:
                while parent_alive():
                    try:
                        automatic(capture, parent_alive)
                    except mss.exception.ScreenShotError:
                        emit("status", {"state": "searching"})
                        time.sleep(2)
            except KeyboardInterrupt:
                pass
        return
    if args.left is None or args.top is None:
        parser.error("use --auto or provide --left and --top")
    region = {"left": args.left, "top": args.top,
              "width": args.columns * args.cell, "height": (256 // args.columns) * args.cell}
    assembler = Assembler()
    with mss.mss() as capture:
        try:
            while True:
                shot = capture.grab(region)
                try:
                    message = assembler.feed(decode(sample_values(shot, args.cell, args.columns, args.theme)))
                except (ValueError, UnicodeError):
                    message = None
                if message is not None:
                    print(json.dumps({"receivedAt": time.time(), **message}, ensure_ascii=False), flush=True)
                time.sleep(0.025)
        except KeyboardInterrupt:
            pass


def emit(channel, data):
    print(json.dumps({"receivedAt": time.time(), "channel": channel, "data": data}, ensure_ascii=False), flush=True)


def automatic(capture, parent_alive=lambda: True):
    region = None
    window = None
    pending = None
    confirmations = set()
    last_valid = 0
    assembler = Assembler()
    last_state = None

    def status(value):
        nonlocal last_state
        if value != last_state:
            emit("status", {"state": value})
            last_state = value

    while parent_alive():
        current = foreground_wow()
        if current != window:
            region, pending, window = None, None, current
            confirmations.clear()
            assembler = Assembler()
        if current is None:
            status("waiting-game")
            time.sleep(0.5)
            continue
        if region is None and pending is None:
            status("searching")
            shot = capture.grab(current)
            for x, y, cell, theme in candidates(shot):
                try:
                    decode(sample_values(RegionShot(shot, x, y), cell, theme=theme))
                except (ValueError, IndexError):
                    continue
                pending = {"left": current["left"] + x, "top": current["top"] + y,
                           "width": 16 * cell, "height": 16 * cell}
                confirmations.clear()
                last_valid = time.monotonic()
                status("calibrating")
                break
            if pending is None:
                del shot
                time.sleep(2)
                continue
            del shot
        target = region or pending
        try:
            packet = decode(sample_values(capture.grab(target), cell, theme=theme))
            last_valid = time.monotonic()
            if region is None:
                confirmations.add(packet)
                if len(confirmations) >= 8:
                    region, pending = pending, None
                    status("receiving")
            else:
                message = assembler.feed(packet)
                if message:
                    emit(message["channel"], message["data"])
        except (ValueError, UnicodeError, IndexError):
            if time.monotonic() - last_valid > 1:
                region, pending = None, None
                confirmations.clear()
                status("searching")
        time.sleep(0.025)


if __name__ == "__main__":
    main()
