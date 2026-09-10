// www/lib/voice/factory.js
import { GeminiLiveClient } from './gemini-live.js';
import { OpenAIRealtimeClient } from './openai-realtime.js';
import { PipelineClient } from './pipeline.js';

export function createVoiceClient(settings, systemPrompt) {
  const backend = settings.get('backend'), models = settings.get('models'), voices = settings.get('voices'), keys = settings.get('keys');
  if (backend === 'openai') return new OpenAIRealtimeClient({ apiKey: keys.openai, model: models.openai, voice: voices.openai, systemPrompt });
  if (backend === 'gemini') return new GeminiLiveClient({ apiKey: keys.gemini, model: models.gemini, voice: voices.gemini, systemPrompt });
  return new PipelineClient({ apiKey: keys.openrouter, llmModel: models.pipelineLlm, sttModel: models.pipelineStt, ttsModel: models.pipelineTts, voice: voices.pipeline, systemPrompt });
}
