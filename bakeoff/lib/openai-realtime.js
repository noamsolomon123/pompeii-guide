// bakeoff/lib/openai-realtime.js
import { callsUrl, buildSessionUpdate, buildTextTurn, buildResponseCreate, parseServerEvent } from './openai-messages.js';

export class OpenAIRealtimeClient {
  constructor({ apiKey, model, voice, systemPrompt }) {
    Object.assign(this, { apiKey, model, voice, systemPrompt });
    this.pc = null; this.dc = null; this.stream = null; this.audioEl = null; this.levelTimer = null; this._levelCtx = null;
    this._status = () => {}; this._transcript = () => {}; this._level = () => {};
  }
  onStatus(fn) { this._status = fn; } onTranscript(fn) { this._transcript = fn; } onAudioLevel(fn) { this._level = fn; }

  async connect() {
    this._status('connecting');
    this.pc = new RTCPeerConnection();
    this.audioEl = document.createElement('audio'); this.audioEl.autoplay = true; document.body.appendChild(this.audioEl);
    this.pc.ontrack = (e) => { this.audioEl.srcObject = e.streams[0]; };
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.pc.addTrack(this.stream.getAudioTracks()[0], this.stream);
    this._startLevelMeter();
    this.dc = this.pc.createDataChannel('oai-events');
    this.dc.onmessage = (e) => {
      const r = parseServerEvent(JSON.parse(e.data));
      if (r.error) this._status(`error: ${r.error}`);
      if (r.userText) this._transcript({ role: 'user', text: r.userText });
      if (r.modelText) this._transcript({ role: 'model', text: r.modelText });
    };
    const offer = await this.pc.createOffer(); await this.pc.setLocalDescription(offer);
    const res = await fetch(callsUrl(this.model), {
      method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/sdp' }, body: offer.sdp
    });
    if (!res.ok) { const t = await res.text(); this._status(`error: ${res.status}`); throw new Error(`realtime calls ${res.status}: ${t.slice(0, 200)}`); }
    await this.pc.setRemoteDescription({ type: 'answer', sdp: await res.text() });
    await new Promise((resolve) => { if (this.dc.readyState === 'open') resolve(); else this.dc.onopen = resolve; });
    this.dc.send(JSON.stringify(buildSessionUpdate({ instructions: this.systemPrompt, voice: this.voice })));
    this._status('live');
  }
  _startLevelMeter() {
    const ctx = new AudioContext(); const src = ctx.createMediaStreamSource(this.stream); const an = ctx.createAnalyser(); an.fftSize = 512; src.connect(an);
    const data = new Float32Array(an.fftSize);
    this.levelTimer = setInterval(() => { an.getFloatTimeDomainData(data); let s = 0; for (const v of data) s += v * v; this._level(Math.min(1, Math.sqrt(s / data.length) * 4)); }, 100);
    this._levelCtx = ctx;
  }
  sendText(text) { this.dc?.send(JSON.stringify(buildTextTurn(text))); this.dc?.send(JSON.stringify(buildResponseCreate())); }
  close() {
    clearInterval(this.levelTimer); this._levelCtx?.close();
    this.stream?.getTracks().forEach(t => t.stop()); this.dc?.close(); this.pc?.close(); this.audioEl?.remove();
    this.pc = this.dc = this.stream = this.audioEl = null; this._status('idle');
  }
}
