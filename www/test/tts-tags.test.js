// www/test/tts-tags.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { TTS_TAGS, findTags, stripTags, tagProblems } from '../lib/tts-tags.js';

test('allowlist holds the Gemini 3.8 vocal events and both pause tags', () => {
  for (const t of ['sigh', 'chuckle', 'laugh', 'breath', 'exhales', 'short pause', 'long pause', 'throat-clearing']) {
    assert.ok(TTS_TAGS.has(t), t);
  }
  assert.ok(!TTS_TAGS.has('applause'));
});

test('findTags returns tag names in order', () => {
  assert.deepEqual(findTags('שלום <sigh> עולם <short pause> סוף.'), ['sigh', 'short pause']);
  assert.deepEqual(findTags('בלי תגיות.'), []);
});

test('stripTags removes tags and repairs spacing around punctuation', () => {
  assert.equal(stripTags('הם ברחו. <sigh> לא הספיקו.'), 'הם ברחו. לא הספיקו.');
  assert.equal(stripTags('כתוב על הקיר <chuckle>, ממש כך.'), 'כתוב על הקיר, ממש כך.');
  assert.equal(stripTags('<breath> מתחילים.'), 'מתחילים.');
  assert.equal(stripTags('סוף <long pause>'), 'סוף');
  assert.equal(stripTags(undefined), '');
});

test('tagProblems accepts known tags', () => {
  assert.deepEqual(tagProblems('משפט. <short pause> עוד משפט <chuckle> וסוף.'), []);
});

test('tagProblems flags unknown tags (typos)', () => {
  assert.deepEqual(tagProblems('משפט <laugge> וסוף.'), ['unknown tag <laugge>']);
});

test('tagProblems flags square-bracket directions, pipes and stray brackets', () => {
  assert.ok(tagProblems('[whispers] סוד.').some((p) => p.includes('square')));
  assert.ok(tagProblems('משפט |oh hmm| סוף.').some((p) => p.includes('backchannel')));
  assert.ok(tagProblems('משפט < סוף.').some((p) => p.includes('stray')));
});

test('tagProblems flags two tags with nothing between them', () => {
  assert.ok(tagProblems('משפט. <sigh> <short pause> סוף.').some((p) => p.includes('adjacent')));
});
