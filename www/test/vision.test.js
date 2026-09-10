// www/test/vision.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVisionRequest, parseVisionAnswer } from '../lib/vision.js';
const cands = [{ id: 'forum', name_en: 'Forum', cues: ['big square'] }, { id: 'jupiter', name_en: 'Temple of Jupiter', cues: ['podium'] }];
test('request lists candidates with cues and attaches the image', () => {
  const r = buildVisionRequest({ model: 'google/gemini-2.5-flash', candidates: cands, imageDataUrl: 'data:image/jpeg;base64,AAAA' });
  assert.equal(r.model, 'google/gemini-2.5-flash');
  const parts = r.messages[0].content;
  assert.equal(parts[1].type, 'image_url'); assert.equal(parts[1].image_url.url, 'data:image/jpeg;base64,AAAA');
  assert.ok(parts[0].text.includes('forum: Forum (big square)'));
  assert.ok(parts[0].text.includes('jupiter: Temple of Jupiter (podium)'));
  assert.ok(parts[0].text.includes('"none"'));
  assert.equal(r.max_tokens, 64);
  assert.deepEqual(r.reasoning, { exclude: true, effort: 'low' });
});
test('parseVisionAnswer returns a known id or null', () => {
  assert.equal(parseVisionAnswer('jupiter', cands), 'jupiter');
  assert.equal(parseVisionAnswer('  Forum\n', cands), 'forum');
  assert.equal(parseVisionAnswer('none', cands), null);
  assert.equal(parseVisionAnswer('macellum', cands), null);
});
test('parseVisionAnswer tolerates markdown, labels and sentences', () => {
  assert.equal(parseVisionAnswer('**forum**', cands), 'forum');
  assert.equal(parseVisionAnswer('id: jupiter', cands), 'jupiter');
  assert.equal(parseVisionAnswer('The Forum.', cands), 'forum');
  assert.equal(parseVisionAnswer('`jupiter`', cands), 'jupiter');
  assert.equal(parseVisionAnswer('It is none of them.', cands), null);
  assert.equal(parseVisionAnswer('', cands), null);
  assert.equal(parseVisionAnswer(null, cands), null);
  assert.equal(parseVisionAnswer('forumx', cands), null);   // whole word only
});
