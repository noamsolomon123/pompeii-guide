// www/app.js — state machine: idle → identifying → narrating → depthOffer → qa → navigating → idle
import { loadStops, nextStop, byId, routeOrder } from './lib/stops.js';
import { rankByGps } from './lib/geo.js';
import { Settings } from './lib/settings.js';
import { buildSystemPrompt } from './lib/context.js';
import { identifyByVision } from './lib/vision.js';
import { createVoiceClient } from './lib/voice/factory.js';
import { Narrator, AudioFilePlayer, SpeechPlayer } from './lib/narrator.js';
import { Camera } from './lib/camera.js';
import { Gps } from './lib/gps.js';
import { BargeIn } from './lib/barge-in.js';

const $ = (id) => document.getElementById(id);
const settings = new Settings(localStorage);
const narrator = new Narrator({ filePlayer: new AudioFilePlayer(), ttsPlayer: new SpeechPlayer() });
const camera = new Camera($('video'));
const gps = new Gps((fix) => { $('gpsDot').classList.add('on'); showNearest(fix.pos); });
let stops = [], current = null, voice = null, bargeIn = null, state = 'idle', idleTimer = null;

const setStatus = (t) => { $('status').textContent = t; };
const setState = (s) => { state = s; };
const online = () => navigator.onLine;
const optionals = () => settings.get('optionals');
function logLine(role, text) { const d = document.createElement('div'); d.className = role; d.textContent = (role === 'user' ? '🧑 ' : '🏛️ ') + text; $('log').appendChild(d); $('log').scrollTop = $('log').scrollHeight; }
function showNearest(pos) { const r = rankByGps(stops, pos, 1)[0]; if (r) { $('nearChip').hidden = false; $('nearChip').textContent = `📍 ${r.stop.name_he} · ${Math.round(r.distanceM)} מ'`; } }
function updateNet() { $('netDot').classList.toggle('on', online()); }

// ---------- identify ----------
async function identify() {
  if (state !== 'idle' && state !== 'navigating') return;
  setState('identifying'); $('identifyBtn').disabled = true; setStatus('מזהה…');
  let frame = null; try { frame = camera.captureFrame(); } catch {}
  const pos = gps.last?.pos ?? null;
  const ranked = pos ? rankByGps(routeOrder(stops, optionals()), pos, 3) : [];
  let id = null, method = 'manual';
  if (frame && online() && settings.get('useVision') && settings.get('keys').openrouter) {
    const candidates = ranked.length ? ranked.map(r => r.stop) : routeOrder(stops, optionals());
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
  current = byId(stops, id);
  closeVoice();
  $('stopCard').hidden = false; $('stopName').textContent = current.name_he; $('stopEn').textContent = `${current.name_en} · Regio ${current.regio} · ${method}`; $('log').innerHTML = '';
  await narrate('open30');
  if (state !== 'narrating') return;
  setState('depthOffer'); setStatus('רוצה שאעמיק? (העמק / הבא / שאלה)');
  armBargeIn();
}
async function narrate(layer) {
  setState('narrating'); setStatus(layer === 'open30' ? 'המדריך מדבר…' : layer === 'deep' ? 'מעמיק…' : 'ניווט…');
  armBargeIn();
  try { await narrator.speak(current, layer); } catch (e) { setStatus('שגיאת שמע: ' + e.message); }
}
async function goDeep() { if (!current) return; await narrate('deep'); if (state === 'narrating') { setState('depthOffer'); setStatus('שאלה? או ➡️ הבא'); armBargeIn(); } }
async function goNext() {
  if (!current) return;
  narrator.stop(); closeVoice();
  await narrate('next_nav');
  const nxt = nextStop(stops, current.id, optionals());
  setState('navigating'); setStatus(nxt ? `הבא: ${nxt.name_he}` : 'סוף המסלול');
}

// ---------- Q&A ----------
function armBargeIn() { if (settings.get('vad') && bargeIn) bargeIn.arm(); }
async function onBargeIn() { if (state === 'narrating') narrator.pause(); await startQa(); }
async function startQa() {
  if (!current) return;
  if (!online()) { setStatus('אין רשת כרגע, אענה כשנחזור'); await new SpeechPlayer().play('אין רשת כרגע, אענה כשנחזור'); if (narrator.state === 'paused') narrator.resume(); return; }
  setState('qa');
  if (!voice) {
    try {
      voice = createVoiceClient(settings, buildSystemPrompt({ stop: current, lastSpoken: narrator.lastSpoken }));
      voice.onStatus((s) => { setStatus(s); if (s === 'live' || s.startsWith('live')) scheduleIdle(); });
      voice.onTranscript(({ role, text }) => logLine(role, text));
      await voice.connect();
    } catch (e) { setStatus('שגיאת חיבור: ' + e.message); closeVoice(); if (narrator.state === 'paused') narrator.resume(); setState('depthOffer'); return; }
  }
  scheduleIdle();
}
function scheduleIdle() { clearTimeout(idleTimer); idleTimer = setTimeout(() => { closeVoice(); if (narrator.state === 'paused') { narrator.resume(); setState('narrating'); } else { setState('depthOffer'); setStatus('שאלה? העמק? הבא?'); } armBargeIn(); }, 60000); }
function closeVoice() { clearTimeout(idleTimer); voice?.close(); voice = null; }
async function sendTyped() { const t = $('textQ').value.trim(); if (!t) return; $('textQ').value = ''; if (state !== 'qa') await startQa(); if (voice) { logLine('user', t); voice.sendText(t); } }

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
function saveSettings() {
  settings.set('backend', $('sBackend').value);
  settings.set('keys', { openrouter: $('sKeyOpenrouter').value.trim(), gemini: $('sKeyGemini').value.trim(), openai: $('sKeyOpenai').value.trim() });
  settings.set('vad', $('sVad').checked); settings.set('useVision', $('sVision').checked);
  settings.set('optionals', { 'villa-mysteries': $('sVilla').checked, 'chaste-lovers': $('sChaste').checked });
  $('settingsModal').hidden = true; closeVoice();
}

// ---------- boot ----------
async function boot() {
  stops = await loadStops();
  updateNet(); addEventListener('online', updateNet); addEventListener('offline', updateNet);
  $('identifyBtn').onclick = identify; $('askBtn').onclick = () => onBargeIn(); $('deepBtn').onclick = goDeep; $('nextBtn').onclick = goNext;
  $('sendTextBtn').onclick = sendTyped; $('wrongBtn').onclick = openPicker; $('pickerClose').onclick = () => { $('pickerModal').hidden = true; };
  $('gearBtn').onclick = openSettings; $('settingsSave').onclick = saveSettings;
  gps.start();
  try { await camera.start(); } catch (e) { setStatus('מצלמה לא זמינה: ' + e.message); }
  if (settings.get('vad')) { try { bargeIn = new BargeIn(onBargeIn); await bargeIn.start(); } catch { bargeIn = null; } }
}
boot();
// exposed for the emulator/CDP simulation harness
window.__pg = { get state() { return state; }, get current() { return current; }, arriveAt, identify, goDeep, goNext, settings, stops: () => stops };
