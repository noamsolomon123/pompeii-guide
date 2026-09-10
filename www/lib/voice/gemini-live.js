// bakeoff/lib/gemini-live.js
import { wsUrl, buildSetup, buildAudioChunk, buildTextTurn, parseServerMessage } from './gemini-messages.js';
import { MicCapture, PcmPlayer } from '../audio-io.js';

export class GeminiLiveClient {
  constructor({ apiKey, model, voice, systemPrompt }) {
    Object.assign(this, { apiKey, model, voice, systemPrompt });
    this.ws = null; this.mic = null; this.player = new PcmPlayer({ sampleRate: 24000 });
    this._userBuf = ''; this._modelBuf = '';
    this._status = () => {}; this._transcript = () => {}; this._level = () => {};
  }
  onStatus(fn) { this._status = fn; } onTranscript(fn) { this._transcript = fn; } onAudioLevel(fn) { this._level = fn; }

  connect() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ok = () => { if (!settled) { settled = true; resolve(); } };
      const fail = (err) => { if (!settled) { settled = true; reject(err); } };
      this._userBuf = ''; this._modelBuf = '';
      this._status('connecting');
      this.ws = new WebSocket(wsUrl(this.apiKey));
      this.ws.onopen = () => this.ws.send(JSON.stringify(buildSetup({ model: this.model, voice: this.voice, systemPrompt: this.systemPrompt })));
      this.ws.onerror = () => { this._status('error: websocket'); fail(new Error('ws error')); };
      this.ws.onclose = (e) => { this._status(`closed ${e.code} ${e.reason || ''}`); fail(new Error(`ws closed ${e.code} ${e.reason || ''}`.trim())); };
      this.ws.onmessage = async (e) => {
        const raw = typeof e.data === 'string' ? e.data : await e.data.text();
        const r = parseServerMessage(JSON.parse(raw));
        if (r.setupComplete) {
          try { await this._startMic(); this._status('live'); ok(); }
          catch (err) { this._status('error: ' + err.message); this.close(); fail(err); }
        }
        if (r.interrupted) { this.player.flush(); this._flushTranscript('model'); }
        for (const a of r.audio) this.player.enqueue(a);
        if (r.userText) this._userBuf += r.userText;
        if (r.modelText) this._modelBuf += r.modelText;
        if (r.turnComplete) { this._flushTranscript('user'); this._flushTranscript('model'); }
      };
    });
  }
  // Gemini streams transcription as fragments; emit one line per turn (matches OpenAI's complete sentences).
  _flushTranscript(role) {
    const k = role === 'user' ? '_userBuf' : '_modelBuf';
    const text = this[k].trim(); this[k] = '';
    if (text) this._transcript({ role, text });
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
  close() {
    this.mic?.stop(); this.player.close();
    if (this.ws) { this.ws.onopen = this.ws.onmessage = this.ws.onerror = this.ws.onclose = null; }
    this.ws?.close(); this.ws = null;
    this._status('idle');
  }
}
