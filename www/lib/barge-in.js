// www/lib/barge-in.js
// Voice barge-in: mic RMS above START for 2 consecutive 100 ms chunks → onSpeech(). Level-only; audio chunks are discarded.
import { MicCapture } from './audio-io.js';
const START = 0.12;
export class BargeIn {
  constructor(onSpeech) { this.onSpeech = onSpeech; this.mic = null; this.hot = 0; this.armed = false; }
  async start() { this.mic = new MicCapture({ targetRate: 16000, onChunk: () => {}, onLevel: (l) => this._level(l) }); await this.mic.start(); }
  arm() { this.armed = true; this.hot = 0; } disarm() { this.armed = false; }
  _level(l) { if (!this.armed) return; if (l > START) { if (++this.hot >= 2) { this.armed = false; this.onSpeech(); } } else this.hot = 0; }
  stop() { this.mic?.stop(); this.mic = null; }
}
