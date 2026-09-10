// www/test/context.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt } from '../lib/context.js';
const stop = { name_he: 'בית הווטי', name_en: 'House of the Vettii', regio: 'VI', open30: 'פתיח.', deep: 'עומק.', look_for: 'חפשו.', faq: ['מי גר כאן?'] };
test('prompt carries stop identity, last spoken, knowledge, rules', () => {
  const p = buildSystemPrompt({ stop, lastSpoken: 'הרגע נאמר.' });
  for (const s of ['בית הווטי', 'House of the Vettii', 'Regio VI', 'הרגע נאמר.', 'עומק.', 'חפשו.', 'עברית בלבד']) assert.ok(p.includes(s), s);
});
test('no lastSpoken → no "הרגע אמר" line', () => {
  const p = buildSystemPrompt({ stop, lastSpoken: '' });
  assert.ok(!p.includes('המדריך הרגע אמר'));
});
