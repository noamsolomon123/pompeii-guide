// bakeoff/lib/pcm.js
// Pure PCM helpers. No DOM, no Web Audio. Works in Node and browser.

export function floatToInt16(f32) {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    out[i] = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
  }
  return out;
}

function bytesToBase64(bytes) {
  if (typeof btoa === 'function') {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(b64) {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

export function int16ToBase64(i16) {
  return bytesToBase64(new Uint8Array(i16.buffer, i16.byteOffset, i16.byteLength));
}

export function base64ToInt16(b64) {
  const bytes = base64ToBytes(b64);
  const even = bytes.byteLength - (bytes.byteLength % 2);
  return new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + even));
}

// Integer-ratio box-filter downsample (48k->16k = 3:1, 48k->24k = 2:1).
export function downsample(f32, fromRate, toRate) {
  const ratio = fromRate / toRate;
  if (!Number.isInteger(ratio)) throw new Error(`non-integer ratio ${ratio}`);
  const n = Math.floor(f32.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = 0; k < ratio; k++) acc += f32[i * ratio + k];
    out[i] = acc / ratio;
  }
  return out;
}

export function wavFromInt16(i16, sampleRate) {
  const dataBytes = i16.byteLength;
  const buf = new ArrayBuffer(44 + dataBytes);
  const dv = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + dataBytes, true); str(8, 'WAVE');
  str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * 2, true);
  dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  str(36, 'data'); dv.setUint32(40, dataBytes, true);
  new Int16Array(buf, 44).set(i16);
  return buf;
}
