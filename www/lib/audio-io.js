// bakeoff/lib/audio-io.js
import { floatToInt16, int16ToBase64, base64ToInt16, downsample } from './pcm.js';

// Mic capture: emits base64 PCM16 chunks at targetRate (16000), ~100ms each.
export class MicCapture {
  constructor({ targetRate = 16000, onChunk, onLevel }) {
    this.targetRate = targetRate; this.onChunk = onChunk; this.onLevel = onLevel;
    this.ctx = null; this.stream = null; this.node = null;
  }
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    this.ctx = new AudioContext({ sampleRate: this.targetRate });
    const srcRate = this.ctx.sampleRate;
    const needsDownsample = srcRate !== this.targetRate;
    if (needsDownsample && !Number.isInteger(srcRate / this.targetRate)) {
      this.stop();
      throw new Error(`mic sample rate ${srcRate} not a multiple of ${this.targetRate}`);
    }
    await this.ctx.audioWorklet.addModule(new URL('./worklet-capture.js', import.meta.url));
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, 'capture-processor');
    src.connect(this.node);
    let acc = new Float32Array(0);
    const chunkLen = Math.round(srcRate * 0.1); // 100 ms
    this.node.port.onmessage = (e) => {
      const f = e.data;
      const merged = new Float32Array(acc.length + f.length); merged.set(acc); merged.set(f, acc.length); acc = merged;
      if (acc.length >= chunkLen) {
        const frame = acc.subarray(0, chunkLen); acc = acc.subarray(chunkLen).slice(0);
        let sum = 0; for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
        this.onLevel?.(Math.min(1, Math.sqrt(sum / frame.length) * 4));
        const ds = needsDownsample ? downsample(frame, srcRate, this.targetRate) : frame;
        this.onChunk?.(int16ToBase64(floatToInt16(ds)));
      }
    };
  }
  stop() {
    this.node?.disconnect(); this.stream?.getTracks().forEach(t => t.stop()); this.ctx?.close();
    this.node = this.stream = this.ctx = null;
  }
}

// PCM player: queues base64 PCM16 chunks at a fixed rate, plays gaplessly, flush() on interruption.
export class PcmPlayer {
  constructor({ sampleRate = 24000 }) {
    this.sampleRate = sampleRate; this.ctx = null; this.nextTime = 0; this.sources = new Set();
  }
  ensure() { if (!this.ctx) this.ctx = new AudioContext({ sampleRate: this.sampleRate }); if (this.ctx.state === 'suspended') this.ctx.resume(); }
  enqueue(b64) {
    this.ensure();
    const i16 = base64ToInt16(b64);
    if (!i16.length) return;
    const f32 = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;
    const buf = this.ctx.createBuffer(1, f32.length, this.sampleRate);
    buf.copyToChannel(f32, 0);
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.connect(this.ctx.destination);
    const t = Math.max(this.ctx.currentTime + 0.02, this.nextTime);
    src.start(t); this.nextTime = t + buf.duration;
    this.sources.add(src); src.onended = () => this.sources.delete(src);
  }
  flush() { for (const s of this.sources) { try { s.stop(); } catch {} } this.sources.clear(); this.nextTime = 0; }
  close() { this.flush(); this.ctx?.close(); this.ctx = null; }
}
