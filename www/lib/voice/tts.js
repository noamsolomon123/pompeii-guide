// bakeoff/lib/tts.js
import { OR, headers, buildSpeech } from './openrouter-messages.js';

// OpenAI and Gemini voices both billed on the OpenRouter wallet.
export async function openrouterTts({ apiKey, text, model, voice }) {
  const res = await fetch(OR.speech, { method: 'POST', headers: headers(apiKey), body: JSON.stringify(buildSpeech({ model, text, voice })) });
  if (!res.ok) throw new Error(`openrouter tts ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return URL.createObjectURL(await res.blob());
}

export const TTS_PRESETS = {
  openai: { model: 'openai/gpt-4o-mini-tts-2025-12-15', voice: 'alloy' },
  gemini: { model: 'google/gemini-3.1-flash-tts-preview', voice: 'Kore' }
};

export async function elevenTts({ apiKey, text, voiceId = 'JBFqnCBsd6RMkjVDRZzb', model = 'eleven_multilingual_v2' }) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: model })
  });
  if (!res.ok) throw new Error(`elevenlabs tts ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return URL.createObjectURL(await res.blob());
}
