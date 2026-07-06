# Agent instructions — Translator

## Production deployment (default)

**GitHub `main` is the source of truth.** Production runs on **hk-studio** (`124.156.174.180`, SSH host alias `hk-studio`).

When the user asks to deploy, ship, or push to production:

### 1. Commit and push first

Ensure all intended changes are on `origin/main`:

```bash
git status
git add <files>
git commit -m "<message>"
git push origin main
```

Do **not** deploy uncommitted local changes to production.

### 2. Deploy on the server via `deploy.sh`

Run the canonical deploy script **on hk-studio**:

```bash
ssh hk-studio 'cd /home/ubuntu/translator && ./deploy.sh'
```

`deploy.sh` will:

1. `git pull --ff-only origin main`
2. `pnpm install --frozen-lockfile`
3. `pnpm db:push` (apply database schema changes)
4. Build server and web (`turbo build`)
5. `pm2 restart translator --update-env`
6. Wait for `http://127.0.0.1:4003/api/health` to return 200

### 3. Confirm success

- Health check prints in deploy output
- Optional: `ssh hk-studio 'pm2 list | grep translator'`

## Server layout

| Path | Purpose |
|------|---------|
| `/home/ubuntu/translator` | Git clone of this repo |
| `/home/ubuntu/translator/deploy.sh` | Canonical production deploy |
| `/home/ubuntu/translator/.env` | Production secrets (not in git) |
| PM2 app `translator` | Express + Socket.io on port 4003 |

## Troubleshooting

**`git pull` fails with untracked `deploy.sh` would be overwritten**

```bash
ssh hk-studio 'cd /home/ubuntu/translator && rm -f deploy.sh && git pull --ff-only origin main && chmod +x deploy.sh'
```

**Reset server git to match GitHub** (destructive to uncommitted server changes):

```bash
ssh hk-studio 'cd /home/ubuntu/translator && git fetch origin && git reset --hard origin/main && git clean -fd'
```

Preserve `.env` before `git clean -fdx` (not needed for `git clean -fd`).

**View backend logs**

```bash
ssh hk-studio 'pm2 logs translator --lines 100 --nostream'
```

## Local development

```bash
pnpm dev          # start server + web in dev mode
pnpm test         # run all tests
pnpm build        # build all packages
pnpm db:push      # apply schema changes to local DB
```
