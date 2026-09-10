# P4 Emulator Simulation — Results

Run 1 (first run) is below; **[Run 2](#run-2--after-the-device-fixes-2026-09-11)** and **[Run 3 — full route](#run-3--full-route-2026-09-11)** follow it.

# Run 1 (2026-09-11)

Harness: `scripts/sim/{adb,cdp,run}.mjs` (plan: `docs/superpowers/plans/2026-09-11-p4-emulator-simulation.md`). Raw output: `scripts/sim/report.json` (git-ignored).

## Environment

| Item | Value |
|---|---|
| Host | Windows 11, Node v24.7.0, Android Emulator 36.4.9.0, SDK `%LOCALAPPDATA%\Android\Sdk` |
| AVD | `OnePlus_15` — Android 16 (API 36) google_apis x86_64, `hw.gps=yes`; launched `-no-window -no-snapshot -no-boot-anim -gpu swiftshader_indirect -camera-back virtualscene` |
| WebView | Google WebView 133.0.6943.137 (UA `… Android 16; sdk_gphone64_x86_64 … wv … Chrome/133`) |
| APK | `android/app/build/outputs/apk/debug/app-debug.apk`, rebuilt from `www/` at HEAD (`npx cap sync android` + `gradlew assembleDebug`) |
| App settings in sim | `useVision=false`, `vad=false`, optionals off (`--optionals` enables villa/chaste-lovers) |
| `navigator.geolocation` | present |
| `speechSynthesis` | **absent** in Android WebView → `SpeechPlayer` resolves immediately, narration is instant (no `audio/*.mp3` yet → 404 → TTS fallback) |
| Camera | `getUserMedia` OK: `camera2 0, facing back`, 720×1280 (virtual scene) |

## Timings

| Phase | Cold run (reported) | Notes |
|---|---|---|
| Emulator boot → `sys.boot_completed=1` | 37 s | Warm host caches; first boot of the session earlier took ~90 s. `waitForBoot` timeout 300 s. |
| `adb install -r -g` | 4.0 s | |
| Launch → WebView socket → first CDP connect | 1.0 s | after a fixed 4 s post-launch sleep |
| `window.__pg` ready + settings + camera stream up | ~4 s | camera stream appears 2–5 s after page load |
| Whole run (boot → report) | 136 s | |

## Per-stop results (route order, non-optional)

| # | Stop | GPS | Expected | Got | Method | Identify ms | Result | Note |
|---|---|---|---|---|---|---|---|---|
| 1 | marina-gate | – | | | | | SKIP | skipped: no gps |
| 2 | apollo | – | | | | | SKIP | skipped: no gps |
| 3 | forum | 40.7489, 14.4842 | forum | forum | gps | 3722 | **PASS** | chip `הפורום · 0 מ'`; depth OK; next → `הבא: מקדש יופיטר` |
| 4 | jupiter | – | | | | | SKIP | skipped: no gps |
| 5 | macellum | – | | | | | SKIP | skipped: no gps |
| 6 | basilica | – | | | | | SKIP | skipped: no gps |
| 7 | antiquarium | – | | | | | SKIP | skipped: no gps |
| 8 | tragic-poet | – | | | | | SKIP | skipped: no gps |
| 9 | faun | – | | | | | SKIP | skipped: no gps |
| 10 | vettii | 40.7503, 14.4849 | vettii | vettii | gps | 1161 | **PASS** | chip `בית הווטי · 29 מ'` (emulator fix lands ~29 m off — see findings); next → `תרמופוליום` |
| 11 | thermopolium | – | | | | | SKIP | skipped: no gps |
| 12 | lupanar | – | | | | | SKIP | skipped: no gps |
| 13 | central-baths | – | | | | | SKIP | skipped: no gps |
| 14 | bakery | – | | | | | SKIP | skipped: no gps |
| 15 | fullonica | – | | | | | SKIP | skipped: no gps |
| 16 | menander | – | | | | | SKIP | skipped: no gps |
| 17 | triangular-forum | – | | | | | SKIP | skipped: no gps |
| 18 | large-theatre | – | | | | | SKIP | skipped: no gps |
| 19 | quadriporticus | – | | | | | SKIP | skipped: no gps |
| 20 | octavius-quartio | – | | | | | SKIP | skipped: no gps |
| 21 | venus-shell | – | | | | | SKIP | skipped: no gps |
| 22 | fugitives | – | | | | | SKIP | skipped: no gps |
| 23 | amphitheatre | 40.7513, 14.4949 | amphitheatre | amphitheatre | gps | 929 | **PASS** | chip `האמפיתיאטרון · 0 מ'`; next → `הפלסטרה הגדולה` |
| 24 | palaestra | – | | | | | SKIP | skipped: no gps |

Optional `villa-mysteries` (has GPS) was not walked: `routeOrder()` excludes optionals unless enabled; run with `--optionals` once coordinates for the rest land.

For every PASS row the full loop ran: `geo fix` → `nearChip` shows the stop → `identify()` → `current.id` matches, `stopEn` shows `… · gps` → opening narration → `state=depthOffer` → `goDeep()` → `depthOffer` → `goNext()` → `state=navigating` with the correct next stop in the status line.

## Negative test (outside the walls)

`geo fix` to 40.7440, 14.4800 → chip `📍 הפורום · 650 מ'` → `identify()` → `pickerModal` opened, status `לא זוהה. בחר ידנית.`, `current` unchanged (`amphitheatre`). **PASS**.

## Offline test

`adb shell svc wifi disable && svc data disable` → in-page `fetch('https://example.com')` fails (network really cut) → `askBtn.click()` → expected status `אין רשת…`, got status `live`, state `qa`. **FAIL** — see finding 2. Network restored with `svc … enable`; `navigator.onLine` never changed in either direction.

## Findings

1. **GPS → WebView works out of the box.** `adb emu geo fix <lng> <lat>` reaches `navigator.geolocation.watchPosition` in the Capacitor WebView within ~2–10 s; `pm grant`/`install -g` is enough, no WebView-level geolocation prompt blocked it, no `location_mode` tweak was needed (the harness still sets `location_mode=3` up front; the logcat-dump fallback never triggered). The P3b fallback (`@capacitor/geolocation`) is **not** required.
2. **`navigator.onLine` is always `true` inside the Android WebView** (app bug, not harness). With the network fully cut (`svc` or `cmd connectivity airplane-mode enable`, verified by failing `fetch`) `navigator.onLine` stayed `true` for 30 s+ and no `offline` event fired. Android WebView only updates this property when the host calls `WebView.setNetworkAvailable()`. Consequences in the app: `online()` guards in `identify()` and `startQa()` never take the offline branch; the "אין רשת כרגע" message can't appear; the pipeline voice client reports `live` even with no network. Fix options: `@capacitor/network` plugin (`Network.getStatus()` / `networkStatusChange`), or a `ConnectivityManager.NetworkCallback` in `MainActivity` that calls `webView.setNetworkAvailable(...)`, or a fetch-based reachability probe before Q&A.
3. **Camera works in the emulator** (`-camera-back virtualscene`): the app's `camera.start()` gets a 720×1280 stream ~2–5 s after page load; `identify()` therefore captures a real (virtual-scene) frame. A first snapshot taken immediately after `__pg` appeared showed no stream yet — the harness now waits up to 20 s for `video.videoWidth > 0`.
4. **No `speechSynthesis` in Android WebView.** Every narration falls through `AudioFilePlayer` (404 → `ENOENT`) to `SpeechPlayer`, which resolves immediately. On device this means **no spoken narration until `www/audio/<id>-<layer>.mp3` exist** (or a native TTS plugin is added). In the sim it makes each stop cycle ~10 s.
5. **Emulator fix precision.** The chip for vettii read `29 מ'` at the stop's own coordinates (forum/amphitheatre read `0 מ'`). The emulator quantises/rounds the fix (or the GPS HAL adds jitter); with the 80 m identify threshold this is harmless, but keep it in mind for stops < 80 m apart once the full coordinate set lands (plan Task 3 step 3).
6. **First identify is slower (3.7 s vs ~1 s).** The first `rankByGps`+`arriveAt` includes the first `Audio` 404 round-trip and WebView warm-up; not a problem.
7. Harness detail: `adb logcat -d` exceeds Node's default 1 MB `execFileSync` buffer (`ENOBUFS`); `adb()` now uses `maxBuffer` 64 MB and `logcat -t 4000`.

## Deviations from the plan

- `adb install` uses `-r -g` (grant at install) in addition to `pm grant`.
- `install()`, `unforward()`, `setNetwork()`, `logcat()`, `killEmulator()` helpers added to `adb.mjs`; `cdp.mjs` also collects console/exception events (`consoleLines()`).
- Flags: `--attached`, `--headed`, `--only <id>` as planned, plus `--optionals` (walk optional stops) and `--keep` (leave app + emulator running for debugging).
- `identify()` is fired without awaiting (narration length is unbounded); the harness polls `__pg.current` / `__pg.state` instead.
- Stops without `gps` are reported `SKIP` (`skipped: no gps`) rather than failing; the exit code is 1 only for real failures (currently the offline test).
- Emulator cleanup: `adb emu kill` then `process.kill(pid)`; note `adb emu kill` itself spawns a short-lived `emulator.exe -kill <pid> -sleep 20` helper that exits on its own ~20 s later.

## Reproduce

```powershell
# one-time: rebuild APK if www/ changed
$env:JAVA_HOME='C:\Program Files\Android\Android Studio3\jbr'; $env:PATH="$env:JAVA_HOME\bin;$env:PATH"
npx cap sync android; cd android; .\gradlew.bat assembleDebug --no-daemon; cd ..

# full run (boots OnePlus_15 headless, installs, walks stops, kills emulator)
npm run sim
# variants
node scripts/sim/run.mjs --attached          # emulator already running
node scripts/sim/run.mjs --headed --keep     # watch it; leave everything running
node scripts/sim/run.mjs --only forum
node scripts/sim/run.mjs --optionals         # include villa-mysteries / chaste-lovers
```
Output: table on stdout, `scripts/sim/report.json`; exit 0 = all pass.

---

# Run 2 — after the device fixes (2026-09-11)

Same harness, same AVD, APK rebuilt at `0cffe07`. Two device-only fixes landed between the runs:

- `8a7c3fc` — `www/lib/net.js`: a reachability probe (`https://www.gstatic.com/generate_204`, `no-cors`, `AbortController` 2.5 s, 8 s result cache) plus `startNetWatch()`; `identify()` / `startQa()` `await isOnline()` and the net dot is watch-driven. Closes finding 2.
- `0cffe07` — `NativeTtsPlayer` in `www/lib/narrator.js` over `@capacitor-community/text-to-speech@8.0.2`; `createSpeechPlayer()` picks it on device, `SpeechPlayer` in the browser. Closes finding 4.

`node scripts/sim/run.mjs --attached` → **exit 0, everything PASS.** Raw output: `scripts/sim/report.json`.

## Environment (deltas from run 1)

| Item | Value |
|---|---|
| APK | rebuilt from `www/` at `0cffe07` (`cap sync` + `gradlew assembleDebug`) |
| `speechSynthesis` | still **absent** — but no longer fatal, the native engine takes over |
| `Capacitor.Plugins` | `SystemBars`, `CapacitorCookies`, `WebView`, **`TextToSpeech`**, `CapacitorHttp` |
| TTS player the app chose | `NativeTtsPlayer` (`window.__pg.ttsKind()`) |
| TTS languages | 81 tags; **`he-IL` present** on this emulator image, 472 voices from `getSupportedVoices()` |
| Everything else | unchanged (Android 16 / API 36, WebView 133.0.6943.137, camera 720×1280, geolocation present) |

## Per-stop results (route order, non-optional)

| # | Stop | GPS | Expected | Got | Method | Identify ms | Result | Note |
|---|---|---|---|---|---|---|---|---|
| 1–2 | marina-gate, apollo | – | | | | | SKIP | skipped: no gps |
| 3 | forum | 40.7489, 14.4842 | forum | forum | gps | 4080 | **PASS** | chip `הפורום · 0 מ'`; next → `מקדש יופיטר` |
| 4–9 | jupiter … faun | – | | | | | SKIP | skipped: no gps |
| 10 | vettii | 40.7503, 14.4849 | vettii | vettii | gps | 1793 | **PASS** | chip `בית הווטי · 2 מ'` (run 1 read 29 m — the emulator fix jitters, see run-1 finding 5); next → `תרמופוליום (דוכן אוכל)` |
| 11–22 | thermopolium … fugitives | – | | | | | SKIP | skipped: no gps |
| 23 | amphitheatre | 40.7513, 14.4949 | amphitheatre | amphitheatre | gps | 1503 | **PASS** | chip `האמפיתיאטרון · 0 מ'`; next → `הפלסטרה הגדולה` |
| 24 | palaestra | – | | | | | SKIP | skipped: no gps |

Same 3 of 24 stops have coordinates as in run 1; the other 21 are still `SKIP` (`skipped: no gps`), not failures.

**Negative test** (40.7440, 14.4800): chip `📍 הפורום · 650 מ'` → `identify()` → picker opened, status `לא זוהה. בחר ידנית.`, `current` unchanged. **PASS**.

**Offline test**: `svc wifi/data disable` → in-page `fetch` fails → net dot goes off → `askBtn.click()` → status `אין רשת כרגע, אענה כשנחזור`. **PASS** (was FAIL in run 1). `navigator.onLine` still never went false — it is now simply not consulted.

## Timings

| Phase | Run 1 | Run 2 | Notes |
|---|---|---|---|
| Whole run | 136 s | **709 s** | the app now really speaks; a stop cycle (open30 + spoken offer + deep + next_nav) is ~3–3.7 min of Hebrew instead of ~10 s |
| `adb install -r -g` | 4.0 s | 5.5 s | |
| Launch → CDP connect | 1.0 s | 2.4 s | |
| Emulator boot | 37 s | 0.6 s | run 2 attached to the already-booted AVD (`--attached`) |

## Status of the run-1 findings

| # | Finding | Status |
|---|---|---|
| 1 | GPS reaches the WebView out of the box | unchanged, still true |
| 2 | `navigator.onLine` always `true` in the WebView | **fixed** — `www/lib/net.js` probes reachability; the offline test passes. The WebView still never flips the property, so `navigator.onLine` must not be used anywhere in this app. |
| 3 | Camera works in the emulator | unchanged, still true |
| 4 | No `speechSynthesis` in the WebView | **fixed** — narration is spoken through the platform engine. The property is still absent; `createSpeechPlayer()` routes around it. |
| 5 | Emulator fix precision | still jittery, but milder this run (vettii 2 m vs 29 m) |
| 6 | First identify slower | unchanged (4.1 s vs ~1.5 s) |
| 7 | Harness `logcat` buffer | unchanged |

## New findings

8. **How the plugin is reachable without a bundler.** `window.Capacitor.Plugins.TextToSpeech.speak` is a `function` — the native runtime pre-populates `Capacitor.Plugins` with every registered plugin, so plain page JS needs no import. **`window.Capacitor.registerPlugin` is `undefined`** in the injected bridge (it is an `@capacitor/core` export, only present when that package is bundled), so the `registerPlugin('TextToSpeech')` path documented for bundled apps does **not** work here. `nativeTts()` tries `Capacitor.Plugins.TextToSpeech` first and keeps `registerPlugin` only as a fallback for a future bundled build.
9. **Hebrew TTS is available on this emulator image.** `getSupportedLanguages()` returns 81 BCP-47 tags including `he-IL` (and `getSupportedVoices()` 472 voices). `speak()` resolved for both `en-US` ("Hello from Pompeii.", 9.9 s) and `he-IL` ("שלום מפומפיי.", 12.7 s) — the first calls include engine start-up. No voice was installed by hand.
10. **Speaking makes the run 5× longer.** With real narration the harness's existing 130 s per-phase waits still hold (the longest single phase was ~110 s), but a full run is ~12 min. If that becomes painful, run `--only <id>`.
11. **Harness change for the probe's timing.** The offline step no longer waits on `navigator.onLine` (it never flips); it waits up to 25 s for the app's own net dot to go off, because `isOnline()` caches its verdict for 8 s behind a 15 s watch. Once the dot is off, the `askBtn` click re-probes and fails within 2.5 s, so the status assertion keeps its 10 s window. Recovery afterwards waits for the dot to come back on instead of `navigator.onLine`.

## Reproduce

```powershell
$env:JAVA_HOME='C:\Program Files\Android\Android Studio3\jbr'; $env:PATH="$env:JAVA_HOME\bin;$env:PATH"
npx cap sync android; cd android; .\gradlew.bat assembleDebug --no-daemon; cd ..
npm run sim                    # ~12 min now that narration is spoken
node scripts/sim/run.mjs --only forum   # one stop, ~4 min
```

---

# Run 3 — full route (2026-09-11)

The first run where **every stop has coordinates** (`www/stops.json`, 26 stops, 21 `gps_quality: exact`)
and the first with the **route-aware chooser** wired into `identify()`. APK rebuilt at `d6a01c6`
(`npx cap sync android` + `gradlew assembleDebug --no-daemon`).

```
node scripts/sim/run.mjs --fast    →  exit 0, 24/24 PASS + negative PASS + offline PASS
```

Two changes since run 2:

- `8e7ad27` — `www/app.js`: `identify()` ranks **5** stops (`rankByGps(route, pos, 5)`) and hands them to
  `chooseStop(ranked, { preferredIds, maxM: 80, tieM: 45 })` with
  `preferredIds = current ? [nextStop(...)?.id, current.id] : []`. The stop card reads `gps+route` when the
  route preference decided and `gps` when plain distance did. Harness hooks added:
  `window.__pg.stopNarration()` and `window.__pg.lastIdentify`.
- `d6a01c6` — `scripts/sim/run.mjs`: `--fast`, plus `lastIdentify` / `nearChip` on every stop row.

## What `--fast` does (and does not skip)

`stopNarration()` is just `narrator.stop()`. Every `speak()` the flow *awaits* resolves when the player is
stopped, so a cut-short narration is indistinguishable from a finished one as far as the state machine is
concerned. Each stop therefore still walks the full path —
`identifying → narrating → depthOffer → narrating → navigating` — in ~13 s instead of ~3 min:

1. `identify()`, wait for `current.id` (≤ 10 s);
2. wait for `state === 'narrating'` (≤ 5 s) → `stopNarration()` → wait for `depthOffer` (≤ 10 s).
   The spoken `רוצים שאעמיק?` offer is stoppable too, so `cutTo()` re-stops once after 3 s if the first
   `stop()` landed in the window between the `audio/*.mp3` rejection and the TTS call;
3. `goNext()` → `stopNarration()` once `narrating` → wait for `navigating` and assert the next stop's
   Hebrew name is in the status line.

`goDeep()` is exercised only in the slow path; `--fast` skips it. `stateAfter` was `depthOffer` on all 24 rows.

## Environment (deltas from run 2)

| Item | Value |
|---|---|
| APK | rebuilt from `www/` at `d6a01c6` |
| AVD | `OnePlus_15`, Android 16 / API 36, WebView 133.0.6943.137 — unchanged |
| TTS | `NativeTtsPlayer`, `he-IL` among 81 tags — unchanged |
| Camera | 720×1280 virtual scene, up before the first stop — unchanged |
| App settings | `useVision=false`, `vad=false`, optionals off |
| Stops walked | **24** (route order, non-optional). `villa-mysteries` / `chaste-lovers` need `--optionals` |

## Per-stop results (route order, non-optional)

`m` is `lastIdentify.distanceM` — how far the emulator's fix landed from the stop's own coordinates.
"2nd candidate" is the runner-up from `lastIdentify.candidates`, i.e. what a plain nearest-wins pick
would have had to beat.

| # | Stop | Expected | Got | Method / reason | m | 2nd candidate | ms | Wall | Result |
|---|---|---|---|---|---|---|---|---|---|
| 1 | marina-gate | marina-gate | marina-gate | `gps` / nearest | 0 | antiquarium 31 | 4243 | 23 s | **PASS** |
| 2 | apollo | apollo | apollo | `gps+route` / preferred | 22 | basilica 47 | 1861 | 11 s | **PASS** |
| 3 | forum | forum | forum | `gps+route` / preferred | 1 | apollo 43 | 916 | 9 s | **PASS** |
| 4 | jupiter | jupiter | jupiter | `gps+route` / preferred | 13 | forum 48 | 1765 | 11 s | **PASS** |
| 5 | macellum | macellum | macellum | `gps+route` / preferred | 3 | jupiter 50 | 2054 | 10 s | **PASS** |
| 6 | basilica | basilica | basilica | `gps+route` / preferred | 6 | apollo 48 | 1520 | 10 s | **PASS** |
| 7 | antiquarium | antiquarium | antiquarium | `gps+route` / preferred | 15 | marina-gate 38 | 1681 | 9 s | **PASS** |
| 8 | tragic-poet | tragic-poet | tragic-poet | `gps+route` / preferred | 0 | thermopolium 20 | 1774 | 12 s | **PASS** |
| 9 | faun | faun | faun | `gps+route` / preferred | 16 | thermopolium 68 | 1405 | 14 s | **PASS** |
| 10 | vettii | vettii | vettii | `gps+route` / preferred | 1 | faun 79 | 1856 | 19 s | **PASS** |
| 11 | thermopolium | thermopolium | thermopolium | `gps+route` / preferred | 0 | tragic-poet 20 | 1959 | 16 s | **PASS** |
| 12 | lupanar | lupanar | lupanar | `gps+route` / preferred | 3 | bakery 109 | 1371 | 17 s | **PASS** |
| 13 | central-baths | central-baths | central-baths | `gps+route` / preferred | 20 | bakery 104 | 3061 | 14 s | **PASS** |
| 14 | bakery | bakery | bakery | `gps+route` / preferred | 5 | macellum 108 | 1280 | 14 s | **PASS** |
| 15 | fullonica | fullonica | fullonica | `gps+route` / preferred | 0 | menander 91 | 1297 | 11 s | **PASS** |
| 16 | menander | menander | menander | `gps+route` / preferred | 4 | fullonica 87 | 1776 | 10 s | **PASS** |
| 17 | triangular-forum | triangular-forum | triangular-forum | `gps+route` / preferred | 2 | large-theatre 70 | 2553 | 11 s | **PASS** |
| 18 | large-theatre | large-theatre | large-theatre | `gps+route` / preferred | 8 | triangular-forum 61 | 1895 | 13 s | **PASS** |
| 19 | quadriporticus | quadriporticus | quadriporticus | `gps+route` / preferred | 10 | large-theatre 56 | 2380 | 18 s | **PASS** |
| 20 | octavius-quartio | octavius-quartio | octavius-quartio | `gps+route` / preferred | 0 | venus-shell 44 | 1218 | 13 s | **PASS** |
| 21 | venus-shell | venus-shell | venus-shell | `gps+route` / preferred | 4 | octavius-quartio 40 | 2232 | 10 s | **PASS** |
| 22 | fugitives | fugitives | fugitives | `gps+route` / preferred | 0 | palaestra 174 | 1191 | 12 s | **PASS** |
| 23 | amphitheatre | amphitheatre | amphitheatre | `gps+route` / preferred | 0 | palaestra 123 | 1782 | 15 s | **PASS** |
| 24 | palaestra | palaestra | palaestra | `gps+route` / preferred | 1 | amphitheatre 122 | 1723 | 15 s | **PASS** |

Every row also passed its navigation assertion (`navPass`): the status line named the next stop in Hebrew,
and `palaestra` ended with `סוף המסלול`.

### Stops whose `reason` was `preferred`

All 23 stops from #2 on. Stop #1 `marina-gate` is `nearest` by construction — `current` is `null` before the
first arrival, so `preferredIds` is empty.

**But the tie-break never had to override anything.** In all 24 rows the stop the chooser returned was also
`candidates[0]`, so a plain nearest-wins pick would have produced the same 24 answers on this data. `preferred`
fired because the route's next stop *was* the nearest one, not because it beat a closer rival — the harness
prints a `route tie-break overrode nearest at:` line for real overrides and it printed nothing this run.
The preference is confirming the GPS here, not correcting it.

### The six adjacency pairs

The pairs the run was meant to stress, with the gap between them and the actual margin the fix produced:

| Pair | Apart | Fix landed | Runner-up | Margin |
|---|---|---|---|---|
| marina-gate / antiquarium | 32 m | 0 m / 15 m | 31 m / 38 m | 31 m / 23 m |
| apollo / forum | 44 m | 22 m / 1 m | 47 m (basilica) / 43 m | 25 m / 42 m |
| apollo / basilica | 53 m | 22 m / 6 m | 47 m / 48 m | 25 m / 42 m |
| jupiter / macellum | 53 m | 13 m / 3 m | 48 m (forum) / 50 m | 35 m / 47 m |
| tragic-poet / thermopolium | 20 m | 0 m / 0 m | 20 m / 20 m | 20 m / 20 m |
| octavius-quartio / venus-shell | 44 m | 0 m / 4 m | 44 m / 40 m | 44 m / 36 m |

The tightest case is `tragic-poet` / `thermopolium` at 20 m apart: both landed at 0 m from their own
coordinates, leaving a full 20 m margin. The largest fix error all run was `apollo` at 22 m, and even
there the runner-up sat 25 m further out. Emulator jitter never came within half the gap to a neighbour,
which is why the preference was never load-bearing (see finding 12).

## Negative test (outside the walls)

`geo fix` 40.7440, 14.4800 → chip `📍 האנטיקווריום · 554 מ'` → `identify()` → picker opened, status
`לא זוהה. בחר ידנית.`, `current` unchanged (`palaestra`). **PASS**.

`lastIdentify` records the rejection cleanly: `{ id: null, method: 'manual', distanceM: null, reason: 'none',
candidates: [antiquarium 554, marina-gate 565, basilica 648, apollo 689, forum 730] }` — `chooseStop` returns
`none` because `ranked[0].distanceM > maxM`, and the route preference cannot resurrect a stop that is out of
range (`withinTie` is also capped at `maxM`).

## Offline test

`svc wifi/data disable` → in-page `fetch` fails → net dot goes off → `askBtn.click()` → status
`אין רשת כרגע, אענה כשנחזור`, state back to `idle`. **PASS**. `navigator.onLine` stayed `true` throughout
(run-1 finding 2 — the property is simply never consulted). Network restored afterwards.

## Timings

| Phase | Run 2 | Run 3 | Notes |
|---|---|---|---|
| Whole run | 709 s (3 stops) | **443 s (24 stops)** | `--fast`; run 2 was `--attached`, run 3 booted the AVD |
| Emulator boot | – | 43.6 s | cold, headless |
| `adb install -r -g` | 5.5 s | 6.4 s | |
| Launch → CDP connect | 2.4 s | 2.0 s | |
| 24 stops, geo fix → PASS | – | 317 s total | min 9 s, median 13 s, max 23 s |
| `identify()` alone | 1.5–4.1 s | 0.9–4.2 s | first stop 4.2 s (WebView warm-up), rest ~1–3 s |

Per stop that is ~13 s against ~3–3.7 min in run 2 — roughly a 14× cut, and the reason a 24-stop walk is
7 min rather than the hours the slow path would need.

## Findings

12. **The route tie-break is currently a no-op on emulator data.** It resolved every stop correctly, but so
    would plain nearest-wins: the intended stop was `candidates[0]` all 24 times. The emulator's fix error
    (0–22 m, median ~3 m) is well under half the smallest gap on the route (20 m, tragic-poet/thermopolium),
    so no tie ever arose. The value of `chooseStop` is therefore **unproven by this run** — it is insurance
    against real-phone GPS error (5–20 m typical, worse between standing walls), not something run 3
    demonstrates. Do not read 23 × `preferred` as 23 saves. A real test needs either a deliberately offset
    fix or a walk on the actual site.
13. **`tieM: 45` is wider than four of the six adjacency gaps.** `apollo`/`forum` (44 m),
    `octavius-quartio`/`venus-shell` (44 m), `tragic-poet`/`thermopolium` (20 m) and
    `marina-gate`/`antiquarium` (32 m) are all inside the 45 m tie window, so at those stops the route
    preference wins the moment both stops are within `maxM` — including when the walker is genuinely standing
    at the *other* one of the pair (e.g. doubling back). The failure mode is not "picks the neighbour" but
    "sticks to the route"; `wrongBtn` → picker is the escape hatch. Left as is — it was chosen deliberately —
    but it is the knob to revisit if on-site testing shows the guide refusing to notice a backtrack.
14. **`--fast` costs nothing in state coverage, but does not cover everything.** Because `stopNarration()`
    resolves the same promise a finished narration would, the `state` transitions are identical; what is lost
    is the audio itself and, in `--fast`, the `goDeep()` leg. Anything that depends on narration *length*
    (barge-in timing, the 8 s `OFFER_MS` fallback to `goNext()`) is not exercised by `--fast` and still needs
    a slow run.
15. **`gps_quality` does not predict fix error.** The `approx` stops walked here (`forum`, `antiquarium`,
    `faun`, `octavius-quartio`) landed at 1 m, 15 m, 16 m and 0 m — indistinguishable from the `exact` ones.
    Expected: the emulator reports back the coordinate it was given, so this run measures emulator jitter,
    not the accuracy of the underlying coordinate research. Only a real visit can check the latter.

## Status of earlier findings

| # | Finding | Status in run 3 |
|---|---|---|
| 1 | GPS reaches the WebView out of the box | unchanged; the `location_mode` fallback never triggered (`report.findings` is empty) |
| 2 | `navigator.onLine` always `true` | unchanged and still irrelevant — `lib/net.js` decides |
| 3 | Camera works in the emulator | unchanged, 720×1280 up before stop 1 |
| 4 | No `speechSynthesis` | unchanged, `NativeTtsPlayer` handles it |
| 5 | Emulator fix precision | quantified: 0–22 m over 24 stops, median ~3 m |
| 6 | First identify slower | unchanged (4.2 s vs ~1–3 s) |
| 7 | Harness `logcat` buffer | unchanged |
| 8–11 | TTS plugin reachability, `he-IL`, run length, net-probe timing | unchanged; 10 is what `--fast` addresses |

## Reproduce

```powershell
$env:JAVA_HOME='C:\Program Files\Android\Android Studio3\jbr'; $env:PATH="$env:JAVA_HOME\bin;$env:PATH"
npx cap sync android; cd android; .\gradlew.bat assembleDebug --no-daemon; cd ..

node scripts/sim/run.mjs --fast              # full 24-stop walk, ~7 min
node scripts/sim/run.mjs --fast --optionals  # 26 stops (villa-mysteries, chaste-lovers)
npm run sim                                  # slow path: real narration + goDeep, hours for 24 stops
node scripts/sim/run.mjs --only forum        # one stop, spoken
```
