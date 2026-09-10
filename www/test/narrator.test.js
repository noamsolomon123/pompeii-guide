// www/test/narrator.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { Narrator } from '../lib/narrator.js';
const stop = { id: 'vettii', open30: 'פתיח', deep: 'עומק', next_nav: 'הבא' };
const fake = (fail = false) => { const p = { calls: [], play: async (x) => { p.calls.push(['play', x]); if (fail) { const e = new Error('missing'); e.code = 'ENOENT'; throw e; } }, pause: () => p.calls.push(['pause']), resume: () => p.calls.push(['resume']), stop: () => p.calls.push(['stop']) }; return p; };
test('plays file when present; records lastSpoken', async () => {
  const f = fake(), t = fake(); const n = new Narrator({ filePlayer: f, ttsPlayer: t });
  await n.speak(stop, 'open30');
  assert.deepEqual(f.calls, [['play', './audio/vettii-open30.mp3']]); assert.deepEqual(t.calls, []);
  assert.equal(n.lastSpoken, 'פתיח'); assert.equal(n.state, 'idle');
});
test('falls back to TTS when file missing', async () => {
  const f = fake(true), t = fake(); const n = new Narrator({ filePlayer: f, ttsPlayer: t });
  await n.speak(stop, 'deep');
  assert.deepEqual(t.calls, [['play', 'עומק']]); assert.equal(n.lastSpoken, 'עומק');
});
test('pause/resume/stop route to the active player', async () => {
  const f = fake(), t = fake(); const n = new Narrator({ filePlayer: f, ttsPlayer: t });
  let resolve; f.play = async (x) => { f.calls.push(['play', x]); await new Promise(r => resolve = r); };
  const p = n.speak(stop, 'open30');
  await new Promise(r => setTimeout(r, 0));
  assert.equal(n.state, 'playing'); n.pause(); assert.equal(n.state, 'paused'); n.resume(); assert.equal(n.state, 'playing'); n.stop(); resolve(); await p;
  assert.deepEqual(f.calls.slice(1), [['pause'], ['resume'], ['stop']]);
});
test('superseded speak() cannot clobber newer call state (generation token)', async () => {
  const f = fake(), t = fake(); const n = new Narrator({ filePlayer: f, ttsPlayer: t });
  let resolveA, resolveB, call = 0;
  f.play = async (x) => {
    f.calls.push(['play', x]); call++;
    if (call === 1) await new Promise(r => resolveA = r);
    else await new Promise(r => resolveB = r);
  };
  const pA = n.speak(stop, 'open30');
  await new Promise(r => setTimeout(r, 0));
  const pB = n.speak(stop, 'deep');
  await new Promise(r => setTimeout(r, 0));
  resolveA(); await pA;
  assert.equal(n.state, 'playing'); assert.equal(n.lastSpoken, 'עומק');
  resolveB(); await pB;
  assert.equal(n.state, 'idle');
});
