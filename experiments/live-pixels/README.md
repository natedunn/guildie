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

3. Type `/guildiepixels on` to show a compact 16×16-cell square, initially
   at the top-left of the game content. Fullscreen and windowed modes can both work. Start capture
   with the physical screen coordinates
   of that strip (not the window border):

   ```sh
   .venv/bin/python reader.py --left 0 --top 0 --cell 4
   ```

   Replace coordinates and cell size for your screen. `--cell` is the measured
   physical pixel width of each square; display scaling can change it. macOS
   requires Screen Recording permission for the terminal/Python host. The reader
   can capture anything covering that rectangle, so keep it unobstructed.
   Use `/guildiepixels on large` for 8-unit cells instead of the default 4.
   At 125% Windows scaling, the compact square is expected to be 80×80 physical
   pixels with `--cell 5`; measure rather than assuming. `on compact` is an alias
   for `on`. The reader defaults to 16 columns; `--columns 32` supports old strips.

   `/guildiepixels edit` pauses export and shows a static dark square with a
   gray outline. Drag it with the left mouse button. `/guildiepixels lock` hides
   it; `/guildiepixels on` resumes export at the new position. It accepts no
   mouse clicks outside edit mode. `/guildiepixels reset` returns it to the
   top-left and disables export. Position is saved across reloads/logins; enabled
   state is never saved. This is the experiment's own edit mode, not Blizzard's.
   **Restart the game once after this update** to register the new SavedVariables
   declaration. After moving the square, stop the reader and remeasure `--left`
   and `--top` in physical screen pixels; it does not follow the square automatically.
   On Windows use `.venv\Scripts\python.exe` in place of `.venv/bin/python`.
4. Change zone/health or inventory and watch JSON lines. `/guildiepixels off`
   hides the strip; Ctrl-C stops the reader. Remove the experimental addon to uninstall.

## Protocol and limits

16×16 opaque grayscale cells, each carrying a byte. Header `GLP`, protocol version 1,
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

Square layout and dragging are covered by stubbed Lua/Python tests. Live rendering,
position persistence and decoding after a drag still need in-game validation.
Colors remain unchanged: custom tints or transparency are not supported by this decoder.

## Smaller cells and interrupted visibility

`/guildiepixels on <size>` accepts a cell size from 1 to 8 addon units.
At the measured 125% scaling on the test PC, try `on 3.2` (64×64 physical
pixels, reader `--cell 4`), then `on 2.4` (48×48, `--cell 3`), then
`on 1.6` (32×32, `--cell 2`). These are candidates, not verified minimums.
Use whole physical pixels and remeasure after changing display/UI scaling.
`on` restores the tested 80×80 square on that PC. Smaller cells retain the
same packet capacity but have less tolerance for capture alignment and rendering.

The panel is a child of UIParent: hiding that parent hides the panel and pauses
its OnUpdate. Another addon can also cover the panel while transmission continues.
The reader discards frames that fail validation; it never emits partial JSON.
When visibility returns, unchanged snapshot chunks can accumulate across repeat
cycles. A changed snapshot replaces the unfinished transfer, so sustained changes
or long interruptions can prevent completion. Live updates missed during an
interruption are not replayed. There is no acknowledgement or automatic retry
request, and no current user-facing disconnected/stale indicator. Hiding is
respected; this experiment does not force itself over cinematic/dialogue UI.
