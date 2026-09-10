// www/lib/barge-in.js
// Voice barge-in: mic RMS above START for 2 consecutive 100 ms chunks → onSpeech(). Level-only; audio chunks are discarded.
import { MicCapture } from './audio-io.js';
const START = 0.12;
const GUARD_MS = 400;   // ignore the mic right after arming (speaker bleed / tap noise)
const now = () => globalThis.performance?.now?.() ?? Date.now();
export class BargeIn {
  constructor(onSpeech) { this.onSpeech = onSpeech; this.mic = null; this.hot = 0; this.armed = false; this.armedAt = 0; }
  async start() { this.mic = new MicCapture({ targetRate: 16000, onChunk: () => {}, onLevel: (l) => this._level(l) }); await this.mic.start(); }
  arm() { this.armed = true; this.hot = 0; this.armedAt = now(); } disarm() { this.armed = false; }
  _level(l) { if (!this.armed || now() - this.armedAt < GUARD_MS) return; if (l > START) { if (++this.hot >= 2) { this.armed = false; this.onSpeech(); } } else this.hot = 0; }
  stop() { this.mic?.stop(); this.mic = null; }
}
