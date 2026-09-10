// scripts/test/build-stops.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateStops, applyOverrides, wordCount, haversineM,
} from '../build-stops.mjs';

const HE_WORDS = ['מילה', 'טקסט', 'לדוגמה', 'משפט', 'תיאור', 'אתם', 'תראו', 'שימו', 'לב', 'פומפיי'];

function heWords(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(HE_WORDS[i % HE_WORDS.length]);
  return out.join(' ');
}

function makeStop(id, order, optional = false, index = order) {
  return {
    id,
    order,
    optional,
    name_he: 'שם התחנה',
    name_en: `Stop ${id}`,
    regio: 'I',
    gps: [40.746 + index * 0.0004, 14.480 + index * 0.0004],
    gps_quality: 'exact',
    hours: '09:00-17:00',
    status: 'verify_winter',
    cues: ['רמז ראשון', 'רמז שני', 'רמז שלישי'],
    open30: heWords(80),
    deep: optional ? '' : heWords(250),
    look_for: 'תיאור קצר של מה לחפש במקום.',
    next_nav: `${heWords(5)}.`,
    faq: [],
    sources: ['https://example.com'],
  };
}

function buildValidStops() {
  const stops = [];
  for (let i = 1; i <= 24; i++) stops.push(makeStop(`stop-${i}`, i, false, i));
  stops.push(makeStop('opt-a', 0, true, 25));
  stops.push(makeStop('opt-b', 13.5, true, 26));
  return stops;
}

test('valid fixture passes validation with no errors', () => {
  const { errors } = validateStops(buildValidStops());
  assert.deepEqual(errors, []);
});

test('missing key produces an error naming the field', () => {
  const stops = buildValidStops();
  delete stops[0].hours;
  const { errors } = validateStops(stops);
  assert.ok(errors.some((e) => e.includes('stop-1') && e.includes('hours')), errors.join('\n'));
});

test('duplicate order produces an error naming the field', () => {
  const stops = buildValidStops();
  stops[1].order = stops[0].order; // stop-2 takes stop-1's order (1)
  const { errors } = validateStops(stops);
  assert.ok(errors.some((e) => e.includes('order') && e.includes('duplicate')), errors.join('\n'));
});

test('order set not 1..24 produces an error naming the field', () => {
  const stops = buildValidStops();
  stops[23].order = 99; // stop-24 jumps out of range, leaving 24 uncovered
  const { errors } = validateStops(stops);
  assert.ok(errors.some((e) => e.includes('order') && e.includes('1..24')), errors.join('\n'));
});

test('gps out of bbox produces an error naming the field', () => {
  const stops = buildValidStops();
  stops[0].gps = [41.0, 14.48]; // far north, outside Pompeii bbox
  const { errors } = validateStops(stops);
  assert.ok(errors.some((e) => e.includes('stop-1') && e.includes('gps')), errors.join('\n'));
});

test('niqqud in name_he produces an error naming the field', () => {
  const stops = buildValidStops();
  stops[0].name_he = 'שֵׁם הַתַּחֲנָה';
  const { errors } = validateStops(stops);
  assert.ok(errors.some((e) => e.includes('stop-1') && e.includes('name_he')), errors.join('\n'));
});

test('deep too short produces an error naming the field', () => {
  const stops = buildValidStops();
  stops[0].deep = heWords(50); // below the 200-320 range, and not optional
  const { errors } = validateStops(stops);
  assert.ok(errors.some((e) => e.includes('stop-1') && e.includes('deep')), errors.join('\n'));
});

test('two non-optional stops 30 m apart produce a warning', () => {
  const stops = buildValidStops();
  // move stop-2 to within 30m of stop-1 (roughly 0.00027 deg lat ~= 30m)
  stops[1].gps = [stops[0].gps[0] + 0.00027, stops[0].gps[1]];
  const { warnings } = validateStops(stops);
  assert.ok(warnings.some((w) => w.includes('stop-1') && w.includes('stop-2')), warnings.join('\n'));
});

test('wordCount counts whitespace-separated words, empty string is 0', () => {
  assert.equal(wordCount('אחת שתיים שלוש'), 3);
  assert.equal(wordCount(''), 0);
  assert.equal(wordCount('   '), 0);
  assert.equal(wordCount(undefined), 0);
});

test('applyOverrides replaces gps/gps_quality by id, skips _-prefixed keys, leaves others untouched', () => {
  const stops = [
    { id: 'a', gps: [1, 1], gps_quality: 'approx', name_he: 'א' },
    { id: 'b', gps: [2, 2], gps_quality: 'approx', name_he: 'ב' },
  ];
  const overrides = {
    _comment: 'ignore me',
    a: { gps: [40.75, 14.49], gps_quality: 'exact' },
  };
  const out = applyOverrides(stops, overrides, null);
  assert.deepEqual(out[0].gps, [40.75, 14.49]);
  assert.equal(out[0].gps_quality, 'exact');
  assert.deepEqual(out[1].gps, [2, 2]);
});

test('applyOverrides replaces name_he from names map when provided', () => {
  const stops = [{ id: 'a', gps: null, gps_quality: null, name_he: 'ישן' }];
  const out = applyOverrides(stops, null, { a: 'חדש' });
  assert.equal(out[0].name_he, 'חדש');
});

test('haversineM is re-exported from www/lib/geo.js and matches known distance', () => {
  const d = haversineM([40.7489, 14.4842], [40.7513, 14.4949]);
  assert.ok(d > 900 && d < 1000, `got ${d}`);
});
