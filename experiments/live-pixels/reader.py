"""Explicit screen-region capture; outputs validated messages as JSON lines."""
import argparse
import json
import time
import zlib


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


def sample_values(shot, cell, columns=16):
    values = []
    for i in range(256):
        x = (i % columns) * cell + cell // 2
        y = (i // columns) * cell + cell // 2
        red, green, blue = shot.pixel(x, y)
        if max(red, green, blue) - min(red, green, blue) > 2:
            raise ValueError("non-grayscale cell")
        values.append(red)
    return values


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--left", type=int, required=True)
    parser.add_argument("--top", type=int, required=True)
    parser.add_argument("--cell", type=int, default=8,
                        help="Actual captured pixels per cell, including display scaling")
    parser.add_argument("--columns", type=int, choices=(16, 32), default=16,
                        help="16 for square; 32 for older strip addons")
    args = parser.parse_args()
    if not 2 <= args.cell <= 64:
        parser.error("cell must be between 2 and 64")
    import mss
    region = {"left": args.left, "top": args.top,
              "width": args.columns * args.cell, "height": (256 // args.columns) * args.cell}
    assembler = Assembler()
    with mss.mss() as capture:
        try:
            while True:
                shot = capture.grab(region)
                try:
                    message = assembler.feed(decode(sample_values(shot, args.cell, args.columns)))
                except (ValueError, UnicodeError):
                    message = None
                if message is not None:
                    print(json.dumps({"receivedAt": time.time(), **message}), flush=True)
                time.sleep(0.025)
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
