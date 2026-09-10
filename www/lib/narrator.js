// www/lib/narrator.js
export class Narrator {
  constructor({ filePlayer, ttsPlayer }) { this.filePlayer = filePlayer; this.ttsPlayer = ttsPlayer; this.active = null; this.state = 'idle'; this.lastSpoken = ''; this._tok = 0; }
  async speak(stop, layer) {
    const tok = ++this._tok;
    const text = stop[layer] || '';
    this.lastSpoken = text; this.state = 'playing';
    try {
      this.active = this.filePlayer;
      await this.filePlayer.play(`./audio/${stop.id}-${layer}.mp3`);
    } catch (e) {
      if (e?.code !== 'ENOENT') throw e;
      this.active = this.ttsPlayer;
      await this.ttsPlayer.play(text);
    } finally { if (tok === this._tok) { this.state = 'idle'; this.active = null; } }
  }
  pause() { if (this.state === 'playing') { this.active?.pause(); this.state = 'paused'; } }
  resume() { if (this.state === 'paused') { this.active?.resume(); this.state = 'playing'; } }
  stop() { this.active?.stop(); this.state = 'idle'; }
}

// ---- browser players ----
const enoent = (msg) => { const e = new Error(msg); e.code = 'ENOENT'; return e; };
export class AudioFilePlayer {
  constructor() { this.el = null; }
  play(src) {
    return new Promise((resolve, reject) => {
      const el = new Audio(src); this.el = el;
      el.onended = () => resolve();
      el.onerror = () => reject(enoent(`audio missing ${src}`));
      // Chrome/Android reject play() with NotSupportedError (code 9) when the file is absent or undecodable.
      el.play().catch((e) => reject(e?.code === 9 || e?.name === 'NotSupportedError' ? enoent(`audio missing ${src}`) : e));
    });
  }
  pause() { this.el?.pause(); } resume() { this.el?.play(); } stop() { if (this.el) { this.el.pause(); this.el.src = ''; this.el.onended?.(); } }
}

// Split on sentence enders, keeping the punctuation with the sentence it closes.
export function splitSentences(text) {
  const t = String(text ?? '').trim();
  if (!t) return [];
  const out = []; const re = /[.!?]\s+/g; let last = 0, m;
  while ((m = re.exec(t)) !== null) { const s = t.slice(last, m.index + 1).trim(); if (s) out.push(s); last = m.index + m[0].length; }
  const tail = t.slice(last).trim(); if (tail) out.push(tail);
  return out;
}

// Voices arrive asynchronously in Chrome; keep a refreshed copy instead of calling getVoices() cold.
let VOICES = [];
function refreshVoices() { try { VOICES = globalThis.speechSynthesis?.getVoices?.() || []; } catch { VOICES = []; } }
refreshVoices();
try { globalThis.speechSynthesis?.addEventListener?.('voiceschanged', refreshVoices); } catch {}

// Android WebView ignores speechSynthesis.pause(), so we speak sentence by sentence:
// pause() = cancel + remember the index, resume() = keep going from that sentence.
export class SpeechPlayer {
  constructor(lang = 'he-IL') { this.lang = lang; this.utt = null; this.parts = []; this.idx = 0; this.done = true; this.paused = false; this._resolve = null; this._abort = null; }
  play(text) {
    return new Promise((resolve) => {
      this._finish();                       // never strand an earlier play()
      const s = globalThis.speechSynthesis;
      this.parts = splitSentences(text); this.idx = 0; this.paused = false; this.utt = null;
      if (!s || !this.parts.length) return resolve();
      this.done = false; this._resolve = resolve;
      s.cancel();
      this._speakFrom(0);
    });
  }
  _speakFrom(i) {
    const s = globalThis.speechSynthesis;
    if (this.done || this.paused) return;
    if (!s || i >= this.parts.length) return this._finish();
    this.idx = i;
    const text = this.parts[i];
    const u = new SpeechSynthesisUtterance(text); u.lang = this.lang; u.rate = 0.98;
    refreshVoices();
    const v = VOICES.find(x => /^he|^iw/i.test(x.lang)); if (v) u.voice = v;
    let moved = false;
    const next = () => { if (moved) return; moved = true; clearTimeout(watchdog); clearTimeout(noEngine); if (this.done || this.paused) return; this._speakFrom(i + 1); };
    u.onend = u.onerror = next;
    const watchdog = setTimeout(next, Math.min(120000, 3000 + text.length * 90));
    const noEngine = setTimeout(() => { if (!s.speaking && VOICES.length === 0) next(); }, 1500);
    this._abort = () => { moved = true; clearTimeout(watchdog); clearTimeout(noEngine); };
    this.utt = u; s.speak(u);
  }
  _finish() { if (this.done) return; this.done = true; const r = this._resolve; this._resolve = null; this.parts = []; r?.(); }
  pause() { if (this.done || this.paused) return; this.paused = true; this._abort?.(); globalThis.speechSynthesis?.cancel(); }
  resume() { if (this.done || !this.paused) return; this.paused = false; this._speakFrom(this.idx); }
  stop() { this.paused = false; this._abort?.(); globalThis.speechSynthesis?.cancel(); this._finish(); }
}
