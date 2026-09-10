// www/lib/vision.js
import { OR, headers } from './voice/openrouter-messages.js';

export function buildVisionRequest({ model, candidates, imageDataUrl }) {
  const list = candidates.map(c => `${c.id}: ${c.name_en} (${(c.cues || []).join(', ')})`).join('\n');
  const text = `This photo was taken in Pompeii near one of these places:\n${list}\nAnswer with exactly one id from the list, or "none" if it is clearly none of them. No other words.`;
  return { model, messages: [{ role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: imageDataUrl } }] }], max_tokens: 20 };
}
export function parseVisionAnswer(answer, candidates) {
  const a = (answer || '').trim().toLowerCase().replace(/[."']/g, '');
  const hit = candidates.find(c => c.id === a || c.name_en.toLowerCase() === a);
  return hit ? hit.id : null;
}
// Online path. Returns candidate id or null. Throws on network/API failure (caller falls back to GPS).
export async function identifyByVision({ apiKey, model, candidates, imageDataUrl }) {
  const res = await fetch(OR.chat, { method: 'POST', headers: headers(apiKey), body: JSON.stringify(buildVisionRequest({ model, candidates, imageDataUrl })) });
  if (!res.ok) throw new Error(`vision ${res.status}`);
  const j = await res.json();
  return parseVisionAnswer(j.choices?.[0]?.message?.content, candidates);
}
