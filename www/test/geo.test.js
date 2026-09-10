// www/test/geo.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { haversineM, rankByGps, chooseStop } from '../lib/geo.js';
test('haversine: forum to amphitheatre ≈ 940 m', () => {
  const d = haversineM([40.7489, 14.4842], [40.7513, 14.4949]);
  assert.ok(d > 900 && d < 1000, `got ${d}`);
});
test('rankByGps sorts by distance, skips stops without gps, caps to n', () => {
  const S = [{ id: 'far', gps: [40.7513, 14.4949] }, { id: 'none', gps: null }, { id: 'near', gps: [40.7490, 14.4843] }];
  const r = rankByGps(S, [40.7489, 14.4842], 5);
  assert.deepEqual(r.map(x => x.stop.id), ['near', 'far']);
  assert.ok(r[0].distanceM < 20);
  assert.equal(rankByGps(S, [40.7489, 14.4842], 1).length, 1);
});

test('chooseStop: nearest wins when no preferred ids given', () => {
  const ranked = [{ stop: { id: 'a' }, distanceM: 10 }, { stop: { id: 'b' }, distanceM: 30 }];
  const r = chooseStop(ranked);
  assert.equal(r.stop.id, 'a');
  assert.equal(r.reason, 'nearest');
  assert.equal(r.distanceM, 10);
});

test('chooseStop: preferred wins when within tie margin of best', () => {
  const ranked = [{ stop: { id: 'a' }, distanceM: 10 }, { stop: { id: 'b' }, distanceM: 40 }];
  const r = chooseStop(ranked, { preferredIds: ['b'], tieM: 45, maxM: 80 });
  assert.equal(r.stop.id, 'b');
  assert.equal(r.reason, 'preferred');
});

test('chooseStop: preferred ignored when farther than tie margin', () => {
  const ranked = [{ stop: { id: 'a' }, distanceM: 10 }, { stop: { id: 'b' }, distanceM: 60 }];
  const r = chooseStop(ranked, { preferredIds: ['b'], tieM: 45, maxM: 80 });
  assert.equal(r.stop.id, 'a');
  assert.equal(r.reason, 'nearest');
});

test('chooseStop: preferred ignored when beyond maxM even if within tie', () => {
  const ranked = [{ stop: { id: 'a' }, distanceM: 50 }, { stop: { id: 'b' }, distanceM: 85 }];
  const r = chooseStop(ranked, { preferredIds: ['b'], tieM: 45, maxM: 80 });
  assert.equal(r.stop.id, 'a');
  assert.equal(r.reason, 'nearest');
});

test('chooseStop: nothing within maxM returns none', () => {
  const ranked = [{ stop: { id: 'a' }, distanceM: 100 }];
  const r = chooseStop(ranked, { maxM: 80 });
  assert.deepEqual(r, { stop: null, distanceM: null, reason: 'none' });
});

test('chooseStop: preferredIds priority order — first listed wins when both within tie', () => {
  const ranked = [{ stop: { id: 'a' }, distanceM: 10 }, { stop: { id: 'b' }, distanceM: 20 }, { stop: { id: 'c' }, distanceM: 30 }];
  const r1 = chooseStop(ranked, { preferredIds: ['c', 'b'], tieM: 45, maxM: 80 });
  assert.equal(r1.stop.id, 'c');
  const r2 = chooseStop(ranked, { preferredIds: ['b', 'c'], tieM: 45, maxM: 80 });
  assert.equal(r2.stop.id, 'b');
});
