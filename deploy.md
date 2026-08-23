# Deployment Guide

## How to Deploy

**Push to `main`. That is the deploy.**

```bash
git add -A
git commit -m "describe the change"
git push origin main
```

The *Wedding Planner* workflow (`.github/workflows/ci-cd.yml`) then runs on
GitHub's machines: it builds the app, checks the changelog, builds the
production image and publishes it to GHCR as `latest`, `v<version>` (read from
the topmost heading in `CHANGELOG.md`) and `sha-<short>`. About three and a half
minutes. Follow it with:

```bash
gh run list --limit 1     # queued / in_progress / completed
gh run watch              # live
```

A pull request gets the same build as a check but publishes nothing, so a broken
commit cannot reach the registry.

### Portainer (Manual Step — User Handles This)
The user pulls and redeploys the new image via the Portainer UI, exactly as
before. Alternatively a Portainer webhook can auto-deploy when a new image is
pushed.

### Building by hand — the fallback

Only when CI genuinely cannot do it (Actions is down, or you need an image from
a working tree that isn't pushed). **This overwrites whatever CI published**, so
it is not the routine:

```bash
docker pull ghcr.io/soccerbeats/weddingwebsite:latest 2>/dev/null || true && \
docker build \
  --cache-from ghcr.io/soccerbeats/weddingwebsite:latest \
  --target production \
  -t ghcr.io/soccerbeats/weddingwebsite:latest \
  -f docker/Dockerfile . && \
docker push ghcr.io/soccerbeats/weddingwebsite:latest
```

> **Note**: The `--cache-from` flag reuses layers from the previous image. The `npm run build`
> step before `docker build` is NOT needed — the Dockerfile runs it internally.

## Critical Rules

- **Image name**: ALWAYS use `ghcr.io/soccerbeats/weddingwebsite:latest` — NEVER change this
- **Build target**: Always use `--target production`
- **Auto-deploy after every code change**: per Austin's standing instruction (see `CLAUDE.md` → "After Every Code Change"), push to GitHub automatically after any change — no need to ask. This supersedes the older "only deploy when asked" gate.
- **Don't build the image by hand as part of that.** CI publishes it. Two builds of the same commit both writing `:latest` means the tag production pulls has no single answer.

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
