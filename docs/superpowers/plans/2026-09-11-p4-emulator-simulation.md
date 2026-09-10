# P4 Emulator Simulation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the app works end-to-end on Android without being in Pompeii: boot the `OnePlus_15` AVD, install the debug APK, spoof GPS to each stop's coordinates, tap זהה through the WebView's CDP endpoint, and assert the app identifies the right stop, narrates, offers depth, and navigates to the next stop — for all 24 stops in route order. Produces a machine-readable report.

**Architecture:** A Node script (`scripts/sim/run.mjs`) orchestrates `adb`/`emulator` and talks CDP to the Capacitor WebView (`adb forward tcp:9223 localabstract:webview_devtools_remote_<pid>`). The app exposes `window.__pg` (state, current stop, `identify()`, `arriveAt()`), so the harness reads real app state instead of scraping the UI. GPS is set with `adb emu geo fix <lng> <lat>`. Vision is disabled in the sim (no key) so identification exercises the GPS path; a second mode with an OpenRouter key exercises vision using stock photos pushed as the emulator's virtual-scene camera image.

**Tech Stack:** Android Emulator (SDK at `%LOCALAPPDATA%\Android\Sdk`), adb, Node 24 (global `WebSocket`), CDP.

**Prereqs:** P3b APK built; `www/stops.json` has GPS for every non-optional stop (P2 research fills exact coordinates).

---

## File structure
```
scripts/sim/
  run.mjs            orchestrator: boot → install → grant perms → walk stops → report
  adb.mjs            thin helpers: exec adb/emulator, waitForBoot, geoFix, findWebViewSocket, forward
  cdp.mjs            connect to WebView target, evaluate(), waitFor(pred, timeout)
  report.json        output (ignored by git)
docs/superpowers/specs/sim-results.md   human summary of the last run (committed)
```

---

### Task 1: adb helpers (`scripts/sim/adb.mjs`)

- [ ] **Step 1:** Implement:
```js
import { spawn, execFileSync } from 'node:child_process';
const SDK = process.env.ANDROID_HOME || `${process.env.LOCALAPPDATA}\\Android\\Sdk`;
export const ADB = `${SDK}\\platform-tools\\adb.exe`;
export const EMU = `${SDK}\\emulator\\emulator.exe`;
export const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
export function bootEmulator(avd, { headless = true } = {}) {
  const args = ['-avd', avd, '-no-snapshot', '-no-boot-anim', '-gpu', 'swiftshader_indirect', '-camera-back', 'virtualscene'];
  if (headless) args.push('-no-window');
  return spawn(EMU, args, { stdio: 'ignore', detached: true });
}
export async function waitForBoot(timeoutMs = 240000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { if (adb('shell', 'getprop', 'sys.boot_completed') === '1') return; } catch {}
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error('emulator did not boot');
}
export const geoFix = (lat, lng) => adb('emu', 'geo', 'fix', String(lng), String(lat));   // NOTE: emulator wants lng first
export function grantAll(pkg) { for (const p of ['CAMERA', 'RECORD_AUDIO', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION']) adb('shell', 'pm', 'grant', pkg, `android.permission.${p}`); }
export const launch = (pkg) => adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
export const stop = (pkg) => adb('shell', 'am', 'force-stop', pkg);
export function findWebViewSocket(pkg) {
  const pid = adb('shell', 'pidof', pkg);
  const lines = adb('shell', 'cat', '/proc/net/unix').split('\n');
  const hit = lines.find(l => l.includes(`webview_devtools_remote_${pid}`));
  if (!hit) throw new Error('no webview devtools socket; is webContentsDebuggingEnabled?');
  return `webview_devtools_remote_${pid}`;
}
export const forward = (port, socket) => adb('forward', `tcp:${port}`, `localabstract:${socket}`);
```
- [ ] **Step 2:** `node --check scripts/sim/adb.mjs`. Commit `sim: adb/emulator helpers`.

---

### Task 2: CDP client (`scripts/sim/cdp.mjs`)

- [ ] **Step 1:**
```js
export async function connect(port = 9223) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = list.find(t => t.type === 'page' && /localhost/.test(t.url)) || list[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const events = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method) events.push(m); };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };
  const waitFor = async (expr, timeoutMs = 20000, every = 500) => { const t0 = Date.now(); while (Date.now() - t0 < timeoutMs) { if (await evaluate(expr)) return true; await new Promise(r => setTimeout(r, every)); } return false; };
  return { evaluate, waitFor, events, close: () => ws.close(), url: page.url };
}
```
- [ ] **Step 2:** `node --check`. Commit `sim: cdp client`.

---

### Task 3: Orchestrator (`scripts/sim/run.mjs`)

Flow:
1. `bootEmulator('OnePlus_15')` unless `--attached` (already running); `waitForBoot()`.
2. `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`; `grantAll(PKG)`; `launch(PKG)`; sleep 4 s; `forward(9223, findWebViewSocket(PKG))`; `connect()`.
3. Wait until `return !!window.__pg && window.__pg.stops().length >= 24`.
4. Disable vision + VAD via the app's settings API: `window.__pg.settings.set('useVision', false); window.__pg.settings.set('vad', false); return 1`. (No reload needed: identify reads settings live.)
5. For each non-optional stop in route order with `gps`: `geoFix(lat, lng)`; wait for `window.__pg` GPS chip to update (`return document.getElementById('nearChip').textContent.includes(<name_he>)`, 15 s); call `await window.__pg.identify()`; wait for `window.__pg.current?.id === <id>` (10 s); record `{ id, identified: current.id, method: stopEn text, stateAfter: window.__pg.state, msIdentify }`; then `await window.__pg.goDeep()` and `await window.__pg.goNext()`; assert `state === 'navigating'` and status text contains next stop's `name_he`.
6. Negative test: set geo to a point 300 m outside the walls (40.7440, 14.4800) → identify → expect picker modal opened (`!document.getElementById('pickerModal').hidden`).
7. Offline test: `adb shell svc wifi disable && svc data disable`, tap "שאלה" via `document.getElementById('askBtn').click()`, expect status contains `אין רשת`; re-enable.
8. Write `scripts/sim/report.json` and print a table: stop, expected, got, pass/fail, ms. Exit code 1 if any fail.
9. `stop(PKG)`; if we booted the emulator, `adb emu kill`.

- [ ] **Step 1:** Implement exactly that flow with the helpers; argv flags `--attached`, `--headed`, `--only <id>`.
- [ ] **Step 2:** Add `"sim": "node scripts/sim/run.mjs"` to package.json; add `scripts/sim/report.json` to `.gitignore`.
- [ ] **Step 3:** Run it. Expected on first run: GPS-only identify passes for every stop whose coordinates are ≥ 80 m apart from neighbours; stops closer than that may resolve to the neighbour → those become findings for P2 (tighten GPS) or for the identify threshold (rank by distance AND route proximity to the previous stop).
- [ ] **Step 4:** Write `docs/superpowers/specs/sim-results.md` with the table + findings. Commit `sim: orchestrator + first results`.

---

### Task 4 (only when a key exists): vision mode
- Push a reference photo per stop as the virtual-scene poster: `adb emu` cannot set it live; instead configure `~/.android/avd/OnePlus_15.avd/Toren1BD.posters` — or simpler: skip the camera and call `identifyByVision` directly with a data URL of a downloaded photo via CDP. Record hit rate over 24 stops with 3 GPS candidates each.

---

## Self-review
- Covers the user's ask: emulator + GPS manipulation to site coordinates + full flow verification ✓.
- Depends on: P3b APK, P2 GPS. Both tracked.
- Sensitive: no keys needed for the core run.
- Emulator note: `adb emu geo fix` takes longitude then latitude; wrong order silently places you in the Indian Ocean — the helper enforces it.
