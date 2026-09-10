// www/lib/settings.js
export const DEFAULTS = {
  backend: 'pipeline',                       // 'openai' | 'pipeline' | 'gemini'
  models: { openai: 'gpt-realtime-2.1', gemini: 'gemini-2.5-flash-native-audio-preview-12-2025', pipelineLlm: 'google/gemini-2.5-flash',
            pipelineStt: 'openai/whisper-large-v3-turbo', pipelineTts: 'openai/gpt-4o-mini-tts-2025-12-15', vision: 'google/gemini-2.5-flash' },
  voices: { openai: 'marin', gemini: 'Kore', pipeline: 'alloy' },
  keys: { openai: '', gemini: '', openrouter: '' },
  vad: true,                                  // barge-in by voice; false = button only
  useVision: true,                            // send photo to vision model when online
  optionals: {}                               // { 'villa-mysteries': true, 'chaste-lovers': true }
};
const PREFIX = 'pg.';
export class Settings {
  constructor(storage) { this.storage = storage; }
  get(key) {
    if (!(key in DEFAULTS)) throw new Error(`unknown setting ${key}`);
    const raw = this.storage.getItem(PREFIX + key);
    if (raw === null) return structuredClone(DEFAULTS[key]);
    try { return JSON.parse(raw); } catch { return structuredClone(DEFAULTS[key]); }
  }
  set(key, value) { if (!(key in DEFAULTS)) throw new Error(`unknown setting ${key}`); this.storage.setItem(PREFIX + key, JSON.stringify(value)); }
}
