#!/bin/sh
# Keep heavenandaustin.com on the newest published image.
#
# WHY THIS EXISTS: CI is meant to POST the stack's redeploy webhook, but no
# webhook is registered on this stack — Portainer's own database has
# `"Webhook":""` and `"AutoUpdate":null` for stack 146, and neither of the two
# URLs handed over was in it, so the token never persisted however it was
# generated in the UI. Until that works, this keeps production current the same
# way the OVH demo box does: it pulls rather than being pushed to, which also
# means nothing on this machine has to be reachable from CI.
#
# It is a stand-in, not a replacement. If the webhook is fixed, CI will redeploy
# on merge and this timer becomes a belt to that braces — harmless, because it
# no-ops whenever the running image already matches the registry.
#
# SCOPED TO THE WEB SERVICE ONLY, deliberately:
#   * `--no-deps web` never touches wedding-db-prod. A database container has no
#     business being recreated because an application image moved, and a failed
#     recreate on this stack has previously left the database created-but-stopped
#     while pages that don't touch it still returned 200.
#   * compose does the recreate, never `docker run`. Compose only manages
#     containers carrying com.docker.compose.config-hash, which only compose
#     itself writes and which cannot be added afterwards — a hand-made container
#     is invisible to it, so Portainer's "Pull and redeploy" starts failing with
#     a name conflict until someone recreates it properly.
#
# The compose file and env used here are Portainer's own, mirrored to this host;
# verified byte-identical (md5 0d2c306f3ed581ad45e2caecee5d7487) to the copy
# inside the Portainer container. If the stack is edited in Portainer, re-mirror
# them — see deploy.md.
set -eu

IMAGE=ghcr.io/soccerbeats/weddingwebsite:latest
DIR=/data/compose/146/v1
PROJECT=weddingwebsite

log() { echo "prod-autoupdate: $*"; }

cd "$DIR"

# Cheap when nothing changed: a manifest check, no layers transferred.
if ! docker pull -q "$IMAGE" >/dev/null 2>&1; then
    log "pull failed — leaving production alone"
    exit 0
fi

running=$(docker inspect wedding-web-prod --format '{{.Image}}' 2>/dev/null || echo none)
latest=$(docker image inspect "$IMAGE" --format '{{.Id}}')

# Comparing the *running container* against the freshly pulled image, rather
# than remembering what was last deployed, means an instance left behind by a
# half-finished update is noticed on the next tick instead of at the next release.
if [ "$running" = "$latest" ]; then
    log "already current ($(echo "$latest" | cut -c8-19)) — nothing to do"
    exit 0
fi

log "redeploying web: $(echo "$running" | cut -c8-19) -> $(echo "$latest" | cut -c8-19)"

if docker compose -p "$PROJECT" --env-file stack.env -f docker-compose.yml \
        up -d --no-deps --force-recreate web; then
    log "web recreated on the new image"
    # Confirm it actually came back, and say so either way: a silent failure
    # here is a wedding site that is down with a green log line above it.
    sleep 5
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 http://localhost:3000/ || echo 000)
    log "post-deploy check: GET / -> $code"
    [ "$code" = "200" ] || log "WARNING: production is not answering 200 — check docker logs wedding-web-prod"
    # Only unreferenced layers; nothing in use is touched.
    docker image prune -f >/dev/null 2>&1 || true
else
    log "compose up failed — the previous container is still running"
    exit 1
fi
