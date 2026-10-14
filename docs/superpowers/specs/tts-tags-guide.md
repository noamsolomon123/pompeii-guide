# Spoken-script guide v2 — Gemini 3.8 Flash TTS tags + audio-first Hebrew

Binding for every edit of `open30`, `deep`, `look_for`, `next_nav` in `content/stops/*.json`.
Replaces the v1 rules in `docs/superpowers/plans/2026-09-11-p2-content.md` §"Hebrew style guide" where they conflict.
Reference stop written to this guide: `content/stops/fugitives.json`.
Sources: ai.google.dev/gemini-api/docs/speech-generation, ai.google.dev/gemini-api/docs/models/gemini-3.8-flash-tts, openrouter.ai/docs/guides/overview/multimodal/tts (all read 2026-09-27).

## 1. How Gemini 3.8 Flash TTS reads our text

- **Verbatim.** Every character in the field is spoken except `<tag>`s. Stage directions ("בקול שקט:"), `[brackets]`, parentheses and Latin glosses are read aloud. 3.1 accepted inline directions; 3.8 does not.
- **Inline tags** = point-in-time vocal events or pauses. Angle brackets, **English tag names even inside Hebrew** (Google's instruction for non-English transcripts). Allowlist in `www/lib/tts-tags.js`; `npm run check:stops` rejects anything else (typos like `<laugge>` included).
- **Sustained delivery** (mood, pace, volume for the whole field) is not a tag. It goes in `speech_metadata.style`, which we store per stop as optional `tts_style` (English, ≤ 12 words). OpenRouter path: `provider.options["google-ai-studio"].speech_metadata.style` — `buildSpeech({ style })` does this.
- Google: "most requests need no style at all". Leave `tts_style` out unless the whole stop needs a different delivery than the default warm guide (e.g. the victims). Never put accent/age/gender in style — that is the voice's job (Kore).
- No capitals in Hebrew, so emphasis comes from word order (key word last), a short sentence, or `<short pause>` before the key word.
- Max input 8,192 tokens per request: every field fits in one call.

## 2. Tag palette for this guide

Use only these in stop scripts (the validator allows the full Google list, the guide does not):

| Tag | When | Example |
|---|---|---|
| `<short pause>` | Before a reveal or punchline; after "דמיינו". The workhorse. | `ומה נמצא בתוך הגבס? <short pause> העצמות עצמן.` |
| `<long pause>` | Max 1 per stop. Let a heavy line land, or give time to look. | `ניקח רגע של שקט. <long pause>` |
| `<chuckle>` | Light amusement: graffiti, ancient jokes, irony. The guide's default laugh. | `מישהו כתב כאן ביקורת על המלצר. <chuckle>` |
| `<laugh>` | Rare, genuinely funny line. Max 1 per stop, a handful per tour. | |
| `<sigh>` | Melancholy, or wry resignation. Never on a neutral fact. | `<sigh> שלושה עשר מהם נשארו כאן.` |
| `<exhales>` | After a sobering number; softer than sigh. | |
| `<breath>` | Before launching a long dramatic passage. Rare. | `<breath> בואו נחזור לבוקר ההוא.` |
| `<tsk>` | Mild disapproval (cheating, a riot, a botched restoration). Rare. | |

Never: `<scream>`, `<shout>`, `<cry>`, `<sob>`, `<gasp>`, `<moan>`, `<whispers>` (semantics unverified), coughs/sneezes/yawns, backchannels `|...|` (multi-speaker only), sound effects.

Rules:
1. The tag sits exactly where the sound happens: `<chuckle>` right after the funny words; `<sigh>` right before the sad sentence; pauses between sentences or before the key word, never inside a name.
2. Never two tags in a row (validator error). Never open `open30` with a tag — the place name is the first thing heard.
3. Budget (validator warns above): `open30` 0–3, `deep` 2–6, `look_for` 0–1, `next_nav` 0.
4. Every tag must be justified by the words around it. If you can't say why a guide would sigh there, delete it. A stop with only pauses is fine.
5. Tags are not words: word limits count `stripTags(text)`.

## 3. Script craft v2 (what changed from v1 and why)

v1 problems fixed here:
- **Double depth offer.** Every v1 `open30` ended "רוצים שאעמיק? תגידו לי." and then the app speaks "רוצים שאעמיק?" (`www/app.js` depthOffer). Now: no invitation or offer in `open30` (validator error).
- **Spoken Latin glosses.** "(Casa dei Vettii)" is read aloud in Italian mid-sentence. The card shows `name_en`. Now: no Latin letters and no parentheses in any spoken field (validator error).
- **Encyclopedia density.** Back-to-back numbers and excavation-date lists can't be held by ear. Now: max one number per sentence, ~3 per `open30`; excavation dates only when they are part of the story; one vivid comparison beats two figures.
- **Flat openings** ("הנה X", "אנחנו ב־X"). Now: name + hook together, name within the first ~6 words (it also confirms the identification to the listener).

Rules:
1. **Ear first.** 6–16 words per sentence, varied. One idea per sentence. New or important word at the end of the sentence (Hebrew end-focus). Commas where a speaker breathes.
2. **See → story.** Anchor each beat on something visible now (from `cues` / research "What you see"). Never invent a direction, position or object not in research.
3. **People over data.** A named person, their trade, what was at stake.
4. **`open30`** (70–100 words, validator 60–110): (1) place name + hook, (2) what it was and who was here, (3) one striking fact, (4) what to look at right now. End on the look instruction or a strong image — not an offer.
5. **`deep`** (230–300 words, validator 200–320): story arc — before → the people → art/technology → AD 62 / AD 79 → excavation only if it is part of the story → a debate or recent discovery → closing image that sends the eyes back to the place. Don't repeat `open30` sentences. Spoken signposts ("ועכשיו, לחלק המוזר.", "אבל רגע.") sparingly.
6. **Honest uncertainty, spoken naturally:** "כנראה", "יש ויכוח", "לפי מי שחפר כאן". Every caveat in `notes` that v1 honoured stays honoured (contested superlatives stay "אחד ה…", single-source finds stay "ייתכן").
7. **Numbers:** in words, except years as digits ("בשנת 79 לספירה" on first mention). No abbreviations (לפנה"ס, וכו'), no slashes, no digits for measurements.
8. **Punctuation for rhythm:** commas and periods; " — " for an aside; "..." at most once per stop, for suspense. No exclamation marks. No parentheses.
9. **Register:** Israeli spoken Hebrew, addressing a couple (אתם, תסתכלו, שימו לב), present tense. Avoid bookish "אשר", "הינו", "כמו כן", "יש לציין". "מדהים/מרהיב/עוצר נשימה" max once per stop. No English words.
10. **Facts:** every claim traceable to `content/research/<id>.md` or the v1 JSON. Add nothing new. Cutting is allowed — less is more.
11. **`look_for`:** 1–3 sentences: where + what + why it matters. 0–1 tag.
12. **`next_nav`:** keep destination, direction and minutes exactly. May smooth wording. Starts "הבא במסלול:", ends with ".", no tags.
13. Don't touch other fields (`cues`, `faq`, `anecdotes`, `sources`, gps, names). `tts_style` optional (see §1).

## 4. Rendering (for P2 Task 8, `scripts/tts.mjs`)

- Read **`content/stops/*.json`** (tagged). `www/stops.json` is built with tags stripped (`toOutputStop`), so the native-TTS fallback, the screen and the Q&A context never see `<sigh>`.
- Gemini 3.8: send text as-is + voice + `style` = stop `tts_style` (else the default chosen in the bake-off, or none).
- Any other provider (OpenAI, ElevenLabs v2): send `stripTags(text)` — they would speak the tags.
- Ear-check every MP3. Tag behaviour inside Hebrew is untested by Google's published evals (none cover Hebrew). If a tag is spoken as a word, or sounds wrong, delete it for that stop and re-render.

## 5. Measured (2026-09-27, 9 samples via Gemini API direct, round-trip transcribed by gemini-2.5-flash)

Samples: `docs/tts-samples/index.html` (WAV, gitignored). Cost $0.11 for 6.5 min of audio.
- No tag was ever spoken as a word. `<chuckle>` and `<laugh>` render as real laughs, in the right spot, in Kore, Sulafat and Sadaltager. Achird skipped the `<chuckle>` (rendered a breath).
- `<sigh>` comes out soft, closer to a breath. `<long pause>` ≈ 2 s. `<short pause>` sometimes adds a breath.
- `tts_style` "quiet, gentle…" (fugitives) may have split "הנמלטים" into two chunks. Compare clips 06 and 07 by ear before keeping the style.
- `open30` runs 40–50 s at the Kore pace (~2 Hebrew words per second), not 30 s. The whole tour ≈ 80 min ≈ 125k audio tokens ≈ $1.1 at the launch price.
- Direct API: `POST https://generativelanguage.googleapis.com/v1beta/interactions` with `{ model, input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style }] }] }], response_format: { type: 'audio' }, generation_config: { speech_config: [{ voice }] } }` → `steps[].content[]` item `{ type: 'audio', mime_type: 'audio/wav', data: <base64> }` (24 kHz mono 16-bit).
