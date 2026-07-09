# Current architecture (July 2026)

This is the source of truth for how Live Translator works **in code today**. Older docs that describe STT → MT → client TTS socket events for rooms are historical.

## Surfaces

| Surface | Route | Realtime path |
|---------|-------|----------------|
| **Rooms** | `/room/:code` | Socket.IO `start-utterance` / `utterance-audio` / `stop-utterance` → `UtteranceOrchestrator` → Grok Voice (one session per target language) |
| **Practice** | `/practice` | Browser WebSocket → `/api/voice/practice-ws` (server proxy with `GROK_API_KEY`) → Grok Voice |
| **Dashboard** | `/dashboard` | REST rooms + guest funnel (no realtime until room entry) |

## Auth

- HTTP-only `auth_token` cookie
- JWT embeds `{ userId, sid }`; **session row required** in `sessions` table (revocation on logout / password change)
- Lifetime: 7 days (session-backed)

## Selective delivery (rooms)

- Same-language listeners: source transcript text only
- Cross-language listeners: translation text + audio deltas
- Client presence: `user-joined` / `user-left` invalidate room query; mic gated on other participants

## Still present but not on room speech path

- `services/stt/*` and `services/translation/*` registries (unit-tested; preferences UI remnants)
- HTTP `/api/tts/synthesize` for legacy TTS use cases

## Ops

- Deploy: `deploy.sh` on hk-studio → migrate (fallback push) → build → PM2 restart → DB-aware health
- Health: `GET /api/health` returns `database: up|down`
