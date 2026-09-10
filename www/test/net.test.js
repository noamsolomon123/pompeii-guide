// www/test/net.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { isOnline, startNetWatch, resetNetCache } from '../lib/net.js';

const realFetch = globalThis.fetch;
function stubFetch(impl) { const calls = []; globalThis.fetch = (...a) => { calls.push(a); return impl(...a); }; return calls; }
function restore() { globalThis.fetch = realFetch; resetNetCache(); }

test('resolves true when the probe responds', async () => {
  resetNetCache();
  const calls = stubFetch(async () => ({ status: 0, type: 'opaque' }));
  try {
    assert.equal(await isOnline(), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'https://www.gstatic.com/generate_204');
    assert.equal(calls[0][1].mode, 'no-cors');
    assert.equal(calls[0][1].cache, 'no-store');
  } finally { restore(); }
});

test('resolves false when the probe rejects', async () => {
  resetNetCache();
  stubFetch(async () => { throw new TypeError('Failed to fetch'); });
  try { assert.equal(await isOnline(), false); } finally { restore(); }
});

test('resolves false when the probe never settles (timeout)', async () => {
  resetNetCache();
  stubFetch((_url, { signal }) => new Promise((_res, rej) => { signal?.addEventListener('abort', () => rej(new Error('aborted'))); }));
  try {
    const t0 = Date.now();
    assert.equal(await isOnline({ timeoutMs: 50 }), false);
    assert.ok(Date.now() - t0 < 1000, 'should give up quickly');
  } finally { restore(); }
});

test('caches the verdict: a second call inside the window does not re-probe', async () => {
  resetNetCache();
  const calls = stubFetch(async () => ({ type: 'opaque' }));
  try {
    assert.equal(await isOnline(), true);
    assert.equal(await isOnline(), true);
    assert.equal(await isOnline(), true);
    assert.equal(calls.length, 1);
    resetNetCache();
    assert.equal(await isOnline(), true);
    assert.equal(calls.length, 2, 'resetNetCache() forces a fresh probe');
  } finally { restore(); }
});

test('startNetWatch reports only transitions and stops on demand', async () => {
  resetNetCache();
  let up = true;
  stubFetch(async () => { if (!up) throw new Error('down'); return { type: 'opaque' }; });
  try {
    const seen = [];
    const stop = startNetWatch((v) => seen.push(v), 5);
    await new Promise(r => setTimeout(r, 30));
    assert.deepEqual(seen, [true]);            // no repeat while the state is unchanged
    up = false; resetNetCache();
    await new Promise(r => setTimeout(r, 40));
    assert.deepEqual(seen, [true, false]);
    stop();
    up = true; resetNetCache();
    await new Promise(r => setTimeout(r, 40));
    assert.deepEqual(seen, [true, false], 'stopped watch emits nothing more');
  } finally { restore(); }
});
