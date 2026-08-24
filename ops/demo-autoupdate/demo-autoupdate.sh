#!/bin/sh
# Keep weddingwebsitedemo.com on the newest published image.
#
# WHY THIS EXISTS INSTEAD OF A WEBHOOK: this host is a Portainer *edge*
# environment, and edge stacks have no per-stack redeploy webhook — the option
# is simply absent in the UI. So the box pulls instead of being pushed to, which
# is the better shape anyway: nothing inbound to open, no credential for this
# machine sitting in a public repository's CI.
#
# Only redeploys when something actually changed. A blind `compose up -d` would
# re-run the one-shot seed service every time it fires, wiping and reseeding the
# demo — 36 photographs re-fetched, and a window where a visitor sees an empty
# site — for no reason.
#
# The trigger is the digest, not the tag: :latest is a moving pointer, so
# comparing the tag to itself would never differ. Comparing the *running
# container's* image against the freshly pulled one also self-heals — if an
# earlier run half-failed and the demo is behind, the next tick notices and
# fixes it rather than waiting for the next release.
set -eu

IMAGE=ghcr.io/soccerbeats/weddingwebsite:latest
SEEDER=ghcr.io/soccerbeats/weddingwebsite-seeder:latest
COMPOSE=/etc/wedding-demo/docker-compose.yml
PROJECT=weddingwebsitedemo
STATE=/var/lib/demo-autoupdate/seeder.digest

log() { echo "demo-autoupdate: $*"; }

# Cheap when nothing has changed: a manifest check, no layers transferred.
docker pull -q "$IMAGE"  >/dev/null 2>&1 || { log "pull of the app image failed — leaving the demo alone"; exit 0; }
docker pull -q "$SEEDER" >/dev/null 2>&1 || log "pull of the seeder failed — carrying on with the one already here"

running=$(docker inspect wedding-web-demo --format '{{.Image}}' 2>/dev/null || echo none)
latest=$(docker image inspect "$IMAGE" --format '{{.Id}}')

# A seeder-only change (new demo content, no app change) still deserves a
# redeploy, so its digest is remembered between runs.
seeder_now=$(docker image inspect "$SEEDER" --format '{{.Id}}' 2>/dev/null || echo none)
seeder_was=$(cat "$STATE" 2>/dev/null || echo none)

if [ "$running" = "$latest" ] && [ "$seeder_now" = "$seeder_was" ]; then
    log "already current ($(echo "$latest" | cut -c8-19)) — nothing to do"
    exit 0
fi

log "redeploying: app $(echo "$running" | cut -c8-19) -> $(echo "$latest" | cut -c8-19)"

# -p as well as the file's own `name`, so this can only ever act on the stack
# Portainer created. A wrong project name here would build a second set of
# containers and a second set of empty volumes.
if docker compose -p "$PROJECT" -f "$COMPOSE" up -d; then
    printf '%s' "$seeder_now" > "$STATE"
    log "redeployed; the seed service reseeds the demo on this start"
    # Only unreferenced layers, so nothing in use is touched. Without it the
    # box accumulates every superseded image.
    docker image prune -f >/dev/null 2>&1 || true
else
    log "compose up failed — the previous containers are still running"
    exit 1
fi
