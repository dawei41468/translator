#!/bin/bash
set -euo pipefail

echo "Starting deployment..."

echo "Pulling latest changes..."
git pull

echo "Installing dependencies..."
pnpm install --frozen-lockfile

echo "Updating database schema..."
pnpm db:push

echo "Building server..."
pnpm -C apps/server build

echo "Building web..."
pnpm -C apps/web build

echo "Restarting application..."
pm2 restart translator --update-env

echo "Deployment complete!"
