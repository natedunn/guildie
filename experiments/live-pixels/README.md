# Live pixel export experiment

Manual, outbound-only prototype. Not bundled with Guildie, installed automatically,
or connected to the server. Blizzard approval of this transport is unconfirmed.
The addon starts disabled every login/reload. The reader captures only the rectangle
you specify, and emits decoded JSON to stdout; it does not send data over the network.

## Data

- `snapshot`: all characters currently in `GuildieDB.characters`, including the
  existing gear, talents, professions, recipes, skills, quests and inventory fields.
  This serializes the in-memory records, so bag and quest updates don't need to
  wait for the main addon's next payload rebuild. Existing capture rules still
  apply: bank contents require opening the bank, recipes require opening the
  profession, and other characters retain their last captured state. Timestamps
  within the records retain their existing meaning. It includes character and
  guild identities and private inventory; treat output accordingly.
- `live`: player GUID, capture time, health/max health, power/type/max power,
  XP/max XP, zone/subzone, map/normalized position, combat and dead/ghost status.
  Unavailable APIs and protected values are omitted. This version doesn't collect other players' data.

This is transport groundwork, not support for every possible future field. New
live fields can be added to `liveState`; new persisted fields follow Guildie's
normal capture/schema workflow. No UI, upload endpoint or presence feature uses it yet.

## Try it

1. Install the normal Guildie addon. Copy `GuildieLivePixels` beside it into
   `_forever_/Interface/AddOns/`. Fully restart WoW to discover the new addon.
2. In this directory, create a Python environment and install the reader dependency:

   ```sh
   python3 -m venv .venv
   .venv/bin/python -m pip install -r requirements.txt
   ```

3. Type `/guildiepixels on` and leave the strip at the top-left of the game's
   content visible. Fullscreen and windowed modes can both work. Start capture
   with the physical screen coordinates
   of that strip (not the window border):

   ```sh
   .venv/bin/python reader.py --left 0 --top 0 --cell 8
   ```

   Replace coordinates and cell size for your screen. `--cell` is the measured
   physical pixel width of each square; display scaling can change it. macOS
   requires Screen Recording permission for the terminal/Python host. The reader
   can capture anything covering that rectangle, so keep it unobstructed.
4. Change zone/health or inventory and watch JSON lines. `/guildiepixels off`
   hides the strip; Ctrl-C stops the reader. Remove the experimental addon to uninstall.

## Protocol and limits

32×8 grayscale cells, each carrying a byte. Header `GLP`, protocol version 1,
one-byte length, up to 240 bytes of packet, Adler-32 of header plus packet
(big endian), then padding. Packet: `channel|transferId|part|total|bytes`.
Payload chunks are 180 bytes; UTF-8 is decoded only after reassembly.
Checksums detect corruption, not malicious input or authentication.

The addon updates at most 10 frames/sec. Two thirds of frames carry snapshots;
one third carry live state. Typical live records take several frames (~1 second).
Snapshot throughput is about 1.2 KB/sec before missed frames: a 120 KB snapshot
takes about 100 seconds. Each cycle freezes the snapshot for consistent assembly.
Unchanged snapshots repeat with the same ID, letting the reader fill missed chunks
across cycles; changed snapshots start a new transfer. Rapid changes, slow capture
or obscured cells can prevent completion. There is no acknowledgement channel.

Snapshot size is capped at 1 MiB. HDR, color management, UI scaling, overlays,
minimized windows and screen-capture permissions can prevent decoding. Invalid
frames are silently discarded. This is deliberately a fidelity/feasibility test;
bulk compression, faster encoding, capture calibration, diagnostics and integration
would need follow-up work after testing on actual WoW clients.

## Verification

```sh
python3 -m unittest discover -s experiments/live-pixels -p 'test_*.py'
```

Run from the repository root; requires LuaJIT. Tests exercise the actual Lua encoder
against the Python decoder, checksum rejection, split UTF-8, out-of-order chunks,
duplicate suppression, interleaved streams and size bounds. Live game rendering and
OS screen capture still need manual verification on Windows/macOS.
