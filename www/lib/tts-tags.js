// www/lib/tts-tags.js
// Inline vocal tags for Gemini 3.8 Flash TTS (<sigh>, <chuckle>, <short pause>, ...).
// Tags live in content/stops/*.json so the MP3 render hears them; everything else
// (www/stops.json, native TTS fallback, Q&A context) gets stripTags() text.
// Syntax per ai.google.dev/gemini-api/docs/speech-generation: angle brackets, English
// tag names even inside non-English text. Sustained delivery goes in speech_metadata.style.

export const TTS_TAGS = new Set([
  'argh', 'breath', 'heavy breath', 'exhales', 'cackle', 'cheer', 'chuckle', 'chuckles', 'cough', 'cry',
  'gasp', 'giggle', 'groan', 'growl', 'grunt', 'grr', 'hiss', 'laugh', 'laughter', 'moan', 'pant',
  'pff', 'phew', 'scream', 'shout', 'shriek', 'sigh', 'sighs', 'sneeze', 'snicker', 'snort', 'sob',
  'throat-clearing', 'tsk', 'whimper', 'whispers', 'whispering', 'yawn',
  'short pause', 'long pause',
]);

const TAG_RE = /<([^<>]*)>/g;

export function findTags(text) {
  return [...String(text ?? '').matchAll(TAG_RE)].map((m) => m[1].trim());
}

export function stripTags(text) {
  return String(text ?? '')
    .replace(TAG_RE, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim();
}

export function tagProblems(text) {
  const t = String(text ?? '');
  const out = [];
  for (const tag of findTags(t)) if (!TTS_TAGS.has(tag)) out.push(`unknown tag <${tag}>`);
  if (/\[[^\]]*\]/.test(t)) out.push('square-bracket direction (3.8 reads it aloud; use <tag> or tts_style)');
  if (/\|[^|]+\|/.test(t)) out.push('backchannel |...| is multi-speaker only');
  if (/[<>]/.test(t.replace(TAG_RE, ''))) out.push('stray < or >');
  if (/<[^<>]*>\s*<[^<>]*>/.test(t)) out.push('adjacent tags with no speech between');
  return out;
}
