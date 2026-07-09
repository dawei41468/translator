#!/usr/bin/env bash
# Canonical production deploy — run ON hk-studio from a clean git checkout.
# GitHub (origin/main) is the source of truth.
set -euo pipefail

# pnpm is installed via standalone script, not system package manager
export PNPM_HOME="/home/ubuntu/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

HEALTH_URL="http://127.0.0.1:4003/api/health"
PREV_SHA="$(git rev-parse HEAD 2>/dev/null || true)"

echo "=== Translator Deploy (server / git-based) ==="
echo "==> Current HEAD: ${PREV_SHA:-unknown}"

echo "==> Pulling latest from origin/main"
git pull --ff-only origin main
NEW_SHA="$(git rev-parse HEAD)"
echo "==> New HEAD: ${NEW_SHA}"

echo "==> Installing dependencies"
pnpm install --frozen-lockfile

# Prefer versioned migrations when available; fall back to push for first-time / drift recovery.
echo "==> Applying database schema"
if [ -d "drizzle" ] && [ -n "$(ls -A drizzle/*.sql 2>/dev/null || true)" ]; then
  if pnpm db:migrate; then
    echo "    migrations applied via drizzle-kit migrate"
  else
    echo "    migrate failed — falling back to db:push (review carefully)"
    pnpm db:push
  fi
else
  pnpm db:push
fi

echo "==> Building server"
pnpm -C apps/server build

echo "==> Building web"
pnpm -C apps/web build

echo "==> Restarting backend (PM2)"
pm2 restart translator --update-env
pm2 save

echo "==> Waiting for health check (up to ~60s)"
for i in $(seq 1 30); do
  if curl -sf "${HEALTH_URL}" > /dev/null 2>&1; then
    BODY="$(curl -s "${HEALTH_URL}")"
    echo "✅ Health check passed: ${BODY}"
    # Prefer DB-aware health when available
    if echo "${BODY}" | grep -q '"database":"down"'; then
      echo "❌ Health reports database down after deploy."
      echo "    Rollback hint: git reset --hard ${PREV_SHA} && pnpm install --frozen-lockfile && pnpm -C apps/server build && pnpm -C apps/web build && pm2 restart translator"
      pm2 logs translator --lines 50 --nostream || true
      exit 1
    fi
    echo "=== Translator Deploy Complete ==="
    echo "    Rollback (code only; schema may need manual restore):"
    echo "    git reset --hard ${PREV_SHA} && pnpm install --frozen-lockfile && pnpm -C apps/server build && pnpm -C apps/web build && pm2 restart translator"
    exit 0
  fi
  echo "   ... waiting (${i}/30)"
  sleep 2
done

echo "❌ Backend failed to become healthy after deploy. Check PM2 logs."
echo "    Rollback hint: git reset --hard ${PREV_SHA} && pnpm install --frozen-lockfile && pnpm -C apps/server build && pnpm -C apps/web build && pm2 restart translator"
pm2 logs translator --lines 50 --nostream || true
exit 1
