# Codebase patterns (Living doc)

> **Architecture SSOT for runtime behavior:** [`ARCHITECTURE-CURRENT.md`](./ARCHITECTURE-CURRENT.md)  
> Rooms use **Grok Voice utterance orchestration**, not the legacy STT→translate→client-TTS socket pipeline. If this file conflicts with `ARCHITECTURE-CURRENT.md`, prefer the latter.

## Monorepo layout

- `apps/server` — Express + Socket.IO + Practice WS proxy
- `apps/web` — React PWA (Vite)
- `packages/db` — Drizzle schema

## Auth pattern

- Cookie `auth_token` (httpOnly)
- JWT payload: `{ userId, sid }` with row in `sessions` for revocation
- Shared verify: `services/auth-session.ts` → used by HTTP middleware, Socket.IO, Practice WS

## Rooms realtime pattern

Client:

1. Connect Socket.IO with credentials
2. On `connect` / `reconnect`: emit `join-room`
3. On presence events: invalidate `["room", code]` query
4. Speak: `start-utterance` → stream `utterance-audio` → `stop-utterance`
5. Listen: `utterance-started` / `utterance-text` / `utterance-audio` / `utterance-done`

Server:

- `UtteranceOrchestrator` opens one Grok Voice session per distinct **listener** target language
- Same-language: source transcript text only
- Cross-language: translation text + audio deltas

## Practice pattern

- Browser → `wss://host/api/voice/practice-ws` (cookie auth)
- Server holds `GROK_API_KEY`, concurrency-capped per user

## Testing

- Server: Vitest unit tests under `apps/server/src/**/__tests__`
- Web: Vitest + Playwright E2E under `apps/web/tests/e2e` (starts monorepo `pnpm dev`)

## Deploy

See root `AGENTS.md` and `deploy.sh` (migrate-first, DB-aware health, rollback hint).
