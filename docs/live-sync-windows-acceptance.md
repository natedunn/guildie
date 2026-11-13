# Windows integrated live-sync acceptance — 2026-11-12

Status: Windows test session completed with remaining blockers and untested cases. NOT release-approved. No release or deployment performed.

## Tested build

- Windows 11 build 26200, current display at 125% scaling.
- Final packaged desktop 0.3.28 and main addon 0.15.0 built from `9f8b1a0cb60e10556c4fd19dfbf1db74f2374674`.
- Earlier functional tests used `5fb97c0` plus the physical-cell sizing fix committed as `6e0efb2`. The final rebuild includes the intervening taskbar-icon change and four-physical-pixel inset default/reset fix. Final automatic discovery, decoding and complete snapshot upload passed after restart.
- Bundled PyInstaller capture helper; no pixel configuration, manual capture coordinates, or separately launched reader used for acceptance.
- Python 3.12 build environment. Runtime loads bundled Python. A machine without Python installed has NOT BEEN TESTED.
- Existing addon backed up; legacy separate addon moved outside AddOns; guild data preserved.
- Final installer and ZIP built successfully with publishing disabled. Unpacked packaged app was exercised; installer was not run.

## Results

| Check                                     | Result               | Evidence / limitation                                                                                                                                                                                                                                                                             |
| ----------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Experimental settings and default off     | PASS                 | User confirmed section present and unchecked after full game restart. App initially launched without capture process.                                                                                                                                                                             |
| Addon/app enable controls                 | PASS                 | User enabled both; packaged helper launched.                                                                                                                                                                                                                                                      |
| Initial automatic discovery               | FAIL, FIXED          | Both sizes initially failed due to actual frame effective scale being omitted from physical-pixel sizing. Fixed and regression-tested.                                                                                                                                                            |
| Large amber                               | PASS                 | Automatically calibrated and uploaded complete snapshot after fix.                                                                                                                                                                                                                                |
| Small amber                               | PASS                 | Automatically recovered after size change.                                                                                                                                                                                                                                                        |
| Small grayscale and movement              | PASS                 | Automatically recovered after palette change and moving in native Edit Mode.                                                                                                                                                                                                                      |
| Large grayscale                           | PASS                 | Automatic capture recovered after moving inward and uploaded a complete snapshot.                                                                                                                                                                                                                 |
| Edit Mode move                            | PASS                 | User confirmed native Edit Mode opened and square moved.                                                                                                                                                                                                                                          |
| Reset position / edge placement after fix | PASS after fix       | Zero-offset reset caused discovery failure; moving inward recovered. Changed default/reset to four physical pixels inward, preserving custom positions. User reset; automatic decoding and a complete snapshot upload succeeded at the new default.                                               |
| Settings/position survive reload          | PASS                 | User confirmed enabled state, theme, size and position survived.                                                                                                                                                                                                                                  |
| Settings survive login                    | PASS                 | User logged out to character selection and back in; enabled state, grayscale theme, large size and inset reset position survived.                                                                                                                                                                 |
| Alt-tab recovery                          | PASS                 | Logs repeatedly transition waiting-game → searching/calibrating → receiving.                                                                                                                                                                                                                      |
| Addon export off/on recovery              | PASS                 | User hid export through WoW settings, waited, then re-enabled it. App remained enabled; logs show searching while absent and automatic calibration/receiving after return.                                                                                                                        |
| Covered square recovery                   | NOT TESTED           | Not independently exercised in integrated build.                                                                                                                                                                                                                                                  |
| Actual gear and bags update               | PASS                 | Site changed equipped test slot to empty and showed test item in bags without game reload.                                                                                                                                                                                                        |
| Actual bank transfer                      | PASS                 | Site subsequently showed the same item in bank, replacing its bag location, without game reload. Bank read time refreshed.                                                                                                                                                                        |
| Actual recipe changes                     | NOT TESTED           | No convenient new recipe; user chose to skip.                                                                                                                                                                                                                                                     |
| Actual quest changes                      | NOT TESTED           | User chose to skip.                                                                                                                                                                                                                                                                               |
| Force-close orphan cleanup                | PASS                 | One helper before stopping desktop parent; zero after four seconds. Restart recovered.                                                                                                                                                                                                            |
| App toggle-off                            | PASS                 | User disabled capture through tray; log reported stopped and zero capture helpers remained.                                                                                                                                                                                                       |
| Sign-out                                  | PASS                 | User signed out with capture preference enabled. Log reported stopped; zero capture helpers remained.                                                                                                                                                                                             |
| Sign-in resumes enabled preference        | PASS                 | After user sign-in, one bundled helper started and automatically calibrated/received without toggling consent again.                                                                                                                                                                              |
| Normal Quit                               | PASS                 | User chose tray Quit with capture active; zero Guildie and capture processes remained.                                                                                                                                                                                                            |
| Normal SavedVariables fallback            | PASS                 | With app live capture off and zero helper processes, user re-equipped the test item and reloaded. Log showed SavedVariables upload; site gear slot showed the item equipped again.                                                                                                                |
| Guild data download                       | FAIL                 | Repeated HTTP 500 from server after uploads; distinct from outbound snapshot acceptance. No server changes made.                                                                                                                                                                                  |
| Installer/zip build                       | PASS with workaround | NSIS failed at a 263-character include path. Short local template path allowed packaging, without repository/dependency changes.                                                                                                                                                                  |
| Installer upgrade/uninstall               | NOT TESTED           | Packaged unpacked application used; installer not executed.                                                                                                                                                                                                                                       |
| 100% scaling / HDR / display changes      | NOT TESTED           | Current display uses 125% scaling.                                                                                                                                                                                                                                                                |
| Resource sample                           | OBSERVED             | 60 samples over five minutes: average CPU 0.2615%, maximum 1.758% of total system capacity; aggregate average private memory 332.2 MB, maximum 582.8 MB. Mixed UI/discovery conditions, not a controlled benchmark. User reported FPS feels normal during the session; FPS not directly measured. |

## Automated verification

- 10 focused desktop/sync Node tests passed.
- 4 capture/discovery Python tests passed.
- 5 experimental Python/Lua tests passed.
- 6 main-addon test files passed in isolated LuaJIT runtimes.
- New regression covers physical sizing with non-unit actual panel scale and scale-change relayout.

Private capture records, account identifiers, inventory details, screenshots, tokens and local configuration are excluded from this report.

## Remaining blockers and handoff

- Guild-data download repeatedly returns HTTP 500. Outbound live and SavedVariables uploads work, but returned guild data is not healthy. Server-side cause was not established; no deployment attempted.
- Quest/recipe value changes skipped at user request. Installer upgrade/uninstall, a clean machine without Python, 100% scaling, HDR/display changes, covered-square recovery and game minimize/close/reopen were not tested.
- Five-minute resource sample and user FPS observation are not a controlled long-duration benchmark.
- Final test app is running with capture enabled and user signed in. Normal installed app remains closed. Experimental labels and initial off defaults are preserved.

## Final artifact SHA-256

- Guildie.exe: `DA56E873639E22AFE88C73C1D6B3E77DBFBB6E7B18AAFA449BE087971ECE7032`
- app.asar: `96A3D465C321172112189A0DDF9ABBDBD5332BE07B6AB29B7ECD7947098C3E31`
- GuildieCapture.exe: `4357F7A2AEC9592899CCF5A059E67BB555EB67ECEE63105BF2B3026F76234614`
- Guildie-Setup-0.3.28.exe: `33EDC3A3459D5542B983FAA6B05A0283CB33394962B6318401DBE171113FD40D`
- Guildie-0.3.28-win-x64.zip: `91EC06EBA9E0058F1C207A2AD24EAFDE9EE1835123688357FA86188991CD5F83`
- LivePixels.lua: `7564A03B95335758779DC4C5B902411E0684ED73FBE2BACF2458B8972030B147`

## Changes after this acceptance session

PR follow-up consolidates addon preferences into General / Experimental sync tabs, redirects minimap clicks, adds top-left / bottom-left placement, and removes the tray toggle. App capture now defaults allowed unless previously disabled, but only starts after the newest Forever SavedVariables file says export is enabled. Enabling or disabling in-game requires `/reload` to notify the app. These UI and activation changes have automated coverage but have not yet been accepted in Windows; repeat enable/reload, disable/reload, minimap navigation, both corner positions, and Edit Mode checks.
