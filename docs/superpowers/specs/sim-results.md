# P4 Emulator Simulation — Results

Run 1 (first run) is below; **[Run 2](#run-2--after-the-device-fixes-2026-09-11)** is at the end of this file.

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
