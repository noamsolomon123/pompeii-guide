// bakeoff/test/pcm.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { floatToInt16, int16ToBase64, base64ToInt16, downsample, wavFromInt16 } from '../lib/pcm.js';

test('floatToInt16 clamps and scales', () => {
  const out = floatToInt16(new Float32Array([0, 1, -1, 2, -2, 0.5]));
  assert.deepEqual(Array.from(out), [0, 32767, -32768, 32767, -32768, 16384]);
});

test('int16 <-> base64 round trip', () => {
  const src = new Int16Array([0, 1, -1, 32767, -32768, 1234]);
  const b64 = int16ToBase64(src);
  assert.equal(typeof b64, 'string');
  assert.deepEqual(Array.from(base64ToInt16(b64)), Array.from(src));
});

test('downsample 48k -> 16k averages every 3 samples', () => {
  const src = new Float32Array([0, 0, 0, 3, 3, 3, 6, 6, 6]);
  const out = downsample(src, 48000, 16000);
  assert.equal(out.length, 3);
  assert.deepEqual(Array.from(out), [0, 3, 6]);
});

test('wavFromInt16 writes a 44-byte header with correct sizes', () => {
  const pcm = new Int16Array([1, 2, 3, 4]);
  const buf = wavFromInt16(pcm, 24000);
  const dv = new DataView(buf);
  assert.equal(buf.byteLength, 44 + 8);
  assert.equal(String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)), 'RIFF');
  assert.equal(dv.getUint32(24, true), 24000);      // sample rate
  assert.equal(dv.getUint16(22, true), 1);          // channels
  assert.equal(dv.getUint16(34, true), 16);         // bits
  assert.equal(dv.getUint32(40, true), 8);          // data size
});
