# Deployment Guide

## How to Deploy

When asked to deploy, always follow these steps in order:

### 1. ASK USER: Push Code to GitHub? If y then do this step!!
Commit any uncommitted changes and push to the main branch:
```bash
git add .
git commit -m "describe changes here"
git push origin main
```

### 2. Build and Push the Docker Image
```bash
docker pull ghcr.io/soccerbeats/weddingwebsite:latest 2>/dev/null || true && \
docker build \
  --cache-from ghcr.io/soccerbeats/weddingwebsite:latest \
  --target production \
  -t ghcr.io/soccerbeats/weddingwebsite:latest \
  . && \
docker push ghcr.io/soccerbeats/weddingwebsite:latest
```

> **Note**: The `--cache-from` flag reuses layers from the previous image. The `npm run build`
> step before `docker build` is NOT needed — the Dockerfile runs it internally.

### 4. Portainer (Manual Step - User Handles This)
The user manually pulls and redeploys the new image via the Portainer UI.
Alternatively, a Portainer webhook may auto-deploy when a new image is pushed.

## Critical Rules

- **Image name**: ALWAYS use `ghcr.io/soccerbeats/weddingwebsite:latest` — NEVER change this
- **Build target**: Always use `--target production`
- **Auto-deploy after every code change**: per Austin's standing instruction (see `CLAUDE.md` → "After Every Code Change"), push to GitHub and build/push the Docker image automatically after any change — no need to ask. This supersedes the older "only deploy when asked" gate.

## Where It Deploys

- **Registry**: GitHub Container Registry (ghcr.io)
- **Host**: Portainer (self-hosted Docker management)
- **Stack**: The Portainer stack is configured to use `ghcr.io/soccerbeats/weddingwebsite:latest`

## Pre-Deploy Checklist

Before running the build/push:
- [ ] TypeScript compilation successful
- [ ] No console errors in browser
- [ ] All admin panel features tested
- [ ] Public pages tested
- [ ] Image uploads/display verified
- [ ] Responsive design checked (mobile)
- [ ] Authentication flow tested
- [ ] WIP toggles verified
- [ ] Build completes without errors or warnings
