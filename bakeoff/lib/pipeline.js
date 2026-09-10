// bakeoff/lib/pipeline.js
import { MicCapture } from './audio-io.js';
import { base64ToInt16, wavFromInt16, int16ToBase64 } from './pcm.js';
import { OR, headers, buildTranscription, buildChat, buildSpeech } from './openrouter-messages.js';

const START = 0.12;      // RMS level (0..1) that counts as speech
const END_MS = 700;      // silence that ends an utterance
const MIN_MS = 400;      // ignore blips shorter than this
const GUARD_MS = 300;    // ignore mic right after playback starts (speaker bleed)

export class PipelineClient {
  constructor({ apiKey, sttModel = 'openai/whisper-large-v3-turbo', llmModel, ttsModel, voice, systemPrompt }) {
    Object.assign(this, { apiKey, sttModel, llmModel, ttsModel, voice, systemPrompt });
    this.history = []; this.mic = null; this.audio = null;
    this.chunks = []; this.speaking = false; this.silenceMs = 0; this.speechMs = 0; this.hot = 0; this.playStartedAt = 0; this.busy = false;
    this._status = () => {}; this._transcript = () => {}; this._level = () => {};
  }
  onStatus(fn) { this._status = fn; } onTranscript(fn) { this._transcript = fn; } onAudioLevel(fn) { this._level = fn; }

  async connect() {
    this._status('connecting');
    this.mic = new MicCapture({ targetRate: 16000, onChunk: (b64) => this._onChunk(b64), onLevel: (l) => this._onLevel(l) });
    await this.mic.start();
    this._status('live');
  }

  _onLevel(l) {
    this._level(l);
    const playing = this.audio && !this.audio.paused;
    if (playing && performance.now() - this.playStartedAt < GUARD_MS) return;
    if (l > START) { this.hot++; this.silenceMs = 0; } else { this.hot = 0; if (this.speaking) this.silenceMs += 100; }
    if (!this.speaking && this.hot >= 2 && !this.busy) {
      if (playing) { this.audio.pause(); this.audio.src = ''; this._status('interrupted'); }
      this.speaking = true; this.speechMs = 0; this.chunks = []; this._status('listening…');
    }
    if (this.speaking) {
      this.speechMs += 100;
      if (this.silenceMs >= END_MS) { this.speaking = false; if (this.speechMs - this.silenceMs >= MIN_MS) this._finishUtterance(); }
    }
  }
  _onChunk(b64) { if (this.speaking) this.chunks.push(base64ToInt16(b64)); }

  async _finishUtterance() {
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const pcm = new Int16Array(total); let o = 0; for (const c of this.chunks) { pcm.set(c, o); o += c.length; }
    this.chunks = [];
    const b64wav = int16ToBase64(new Int16Array(wavFromInt16(pcm, 16000)));
    await this._turn({ base64Wav: b64wav });
  }

  async _turn({ base64Wav, text }) {
    if (this.busy) return; this.busy = true;
    const t0 = performance.now();
    try {
      let userText = text;
      if (!userText) {
        this._status('transcribing…');
        const r = await fetch(OR.transcriptions, { method: 'POST', headers: headers(this.apiKey), body: JSON.stringify(buildTranscription({ model: this.sttModel, base64Wav })) });
        if (!r.ok) throw new Error(`stt ${r.status}: ${(await r.text()).slice(0, 200)}`);
        userText = (await r.json()).text?.trim();
        if (!userText) { this._status('live'); return; }
        this._transcript({ role: 'user', text: userText });
      }
      this.history.push({ role: 'user', content: userText });
      this._status('thinking…');
      const c = await fetch(OR.chat, { method: 'POST', headers: headers(this.apiKey), body: JSON.stringify(buildChat({ model: this.llmModel, systemPrompt: this.systemPrompt, history: this.history })) });
      if (!c.ok) throw new Error(`llm ${c.status}: ${(await c.text()).slice(0, 200)}`);
      const answer = (await c.json()).choices?.[0]?.message?.content?.trim() || '';
      this.history.push({ role: 'assistant', content: answer });
      this._transcript({ role: 'model', text: answer });
      this._status('speaking…');
      const s = await fetch(OR.speech, { method: 'POST', headers: headers(this.apiKey), body: JSON.stringify(buildSpeech({ model: this.ttsModel, text: answer, voice: this.voice })) });
      if (!s.ok) throw new Error(`tts ${s.status}: ${(await s.text()).slice(0, 200)}`);
      const url = URL.createObjectURL(await s.blob());
      this.audio?.pause();
      this.audio = new Audio(url); this.playStartedAt = performance.now();
      this.audio.onended = () => this._status('live');
      await this.audio.play();
      this._status(`live (${Math.round(performance.now() - t0)} ms to first audio)`);
    } catch (e) { this._status('error: ' + e.message); }
    finally { this.busy = false; }
  }

  sendText(text) { this._turn({ text }); }
  close() { this.mic?.stop(); this.audio?.pause(); this.audio = null; this.mic = null; this._status('idle'); }
}
