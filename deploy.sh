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

echo "=== Translator Deploy (server / git-based) ==="

echo "==> Pulling latest from origin/main"
git pull --ff-only origin main

echo "==> Installing dependencies"
pnpm install --frozen-lockfile

echo "==> Pushing database schema"
pnpm db:push

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
    echo "✅ Health check passed: $(curl -s "${HEALTH_URL}")"
    echo "=== Translator Deploy Complete ==="
    exit 0
  fi
  echo "   ... waiting (${i}/30)"
  sleep 2
done

echo "❌ Backend failed to become healthy after deploy. Check PM2 logs."
pm2 logs translator --lines 50 --nostream || true
exit 1
