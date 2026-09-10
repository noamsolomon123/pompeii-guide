// bakeoff/test/openrouter-messages.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { OR, headers, buildTranscription, buildChat, buildSpeech } from '../lib/voice/openrouter-messages.js';

test('endpoints', () => {
  assert.equal(OR.transcriptions, 'https://openrouter.ai/api/v1/audio/transcriptions');
  assert.equal(OR.chat, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(OR.speech, 'https://openrouter.ai/api/v1/audio/speech');
});

test('headers carry bearer key and json', () => {
  assert.deepEqual(headers('K'), { Authorization: 'Bearer K', 'Content-Type': 'application/json' });
});

test('buildTranscription sends base64 wav with Hebrew hint', () => {
  const b = buildTranscription({ model: 'openai/whisper-large-v3-turbo', base64Wav: 'AAAA' });
  assert.deepEqual(b, { model: 'openai/whisper-large-v3-turbo', input_audio: { data: 'AAAA', format: 'wav' }, language: 'he' });
});

test('buildChat prepends system prompt and keeps history order', () => {
  const b = buildChat({ model: 'google/gemini-2.5-flash', systemPrompt: 'S', history: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] });
  assert.equal(b.model, 'google/gemini-2.5-flash');
  assert.deepEqual(b.messages, [{ role: 'system', content: 'S' }, { role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }]);
  assert.equal(b.max_tokens, 300);
});

test('buildSpeech requests mp3 with voice', () => {
  assert.deepEqual(buildSpeech({ model: 'openai/gpt-4o-mini-tts-2025-12-15', text: 'שלום', voice: 'alloy' }),
    { model: 'openai/gpt-4o-mini-tts-2025-12-15', input: 'שלום', voice: 'alloy', response_format: 'mp3' });
});
