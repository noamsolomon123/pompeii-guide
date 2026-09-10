// scripts/sim/run.mjs — P4 emulator simulation: boot → install → grant → walk stops via GPS → negative → offline → report.
// Flags: --attached (emulator already running) --headed (window) --only <id> --optionals (enable optional stops) --keep (leave app + emulator running)
//        --fast (cut every narration short with __pg.stopNarration() instead of listening to ~3 min of Hebrew per stop)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as A from './adb.mjs';
import { connect } from './cdp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PKG = 'com.noam.pompeiiguide';
const AVD = 'OnePlus_15';
const APK = resolve(ROOT, 'android/app/build/outputs/apk/debug/app-debug.apk');
const PORT = 9223;
const OUTSIDE = [40.7440, 14.4800]; // ~300 m outside the walls

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const opt = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const ATTACHED = flag('--attached'), HEADED = flag('--headed'), ONLY = opt('--only'), OPTIONALS = flag('--optionals'), KEEP = flag('--keep'), FAST = flag('--fast');

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const timings = {};
const report = { startedAt: new Date().toISOString(), env: {}, timings, stops: [], negative: null, offline: null, findings: [], console: [] };
let emu = null, cdp = null, failed = false;

const routeOrder = (stops, on) => stops.filter(s => !s.optional || on[s.id]).sort((a, b) => a.order - b.order);

// ---- --fast helpers ----------------------------------------------------------------------------
// Nothing about the state machine is skipped: every speak() the flow awaits resolves when the
// player is stopped, so cutting the audio short is exactly what a finished narration looks like
// (open30 → depthOffer, next_nav → navigating). Without it one stop costs ~3 min of Hebrew.
const stopNarration = () => cdp.evaluate('window.__pg.stopNarration(); return 1');
const isState = (s) => cdp.evaluate(`return window.__pg.state === ${JSON.stringify(s)}`);
const untilState = (s, ms, every = 200) => cdp.waitFor(`return window.__pg.state === ${JSON.stringify(s)}`, ms, every);

// Wait for the narration to start (≤ narrateMs), stop it, then wait for `target` (≤ settleMs).
// The spoken "רוצים שאעמיק?" offer is stoppable too, so a second stop() covers the race where the
// first one landed between the audio-file rejection and the TTS call.
async function cutTo(target, { narrateMs = 5000, settleMs = 10000, retryMs = 3000 } = {}) {
  await cdp.waitFor(`return ['narrating', ${JSON.stringify(target)}].includes(window.__pg.state)`, narrateMs, 200);
  if (await isState('narrating')) await stopNarration();
  if (await untilState(target, retryMs)) return true;
  if (await isState('narrating')) await stopNarration();
  return untilState(target, settleMs - retryMs);
}
// Leave 'identifying'/'narrating' behind: cut it short in --fast, otherwise sit through it.
const settled = `return !['identifying','narrating'].includes(window.__pg.state)`;
const settleNarration = async () => await cdp.evaluate(settled) ? true
  : FAST ? cutTo('depthOffer') : cdp.waitFor(settled, 130000, 1000);

async function main() {
  const tStart = Date.now();
  if (!ATTACHED) {
    log('booting', AVD, HEADED ? '(headed)' : '(headless)');
    emu = A.bootEmulator(AVD, { headless: !HEADED });
    report.env.emulatorPid = emu.pid;
  }
  timings.bootMs = await A.waitForBoot(300000);
  log('booted in', timings.bootMs, 'ms');
  report.env.avd = AVD; report.env.android = A.adb('shell', 'getprop', 'ro.build.version.release'); report.env.sdk = A.adb('shell', 'getprop', 'ro.build.version.sdk');
  try { report.env.webview = A.adb('shell', 'dumpsys', 'package', 'com.google.android.webview').split('\n').find(l => /versionName/.test(l))?.trim(); } catch {}

  let t = Date.now(); log('installing', APK); log(A.install(APK)); timings.installMs = Date.now() - t;
  A.grantAll(PKG);
  try { A.adb('shell', 'settings', 'put', 'secure', 'location_mode', '3'); } catch {}
  A.stop(PKG); A.launch(PKG); await A.sleep(4000);

  t = Date.now();
  let sock = null;
  for (let i = 0; i < 10 && !sock; i++) { try { sock = A.findWebViewSocket(PKG); } catch (e) { if (i === 9) throw e; await A.sleep(1500); } }
  A.unforward(PORT); A.forward(PORT, sock);
  for (let i = 0; ; i++) { try { cdp = await connect(PORT); break; } catch (e) { if (i > 10) throw e; await A.sleep(1000); } }
  timings.cdpConnectMs = Date.now() - t;
  log('cdp connected to', cdp.url, 'in', timings.cdpConnectMs, 'ms');

  if (!await cdp.waitFor('return !!window.__pg && window.__pg.stops().length >= 24', 30000)) throw new Error('app did not expose window.__pg with stops');
  await cdp.evaluate(`window.__pg.settings.set('useVision', false); window.__pg.settings.set('vad', false); window.__pg.settings.set('optionals', ${JSON.stringify(OPTIONALS ? { 'villa-mysteries': true, 'chaste-lovers': true } : {})}); return 1`);
  report.env.userAgent = await cdp.evaluate('return navigator.userAgent');
  report.env.hasGeolocation = await cdp.evaluate('return !!navigator.geolocation');
  report.env.hasSpeechSynthesis = await cdp.evaluate('return !!globalThis.speechSynthesis');
  report.env.capacitorPlugins = await cdp.evaluate('return Object.keys(window.Capacitor?.Plugins || {})');
  report.env.ttsPlayer = await cdp.evaluate('return window.__pg.ttsKind ? window.__pg.ttsKind() : null');
  report.env.ttsHasRegisterPlugin = await cdp.evaluate('return typeof window.Capacitor?.registerPlugin');
  try { report.env.ttsLanguages = await cdp.evaluate('const r = await window.Capacitor.Plugins.TextToSpeech.getSupportedLanguages(); return r.languages'); } catch (e) { report.env.ttsLanguages = `ERR ${e.message}`; }
  const camOk = await cdp.waitFor(`const v=document.getElementById('video'); return !!v.srcObject && v.videoWidth > 0`, 20000, 1000); // virtualscene camera takes a few seconds
  report.env.cameraStatus = await cdp.evaluate(`const v=document.getElementById('video'); return { ok: ${camOk}, srcObject: !!v.srcObject, w: v.videoWidth, h: v.videoHeight, status: document.getElementById('status').textContent }`);
  log('env', JSON.stringify(report.env));

  const stops = await cdp.evaluate('return window.__pg.stops()');
  const route = routeOrder(stops, OPTIONALS ? { 'villa-mysteries': true, 'chaste-lovers': true } : {});
  let gpsProbed = false;

  for (let i = 0; i < route.length; i++) {
    const s = route[i];
    if (ONLY && s.id !== ONLY) continue;
    const next = route[i + 1] ?? null;
    const row = { order: s.order, id: s.id, name_he: s.name_he, gps: s.gps ?? null, expected: s.id, got: null, method: null, pass: null, msIdentify: null, note: '' };
    report.stops.push(row);
    if (!Array.isArray(s.gps)) { row.pass = null; row.note = 'skipped: no gps'; log(`${s.id}: skipped (no gps)`); continue; }

    const st = await cdp.evaluate('return window.__pg.state');
    if (st !== 'idle' && st !== 'navigating') { row.note = `state ${st} before identify; forcing idle via reload`; await cdp.evaluate('location.reload(); return 1'); await A.sleep(3000); }

    log(`${s.id}: geo fix ${s.gps}`);
    const fix = A.geoFix(s.gps[0], s.gps[1]); if (/KO/.test(fix)) row.note += ` geo fix said: ${fix};`;
    let chip = await cdp.waitFor(`return document.getElementById('nearChip').textContent.includes(${JSON.stringify(s.name_he)})`, 20000);
    if (!chip && !gpsProbed) {
      gpsProbed = true;
      log('GPS chip did not update in 20 s — probing');
      const lc = A.logcat('Geolocation|Capacitor|chromium|LocationManager|GnssLocationProvider', 40);
      report.findings.push({ topic: 'gps-into-webview', detail: 'nearChip did not update within 20 s of first geo fix', logcat: lc, console: cdp.consoleLines().slice(-20) });
      try { A.adb('shell', 'settings', 'put', 'secure', 'location_mode', '3'); A.geoFix(s.gps[0], s.gps[1]); } catch {}
      chip = await cdp.waitFor(`return document.getElementById('nearChip').textContent.includes(${JSON.stringify(s.name_he)})`, 15000);
      report.findings.at(-1).recoveredAfterLocationMode3 = chip;
    }
    row.nearChip = await cdp.evaluate(`return document.getElementById('nearChip').textContent`);
    if (!chip) { row.pass = false; row.note += ' gps chip never updated'; failed = true; log(`${s.id}: FAIL (no gps in webview)`); continue; }

    t = Date.now();
    await cdp.evaluate('window.__pg.identify(); return 1'); // don't await: narration may take a while; we poll state instead
    const hit = await cdp.waitFor(`return window.__pg.current && window.__pg.current.id === ${JSON.stringify(s.id)}`, 10000);
    row.msIdentify = Date.now() - t;
    row.got = await cdp.evaluate('return window.__pg.current ? window.__pg.current.id : null');
    row.method = await cdp.evaluate(`return document.getElementById('stopEn').textContent`);
    row.lastIdentify = await cdp.evaluate('return window.__pg.lastIdentify');
    row.pickerOpen = await cdp.evaluate(`return !document.getElementById('pickerModal').hidden`);
    if (row.pickerOpen) await cdp.evaluate(`document.getElementById('pickerModal').hidden = true; return 1`);
    // opening narration: cut short in --fast, otherwise wait it out (state leaves 'narrating'/'identifying')
    await settleNarration();
    row.stateAfter = await cdp.evaluate('return window.__pg.state');
    row.statusAfter = await cdp.evaluate(`return document.getElementById('status').textContent`);
    row.pass = hit && row.got === s.id;
    if (!row.pass) { failed = true; log(`${s.id}: FAIL got=${row.got} picker=${row.pickerOpen} status=${row.statusAfter} cand=${JSON.stringify(row.lastIdentify?.candidates)}`); continue; }

    if (!FAST) {
      await cdp.evaluate('window.__pg.goDeep(); return 1');
      await cdp.waitFor(`return window.__pg.state === 'depthOffer'`, 130000, 1000);
    }
    await cdp.evaluate('window.__pg.goNext(); return 1');
    const nav = FAST
      ? await cutTo('navigating')
      : await cdp.waitFor(`return window.__pg.state === 'navigating'`, 130000, 1000);
    row.navStatus = await cdp.evaluate(`return document.getElementById('status').textContent`);
    row.navPass = nav && (next ? row.navStatus.includes(next.name_he) : row.navStatus.includes('סוף המסלול'));
    if (!row.navPass) { row.pass = false; failed = true; row.note += ` nav expected ${next ? next.name_he : 'end'} got "${row.navStatus}"`; }
    const li = row.lastIdentify;
    log(`${s.id}: ${row.pass ? 'PASS' : 'FAIL'} (${row.msIdentify} ms, ${li?.method}/${li?.reason}, ${li?.distanceM == null ? '-' : Math.round(li.distanceM)} m) → ${row.navStatus}`);
  }

  // ---- negative: outside the walls → picker
  if (!ONLY) {
    log('negative test: outside walls', OUTSIDE);
    await cdp.evaluate(`document.getElementById('pickerModal').hidden = true; return 1`);
    A.geoFix(OUTSIDE[0], OUTSIDE[1]);
    await cdp.waitFor(`return /\\d{3,}/.test(document.getElementById('nearChip').textContent)`, 15000); // distance ≥ 100 m
    const st = await cdp.evaluate('return window.__pg.state');
    if (st !== 'idle' && st !== 'navigating') { await cdp.evaluate('location.reload(); return 1'); await A.sleep(3000); A.geoFix(OUTSIDE[0], OUTSIDE[1]); await A.sleep(3000); }
    const before = await cdp.evaluate('return window.__pg.current ? window.__pg.current.id : null');
    await cdp.evaluate('window.__pg.identify(); return 1');
    const picker = await cdp.waitFor(`return !document.getElementById('pickerModal').hidden`, 10000);
    const after = await cdp.evaluate('return window.__pg.current ? window.__pg.current.id : null');
    report.negative = { pos: OUTSIDE, nearChip: await cdp.evaluate(`return document.getElementById('nearChip').textContent`), pickerOpened: picker, currentBefore: before, currentAfter: after, lastIdentify: await cdp.evaluate('return window.__pg.lastIdentify'), status: await cdp.evaluate(`return document.getElementById('status').textContent`), pass: picker && before === after };
    if (!report.negative.pass) failed = true;
    log('negative:', report.negative.pass ? 'PASS' : 'FAIL', JSON.stringify(report.negative));
    await cdp.evaluate(`document.getElementById('pickerModal').hidden = true; return 1`);

    // ---- offline: no network → "אין רשת"
    log('offline test');
    const hasCurrent = await cdp.evaluate('return !!window.__pg.current');
    if (!hasCurrent) await cdp.evaluate(`window.__pg.arriveAt('forum','manual'); return 1`); // startQa needs a current stop
    await settleNarration();
    const reachable = () => cdp.evaluate(`try{await Promise.race([fetch('https://example.com',{mode:'no-cors',cache:'no-store'}),new Promise((_,j)=>setTimeout(()=>j(new Error('timeout')),8000))]);return true}catch(e){return false}`);
    A.setNetwork(false);
    const fetchReachable = await reachable();
    // navigator.onLine never flips in the Android WebView — recorded, not waited on (finding 2).
    const offline = !await cdp.evaluate('return navigator.onLine');
    // The app's own truth is lib/net.js: an 8 s result cache behind a 15 s watch, so give the
    // net dot up to 25 s to notice. Once it is off, the click's fresh probe fails within 2.5 s.
    const dotOff = await cdp.waitFor(`return !document.getElementById('netDot').classList.contains('on')`, 25000, 1000);
    await cdp.evaluate(`document.getElementById('askBtn').click(); return 1`);
    const msg = await cdp.waitFor(`return document.getElementById('status').textContent.includes('אין רשת')`, 10000);
    report.offline = { networkCut: !fetchReachable, navigatorOnLineWentFalse: offline, netDotWentOff: dotOff, status: await cdp.evaluate(`return document.getElementById('status').textContent`), stateAfter: await cdp.evaluate('return window.__pg.state'), pass: msg };
    if (!msg) { failed = true; if (!fetchReachable && !offline) report.findings.push({ topic: 'navigator.onLine', detail: 'network was cut (fetch failed) but navigator.onLine stayed true in the WebView, so the app never shows אין רשת; use @capacitor/network or a reachability probe' }); }
    log('offline:', msg ? 'PASS' : 'FAIL', JSON.stringify(report.offline));
    A.setNetwork(true);
    await cdp.waitFor(`return document.getElementById('netDot').classList.contains('on')`, 30000, 1000);
  }

  report.console = cdp.consoleLines().slice(-60);
  timings.totalMs = Date.now() - tStart;
}

function printTable() {
  const rows = report.stops.map(r => ({
    order: r.order, stop: r.id, expected: r.expected, got: r.got ?? '-',
    method: (r.method || '').split('·').pop()?.trim() || '-',
    reason: r.lastIdentify?.reason ?? '-',
    m: r.lastIdentify?.distanceM == null ? '-' : Math.round(r.lastIdentify.distanceM),
    result: r.pass === null ? 'SKIP' : r.pass ? 'PASS' : 'FAIL', ms: r.msIdentify ?? '-', note: r.note.trim(),
  }));
  console.table(rows);
  const tie = report.stops.filter(r => r.lastIdentify?.reason === 'preferred' && r.lastIdentify.candidates?.[0]?.[0] !== r.got);
  if (tie.length) console.log('route tie-break overrode nearest at:', tie.map(r => `${r.id} (nearest was ${r.lastIdentify.candidates[0][0]} @ ${r.lastIdentify.candidates[0][1]} m)`).join(', '));
  if (report.negative) console.log('negative:', report.negative.pass ? 'PASS' : 'FAIL');
  if (report.offline) console.log('offline:', report.offline.pass ? 'PASS' : 'FAIL');
  console.log('timings:', JSON.stringify(timings));
}

main().catch(e => { failed = true; report.error = e.stack || String(e); log('ERROR', e.message); try { report.console = cdp?.consoleLines().slice(-60) ?? []; } catch {} })
  .finally(async () => {
    report.finishedAt = new Date().toISOString(); report.pass = !failed && !report.error;
    mkdirSync(resolve(ROOT, 'scripts/sim'), { recursive: true });
    writeFileSync(resolve(ROOT, 'scripts/sim/report.json'), JSON.stringify(report, null, 2));
    printTable();
    try { cdp?.close(); } catch {}
    if (!KEEP) {
      try { A.stop(PKG); } catch {}
      A.unforward(PORT);
      if (emu) { log('killing emulator'); A.killEmulator(emu); }
    }
    process.exit(report.pass ? 0 : 1);
  });
