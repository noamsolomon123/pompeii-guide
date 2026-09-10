// www/test/geo.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { haversineM, rankByGps } from '../lib/geo.js';
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
