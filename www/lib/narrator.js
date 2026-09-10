// www/lib/narrator.js
export class Narrator {
  constructor({ filePlayer, ttsPlayer }) { this.filePlayer = filePlayer; this.ttsPlayer = ttsPlayer; this.active = null; this.state = 'idle'; this.lastSpoken = ''; }
  async speak(stop, layer) {
    const text = stop[layer] || '';
    this.lastSpoken = text; this.state = 'playing';
    try {
      this.active = this.filePlayer;
      await this.filePlayer.play(`./audio/${stop.id}-${layer}.mp3`);
    } catch (e) {
      if (e?.code !== 'ENOENT') { this.state = 'idle'; this.active = null; throw e; }
      this.active = this.ttsPlayer;
      await this.ttsPlayer.play(text);
    } finally { if (this.state !== 'stopped') this.state = 'idle'; this.active = null; }
  }
  pause() { if (this.state === 'playing') { this.active?.pause(); this.state = 'paused'; } }
  resume() { if (this.state === 'paused') { this.active?.resume(); this.state = 'playing'; } }
  stop() { this.active?.stop(); this.state = 'idle'; }
}

// ---- browser players ----
export class AudioFilePlayer {
  constructor() { this.el = null; }
  play(src) {
    return new Promise((resolve, reject) => {
      const el = new Audio(src); this.el = el;
      el.onended = () => resolve();
      el.onerror = () => { const e = new Error(`audio missing ${src}`); e.code = 'ENOENT'; reject(e); };
      el.play().catch(reject);
    });
  }
  pause() { this.el?.pause(); } resume() { this.el?.play(); } stop() { if (this.el) { this.el.pause(); this.el.src = ''; this.el.onended?.(); } }
}
export class SpeechPlayer {
  constructor(lang = 'he-IL') { this.lang = lang; this.utt = null; }
  play(text) {
    return new Promise((resolve) => {
      const s = globalThis.speechSynthesis; if (!s || !text) return resolve();
      s.cancel();
      const u = new SpeechSynthesisUtterance(text); u.lang = this.lang;
      const v = s.getVoices().find(v => /^he|^iw/i.test(v.lang)); if (v) u.voice = v;
      u.rate = 0.98; u.onend = u.onerror = () => resolve(); this.utt = u; s.speak(u);
    });
  }
  pause() { globalThis.speechSynthesis?.pause(); } resume() { globalThis.speechSynthesis?.resume(); } stop() { globalThis.speechSynthesis?.cancel(); }
}
