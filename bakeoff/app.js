// bakeoff/app.js
import { SYSTEM_PROMPT, TTS_SCRIPT } from './persona.js';
import { GeminiLiveClient } from '../www/lib/voice/gemini-live.js';
import { OpenAIRealtimeClient } from '../www/lib/voice/openai-realtime.js';
import { PipelineClient } from '../www/lib/voice/pipeline.js';
import { openrouterTts, elevenTts, TTS_PRESETS } from '../www/lib/voice/tts.js';

const $ = (id) => document.getElementById(id);
const DEFAULTS = {
  openai: { model: 'gpt-realtime-2.1', voice: 'marin' },
  pipeline: { model: 'google/gemini-2.5-flash', voice: 'alloy' },
  gemini: { model: 'gemini-2.5-flash-native-audio-preview-12-2025', voice: 'Kore' }
};

// keys persisted
for (const [id, k] of [['keyOpenrouter', 'OPENROUTER_KEY'], ['keyOpenai', 'OPENAI_KEY'], ['keyGemini', 'GEMINI_KEY'], ['keyEleven', 'ELEVEN_KEY']]) {
  $(id).value = localStorage.getItem(k) || '';
  $(id).addEventListener('change', () => localStorage.setItem(k, $(id).value.trim()));
}
const key = (k) => localStorage.getItem(k) || '';

$('backend').addEventListener('change', () => {
  const b = $('backend').value; const d = DEFAULTS[b];
  $('model').value = d.model; $('voice').value = d.voice; $('pipelineOpts').hidden = b !== 'pipeline';
});
$('backend').dispatchEvent(new Event('change'));

let client = null;
function setStatus(s) { $('status').textContent = s; }
function logLine(role, text) {
  const div = document.createElement('div'); div.className = role; div.textContent = (role === 'user' ? '🧑 ' : '🏛️ ') + text;
  $('log').appendChild(div); $('log').scrollTop = $('log').scrollHeight;
}

$('connect').addEventListener('click', async () => {
  const backend = $('backend').value;
  const opts = { model: $('model').value.trim(), voice: $('voice').value.trim(), systemPrompt: SYSTEM_PROMPT };
  try {
    client = backend === 'openai' ? new OpenAIRealtimeClient({ apiKey: key('OPENAI_KEY'), ...opts })
      : backend === 'gemini' ? new GeminiLiveClient({ apiKey: key('GEMINI_KEY'), ...opts })
      : new PipelineClient({ apiKey: key('OPENROUTER_KEY'), llmModel: opts.model, voice: opts.voice, systemPrompt: SYSTEM_PROMPT,
          ttsModel: $('ttsModel').value.trim(), sttModel: $('sttModel').value.trim() });
    client.onStatus(setStatus);
    client.onTranscript(({ role, text }) => logLine(role, text));
    client.onAudioLevel((l) => { $('level').style.width = `${Math.round(l * 100)}%`; });
    $('connect').disabled = true;
    $('disconnect').disabled = false;
    await client.connect();
    $('sendText').disabled = false;
  } catch (e) {
    $('disconnect').disabled = true;
    client?.close(); client = null;
    $('connect').disabled = false;
    setStatus('שגיאה: ' + e.message);
  }
});

$('disconnect').addEventListener('click', () => {
  $('disconnect').disabled = true;
  client?.close(); client = null;
  $('connect').disabled = false; $('sendText').disabled = true;
  $('level').style.width = '0%';
});

$('sendText').addEventListener('click', () => {
  const t = $('textQ').value.trim(); if (!t || !client) return;
  logLine('user', t); client.sendText(t); $('textQ').value = '';
});

async function runTts(label, fn) {
  const out = $('ttsOut');
  const wrap = document.createElement('div'); wrap.innerHTML = `<div><b>${label}</b> <span class="status">…</span></div>`;
  out.prepend(wrap);
  const t0 = performance.now();
  try {
    const url = await fn();
    const a = document.createElement('audio'); a.controls = true; a.src = url; wrap.appendChild(a);
    wrap.querySelector('.status').textContent = `${Math.round(performance.now() - t0)} ms`;
  } catch (e) { wrap.querySelector('.status').textContent = e.message; wrap.querySelector('.status').classList.add('err'); }
}
$('ttsOpenai').addEventListener('click', () => runTts('OpenAI TTS', () => openrouterTts({ apiKey: key('OPENROUTER_KEY'), text: TTS_SCRIPT, ...TTS_PRESETS.openai })));
$('ttsGemini').addEventListener('click', () => runTts('Gemini TTS', () => openrouterTts({ apiKey: key('OPENROUTER_KEY'), text: TTS_SCRIPT, ...TTS_PRESETS.gemini })));
$('ttsEleven').addEventListener('click', () => runTts('ElevenLabs', () => elevenTts({ apiKey: key('ELEVEN_KEY'), text: TTS_SCRIPT })));
