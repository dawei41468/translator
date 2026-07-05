# First-Principles Redesign: Practice + Multi-User Rooms

**Date**: 2026-07-04  
**Status**: Practice implemented and polished (July 2026). Rooms architecture pending implementation.
**Context**: Moving beyond the original 3-pillar (STT + Translation + TTS) architecture now that true speech-to-speech (Grok Voice `grok-voice-think-fast-1.0`) is available. User is willing to change the message UI and re-shape features.

## Status Update (July 4, 2026)

**Done**:
- ✅ Practice mode fully implemented and working with direct Grok Voice S2S.
- ✅ Replaced old "solo mode" toggle with dedicated first-class `/practice` experience.
- ✅ Complete removal of Google Cloud dependencies across backend/frontend.
- ✅ Grok Voice ephemeral token backend + realtime client integration.
- ✅ Input transcription + output translated text + spoken audio working.
- ✅ Bottom nav, routing, and basic UI in place.
- ✅ Practice polish: real-time microphone waveform visualizer, improved live transcription streaming, explicit error-state UI with retry, and AudioWorklet playback path with legacy fallback.

**Still Left to Implement** (see sections below):
- Full multi-user Rooms redesign with language-aware delivery.
- Selective spoken audio (only cross-language) + text for same-language.
- New voice-centric UI for rooms (utterance cards instead of traditional bubbles).
- Per-speaker or orchestrated Voice sessions for rooms.
- Integration of rooms architecture into actual code (currently design doc only).

## 1. Locked Naming

- The dedicated solo/testing + learning experience is now called **Practice**.
- Accessed via bottom nav (Mic icon).
- Route: `/practice`
- Purpose:
  - Quick solo testing of the voice pipeline.
  - Language learning tool: Speak in home language → hear natural spoken translation in target language.

## 2. High-Level Structure

- **Practice** (`/practice`): Dedicated, first-class experience. Voice-first loop. Optimized for direct speech-to-speech.
- **Rooms** (`/room/:code`): Real multi-person conversations only. 2+ participants. Language-aware delivery.
- Dashboard remains for room creation/joining + history.
- Bottom Nav: Dashboard | Practice | Profile

This separation allows:
- Practice to be pure and aggressive with the new Grok Voice model.
- Rooms to be designed around the specific multi-language UX rules without solo-mode pollution.

## 3. First-Principles Architecture for Rooms (Multi-User)

### Core Product Rules (from user spec)

- Minimum 2 people (easy 1:1 supported, groups too).
- Example scenario: 1 Chinese speaker + 2 Italian speakers.
  - Chinese speaks → Both Italians hear **spoken Italian** + see Italian text.
  - Italian speaks → Other Italian sees **Italian text only** (no audio).
  - Chinese hears **spoken Chinese** + Chinese text.

**Generalized rule**:
- **Text** is always delivered in the listener's chosen language.
- **Spoken audio** is delivered **only** when the listener's language differs from the speaker's language.
- Same-language participants receive clean transcription text (high quality source or lightly processed).
- Cross-language participants receive spoken natural translation + text in their language.

This minimizes unnecessary audio playback and respects that same-language listeners don't need re-synthesis.

### Why First Principles?

Old flow (socket chunks → STT → transcript-handler grouping → per-lang translation → client TTS) was solid when tools were separate stages.

New flow should optimize for:
- Natural prosody and low latency via end-to-end speech-to-speech where possible.
- Model handles understanding + translation + expressive speech internally.
- Text layer remains lightweight for UI, history, accessibility, and same-lang cases.
- Preserve rooms, auth, participants, QR, per-user language prefs.

### Proposed Architecture (Hybrid S2S + Text Coordination)

**Control Plane**: Keep Socket.io (or evolve to it) for:
- Room presence, join/leave.
- Participant language preferences.
- Text message fan-out (lightweight).
- Coordination signals (who is speaking, utterance IDs).

**Voice Plane**: Grok Voice realtime WebSocket sessions (`wss://api.x.ai/v1/realtime?model=grok-voice-think-fast-1.0`).

Options for voice handling (tradeoffs to evaluate):

**Option A: Per-Speaker Voice Sessions (Recommended starting point)**
- When a user starts speaking, their client (or server-proxied) opens/uses a Grok Voice session.
- Session instructions (dynamic):
  ```
  You are a real-time translator in a group conversation.
  Speaker is using {sourceLang}.
  For listeners using different languages, produce natural spoken translation in their language.
  Output both:
  - High-quality transcript in source language.
  - Translated text + spoken audio targeted per language group.
  Preserve tone, be concise and conversational.
  ```
- The model can be instructed to support multiple output "tracks" or we post-process events.
- Server listens to events from the session(s) and routes:
  - Source transcript + translated text via Socket.io to relevant users.
  - Audio deltas streamed only to users who need spoken output (via Socket.io or separate WebRTC/data if we add).
- Benefits: Model does the heavy translation + speech in one pass. Good naturalness.
- For same-lang: Just forward the source transcript text (no audio).

**Option B: Per-Listener Targeted Sessions**
- For each cross-language listener, a dedicated lightweight session or instruction update that says "translate incoming to my language".
- More sessions = more cost, but simpler routing per target.
- Good for small groups (like the 1+2 example).

**Option C: Hybrid with Standalone STT + S2S for Output**
- Use high-quality Grok STT for accurate source transcripts (we already have this engine).
- Feed transcript + context into a Grok Voice session configured purely for "speak this translation naturally in {target}".
- This re-uses existing STT strengths while using S2S for the voice output quality.

**Recommendation for MVP of redesign**: Start with **Option A (Per-Speaker)** + server-side orchestration that decides audio vs text-only per recipient. Use the model's event output for both transcript and translations.

### Text + Audio Delivery Flow (New)

1. User starts speaking → client begins audio capture (reuse/extend `useSpeechEngine` VAD + recorder logic) + signals "speaking" via socket.
2. Audio streamed to Grok Voice session (directly from client with ephemeral token, or server-relayed for simplicity/auth).
3. Model produces:
   - Transcript (source lang)
   - Translations (per target lang needed)
   - Audio deltas (for speech output)
4. Server (or client coordination) fans out:
   - To same-lang listeners: `{ type: "transcript", text: "...", lang: "it", speaker: "..." }` → show text only.
   - To cross-lang: `{ type: "translated", original: "...", translated: "...", lang: "zh", audio?: deltas }` → show text + play audio.
5. Client handles playback selectively (only when audio provided for their lang).

**Utterance ID** ties text and audio together for UI.

### Solo/Practice vs Rooms

- Practice: Single user. Direct 1:1 S2S session with fixed home→target instruction. No fan-out. Pure loop. Minimal UI.
- Rooms: Multi. Orchestrated sessions + selective delivery as above.

This respects the user's description perfectly.

### Persistence & State

- Rooms stay ephemeral (24h cleanup).
- Utterances can be stored lightly for recent history if desired (optional).
- User language pref still drives default target.

### Migration Notes from Current Codebase

- Deprecate `soloMode` / `soloTargetLang` everywhere.
- `transcript-handler.ts` will evolve or be replaced by voice session event handlers + new delivery logic.
- Keep registries for now (or simplify) as we may still use standalone STT/TTS as fallbacks.
- `useSpeechEngine.ts` can be refactored: Practice uses different capture/playback loop; rooms use selective audio.
- Socket events can be extended: `start-utterance`, `utterance-text`, `utterance-audio` (selective).

## 4. Next Steps (Implementation Order)

1. (Done in this pass) Name locked + Basic Practice scaffold + nav.
2. Flesh out Practice with real Grok Voice integration (direct realtime WS, proper instructions, audio streaming + playback).
3. Prototype room voice orchestration (start with 1:1, then the 1+2 group case).
4. Redesign room message UI (see separate section).
5. Update backend transcript/voice handling.
6. Tests + i18n for new flows.

## Open Questions

- Ephemeral tokens vs server-relayed audio for client-direct voice sessions?
- How much text history to keep visible in rooms?
- Should same-lang listeners see the original source text or a cleaned version?
- Cost monitoring for voice minutes in groups.

## 5. Proposed New Message UI Concept for Rooms (Voice-Centric)

Since we are willing to change the current message UI (traditional chat bubbles driven by translated text), here is a first-principles proposal tailored to the language-aware rules.

### Goals for New UI
- Prioritize **voice presence** and **live understanding**.
- Text supports but does not dominate (especially for same-lang).
- Clearly distinguish "this was spoken for me" vs "transcript for reference".
- Reduce visual noise in groups (1 speaker + multiple listeners in different langs).
- Mobile-first, glanceable.
- Support the exact behavior: selective audio + always text in listener lang.

### High-Level Layout (per room)

**Header** (keep similar to current RoomHeader):
- Room code / QR
- Participant list with flags + language (e.g. "🇨🇳 Zhang (中文)", "🇮🇹 Marco (Italiano)", "🇮🇹 Lucia (Italiano)")

**Main Area** — "Live Conversation" instead of scrollable message list:
- Vertical timeline of **utterances** (not per-person bubbles).
- Each utterance card:
  - Speaker avatar/name + flag + timestamp
  - **Source line** (small, muted): original language snippet (for reference)
  - **Your view** (prominent):
    - If same language as speaker: Large, clean text of the transcription in your language.
    - If different: Translated text in your language + "Play" control / auto-play indicator.
  - Audio status (only for cross-lang):
    - Waveform or pulsing "Speaking in your language" while audio plays.
    - Manual replay button.
  - Optional: Tap to expand full original + your translation side-by-side.

**Example for 1 Chinese + 2 Italians**:

Utterance 1 (Zhang speaking Chinese):
- Zhang 🇨🇳: "你好，今天天气不错。"
- For Italians:
  - "Ciao, il tempo oggi è bello." (prominent)
  - [▶︎ Playing spoken Italian] (waveform)
- For Chinese (if listening back): source text only or nothing special.

Utterance 2 (Marco speaking Italian):
- Marco 🇮🇹: "Sì, andiamo a fare una passeggiata?"
- For other Italian (Lucia):
  - "Sì, andiamo a fare una passeggiata?" (clean, same-lang transcript — no audio)
- For Chinese:
  - "是的，我们去散步吗？" (prominent translated text)
  - [▶︎ Spoken Chinese playing]

**Footer / Controls**:
- Big mic (same as current, but now only for rooms).
- Audio toggle (global for the room? or per-utterance).
- Language quick-switch (if user wants to temporarily hear in another lang — advanced).

### Component Ideas (to implement later)

- `UtteranceCard.tsx` (new) — replaces or augments MessageList.
- `LanguageAwareText.tsx` — handles source vs target rendering + audio attachment.
- `VoicePresence.tsx` — shows who is currently speaking + which languages are receiving audio.
- Keep `MessageList` for history if we want a "transcript view" toggle.

### Why This Over Current Bubbles?

Current system (MessageList + bubbles) was built around "every translation is a chat message". 

New model:
- Treats speech as the primary event.
- Text is a **view** of that event filtered by language.
- Audio is an **optional enhancement** only when it adds value (cross-lang).
- Feels more like a live translated meeting than a group chat.

This aligns with first-principles + speech-to-speech strengths: the model produces natural speech; the UI surfaces it selectively.

### Visual / Interaction Polish Ideas
- Subtle language badges on cards.
- Auto-scroll to latest utterance.
- Haptics on new spoken translation start.
- Collapse long utterances.
- "Only show my language" filter (default on).

---

*This document is the working spec. Update as we implement. Follow CODEBASE-PATTERNS for new code.*
