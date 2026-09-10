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

test('int16 <-> base64 round trip on 40000 samples exercises 0x8000 chunking', () => {
  const src = new Int16Array(40000);
  for (let i = 0; i < src.length; i++) src[i] = i % 65536 - 32768;
  const back = base64ToInt16(int16ToBase64(src));
  assert.equal(back.length, src.length);
  assert.deepEqual(Array.from(back), Array.from(src));
});

test('int16ToBase64 honours byteOffset of a subarray view', () => {
  const full = new Int16Array([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
  const view = full.subarray(3, 9);
  assert.notEqual(view.byteOffset, 0);
  assert.deepEqual(Array.from(base64ToInt16(int16ToBase64(view))), [13, 14, 15, 16, 17, 18]);
});

test('base64ToInt16 drops a trailing odd byte', () => {
  const b64 = Buffer.from([1, 0, 2, 0, 3]).toString('base64'); // 5 bytes
  const out = base64ToInt16(b64);
  assert.equal(out.length, 2);
  assert.deepEqual(Array.from(out), [1, 2]);
});

test('downsample throws on non-integer ratio', () => {
  assert.throws(() => downsample(new Float32Array(10), 44100, 16000), /non-integer ratio/);
});

test('wavFromInt16 writes RIFF markers, byteRate, blockAlign and payload', () => {
  const pcm = new Int16Array([100, -100, 32767, -32768, 7]);
  const buf = wavFromInt16(pcm, 24000);
  const dv = new DataView(buf);
  const tag = (o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  assert.equal(tag(8), 'WAVE');
  assert.equal(tag(12), 'fmt ');
  assert.equal(tag(36), 'data');
  assert.equal(dv.getUint32(28, true), 48000);     // byteRate = sampleRate * blockAlign
  assert.equal(dv.getUint16(32, true), 2);         // blockAlign
  assert.deepEqual(Array.from(new Int16Array(buf, 44)), Array.from(pcm));
});
