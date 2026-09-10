// www/test/narrator.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { Narrator, splitSentences, SpeechPlayer, NativeTtsPlayer, createSpeechPlayer, nativeTts } from '../lib/narrator.js';
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
test('splitSentences keeps the punctuation and drops empties', () => {
  assert.deepEqual(splitSentences('one. two! three? four'), ['one.', 'two!', 'three?', 'four']);
  assert.deepEqual(splitSentences('  בית הוונטיים.   שני אחים.  '), ['בית הוונטיים.', 'שני אחים.']);
  assert.deepEqual(splitSentences('no enders here'), ['no enders here']);
  assert.deepEqual(splitSentences(''), []);
  assert.deepEqual(splitSentences(null), []);
});

// Android WebView ignores speechSynthesis.pause(): the player must chunk and re-speak instead.
const fakeSynth = () => {
  const spoken = []; let pending = null;
  const s = {
    speaking: false,
    getVoices: () => [{ lang: 'he-IL', name: 'fake' }],
    speak(u) { spoken.push(u.text); pending = u; s.speaking = true; },
    cancel() { pending = null; s.speaking = false; },
    end() { const u = pending; pending = null; s.speaking = false; u?.onend?.(); },
    addEventListener() {}
  };
  return { s, spoken };
};
test('SpeechPlayer speaks sentence by sentence and resumes from the cut sentence', async () => {
  const { s, spoken } = fakeSynth();
  globalThis.speechSynthesis = s;
  globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  try {
    const p = new SpeechPlayer();
    const done = p.play('one. two. three');
    assert.deepEqual(spoken, ['one.']);
    s.end();
    assert.deepEqual(spoken, ['one.', 'two.']);
    p.pause();
    assert.equal(s.speaking, false);
    s.end();                                   // cancelled utterance must not advance
    assert.deepEqual(spoken, ['one.', 'two.']);
    p.resume();
    assert.deepEqual(spoken, ['one.', 'two.', 'two.']);
    s.end(); s.end();
    assert.deepEqual(spoken, ['one.', 'two.', 'two.', 'three']);
    await done;                                // resolves once every sentence is done
  } finally { delete globalThis.speechSynthesis; delete globalThis.SpeechSynthesisUtterance; }
});
test('SpeechPlayer stop() resolves the pending play()', async () => {
  const { s, spoken } = fakeSynth();
  globalThis.speechSynthesis = s;
  globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  try {
    const p = new SpeechPlayer();
    const done = p.play('one. two.');
    p.stop();
    await done;
    assert.deepEqual(spoken, ['one.']);
    assert.equal(s.speaking, false);
  } finally { delete globalThis.speechSynthesis; delete globalThis.SpeechSynthesisUtterance; }
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

// ---- native (Capacitor) TTS: the Android WebView has no speechSynthesis at all ----
const fakeTts = () => {
  const calls = []; let pending = null;
  return {
    calls,
    settle() { const p = pending; pending = null; p?.(); },        // finish the sentence in flight
    speak(o) { calls.push(['speak', o.text, o.lang]); return new Promise(r => { pending = r; }); },
    stop() { calls.push(['stop']); const p = pending; pending = null; p?.(); return Promise.resolve(); }
  };
};

test('NativeTtsPlayer speaks sentence by sentence with he-IL', async () => {
  const tts = fakeTts();
  const p = new NativeTtsPlayer(tts);
  const done = p.play('one. two. three');
  await null;
  assert.deepEqual(tts.calls, [['speak', 'one.', 'he-IL']]);
  tts.settle(); await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(tts.calls.at(-1), ['speak', 'two.', 'he-IL']);
  tts.settle(); await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(tts.calls.at(-1), ['speak', 'three', 'he-IL']);
  tts.settle();
  await done;                                   // resolves once every sentence is done
});

test('NativeTtsPlayer pause() stops the engine and resume() re-speaks the cut sentence', async () => {
  const tts = fakeTts();
  const p = new NativeTtsPlayer(tts);
  const done = p.play('one. two. three');
  await null;
  tts.settle(); await new Promise(r => setTimeout(r, 0));   // now speaking "two."
  p.pause();
  assert.deepEqual(tts.calls.at(-1), ['stop']);
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(tts.calls.filter(c => c[0] === 'speak').map(c => c[1]), ['one.', 'two.']);
  p.resume();
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(tts.calls.filter(c => c[0] === 'speak').map(c => c[1]), ['one.', 'two.', 'two.']);
  tts.settle(); await new Promise(r => setTimeout(r, 0));
  tts.settle();
  await done;
});

test('NativeTtsPlayer stop() resolves the pending play()', async () => {
  const tts = fakeTts();
  const p = new NativeTtsPlayer(tts);
  const done = p.play('one. two.');
  await null;
  p.stop();
  await done;
  assert.deepEqual(tts.calls.filter(c => c[0] === 'speak').map(c => c[1]), ['one.']);
});

test('NativeTtsPlayer survives a sentence the engine rejects', async () => {
  const spoken = [];
  const tts = { speak: async (o) => { spoken.push(o.text); if (o.text === 'two.') throw new Error('engine busy'); }, stop: async () => {} };
  const p = new NativeTtsPlayer(tts);
  await p.play('one. two. three');
  assert.deepEqual(spoken, ['one.', 'two.', 'three']);
});

test('createSpeechPlayer picks the native plugin when the bridge exposes it, else SpeechPlayer', () => {
  assert.equal(nativeTts(), null);
  assert.equal(createSpeechPlayer().constructor.name, 'SpeechPlayer');
  const plugin = { speak: async () => {}, stop: async () => {} };
  globalThis.Capacitor = { Plugins: { TextToSpeech: plugin } };
  try {
    assert.equal(nativeTts(), plugin);
    assert.equal(createSpeechPlayer().constructor.name, 'NativeTtsPlayer');
    globalThis.Capacitor = { Plugins: {}, registerPlugin: (n) => (n === 'TextToSpeech' ? plugin : null) };
    assert.equal(nativeTts(), plugin);          // fallback path when Plugins is not pre-populated
  } finally { delete globalThis.Capacitor; }
});
