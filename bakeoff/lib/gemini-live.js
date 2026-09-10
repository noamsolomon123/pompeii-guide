// bakeoff/lib/gemini-live.js
import { wsUrl, buildSetup, buildAudioChunk, buildTextTurn, parseServerMessage } from './gemini-messages.js';
import { MicCapture, PcmPlayer } from './audio-io.js';

export class GeminiLiveClient {
  constructor({ apiKey, model, voice, systemPrompt }) {
    Object.assign(this, { apiKey, model, voice, systemPrompt });
    this.ws = null; this.mic = null; this.player = new PcmPlayer({ sampleRate: 24000 });
    this._status = () => {}; this._transcript = () => {}; this._level = () => {};
  }
  onStatus(fn) { this._status = fn; } onTranscript(fn) { this._transcript = fn; } onAudioLevel(fn) { this._level = fn; }

  connect() {
    return new Promise((resolve, reject) => {
      this._status('connecting');
      this.ws = new WebSocket(wsUrl(this.apiKey));
      this.ws.onopen = () => this.ws.send(JSON.stringify(buildSetup({ model: this.model, voice: this.voice, systemPrompt: this.systemPrompt })));
      this.ws.onerror = () => { this._status('error: websocket'); reject(new Error('ws error')); };
      this.ws.onclose = (e) => this._status(`closed ${e.code} ${e.reason || ''}`);
      this.ws.onmessage = async (e) => {
        const raw = typeof e.data === 'string' ? e.data : await e.data.text();
        const r = parseServerMessage(JSON.parse(raw));
        if (r.setupComplete) { await this._startMic(); this._status('live'); resolve(); }
        if (r.interrupted) this.player.flush();
        for (const a of r.audio) this.player.enqueue(a);
        if (r.userText) this._transcript({ role: 'user', text: r.userText });
        if (r.modelText) this._transcript({ role: 'model', text: r.modelText });
      };
    });
  }
  async _startMic() {
    this.mic = new MicCapture({
      targetRate: 16000,
      onChunk: (b64) => { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(buildAudioChunk(b64))); },
      onLevel: (l) => this._level(l)
    });
    await this.mic.start();
  }
  sendText(text) { this.ws?.send(JSON.stringify(buildTextTurn(text))); }
  close() { this.mic?.stop(); this.player.close(); this.ws?.close(); this.ws = null; this._status('idle'); }
}
