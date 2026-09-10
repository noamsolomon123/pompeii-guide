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
const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export class Settings {
  constructor(storage) { this.storage = storage; }
  get(key) {
    if (!(key in DEFAULTS)) throw new Error(`unknown setting ${key}`);
    const base = structuredClone(DEFAULTS[key]);
    const raw = this.storage.getItem(PREFIX + key);
    if (raw === null) return base;
    let stored;
    try { stored = JSON.parse(raw); } catch { return base; }
    // Object settings (models/voices/keys/optionals) are merged over the defaults so a value
    // stored by an older build never leaves a newer field undefined.
    if (isPlain(base) && isPlain(stored)) return { ...base, ...stored };
    return stored;
  }
  set(key, value) { if (!(key in DEFAULTS)) throw new Error(`unknown setting ${key}`); this.storage.setItem(PREFIX + key, JSON.stringify(value)); }
}
