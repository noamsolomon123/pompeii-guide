// bakeoff/lib/gemini-messages.js
// Pure builders/parsers for the Gemini Live (BidiGenerateContent) protocol.

export function wsUrl(apiKey) {
  return `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
}

export function buildSetup({ model, voice, systemPrompt }) {
  return {
    setup: {
      model: `models/${model}`,
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
      },
      systemInstruction: { parts: [{ text: systemPrompt }] },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: { automaticActivityDetection: {} }
    }
  };
}

export function buildAudioChunk(base64Pcm16) {
  return { realtimeInput: { audio: { data: base64Pcm16, mimeType: 'audio/pcm;rate=16000' } } };
}

export function buildTextTurn(text) {
  return { clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } };
}

export function parseServerMessage(msg) {
  const out = { setupComplete: false, audio: [], interrupted: false, turnComplete: false, userText: null, modelText: null };
  if (msg.setupComplete) out.setupComplete = true;
  const sc = msg.serverContent;
  if (sc) {
    for (const p of sc.modelTurn?.parts ?? []) {
      if (p.inlineData?.data && (p.inlineData.mimeType || '').startsWith('audio/')) out.audio.push(p.inlineData.data);
    }
    out.interrupted = !!sc.interrupted;
    out.turnComplete = !!sc.turnComplete;
    out.userText = sc.inputTranscription?.text ?? null;
    out.modelText = sc.outputTranscription?.text ?? null;
  }
  return out;
}
