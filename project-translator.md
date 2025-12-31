# Live Translator — Real-Time Cross-Device Conversation Translator

**Quick Summary**: A Progressive Web App (PWA) that enables seamless two-way real-time translated conversations between two users on different devices (iOS/Android). Users join a private room, select their language, speak naturally (via device mic or Bluetooth headset), and instantly hear/see the translation in their own language through speaker or Bluetooth headset.

**Live URL**: https://translator.studiodtw.net  
**Current Progress**: 90% (Auth/infra/deploy/db/backend-core/frontend-core complete — December 31, 2025)
**Target MVP**: End of January 2026

**Engineering Patterns (Canonical)**: Follow existing patterns exactly (see `CODEBASE-PATTERNS.md`) for coding conventions, API design, auth, deployment, and architectural decisions.

## Core Philosophy (User-First)

1. Conversations feel natural — minimal latency, no awkward button presses.
2. Works across platforms — iOS Safari + Android Chrome, installable as PWA.
3. Privacy by design — no audio stored, no transcripts saved unless explicitly opted-in later.
4. One device per user — each participant uses their own phone; translation happens live across devices.
5. Bluetooth headset support — input from headset mic, output to headset (user-toggled).

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
| Core Features         | 90%      | Backend: room creation/join, real-time speech → translation → broadcast (multi-user); Frontend: QR joining, Web Speech API, TTS, chat UI |
| Internationalization  | 100%     | Complete: react-i18next + DB preference (en/zh) |

## Translation Provider Decision (Locked)

**MVP Provider**: Google Cloud Translation Advanced v3 (asia-east2 — Hong Kong region)  
**Reasoning**:
- Lowest latency from our Tencent HK infrastructure (~50–200ms).
- Dedicated translation engine — zero hallucinations, perfect consistency.
- Predictable per-character pricing.
- Proven reliability for short, real-time utterances.

## TTS Strategy

**MVP**: Browser-native Web Speech API (SpeechSynthesis)
- Zero latency, seamless headset routing.
- Excellent for English, Italian, German.
- Acceptable for Dutch.
- Functional but noticeably robotic for Mandarin Chinese.

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
- Joiner (must be logged in) on Dashboard clicks "Scan QR Code to Join" → camera opens → scans QR → auto-joins room.

**Fallback: Room Code Manual Entry**
- Short room code (e.g., ABC-123) always displayed alongside QR.
- Dashboard has "Enter Room Code" field + button for manual entry.
- No public join links in URL.

**Login Handling**
- "Scan QR Code" and "Enter Room Code" buttons disabled/redirect to login if not authenticated.
- Post-login returns user to Dashboard for joining.

## MVP Features & Priority

| Feature                                    | Priority | Status       | Owner          |
|--------------------------------------------|----------|--------------|----------------|
| Secure login (email/password)              | High     | Completed    | Kilo           |
| Register (invite-only initially)           | High     | Completed    | Kilo           |
| Create private room + auto-join creator    | High     | Completed    | You + Kilo     |
| QR code generation + display               | High     | Completed   | You            |
| Dashboard "Scan QR Code to Join" button    | High     | Completed   | You            |
| QR scanner integration                     | High     | Completed   | You            |
| Room code manual entry fallback            | High     | Completed   | You            |
| Language selection per user (DB stored)    | High     | Completed   | Kilo           |
| Real-time speech capture (Web Speech API)  | High     | Completed   | You            |
| Send transcript to server                  | High     | Completed    | Kilo           |
| Server-side translation (Google Cloud HK)  | High     | Completed    | Kilo           |
| Broadcast translated text to other participant | High     | Completed    | Kilo           |
| Client-side TTS (Web Speech API) + audio toggle | High     | Completed   | You            |
| Bluetooth headset output routing (Audio Output API) | High     | Completed    | You            |
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
| QR code generation + "Show QR Code" UI     | Completed   | High     | You   | qrcode.react library |
| Dashboard "Scan QR Code to Join" + scanner | Completed   | High     | You   | html5-qrcode library |
| Room code display + manual entry fallback  | Completed   | High     | You   | Short code (e.g., ABC-123) |
| Core speech → translate → TTS loop         | Completed   | High     | Both  | End-to-end working with multi-user support |
| i18n setup (copy OneProject)               | Not started  | High     | You   | en/zh minimum, user preference in DB |
| Loveable UI generation                     | Not started  | High     | Grok + You | Professional, clean, mobile-first design (waiting screen with QR focus) |
| Headset routing + audio toggle UI          | Not started  | Medium   | You   | Use Audio Output API where supported |
| Rate limiting on auth/room endpoints       | Completed    | Medium   | Kilo  | express-rate-limit |
| Loading/empty/error states                 | Not started  | Medium   | You   | Skeletons, toasts |
| Accessibility review                       | Not started  | Medium   | You   | ARIA labels, keyboard nav |
| Mobile polish (iOS/Android quirks)         | Not started  | Medium   | Both  | Test on real devices |
| Structured logging + basic monitoring      | Not started  | Low      | Kilo  | Winston or console for now |

## Core Flow (MVP)

1. User logs in → Dashboard.
2. Creator clicks "Start New Conversation" → room auto-created → creator auto-joined → enters waiting screen with "Show QR Code" button.
3. Creator clicks "Show QR Code" → displays large QR + short room code.
4. Joiner (logged in) on Dashboard clicks "Scan QR Code to Join" → scans QR (or manually enters code) → auto-joined.
5. All participants see "Connected" status.
6. When one speaks:
    - Device captures via Web Speech API (continuous, interim results for live feel).
    - On final utterance → send transcript + sourceLang to server via Socket.io `speech-transcript` event.
    - Server translates to each other participant's language using Google Cloud Translation (asia-east2).
    - Server emits `translated-message` to all other participants in the room.
    - Receiving clients display in chat bubbles + speak via TTS (if audio enabled).
    - Audio routed to speaker or selected Bluetooth headset.

## Tech Stack (Locked — Identical to OneProject)

- **Frontend**: React 18 + TypeScript + Vite + Tailwind + shadcn/ui + TanStack Query + React Router + react-i18next
- **Backend**: Node.js 20 + Express + Drizzle ORM + self-hosted PostgreSQL (local/prod servers)
- **Real-Time**: Socket.io (authenticated via JWT cookie, room namespaces)
- **Auth**: JWT in httpOnly cookie
- **Translation (MVP)**: Google Cloud Translation Advanced v3 (asia-east2 region)
- **TTS (MVP)**: Browser-native Web Speech API (SpeechSynthesis)
- **TTS (Phase 2 Experiment)**: iFlyTek Online TTS + Grok Voice TTS
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

Last updated: December 31, 2025 (MVP core features completed - QR joining, multi-user translation with API optimization, end-to-end speech/TTS, settings page)