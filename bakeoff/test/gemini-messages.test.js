// bakeoff/test/gemini-messages.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSetup, buildAudioChunk, buildTextTurn, parseServerMessage, wsUrl } from '../lib/gemini-messages.js';

test('wsUrl embeds key', () => {
  assert.equal(wsUrl('K1'),
    'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=K1');
});

test('buildSetup has model, AUDIO modality, voice, system prompt', () => {
  const m = buildSetup({ model: 'gemini-2.5-flash-native-audio-preview-12-2025', voice: 'Kore', systemPrompt: 'hi' });
  assert.equal(m.setup.model, 'models/gemini-2.5-flash-native-audio-preview-12-2025');
  assert.deepEqual(m.setup.generationConfig.responseModalities, ['AUDIO']);
  assert.equal(m.setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Kore');
  assert.equal(m.setup.systemInstruction.parts[0].text, 'hi');
  assert.ok(m.setup.inputAudioTranscription);
  assert.ok(m.setup.outputAudioTranscription);
});

test('buildAudioChunk wraps base64 pcm16 at 16k', () => {
  const m = buildAudioChunk('AAAA');
  assert.equal(m.realtimeInput.audio.data, 'AAAA');
  assert.equal(m.realtimeInput.audio.mimeType, 'audio/pcm;rate=16000');
});

test('buildTextTurn sends a user turn and marks it complete', () => {
  const m = buildTextTurn('שלום');
  assert.equal(m.clientContent.turns[0].role, 'user');
  assert.equal(m.clientContent.turns[0].parts[0].text, 'שלום');
  assert.equal(m.clientContent.turnComplete, true);
});

test('parseServerMessage extracts audio, interrupted, transcripts, turnComplete, setupComplete', () => {
  assert.deepEqual(parseServerMessage({ setupComplete: {} }), { setupComplete: true, audio: [], interrupted: false, turnComplete: false, userText: null, modelText: null });
  const r = parseServerMessage({ serverContent: {
    modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'QUJD' } }] },
    outputTranscription: { text: 'ok' }, inputTranscription: { text: 'hi' }, interrupted: true, turnComplete: true } });
  assert.deepEqual(r.audio, ['QUJD']);
  assert.equal(r.interrupted, true);
  assert.equal(r.turnComplete, true);
  assert.equal(r.userText, 'hi');
  assert.equal(r.modelText, 'ok');
  assert.equal(r.setupComplete, false);
});
