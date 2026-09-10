// www/test/factory.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceClient } from '../lib/voice/factory.js';
import { DEFAULTS } from '../lib/settings.js';
const settings = { get: (k) => structuredClone(DEFAULTS[k]) };
test('creates the right class per backend with matching options', () => {
  const p = createVoiceClient({ ...settings, get: (k) => k === 'backend' ? 'pipeline' : settings.get(k) }, 'S');
  assert.equal(p.constructor.name, 'PipelineClient'); assert.equal(p.llmModel, 'google/gemini-2.5-flash'); assert.equal(p.systemPrompt, 'S');
  const g = createVoiceClient({ ...settings, get: (k) => k === 'backend' ? 'gemini' : settings.get(k) }, 'S');
  assert.equal(g.constructor.name, 'GeminiLiveClient'); assert.equal(g.voice, 'Kore');
  const o = createVoiceClient({ ...settings, get: (k) => k === 'backend' ? 'openai' : settings.get(k) }, 'S');
  assert.equal(o.constructor.name, 'OpenAIRealtimeClient'); assert.equal(o.model, 'gpt-realtime-2.1');
});
