# Pompeii AI Guide — Technical Design

Date: 2026-09-10 · Status: approved (brainstorm) · Product spec: `C:\Users\noams\TRAVEL\naples\pompeii-guide\product-spec.md` · Route source of truth: `C:\Users\noams\TRAVEL\naples\pompeii-route.md`

## 1. Goal

Voice tour guide for the 24-stop Pompeii route, visit 20.10.2026, ~9:00–13:30. Tap "זהה" → photo + GPS → guide speaks Hebrew (~30s) → offers depth → voice Q&A with barge-in → navigates to next stop. Hebrew only. Pompeii only.

## 2. Locked decisions

| Topic | Decision |
|---|---|
| Device | Android only (OnePlus 15), Chrome |
| Form | **Android APK via Capacitor 8** wrapping the vanilla-JS web app in `www/` (decided 2026-09-11; PWA was only for the bake-off). Debug APK built by GitHub Actions, sideloaded to OnePlus 15. All content + audio bundled in `www/` so offline needs no service worker. WebView served as `https://localhost` (secure context → getUserMedia/WebRTC work). Manifest: CAMERA, RECORD_AUDIO, MODIFY_AUDIO_SETTINGS, ACCESS_FINE_LOCATION, INTERNET |
| Live voice backend | Decided by bake-off (P1) between three adapters: (A) OpenAI Realtime direct, (B) pipeline via OpenRouter (STT → switchable LLM → TTS, barge-in handled locally), (C) Gemini Live direct. Adapter interface keeps all three |
| Unified wallet | OpenRouter for everything request/response: vision identify, Hebrew proofreading, pipeline Q&A, STT, TTS generation. Realtime speech-to-speech cannot go through OpenRouter (verified 2026-09-10: no WebSocket/WebRTC endpoint), so A and C use their own provider keys |
| Offline core | 24 stop scripts + pre-generated Hebrew MP3 + navigation + GPS/manual identify — all cached by service worker |
| Network-only | Free-form voice Q&A (live session) and photo identify (vision call; falls back to GPS/manual offline) |
| Budget | ~$10 total credits. Live session opened only on demand, closed after 60s idle |
| Keys | Personal use. API keys in `localStorage`, direct browser calls, no server |
| Hebrew QA | Every user-facing script passes a proofreading pass through Gemini (external Hebrew tool per product spec §6) before entering the app |

## 3. Sub-projects (build order)

### P1 — Bake-off (`bakeoff/`)
Single page. Purpose: pick live voice backend and TTS voice by ear.
- Backend selector: OpenAI Realtime (`gpt-realtime-2.1` / `gpt-realtime-2.1-mini`), Gemini Live (`gemini-2.5-flash-native-audio-preview-12-2025` / `gemini-3.1-flash-live-preview`), OpenRouter pipeline (STT `openai/whisper-large-v3-turbo` → LLM of choice, default `google/gemini-2.5-flash` → TTS `openai/gpt-4o-mini-tts-2025-12-15` or `google/gemini-3.1-flash-tts-preview`).
- Preloaded guide persona + House of the Vettii context (Hebrew system prompt).
- Mic on, speak Hebrew, interrupt mid-answer, listen. Pipeline barge-in = local RMS VAD stops playback and starts recording.
- TTS panel: same 30s Vettii script rendered by OpenAI TTS and Gemini TTS (both via OpenRouter, one key) and ElevenLabs (direct, free tier) → play side by side.
- Keys: OpenAI, Gemini, OpenRouter, ElevenLabs (optional).
- Output: user's pick written into `docs/superpowers/specs/bakeoff-result.md`.

### P2 — Content pipeline (`content/`)
- `content/stops/<id>.json` per stop (24 + villa-mysteries + chaste-lovers optional). Schema:
  ```json
  {"id":"vettii","order":10,"name_he":"בית הווטי","name_en":"House of the Vettii","regio":"VI",
   "gps":[40.7503,14.4849],"gps_quality":"approx|exact|null","hours":"09:15-18:20","status":"verify_winter",
   "cues":["..."],"open30":"...","deep":"...","look_for":"...","next_nav":"הבא: תרמופוליום, 3 דק' מזרחה.",
   "faq":["..."],"sources":["url"]}
  ```
- Seed: existing `STOPS` array in `pompeii-guide/index.html` + route tables. Expand with research; cite sources.
- Proofread step: script `scripts/proofread.mjs` sends each Hebrew field to Gemini with a strict "fix grammar/naturalness, keep meaning, return only text" prompt; diff reviewed by hand before accept.
- TTS step: `scripts/tts.mjs` → `audio/<id>-open30.mp3`, `audio/<id>-deep.mp3`, `audio/<id>-nav.mp3` using the P1 winner voice.
- GPS: fill exact coords where verifiable (OSM/Wikidata); otherwise `null` — never invent.

### P3 — App (`www/` = Capacitor webDir; `android/` = generated native project)
Split: **P3a** web app core in `www/` (runs in desktop Chrome for dev, backend-agnostic, browser TTS fallback until P2 audio exists). **P3b** Capacitor wrap + GitHub Actions APK. Shared libs move from `bakeoff/lib/` to `www/lib/`; bake-off imports them from there.
Modules (plain ES modules, no framework, no bundler):
- `src/identify.js` — `identify({frame, gps}) → {stop, confidence, method}`. GPS haversine ranks stops; top 3 candidates + cues sent to vision model with the JPEG. Offline: nearest by GPS or manual picker. Manual picker always available ("זיהוי שגוי? בחר ידנית").
- `src/narrator.js` — plays cached MP3 layers. `play(stopId, layer)`, `pause()`, `resume()`, `stop()`. Emits `ended`. After `open30` → asks "רוצה שאעמיק?" (short MP3) and listens for yes/no or tap.
- `src/bargeIn.js` — mic VAD on `getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}})`, RMS threshold with 300ms hold; on trigger → `narrator.pause()` + open live turn. On-screen "שאלה" button as fallback; setting to disable VAD.
- `src/voice/adapter.js` — interface: `connect(systemContext)`, `pushContext(text)`, `startTurn()`, `interrupt()`, `onAudio`, `onTranscript`, `close()`.
  - `src/voice/openaiRealtime.js` — WebRTC to `https://api.openai.com/v1/realtime`, API key as bearer.
  - `src/voice/geminiLive.js` — WebSocket `BidiGenerateContent`, PCM16 in/out via AudioWorklet.
  - `src/voice/pipeline.js` — local VAD → OpenRouter transcription → OpenRouter chat completion (history kept) → OpenRouter TTS → `<audio>`. Any LLM switchable by model id.
  - Context per spec §8: stop record + last spoken chunk + Q&A history in session.
- `src/navigator.js` — after narration ends: play `next_nav` MP3; order from `stops.json`; villa/chaste-lovers included only when toggled in settings.
- offline — no service worker: everything in `www/` ships inside the APK. `navigator.onLine` + fetch probe before live call; offline → spoken "אין רשת כרגע".
- `src/settings.js` — keys, backend, VAD on/off, question mode (voice/button), villa toggle, entry time.
- `src/ui.js` — camera view, big זהה button, current stop card (title only; guide is voice-first), progress row of 24, settings gear.

## 4. Main flow
1. Tap זהה → capture JPEG (max 1024px) + last GPS fix.
2. `identify` → stop. Show name; `narrator.play(open30)`.
3. On end → depth offer. "כן"/tap → `play(deep)`. "לא"/silence 5s → step 5.
4. Any time: VAD/tap → pause narrator → `adapter.connect` (if not open) → user turn → answer audio → `narrator.resume()`.
5. `navigator.speak(next_nav)`. Idle. Live session auto-closes after 60s idle.

## 5. Errors
| Case | Behaviour |
|---|---|
| Wrong ID | Manual list of 24 |
| Vision call fails / offline | GPS nearest + manual list |
| Mic denied / STT noisy | Button question mode; typed question via text → adapter text turn |
| Live session fails / offline | Spoken "אין רשת כרגע, אענה כשנחזור"; narration continues |
| Key missing | Settings modal |
| Audio file missing | Browser `speechSynthesis` he-IL fallback |

## 6. Testing
- Identify: desk run over a folder of web photos per stop; log hit rate; target ≥ 20/24 with GPS hint.
- Offline: airplane mode → full narration + navigation for 3 stops.
- Barge-in: phone speaker at arm's length, interrupt mid-sentence 10×; ≥ 8 pause within 500ms, ≤ 1 false trigger per minute from own audio.
- Hebrew: every script diff from proofread step reviewed; TTS listened to at least once per stop.
- Budget: log tokens per session; dry-run 24 stops with 2 questions each stays < $5.

## 7. Out of scope
Other sites, accounts, sharing, tickets, arrival navigation, iOS.

## 8. Open items (carry to plan)
- Winter schedule check ~10.10.2026 (which stops open).
- Exact GPS for remaining stops.
- Villa dei Misteri entry 8:30 decision (settings toggle only).
