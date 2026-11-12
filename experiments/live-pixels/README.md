# Live pixel export experiment

Manual, outbound-only prototype. Not bundled with Guildie or installed automatically.
The standalone reader stays local; the opt-in desktop pilot below uploads complete
snapshots through your signed-in Guildie connection. Blizzard approval of this transport is unconfirmed.
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
normal capture/schema workflow. The desktop pilot uses the existing snapshot endpoint;
live health/position remain local and are not yet a site presence feature.

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
   .venv/bin/python reader.py --left 0 --top 0 --cell 2
   ```

   Replace coordinates and cell size for your screen. `--cell` is the measured
   physical pixel width of each square; display scaling can change it. macOS
   requires Screen Recording permission for the terminal/Python host. The reader
   can capture anything covering that rectangle, so keep it unobstructed.
   Use `/guildiepixels on large` for 8-unit cells instead of the default 1.6.
   At 125% Windows scaling, the default square was verified at 32×32 physical
   pixels with `--cell 2`; remeasure on other displays. `on compact` is an alias
   for `on`. The reader defaults to 16 columns; `--columns 32` supports old strips.

   Open **WoW's Edit Mode** to show the static amber square labeled **Guildie sync**.
   Drag it with the left mouse button. Closing Edit Mode resumes export if it was
   enabled beforehand, or hides the square if it was disabled. Export pauses while
   editing, and the square accepts no mouse clicks outside editing.
   `/guildiepixels edit` remains a fallback if this client's Edit Mode manager is
   unavailable; `/guildiepixels lock` hides it and `/guildiepixels on` resumes export.
   `/guildiepixels reset` returns it to the
   top-left and disables export. Position is saved across reloads/logins; enabled
   state is never saved. Position is saved when dragging stops, including when Edit
   Mode closes during a drag. It is one addon position shared across Blizzard layouts;
   Blizzard's layout save/cancel controls do not undo it. This integration follows
   `EditModeManagerFrame` show/hide hooks and still needs verification in Forever.
   **Restart the game once after this update** to register the new SavedVariables
   declaration. After moving the square, stop the reader and remeasure `--left`
   and `--top` in physical screen pixels; it does not follow the square automatically.
   On Windows use `.venv\Scripts\python.exe` in place of `.venv/bin/python`.
4. Change zone/health or inventory and watch JSON lines. `/guildiepixels off`
   hides the strip; Ctrl-C stops the reader. Remove the experimental addon to uninstall.

## Protocol and limits

16×16 opaque cells (amber by default), each carrying a byte. Header `GLP`, protocol version 1,
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
duplicate suppression, interleaved streams and size bounds. See the Windows results below; macOS still needs live rendering/capture validation.

Square layout and dragging are covered by stubbed Lua/Python tests. Dragging and
decoding at the new position were tested in game; persistence across a further
login/reload has not been independently verified.
The amber palette is described below. Arbitrary custom tints and transparency
are not supported.

## Smaller cells and interrupted visibility

`/guildiepixels on <size>` accepts a cell size from 1 to 8 addon units.
At the measured 125% scaling on the test PC, try `on 3.2` (64×64 physical
pixels, reader `--cell 4`), then `on 2.4` (48×48, `--cell 3`), then
`on 1.6` (32×32, `--cell 2`, now the default). The intermediate sizes
were not tested in game; 32×32 passed the uninterrupted test below.
Use whole physical pixels and remeasure after changing display/UI scaling.
`on 4` restores the tested 80×80 square on that PC. Smaller cells retain the
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

## Windows handoff: November 12, 2026

- WoW Forever in the user's normal fullscreen/borderless mode, 2560×1440,
  Windows display scaling 125%. No windowed-mode requirement.
- Default addon cell size is now 1.6 addon units, measured as 2 physical pixels
  on this PC: 16×16 cells = 32×32 physical pixels. This does not automatically
  guarantee 32×32 on macOS/Retina or other scaling configurations. Calibrate
  there; the reader's `--cell` always means physical captured pixels.
- Uninterrupted small-square test: 60.3 seconds, 1,808 valid sampled frames,
  zero rejected frames, 100 complete live records and one complete snapshot.
  These are sampled frames (including duplicates), not unique packets or a
  guarantee that every transmitted update was captured.
- Earlier test while the user opened Dialogue UI: 90 live records and two
  complete snapshots; 335/2,000 samples rejected. We did not timestamp UI
  visibility, so attribution to Dialogue UI is plausible, not proven.
- Previously verified 80×80 after dragging: 38 live records, one snapshot.
  Snapshot schema and stored character count matched between the 80×80 and
  32×32 tests. Contents can change with gameplay; this was not byte-for-byte
  equivalence or verification of every field's accuracy/freshness.
- Protected API values are omitted rather than compared/serialized, fixing
  the observed repeating secret-number Lua error. Earlier live testing
  confirmed position and bag-content changes. Zone changes, bank opening and
  profession-window refresh still need focused testing.
- Four focused tests pass using LuaJIT 2.1 through local Python/lupa bindings:
  encoder/decoder interoperability, corruption rejection, assembly, layouts,
  protected-value omission and edit/position behavior. The test suite normally
  invokes a LuaJIT CLI. No full monorepo suite or formal FPS benchmark was run.
- Experimental addon and local reader only. No server upload, production desktop
  changes, inbound transport, private output committed, or gameplay automation.
- Reader stopped after tests. Capture coordinates are machine-specific and must
  be recalibrated after dragging; automatic relocation is not implemented.

## Amber palette test

`/guildiepixels on amber` uses warm bronze/amber tones at the default small size.
`/guildiepixels on 4 amber` uses the larger size with that palette. Match the reader
with `--theme amber`. Amber is now also the default for plain `/guildiepixels on`
and reader launches without `--theme`. For debugging, `/guildiepixels on gray`
and reader `--theme gray` restore grayscale.
Reload the UI after installing the updated Live.lua; no new addon files were added.

Each byte v maps to opaque RGB `(v, floor(v*0.75+0.5), floor(v*0.45+0.5))`.
Red retains the original byte; the reader checks the other channels against the
known palette before checksum validation. Packet capacity and timing are unchanged.
This removes white flashes but does not remove all brightness changes. All 256
values and the Lua rendering formula are tested. Windows in-game amber test at
32×32 after dragging: 60.5 seconds, 1,813 valid samples, zero rejected samples,
101 live records and one complete snapshot. macOS/HDR/color management still need
validation. No automatic theme detection.

Calibration caution: the first checksum-valid frame alone is not sufficient to
choose an origin at two-pixel cells. After dragging to the bottom-left, a candidate
one pixel too low decoded only some packets. Testing neighboring sampling origins
found the reliable position; the figures above are from that corrected position.
Validate multiple changing frames before accepting calibration. This was a local
calibration correction, not an automatic relocation feature in reader.py.

## Desktop upload pilot

This phase connects the tested capture transport to Guildie's existing uploader.
It is a development launch option, not a shipped release or default setting.
No server deployment is required. The selected site's normal character ownership,
payload validation and timestamp rules apply; the server keeps the newest sections
when older SavedVariables uploads arrive later.

1. Pull this branch, install workspace dependencies with `pnpm install --frozen-lockfile`,
   and copy the updated experimental addon into WoW. `/reload` loads the Lua changes,
   including the empty-list serialization fix required for server compatibility.
   Then `/guildiepixels on` starts the default small amber square.
2. Keep the Python virtual environment and `mss` dependency from the earlier test.
   Stop the standalone reader. Save `experiments/live-pixels/pixel-config.json`
   (ignored by Git) with absolute paths and the **previously verified** coordinates:

   ```json
   {
     "python": "C:/path/to/guildie/experiments/live-pixels/.venv/Scripts/python.exe",
     "reader": "C:/path/to/guildie/experiments/live-pixels/reader.py",
     "left": 0,
     "top": 0,
     "cell": 2,
     "theme": "amber"
   }
   ```

   Coordinates above are placeholders. The config launches that Python executable
   and script locally; use only the trusted files from your checkout. No API token
   belongs in this file or in the reader.
3. Quit the installed Guildie app from its tray. From the repository root:

   ```sh
   pnpm --filter @guildie/desktop build
   pnpm --filter @guildie/desktop exec electron . --live-pixels-config "C:/path/to/guildie/experiments/live-pixels/pixel-config.json"
   ```

   This uses the app's usual signed-in site (`guildie.club` by default). `--url`
   can select a configured preview instead. Sign in normally if necessary. This
   launch **uploads your claimed characters' complete snapshots** to that site.
   Never copy or print the app's stored token.
4. The tray shows `Live capture: waiting`, then `receiving` when complete records
   arrive. `stale` means no complete record for ten seconds (covered/hidden square,
   stopped export, etc.). `failed` means the process stopped or emitted invalid
   output; run the reader standalone for diagnostics, then restart the app.
   Receiving alone does not mean a snapshot has uploaded: check Last upload and
   the app log for `Uploaded live pixel snapshot` and any rejection message.
5. Change bag contents without `/reload`, wait for a complete snapshot, and verify
   the inventory on Guildie. Then test gear, bank (open it), professions (open each
   window), and quests. Large snapshots still take time; capture timing is unchanged.
6. Cover the square or use `/guildiepixels off`: the tray should become stale.
   Re-enable it and verify recovery. Sign out: capture must stop. Sign back in:
   capture must restart. Quit the app: its Python child must exit.

The sync engine retains only the latest pending complete snapshot, attempts pixel
uploads at most every 30 seconds, retries failures, and suppresses repeated successful
payloads. It discards pending data on disconnect. Capture records are consumed in
memory, not logged or written to disk. Only snapshot records upload; live records
provide capture liveness and are discarded. Ordinary SavedVariables sync remains active.
The in-game "On Guildie" display still needs a reload to load returned GuildieData.lua.

Restart without `--live-pixels-config` to disable this pilot entirely. The experiment
still starts disabled after WoW reload/login; enable it explicitly in game.
Moving the square requires updating the config and restarting the app.

Local verification covers Lua-to-Python framing, palettes and empty arrays; bounded
process output and lifecycle; and snapshot coalescing, throttling, retry and disconnect.
The new desktop-to-server path still needs the Windows checklist above. Record only
counts, timings and pass/fail results in this repository, never raw character records.
