// www/lib/vision.js
import { OR, headers } from './voice/openrouter-messages.js';

export function buildVisionRequest({ model, candidates, imageDataUrl }) {
  const list = candidates.map(c => `${c.id}: ${c.name_en} (${(c.cues || []).join(', ')})`).join('\n');
  const text = `This photo was taken in Pompeii near one of these places:\n${list}\nAnswer with exactly one id from the list, or "none" if it is clearly none of them. No other words.`;
  return {
    model,
    messages: [{ role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: imageDataUrl } }] }],
    max_tokens: 64,
    reasoning: { exclude: true, effort: 'low' }   // OpenRouter: don't bill/stall on a hidden chain of thought
  };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const asWord = (w) => new RegExp(`(^|[^a-z0-9])${escapeRe(w.toLowerCase())}($|[^a-z0-9])`, 'i');

// Models wrap the answer ("**forum**", "id: jupiter", "The Forum."). Prefer a line that is
// exactly an id/name; otherwise take the first candidate whose id or name appears as a whole word.
export function parseVisionAnswer(answer, candidates) {
  const clean = String(answer ?? '').replace(/[*`"'“”]/g, ' ').toLowerCase();
  if (!clean.trim()) return null;
  for (const raw of clean.split('\n')) {
    const line = raw.replace(/^\s*(id|answer|stop)\s*[:=]\s*/, '').replace(/[.,;:!?\s]+$/, '').trim();
    if (!line) continue;
    const hit = candidates.find(c => c.id.toLowerCase() === line || c.name_en.toLowerCase() === line);
    if (hit) return hit.id;
    if (line === 'none') return null;
  }
  if (asWord('none').test(clean)) return null;
  const hit = candidates.find(c => asWord(c.id).test(clean)) || candidates.find(c => asWord(c.name_en).test(clean));
  return hit ? hit.id : null;
}

// Online path. Returns candidate id or null. Throws on network/API failure (caller falls back to GPS).
export async function identifyByVision({ apiKey, model, candidates, imageDataUrl }) {
  const res = await fetch(OR.chat, { method: 'POST', headers: headers(apiKey), body: JSON.stringify(buildVisionRequest({ model, candidates, imageDataUrl })) });
  if (!res.ok) throw new Error(`vision ${res.status}`);
  const j = await res.json();
  return parseVisionAnswer(j.choices?.[0]?.message?.content, candidates);
}
