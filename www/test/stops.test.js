// www/test/stops.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { routeOrder, nextStop, byId } from '../lib/stops.js';
const S = [
  { id: 'villa', order: 0, optional: true }, { id: 'a', order: 1 }, { id: 'b', order: 2 },
  { id: 'cl', order: 2.5, optional: true }, { id: 'c', order: 3 }
];
test('routeOrder excludes optionals by default', () => {
  assert.deepEqual(routeOrder(S).map(s => s.id), ['a', 'b', 'c']);
});
test('routeOrder includes enabled optionals in order position', () => {
  assert.deepEqual(routeOrder(S, { villa: true, cl: true }).map(s => s.id), ['villa', 'a', 'b', 'cl', 'c']);
});
test('nextStop follows route order, null at end', () => {
  assert.equal(nextStop(S, 'a').id, 'b');
  assert.equal(nextStop(S, 'b').id, 'c');
  assert.equal(nextStop(S, 'b', { cl: true }).id, 'cl');
  assert.equal(nextStop(S, 'c'), null);
});
test('byId', () => { assert.equal(byId(S, 'c').order, 3); assert.equal(byId(S, 'zz'), undefined); });
