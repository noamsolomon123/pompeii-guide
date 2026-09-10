// www/app.js — state machine: idle → identifying → narrating → depthOffer → qa → navigating → idle
import { loadStops, nextStop, byId, routeOrder } from './lib/stops.js';
import { rankByGps } from './lib/geo.js';
import { Settings } from './lib/settings.js';
import { buildSystemPrompt } from './lib/context.js';
import { identifyByVision } from './lib/vision.js';
import { createVoiceClient } from './lib/voice/factory.js';
import { Narrator, AudioFilePlayer, createSpeechPlayer } from './lib/narrator.js';
import { Camera } from './lib/camera.js';
import { Gps } from './lib/gps.js';
import { BargeIn } from './lib/barge-in.js';
import { isOnline, startNetWatch } from './lib/net.js';

const $ = (id) => document.getElementById(id);
const settings = new Settings(localStorage);
const narrator = new Narrator({ filePlayer: new AudioFilePlayer(), ttsPlayer: createSpeechPlayer() });
const camera = new Camera($('video'));
const gps = new Gps((fix) => { $('gpsDot').classList.add('on'); showNearest(fix.pos); });
let stops = [], current = null, voice = null, bargeIn = null, state = 'idle';
let idleTimer = null, resumeTimer = null, offerTimer = null;
let narrationGen = 0, arrivalGen = 0, lastNarration = '';

const IDLE_MS = 60000;    // live session auto-close
const RESUME_MS = 5000;   // silence after an answer → resume narration / depth offer
const OFFER_MS = 8000;    // silence at the depth offer → move on
// which key each backend needs
const KEY_FOR_BACKEND = { pipeline: 'openrouter', gemini: 'gemini', openai: 'openai' };

const setStatus = (t) => { $('status').textContent = t; };
const setState = (s) => { state = s; };
const optionals = () => settings.get('optionals');
function logLine(role, text) { const d = document.createElement('div'); d.className = role; d.textContent = (role === 'user' ? '🧑 ' : '🏛️ ') + text; $('log').appendChild(d); $('log').scrollTop = $('log').scrollHeight; }
function showNearest(pos) { const r = rankByGps(stops, pos, 1)[0]; if (r) { $('nearChip').hidden = false; $('nearChip').textContent = `📍 ${r.stop.name_he} · ${Math.round(r.distanceM)} מ'`; } }
// navigator.onLine is always true in the Android WebView → the reachability probe is the truth.
function updateNet(ok) { $('netDot').classList.toggle('on', !!ok); }

// Adapter status strings (english, backend-specific) → one Hebrew vocabulary for the user.
export function hebrewStatus(s) {
  const t = String(s ?? '').trim();
  if (/^error/i.test(t)) return 'שגיאה: ' + t.replace(/^error\s*:?\s*/i, '');
  if (/^closed/i.test(t)) return 'החיבור נסגר';
  if (/^connecting/i.test(t)) return 'מתחבר…';
  if (/^live/i.test(t)) return 'מקשיב…';
  if (/^listening/i.test(t)) return 'מקשיב…';
  if (/^transcribing/i.test(t)) return 'מתמלל…';
  if (/^thinking/i.test(t)) return 'חושב…';
  if (/^speaking/i.test(t)) return 'עונה…';
  if (/^interrupted/i.test(t)) return 'נקטע';
  if (/^idle/i.test(t)) return '';
  return t;
}
const isDead = (s) => /^(closed|error)/i.test(String(s ?? ''));

// ---------- identify ----------
async function identify() {
  if (state === 'identifying' || state === 'qa') return;   // re-aiming during narration is allowed
  clearTimeout(offerTimer);
  narrationGen++; arrivalGen++;                            // supersede a narration/arrival still in flight
  if (state === 'narrating' || state === 'depthOffer') narrator.stop();
  bargeIn?.disarm();
  setState('identifying'); $('identifyBtn').disabled = true; setStatus('מזהה…');
  let frame = null; try { frame = camera.captureFrame(); } catch {}
  const pos = gps.last?.pos ?? null;
  const route = routeOrder(stops, optionals());
  const ranked = pos ? rankByGps(route, pos, 3) : [];
  const near = ranked.length > 0 && ranked[0].distanceM < 150;
  let id = null, method = 'manual';
  if (frame && settings.get('useVision') && settings.get('keys').openrouter && await isOnline()) {
    const candidates = near ? ranked.map(r => r.stop) : route;
    try { id = await identifyByVision({ apiKey: settings.get('keys').openrouter, model: settings.get('models').vision, candidates, imageDataUrl: frame }); method = 'vision'; }
    catch (e) { setStatus('זיהוי בתמונה נכשל, משתמש ב-GPS'); }
  }
  if (!id && ranked.length && ranked[0].distanceM < 80) { id = ranked[0].stop.id; method = 'gps'; }
  $('identifyBtn').disabled = false;
  if (!id) { setState('idle'); setStatus('לא זוהה. בחר ידנית.'); openPicker(); return; }
  await arriveAt(id, method);
}

// ---------- narration flow ----------
async function arriveAt(id, method) {
  const g = ++arrivalGen;
  narrator.stop(); closeVoice(); bargeIn?.disarm(); clearTimeout(offerTimer);
  const stop = byId(stops, id);
  if (!stop) { setState('idle'); setStatus('תחנה לא נמצאה'); return; }
  current = stop;
  $('stopCard').hidden = false; $('stopName').textContent = current.name_he; $('stopEn').textContent = `${current.name_en} · Regio ${current.regio} · ${method}`; $('log').innerHTML = '';
  $('deepBtn').hidden = !current.deep;
  const ok = await narrate('open30');
  if (g !== arrivalGen) return;
  if (!ok) return;
  setState('depthOffer'); setStatus('רוצה שאעמיק? (העמק / הבא / שאלה)');
  armBargeIn();
  // spoken offer; a recorded ./audio/_prompt-open30.mp3 replaces the TTS when present
  try { await narrator.speak({ id: '_prompt', open30: 'רוצים שאעמיק?' }, 'open30'); } catch {}
  if (g !== arrivalGen) return;
  if (state !== 'depthOffer') return;
  clearTimeout(offerTimer);
  offerTimer = setTimeout(() => { if (state === 'depthOffer') goNext(); }, OFFER_MS);
}
async function narrate(layer) {
  narrator.stop();
  const gen = ++narrationGen;
  setState('narrating'); setStatus(layer === 'open30' ? 'המדריך מדבר…' : layer === 'deep' ? 'מעמיק…' : 'ניווט…');
  armBargeIn();
  lastNarration = current?.[layer] || '';
  try { await narrator.speak(current, layer); } catch (e) { setStatus('שגיאת שמע: ' + e.message); }
  if (gen !== narrationGen) return false;
  return true;
}
async function goDeep() {
  if (!current) return;
  clearTimeout(offerTimer);
  const ok = await narrate('deep');
  if (ok) { setState('depthOffer'); setStatus('שאלה? או ➡️ הבא'); armBargeIn(); }
}
async function goNext() {
  if (!current) return;
  clearTimeout(offerTimer);
  narrator.stop(); closeVoice();
  const ok = await narrate('next_nav');
  if (!ok) return;
  const nxt = nextStop(stops, current.id, optionals());
  setState('navigating'); setStatus(nxt ? `הבא: ${nxt.name_he}` : 'סוף המסלול');
  bargeIn?.disarm();
}

// ---------- Q&A ----------
function armBargeIn() { if (settings.get('vad') && bargeIn) bargeIn.arm(); }
async function onBargeIn() { if (state === 'narrating') narrator.pause(); else narrator.stop(); await startQa(); }
// Leave the live-session state: resume a paused narration, otherwise fall back to the depth offer.
function leaveQa(keepStatus) {
  if (narrator.state === 'paused') { narrator.resume(); setState('narrating'); if (!keepStatus) setStatus('המדריך מדבר…'); }
  else { setState('depthOffer'); if (!keepStatus) setStatus('שאלה? העמק? הבא?'); }
  armBargeIn();
}
function missingKey() {
  const need = KEY_FOR_BACKEND[settings.get('backend')] || 'openrouter';
  return !String(settings.get('keys')[need] || '').trim();
}
async function startQa() {
  if (!current) return;
  clearTimeout(offerTimer);
  if (!await isOnline()) {
    setStatus('אין רשת כרגע, אענה כשנחזור');
    await createSpeechPlayer().play('אין רשת כרגע, אענה כשנחזור');
    if (narrator.state === 'paused') { narrator.resume(); setState('narrating'); }
    armBargeIn();
    return;
  }
  if (missingKey()) { setStatus('חסר מפתח API. פתח הגדרות.'); openSettings(); return; }
  setState('qa');
  if (!voice) {
    try {
      voice = createVoiceClient(settings, buildSystemPrompt({ stop: current, lastSpoken: lastNarration || narrator.lastSpoken }));
      voice.onStatus(onVoiceStatus);
      voice.onTranscript(onVoiceTranscript);
      await voice.connect();
    } catch (e) { setStatus('שגיאת חיבור: ' + e.message); closeVoice(); leaveQa(true); return; }
  }
  scheduleIdle();
}
function onVoiceStatus(s) {
  if (isDead(s)) { closeVoice(); setStatus(hebrewStatus(s)); leaveQa(true); return; }
  setStatus(hebrewStatus(s));
  if (/^live/i.test(String(s))) scheduleIdle();
}
function onVoiceTranscript({ role, text }) {
  logLine(role, text);
  scheduleIdle();                       // any turn counts as activity
  clearTimeout(resumeTimer);
  if (role !== 'model') return;
  resumeTimer = setTimeout(() => { if (state !== 'qa') return; leaveQa(false); }, RESUME_MS);
}
function scheduleIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { closeVoice(); if (state !== 'qa') return; leaveQa(false); }, IDLE_MS);
}
function closeVoice() {
  clearTimeout(idleTimer); clearTimeout(resumeTimer);
  const v = voice; voice = null;
  if (!v) return;
  try { v.onStatus(() => {}); v.onTranscript(() => {}); v.close(); } catch {}
}
async function sendTyped() {
  const t = $('textQ').value.trim(); if (!t) return;
  if (state !== 'qa') await startQa();
  if (!voice) return;                   // key missing / connect failed → keep what the user typed
  $('textQ').value = '';
  logLine('user', t); voice.sendText(t); scheduleIdle();
}

// ---------- picker / settings ----------
function openPicker() {
  const list = $('pickerList'); list.innerHTML = '';
  for (const s of routeOrder(stops, optionals())) { const b = document.createElement('button'); b.textContent = `${s.order}. ${s.name_he}`; b.onclick = () => { $('pickerModal').hidden = true; narrator.stop(); arriveAt(s.id, 'manual'); }; list.appendChild(b); }
  $('pickerModal').hidden = false;
}
function openSettings() {
  const k = settings.get('keys'), o = optionals();
  $('sBackend').value = settings.get('backend'); $('sKeyOpenrouter').value = k.openrouter; $('sKeyGemini').value = k.gemini; $('sKeyOpenai').value = k.openai;
  $('sVad').checked = settings.get('vad'); $('sVision').checked = settings.get('useVision'); $('sVilla').checked = !!o['villa-mysteries']; $('sChaste').checked = !!o['chaste-lovers'];
  $('settingsModal').hidden = false;
}
function closeSettings() { $('settingsModal').hidden = true; }   // discards edits
function saveSettings() {
  const hadVad = settings.get('vad'), wantVad = $('sVad').checked;
  settings.set('backend', $('sBackend').value);
  settings.set('keys', { openrouter: $('sKeyOpenrouter').value.trim(), gemini: $('sKeyGemini').value.trim(), openai: $('sKeyOpenai').value.trim() });
  settings.set('vad', wantVad); settings.set('useVision', $('sVision').checked);
  settings.set('optionals', { 'villa-mysteries': $('sVilla').checked, 'chaste-lovers': $('sChaste').checked });
  $('settingsModal').hidden = true;
  const wasQa = state === 'qa';
  closeVoice();                                       // the adapter is built from settings; rebuild on next question
  if (wantVad !== hadVad) {
    if (wantVad && !bargeIn) { bargeIn = new BargeIn(onBargeIn); bargeIn.start().catch(() => { bargeIn = null; }); }
    else if (!wantVad && bargeIn) { bargeIn.stop(); bargeIn = null; }
  }
  if (wasQa) leaveQa(false);
}

// ---------- boot ----------
async function boot() {
  stops = await loadStops();
  startNetWatch(updateNet);        // probes immediately, then every 15 s; navigator.onLine lies in the WebView
  $('identifyBtn').onclick = identify; $('askBtn').onclick = () => onBargeIn(); $('deepBtn').onclick = goDeep; $('nextBtn').onclick = goNext;
  $('sendTextBtn').onclick = sendTyped; $('wrongBtn').onclick = openPicker; $('pickerClose').onclick = () => { $('pickerModal').hidden = true; };
  $('gearBtn').onclick = openSettings; $('settingsSave').onclick = saveSettings;
  const closeBtn = $('settingsClose'); if (closeBtn) closeBtn.onclick = closeSettings;
  gps.start();
  try { await camera.start(); } catch (e) { setStatus('מצלמה לא זמינה: ' + e.message); }
  if (settings.get('vad')) { try { bargeIn = new BargeIn(onBargeIn); await bargeIn.start(); } catch { bargeIn = null; } }
}
boot().catch(e => setStatus('שגיאת טעינה: ' + e.message));
// exposed for the emulator/CDP simulation harness
window.__pg = { get state() { return state; }, get current() { return current; }, arriveAt, identify, goDeep, goNext, startQa, openSettings, hebrewStatus, settings, stops: () => stops, ttsKind: () => narrator.ttsPlayer?.constructor?.name ?? null };
