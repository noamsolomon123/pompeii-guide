// www/test/settings.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { Settings, DEFAULTS } from '../lib/settings.js';
const mem = () => { const m = new Map(); return { getItem: (k) => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)) }; };
test('defaults when storage empty', () => {
  const s = new Settings(mem());
  assert.equal(s.get('backend'), DEFAULTS.backend);
  assert.equal(s.get('vad'), true);
  assert.deepEqual(s.get('optionals'), {});
});
test('set persists JSON and round-trips types', () => {
  const st = mem(); const s = new Settings(st);
  s.set('vad', false); s.set('optionals', { 'villa-mysteries': true }); s.set('keys', { openrouter: 'x' });
  const s2 = new Settings(st);
  assert.equal(s2.get('vad'), false);
  assert.deepEqual(s2.get('optionals'), { 'villa-mysteries': true });
  assert.equal(s2.get('keys').openrouter, 'x');
});
test('object settings merge over the defaults so no field reads undefined', () => {
  const st = mem(); const s = new Settings(st);
  s.set('keys', { openrouter: 'x' });                       // written by an older build
  s.set('models', { vision: 'my/model' });
  assert.deepEqual(s.get('keys'), { ...DEFAULTS.keys, openrouter: 'x' });
  assert.equal(s.get('keys').gemini, '');
  assert.equal(s.get('models').vision, 'my/model');
  assert.equal(s.get('models').pipelineStt, DEFAULTS.models.pipelineStt);
  assert.equal(s.get('voices').gemini, DEFAULTS.voices.gemini);
});
test('corrupt or scalar values still resolve', () => {
  const st = mem(); st.setItem('pg.keys', '{not json');
  assert.deepEqual(new Settings(st).get('keys'), DEFAULTS.keys);
  const st2 = mem(); const s2 = new Settings(st2);
  s2.set('vad', false); assert.equal(s2.get('vad'), false);
});
test('unknown key throws', () => { assert.throws(() => new Settings(mem()).get('nope'), /unknown setting/); });
