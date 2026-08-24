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

Production is the other way round: it is a normal Portainer environment, so CI
POSTs its redeploy webhook (`PORTAINER_PROD_WEBHOOK`) and nothing needs to poll.

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
