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

export function buildSpeech({ model, text, voice }) {
  return { model, input: text, voice, response_format: 'mp3' };
}
