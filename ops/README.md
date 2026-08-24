# ops/

Host-side pieces that live on a server rather than in the image. They are here so
they are reviewable and reproducible: each one was, at first, a file on exactly
one box with nothing recording why it existed.

Nothing in here is used by the application or the Docker build.

## `demo-autoupdate/` — the OVH box redeploys itself

The public demo (weddingwebsitedemo.com) runs on a host that Portainer manages as
an **edge** environment, and edge stacks have no per-stack redeploy webhook — the
option is absent from the UI, so CI has nothing to POST to. Rather than give CI
an SSH key to that machine, the box polls: a timer compares the digest of
`ghcr.io/soccerbeats/weddingwebsite:latest` against the image its container is
actually running, and redeploys only when they differ.

Only-when-changed matters. The demo stack includes a one-shot seed service, so a
blind `docker compose up -d` on every tick would wipe and reseed the demo every
five minutes — re-fetching three dozen photographs, and leaving a window where a
visitor sees an empty site.

```bash
install -m 755 demo-autoupdate/demo-autoupdate.sh /usr/local/sbin/
install -m 644 demo-autoupdate/demo-autoupdate.{service,timer} /etc/systemd/system/
mkdir -p /var/lib/demo-autoupdate /etc/wedding-demo
cp ../docker/docker-compose.demo.yml /etc/wedding-demo/docker-compose.yml   # set `name:` to the project Portainer used
systemctl daemon-reload && systemctl enable --now demo-autoupdate.timer
```

## `prod-autoupdate/` — production polls too, for now

Production is a normal (non-edge) Portainer environment, so CI *should* just POST
its redeploy webhook (`PORTAINER_PROD_WEBHOOK`). In practice Portainer has not
kept a webhook on that stack: two tokens generated in its UI were both missing
from its database afterwards — stack 146 reads `"Webhook":""` and
`"AutoUpdate":null` — so the webhook 404s with "Unable to find the stack by
webhook ID".

Until that is sorted, the host polls, exactly like the demo box. Two differences
from `demo-autoupdate`, both deliberate:

- **`--no-deps web`**: only the application container is recreated. A database
  has no business restarting because an application image moved, and a failed
  recreate on this stack has previously left the database created-but-stopped
  while pages that don't touch it still returned 200.
- **A post-deploy check**: it curls the site afterwards and logs the status code.
  A silent failure here is a wedding site that is down under a green log line.

It uses **Portainer's own** compose file and env, mirrored to the host at
`/data/compose/146/v1` and verified byte-identical to the copy inside the
Portainer container. Compose does the recreate, never `docker run`: compose only
manages containers carrying `com.docker.compose.config-hash`, which only compose
writes and which cannot be added to an existing container — a hand-made one is
invisible to it, and Portainer's own "Pull and redeploy" then fails on a name
conflict until someone recreates it properly.

```bash
install -m 755 prod-autoupdate/prod-autoupdate.sh /usr/local/sbin/
install -m 644 prod-autoupdate/prod-autoupdate.{service,timer} /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now prod-autoupdate.timer
```

Fixing the webhook makes this redundant rather than wrong: it no-ops whenever the
running image already matches the registry. To stop it entirely:
`systemctl disable --now prod-autoupdate.timer`.

## `portguard/` — published Docker ports are not behind ufw

On a host where `ufw` was active, every published container port still answered
the internet. Docker writes its own DNAT and forwarding rules ahead of ufw's
chains, so ufw cannot police a published port — the demo's `3001` and the reverse
proxy's admin panel on `81` were both reachable from anywhere.

The hook Docker leaves is the `DOCKER-USER` chain, which it consults first and
never rewrites. Two details that make the rules hold up:

- **Match `-m conntrack --ctorigdstport`, not the container's address.** DNAT has
  already rewritten the packet by the time it reaches `FORWARD`, and a
  container's IP changes on every redeploy. Verified: the rule still blocked the
  port after the stack was recreated with a new container IP.
- **Do both families.** That host has a public IPv6, so v4-only rules leave the
  port wide open to anyone who has it.

```bash
install -m 755 portguard/docker-portguard.sh /usr/local/sbin/
install -m 644 portguard/docker-portguard.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now docker-portguard.service
```

Nothing persists iptables on that host, hence the boot-time unit. Edit
`ADMIN_ALLOW` and `BLOCK_PORTS` in the script to change what it covers.
