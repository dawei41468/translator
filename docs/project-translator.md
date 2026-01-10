# Live Translator — Real-Time Cross-Device Conversation Translator

**Quick Summary**: A Progressive Web App (PWA) that enables seamless two-way real-time translated conversations between two users on different devices (iOS/Android). Users join a private room, select their language, speak naturally (via device mic or Bluetooth headset), and instantly hear/see the translation in their own language through speaker or Bluetooth headset.

**Live URL**: https://translator.studiodtw.net
**Current Progress**: 100% ✅ MVP COMPLETE (Auth/infra/deploy/db/backend-core/frontend-core complete — January 6, 2026)
**Target MVP**: ✅ ACHIEVED - Ready for production deployment

**Engineering Patterns (Canonical)**: Follow existing patterns exactly (see `CODEBASE-PATTERNS.md`) for coding conventions, API design, auth, deployment, and architectural decisions.

## Core Philosophy (User-First)

1. Conversations feel natural — minimal latency, no awkward button presses.
2. Works across platforms — iOS Safari + Android Chrome, installable as PWA.
3. Privacy by design — no audio stored, no transcripts saved unless explicitly opted-in later.
4. One device per user — each participant uses their own phone; translation happens live across devices.
5. OS-level audio routing — output follows device system settings (speaker/Bluetooth/headphones); app provides simple audio on/off toggle.

## Targeted Languages (MVP - Priority Order)
1. Chinese — Mandarin (Simplified primary; Traditional secondary)
2. English
3. Italian
4. German
5. Dutch

## Current Status (December 31, 2025)

| Area                  | Status   | Notes |
|-----------------------|----------|-------|
| Infrastructure        | 100%     | Complete (Turborepo + pnpm + Drizzle + PM2 + Express serving React) |
| Authentication        | 100%     | Complete (JWT cookie, /api/auth/*, /me, rate limit) |
| Deployment            | 100%     | Complete (deploy.sh, ecosystem.config.cjs port 4003, PM2) |
| Database Schema       | 100%     | Complete (users/sessions/rooms/room_participants w/ relations) |
| Core Features         | 100% ✅   | Backend: room creation/join, real-time speech → translation → broadcast (multi-user); Frontend: QR joining, Web Speech API, TTS, chat UI, accessibility, error handling, security |
| Internationalization  | 100%     | Complete: react-i18next + DB preference (en/zh) |

## Translation Provider Decision (Locked)

**MVP Provider**: Google Cloud Translation Advanced v3  
**Reasoning**:
- Lowest latency from our Tencent HK infrastructure (~50–200ms).
- Dedicated translation engine — zero hallucinations, perfect consistency.
- Predictable per-character pricing.
- Proven reliability for short, real-time utterances.

**Implementation Notes (Current Code)**:
- The server uses a translation engine registry with:
  - `google-translate` (default, requires `GOOGLE_CLOUD_PROJECT_ID`)
  - `grok-translate` (optional, requires `GROK_API_KEY`, falls back to Google if Grok fails)
- Google Translation location is configurable via `GOOGLE_CLOUD_TRANSLATE_LOCATION` (supported: `global`, `us-central1`). Invalid values fall back to `global`.

## TTS Strategy

**MVP (Current Code)**: Server-side Google Cloud Text-to-Speech proxy
- Client calls `POST /api/tts/synthesize` and plays returned `audio/mpeg`.
- Server caches MP3s on disk (`cache/tts`) and cleans up old files.
- Benefit: no client-side Google API keys; consistent voice quality across platforms.

**Phase 2 — Premium Voices Experiment (February 2026)**:

**Goal**: Significantly improve TTS quality, with primary focus on Mandarin Chinese naturalness.

**Providers to Test**:
1. **iFlyTek Online TTS** (Mandarin priority)
   - Best-in-class Mandarin voices available.
   - Low latency from HK/China servers.
   - Integration starts immediately after MVP.
2. **Grok Voice TTS** (or Voice Agent fallback)
   - Highly expressive multilingual voices.
   - Integrate as soon as standalone TTS endpoint launches (expected early-mid January 2026).

**User Controls** (Settings page):
- Toggle: "Use Premium Voices" (default off)
  - Mandarin Chinese: iFlyTek (default) / Grok / Browser
  - Other languages: Grok (default) / Browser

**Metrics to Track**:
- Perceived naturalness (in-app feedback thumbs up/down per utterance)
- End-to-end latency
- Cost per minute of generated speech
- Reliability / fallback frequency

**Outcome**: Data-driven decision on default premium provider per language.

## User Flow (QR-First with Room Code Fallback)

**Primary Method: QR Code (Mobile-Optimized)**
- Creator clicks "Start New Conversation" → room auto-created → creator auto-joined → lands in waiting screen.
- Waiting screen shows prominent "Show QR Code" button → reveals large scannable QR code + short room code (e.g., ABC-123).
- Joiner on Dashboard clicks "Scan QR Code to Join" → camera opens → scans QR → auto-joins room.

**Fallback: Room Code Manual Entry**
- Short room code (e.g., ABC-123) always displayed alongside QR.
- Dashboard has "Enter Room Code" field + button for manual entry.
- No public join links in URL.

**Login Handling**
- If not authenticated, the app offers **Guest Mode** (display name only) and then performs the pending action (create / join / scan).
- Users can still choose full login/register.

## UX/UI Audit (2026)

The detailed UX audit and recommendations live in [`UX-AUDIT-2026.md`](UX-AUDIT-2026.md).

**Implemented (Current Code):**
- Guest Mode (display name only)
- Dashboard FAB quick actions + recent rooms
- Conversation header cleanup (room code/QR and settings moved into secondary UI)
- Wake lock enabled while connected
- Message bubble original text collapsed by default with toggle

**Partially implemented:**
- Immersive mic (haptics + recording ripple/feedback; waveform + full-screen dimming not yet implemented)
- Safe area insets (handled for dashboard FAB; verify/extend for conversation footer)

**Not implemented:**
- Inline QR scanner half-sheet UI
- Biometric auth (WebAuthn)

## MVP Features & Priority

| Feature                                    | Priority | Status       | Owner          |
|--------------------------------------------|----------|--------------|----------------|
| Secure login (email/password)              | High     | Completed    | Kilo           |
| Register (invite-only initially)           | High     | Completed    | Kilo           |
| Guest Mode (display name only)             | High     | Completed    | You + Kilo     |
| Create private room + auto-join creator    | High     | Completed    | You + Kilo     |
| QR code generation + display               | High     | Completed    | You            |
| Dashboard "Scan QR Code to Join" button    | High     | Completed    | You            |
| QR scanner integration                     | High     | Completed    | You            |
| Room code manual entry fallback            | High     | Completed    | You            |
| Language selection per user (DB stored)    | High     | Completed    | Kilo           |
| Real-time speech capture (Google Cloud STT) | High     | Completed    | You            |
| Send audio stream to server                | High     | Completed    | Kilo           |
| Server-side translation (Google Cloud HK)  | High     | Completed    | Kilo           |
| Broadcast translated text to other participant | High     | Completed    | Kilo           |
| Client-side TTS (Google Cloud TTS) + audio toggle | High     | Completed    | You            |
| UI-level audio toggle (OS handles routing) | High     | Completed    | You            |
| Live chat-like UI with bubbles (You / Other) | High     | Completed    | You            |
| Mobile-responsive conversation screen      | High     | Completed    | You            |
| Reconnection handling + status indicators | Medium   | Completed    | Kilo           |
| Room expiration (24h auto-cleanup)         | Medium   | Completed    | Kilo           |

## Next Steps (MVP Roadmap)

| Item                                       | Status       | Priority | Owner | Notes |
|--------------------------------------------|--------------|----------|-------|-------|
| Scaffold Turborepo (copy OneProject)       | Completed    | High     | You   | Clone structure, create apps/web + apps/server |
| NGINX + EdgeOne subdomain setup            | Completed    | High     | You   | translator.studiodtw.net block configured (port 4003) |
| Auth system (copy OneProject)              | Completed    | High     | Kilo  | JWT cookie, /api/auth/* endpoints |
| Database schema + Drizzle setup            | Completed    | High     | Kilo  | users, rooms, room_participants |
| Room creation + auto-join creator          | Completed    | High     | You   | Creator immediately enters room |
| Socket.io real-time infrastructure         | Completed    | High     | Kilo  | Auth via cookie, room namespaces |
| QR code generation + "Show QR Code" UI     | Completed    | High     | You   | qrcode.react library |
| Dashboard "Scan QR Code to Join" + scanner | Completed    | High     | You   | html5-qrcode library |
| Room code display + manual entry fallback  | Completed    | High     | You   | Short code (e.g., ABC-123) |
| Core speech → translate → TTS loop         | Completed    | High     | Both  | End-to-end working with Google Cloud STT/TTS |
| i18n setup (copy OneProject)               | Completed    | High     | You   | en/zh/it/de/nl, separate JSONs, user preference in DB |
| Loveable UI generation                     | Completed    | High     | Grok + You | Professional, clean, mobile-first design (waiting screen with QR focus) |
| Audio toggle UI (OS-level routing)         | Completed    | Medium   | You   | Toggle implemented in Conversation.tsx |
| Rate limiting on auth/room endpoints       | Completed    | Medium   | Kilo  | express-rate-limit |
| Loading/empty/error states                 | Completed    | Medium   | You   | Skeleton, ErrorState, EmptyState components |
| Accessibility review                       | Completed    | Medium   | You   | ARIA labels, keyboard nav, screen reader support, WCAG compliance |
| Mobile polish (iOS/Android quirks)         | Not started  | Medium   | Both  | Test on real devices |
| Structured logging + basic monitoring      | Completed    | Low      | Kilo  | Winston structured logging implemented |

## Core Flow (MVP)

1. User logs in → Dashboard.
2. Creator clicks "Start New Conversation" → room auto-created → creator auto-joined → enters waiting screen with "Show QR Code" button.
3. Creator clicks "Show QR Code" → displays large QR + short room code.
4. Joiner (logged in) on Dashboard clicks "Scan QR Code to Join" → scans QR (or manually enters code) → auto-joined.
5. All participants see "Connected" status.
6. When one speaks:
    - Client starts server STT via Socket.IO `start-speech`.
    - Client streams mic audio via Socket.IO `speech-data`.
      - WebM/Opus on platforms that support it.
      - PCM (LINEAR16) fallback on platforms without WebM (e.g. iOS Safari).
    - Server performs streaming STT and when an utterance is final:
      - Emits `recognized-speech` back to the speaker.
      - Translates per-target-language group and emits `translated-message` to each recipient.
      - In solo mode, emits `solo-translated` (and does not emit `translated-message`).
    - Receiving clients display in chat bubbles + speak via TTS (if audio enabled).

## Tech Stack (Locked — Identical to OneProject)

- **Frontend**: React 18 + TypeScript + Vite + Tailwind + shadcn/ui + TanStack Query + React Router + react-i18next
- **Backend**: Node.js 20 + Express + Drizzle ORM + self-hosted PostgreSQL (local/prod servers)
- **Real-Time**: Socket.io (authenticated via JWT cookie, room namespaces)
- **Auth**: JWT in httpOnly cookie
- **Translation (MVP)**: Google Cloud Translation v3 + optional Grok translation engine
- **Speech (MVP)**: Server STT (Google Cloud Speech-to-Text) + client-side VAD for cost control
- **TTS (MVP)**: Server-side Google Cloud Text-to-Speech proxy (`/api/tts/synthesize`) + on-disk caching
- **TTS (Phase 2 Experiment)**: iFlyTek Online TTS + Grok Voice TTS (via Engine Framework)
- **QR Code**: qrcode.react (generation) + html5-qrcode (scanning)
- **Deployment**: Tencent Lighthouse HK + EdgeOne CDN + NGINX reverse proxy
- **Monorepo**: Turborepo + pnpm
- **UI Generation**: Loveable (for professional, consistent design)

## Build & Deployment Notes

- **PM2 config**: `ecosystem.config.cjs` running `./apps/server/dist/apps/server/src/index.js` on port 4003
- **Server build**: `pnpm -C apps/server build` (tsc)
- **Web build**: `pnpm -C apps/web build` (vite)
- Server serves built frontend from `apps/web/dist` + `/api/health`

## Collaboration Rules

- This file is the **single source of truth**
- All planning, status, features, and decisions live here
- Kilo: backend, database, auth, real-time logic, translation integration
- Grok: Loveable prompts, architecture alignment, deployment config, roadmap
- You: final merge, deploy, test, UI integration, prioritize

Last updated: January 6, 2026 (MVP 100% COMPLETE ✅ - All high priority blockers resolved, end-to-end testing successful, production-ready)