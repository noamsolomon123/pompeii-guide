// bakeoff/lib/openrouter-messages.js
// Pure builders for OpenRouter request bodies. No fetch here.

export const OR = {
  transcriptions: 'https://openrouter.ai/api/v1/audio/transcriptions',
  chat: 'https://openrouter.ai/api/v1/chat/completions',
  speech: 'https://openrouter.ai/api/v1/audio/speech'
};

export function headers(apiKey) {
  return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
}

export function buildTranscription({ model, base64Wav }) {
  return { model, input_audio: { data: base64Wav, format: 'wav' }, language: 'he' };
}

export function buildChat({ model, systemPrompt, history }) {
  return { model, messages: [{ role: 'system', content: systemPrompt }, ...history], max_tokens: 300 };
}

// Gemini 3.8 reads `input` verbatim (inline <tags> only); sustained delivery goes in speech_metadata.style.
export function buildSpeech({ model, text, voice, style }) {
  const body = { model, input: text, voice, response_format: 'mp3' };
  if (style && model.startsWith('google/')) body.provider = { options: { 'google-ai-studio': { speech_metadata: { style } } } };
  return body;
}
