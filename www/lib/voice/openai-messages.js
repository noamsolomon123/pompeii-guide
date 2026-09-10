// bakeoff/lib/openai-messages.js
// Pure builders/parsers for the OpenAI Realtime API (GA event shapes).

export function callsUrl(model) {
  return `https://api.openai.com/v1/realtime/calls?model=${model}`;
}

export function buildSessionUpdate({ instructions, voice }) {
  return {
    type: 'session.update',
    session: {
      type: 'realtime',
      instructions,
      audio: {
        input: {
          turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 500 },
          transcription: { model: 'gpt-4o-mini-transcribe', language: 'he' }
        },
        output: { voice }
      }
    }
  };
}

export function buildTextTurn(text) {
  return { type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } };
}

export function buildResponseCreate() {
  return { type: 'response.create' };
}

export function parseServerEvent(ev) {
  const out = { userText: null, modelText: null, error: null, speechStarted: false };
  switch (ev.type) {
    case 'conversation.item.input_audio_transcription.completed': out.userText = ev.transcript ?? null; break;
    case 'response.output_audio_transcript.done': out.modelText = ev.transcript ?? null; break;
    case 'input_audio_buffer.speech_started': out.speechStarted = true; break;
    case 'error': out.error = ev.error?.message ?? 'unknown error'; break;
  }
  return out;
}
