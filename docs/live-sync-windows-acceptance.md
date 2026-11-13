# Windows integrated live-sync acceptance — 2026-11-12

Status: IN PROGRESS. This is not a release approval. No release or deployment performed.

## Tested build

- Windows packaged desktop 0.3.28 and main addon 0.15.0.
- Initial source: `5fb97c0`; installed and packaged addon subsequently received the physical-cell sizing fix committed as `6e0efb2df8aea092114d3b3f49435cb3b9b9317a`.
- Follow-up addon-only patch changes default/reset to a four-physical-pixel inset. Both installed addon and unpacked bundle were updated; earlier installer/zip artifacts do not include this follow-up.
- The running desktop executable predates the intervening taskbar-icon commit `a16436d`. Do not describe the entire executable as built from `6e0efb2`.
- Bundled PyInstaller capture helper; no pixel configuration, manual capture coordinates, or separately launched reader used for acceptance.
- Python 3.12 build environment. Runtime loads bundled Python. A machine without Python installed has NOT BEEN TESTED.
- Existing addon backed up; legacy separate addon moved outside AddOns; guild data preserved.

## Results so far

| Check | Result | Evidence / limitation |
| --- | --- | --- |
| Experimental settings and default off | PASS | User confirmed section present and unchecked after full game restart. App initially launched without capture process. |
| Addon/app enable controls | PASS | User enabled both; packaged helper launched. |
| Initial automatic discovery | FAIL, FIXED | Both sizes initially failed due to actual frame effective scale being omitted from physical-pixel sizing. Fixed and regression-tested. |
| Large amber | PASS | Automatically calibrated and uploaded complete snapshot after fix. |
| Small amber | PASS | Automatically recovered after size change. |
| Small grayscale and movement | PASS | Automatically recovered after palette change and moving in native Edit Mode. |
| Large grayscale | PASS | Automatic capture recovered after moving inward and uploaded a complete snapshot. |
| Edit Mode move | PASS | User confirmed native Edit Mode opened and square moved. |
| Reset position / edge placement after fix | PASS after fix | Zero-offset reset caused discovery failure; moving inward recovered. Changed default/reset to four physical pixels inward, preserving custom positions. User reset; automatic decoding and a complete snapshot upload succeeded at the new default. |
| Settings/position survive reload | PASS | User confirmed enabled state, theme, size and position survived. |
| Settings survive login | NOT TESTED | Pending. |
| Alt-tab recovery | PASS | Logs repeatedly transition waiting-game → searching/calibrating → receiving. |
| Addon export off/on recovery | PASS | User hid export through WoW settings, waited, then re-enabled it. App remained enabled; logs show searching while absent and automatic calibration/receiving after return. |
| Covered square recovery | NOT TESTED | Not independently exercised in integrated build. |
| Actual gear and bags update | PASS | Site changed equipped test slot to empty and showed test item in bags without game reload. |
| Actual bank transfer | PASS | Site subsequently showed the same item in bank, replacing its bag location, without game reload. Bank read time refreshed. |
| Actual recipe changes | NOT TESTED | No convenient new recipe; user chose to skip. |
| Actual quest changes | NOT TESTED | Pending. |
| Force-close orphan cleanup | PASS | One helper before stopping desktop parent; zero after four seconds. Restart recovered. |
| App toggle-off | PASS | User disabled capture through tray; log reported stopped and zero capture helpers remained. |
| Sign-out | PASS | User signed out with capture preference enabled. Log reported stopped; zero capture helpers remained. |
| Sign-in resumes enabled preference | PASS | After user sign-in, one bundled helper started and automatically calibrated/received without toggling consent again. |
| Normal Quit | PASS | User chose tray Quit with capture active; zero Guildie and capture processes remained. |
| Normal SavedVariables fallback | PASS | With app live capture off and zero helper processes, user re-equipped the test item and reloaded. Log showed SavedVariables upload; site gear slot showed the item equipped again. |
| Guild data download | FAIL | Repeated HTTP 500 from server after uploads; distinct from outbound snapshot acceptance. No server changes made. |
| Installer/zip build | PASS with workaround | NSIS failed at a 263-character include path. Short local template path allowed packaging, without repository/dependency changes. |
| Installer upgrade/uninstall | NOT TESTED | Packaged unpacked application used; installer not executed. |
| 100% scaling / HDR / display changes | NOT TESTED | Current display uses 125% scaling. |
| Resource sample | OBSERVED | 60 samples over five minutes: average CPU 0.2615%, maximum 1.758% of total system capacity; aggregate average private memory 332.2 MB, maximum 582.8 MB. Mixed UI/discovery conditions, not a controlled benchmark. FPS not measured. |

## Automated verification

- 10 focused desktop/sync Node tests passed.
- 4 capture/discovery Python tests passed.
- 5 experimental Python/Lua tests passed.
- 6 main-addon test files passed in isolated LuaJIT runtimes.
- New regression covers physical sizing with non-unit actual panel scale and scale-change relayout.

Private capture records, account identifiers, inventory details, screenshots, tokens and local configuration are excluded from this report.
