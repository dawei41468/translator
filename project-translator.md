# Live Translator — Real-Time Cross-Device Conversation Translator

**Quick Summary**: A Progressive Web App (PWA) that enables seamless two-way real-time translated conversations between two users on different devices (iOS/Android). Users join a private room, select their language, speak naturally (via device mic or Bluetooth headset), and instantly hear/see the translation in their own language through speaker or Bluetooth headset.

**Live URL**: https://translator.studiodtw.net  
**Current Progress**: 30% (Auth/infra/deploy/db complete — December 31, 2025)
**Target MVP**: End of January 2026

**Engineering Patterns (Canonical)**: Follow existing OneProject patterns exactly (see `CODEBASE-PATTERNS.md` in OneProject repo) for coding conventions, API design, auth, deployment, and architectural decisions.

## Core Philosophy (User-First)

1. Conversations feel natural — minimal latency, no awkward button presses.
2. Works across platforms — iOS Safari + Android Chrome, installable as PWA.
3. Privacy by design — no audio stored, no transcripts saved unless explicitly opted-in later.
4. One device per user — each participant uses their own phone; translation happens live across devices.
5. Bluetooth headset support — input from headset mic, output to headset (user-toggled).

## Targeted Languages (Priority Order)
1. Chinese — Mandarin (Simplified primary; Traditional secondary)
2. English
3. Italian
4. German
5. Dutch
6. Spanish
7. Russian
8. Japanese

## Current Status (December 31, 2025)

| Area                  | Status   | Notes |
|-----------------------|----------|-------|
| Infrastructure        | 100%     | Complete (Turborepo + pnpm + Drizzle + PM2 + Express serving React) |
| Authentication        | 100%     | Complete (JWT cookie, /api/auth/*, /me, rate limit) |
| Deployment            | 100%     | Complete (deploy.sh, ecosystem.config.cjs port 4003, PM2) |
| Database Schema       | 100%     | Complete (users/sessions/rooms/room_participants w/ relations) |
| Core Features         | 0%       | Room creation/join, real-time speech → translation → TTS |
| Internationalization  | 0%       | Will reuse OneProject react-i18next + DB preference (essential for translator) |

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
- Excellent for English, Italian, German, Spanish.
- Acceptable for Dutch, Russian, Japanese.
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

## MVP Features & Priority

| Feature                                    | Priority | Status     | Owner          |
|--------------------------------------------|----------|------------|----------------|
| Secure login (email/password)              | High     | Completed  | Kilo           |
| Register (invite-only initially)           | High     | Completed  | Kilo           |
| Create private room + shareable link/QR    | High     | Not started| You + Kilo     |
| Join room by link/code                     | High     | Not started| You + Kilo     |
| Language selection per user (DB stored)    | High     | Not started| Kilo           |
| Real-time speech capture (Web Speech API)  | High     | Not started| You            |
| Send transcript to server                  | High     | Not started| Kilo           |
| Server-side translation (Google Cloud HK)  | High     | Not started| Kilo           |
| Broadcast translated text to other participant | High     | Not started| Kilo           |
| Client-side TTS (Web Speech API) + audio toggle | High     | Not started| You            |
| Bluetooth headset output routing (Audio Output API) | High     | Not started| You            |
| Live chat-like UI with bubbles (You / Other) | High     | Not started| You            |
| Mobile-responsive conversation screen      | High     | Not started| You            |
| Reconnection handling + status indicators | Medium   | Not started| Kilo           |
| Room expiration (24h auto-cleanup)         | Medium   | Not started| Kilo           |

## Next Steps (MVP Roadmap)

| Item                                       | Status       | Priority | Owner | Notes |
|--------------------------------------------|--------------|----------|-------|-------|
| Scaffold Turborepo (copy OneProject)       | Completed    | High     | You   | Clone structure, create apps/web + apps/server |
| NGINX + EdgeOne subdomain setup            | Completed    | High     | You   | translator.studiodtw.net block configured (port 4003) |
| Auth system (copy OneProject)              | Completed    | High     | Kilo  | JWT cookie, /api/auth/* endpoints |
| Database schema + Drizzle setup            | Completed    | High     | Kilo  | users, rooms, room_participants |
| Room creation/join flow + shareable link   | Not started  | High     | You   | /join/:roomId route |
| Socket.io real-time infrastructure         | Not started  | High     | Kilo  | Auth via cookie, room namespaces |
| Core speech → translate → TTS loop         | Not started  | High     | Both  | End-to-end test on two devices |
| i18n setup (copy OneProject)               | Not started  | High     | You   | en/zh minimum, user preference in DB |
| Loveable UI generation                     | Not started  | High     | Grok + You | Professional, clean, mobile-first design |
| Headset routing + audio toggle UI          | Not started  | Medium   | You   | Use Audio Output API where supported |
| Rate limiting on auth/room endpoints       | Not started  | Medium   | Kilo  | express-rate-limit |
| Loading/empty/error states                 | Not started  | Medium   | You   | Skeletons, toasts |
| Accessibility review                       | Not started  | Medium   | You   | ARIA labels, keyboard nav |
| Mobile polish (iOS/Android quirks)         | Not started  | Medium   | Both  | Test on real devices |
| Structured logging + basic monitoring      | Not started  | Low      | Kilo  | Winston or console for now |

## Core Flow (MVP)

1. User logs in → lands on dashboard.
2. User clicks "Start New Conversation" → creates room → gets shareable link/QR.
3. Other user opens link → logs in → selects their language → joins.
4. Both see "Connected" status.
5. When one speaks:
   - Device captures via Web Speech API (continuous, interim results for live feel).
   - On final utterance → send transcript + sourceLang to server via Socket.io.
   - Server translates to target's language using Google Cloud Translation (asia-east2).
   - Server emits translated text to the other participant only.
   - Receiving client displays in chat bubble + speaks via TTS (if audio enabled).
   - Audio routed to speaker or selected Bluetooth headset.

## Tech Stack (Locked — Identical to OneProject)

- **Frontend**: React 18 + TypeScript + Vite + Tailwind + shadcn/ui + TanStack Query + React Router + react-i18next
- **Backend**: Node.js 20 + Express + Drizzle ORM + self-hosted PostgreSQL (local/prod servers)
- **Real-Time**: Socket.io (authenticated via JWT cookie)
- **Auth**: JWT in httpOnly cookie
- **Translation (MVP)**: Google Cloud Translation Advanced v3 (asia-east2 region)
- **TTS (MVP)**: Browser-native Web Speech API (SpeechSynthesis)
- **TTS (Phase 2 Experiment)**: iFlyTek Online TTS + Grok Voice TTS
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

Last updated: December 31, 2025 (auth/infra/db/deploy status updated)