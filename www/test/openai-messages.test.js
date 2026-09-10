// bakeoff/test/openai-messages.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionUpdate, buildTextTurn, buildResponseCreate, parseServerEvent, callsUrl } from '../lib/voice/openai-messages.js';

test('callsUrl includes model', () => {
  assert.equal(callsUrl('gpt-realtime-2'), 'https://api.openai.com/v1/realtime/calls?model=gpt-realtime-2');
});

test('buildSessionUpdate sets instructions, voice, server_vad, transcription', () => {
  const m = buildSessionUpdate({ instructions: 'hi', voice: 'marin' });
  assert.equal(m.type, 'session.update');
  assert.equal(m.session.type, 'realtime');
  assert.equal(m.session.instructions, 'hi');
  assert.equal(m.session.audio.output.voice, 'marin');
  assert.equal(m.session.audio.input.turn_detection.type, 'server_vad');
  assert.equal(m.session.audio.input.transcription.model, 'gpt-4o-mini-transcribe');
  assert.equal(m.session.audio.input.transcription.language, 'he');
});

test('buildTextTurn + buildResponseCreate', () => {
  const t = buildTextTurn('שלום');
  assert.equal(t.type, 'conversation.item.create');
  assert.equal(t.item.role, 'user');
  assert.equal(t.item.content[0].type, 'input_text');
  assert.equal(t.item.content[0].text, 'שלום');
  assert.deepEqual(buildResponseCreate(), { type: 'response.create' });
});

test('parseServerEvent maps transcripts and errors', () => {
  assert.deepEqual(parseServerEvent({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'hi' }),
    { userText: 'hi', modelText: null, error: null, speechStarted: false });
  assert.deepEqual(parseServerEvent({ type: 'response.output_audio_transcript.done', transcript: 'ok' }),
    { userText: null, modelText: 'ok', error: null, speechStarted: false });
  assert.deepEqual(parseServerEvent({ type: 'error', error: { message: 'bad' } }),
    { userText: null, modelText: null, error: 'bad', speechStarted: false });
  assert.deepEqual(parseServerEvent({ type: 'input_audio_buffer.speech_started' }),
    { userText: null, modelText: null, error: null, speechStarted: true });
});
