#!/bin/sh
# Keep published Docker ports off the public internet.
#
# ufw cannot do this job: Docker writes its own DNAT and forwarding rules ahead
# of ufw's chains, so a published port answers the internet whatever ufw says.
# The one hook Docker leaves for us is the DOCKER-USER chain, which it consults
# before its own rules and never rewrites — so that is where these live.
#
# Matching is on the *original* destination port via conntrack, not on the
# container's address: DNAT has already rewritten the packet by the time it
# reaches FORWARD, and a container's IP changes every time its stack is
# redeployed. --ctorigdstport survives both.
#
# Only traffic arriving on the public interface is touched. The reverse proxy
# reaches the demo through the docker0 gateway, which enters on a bridge
# interface instead, so proxied traffic is unaffected.
#
# Idempotent: every rule is checked before it is inserted, so running this twice
# changes nothing. Applied at boot by docker-portguard.service.
set -e

WAN=ens16

# Who may reach the Nginx Proxy Manager admin panel. Austin's home connection,
# which is also how docker-server appears from out here.
ADMIN_ALLOW=98.116.142.5

# Published ports that should never answer the internet.
#   81   — the proxy's admin panel: its login form is all that stands in front
#          of every route on this box. Allowlisted above, dropped below.
#   3001 — the demo's container port. weddingwebsitedemo.com serves it through
#          the proxy; reaching it directly skips Cloudflare and the proxy both.
BLOCK_PORTS="81 3001"

ins4() { iptables -C DOCKER-USER "$@" 2>/dev/null || iptables -I DOCKER-USER "$@"; }
ins6() { ip6tables -C DOCKER-USER "$@" 2>/dev/null || ip6tables -I DOCKER-USER "$@"; }

# The DROPs go in first so that the ACCEPT inserted afterwards lands above them
# (-I prepends), which is the order that makes the allowlist an exception.
for p in $BLOCK_PORTS; do
    ins4 -i "$WAN" -p tcp -m conntrack --ctorigdstport "$p" -j DROP
    ins6 -i "$WAN" -p tcp -m conntrack --ctorigdstport "$p" -j DROP
done

# The admin panel stays reachable from the allowlisted address over IPv4. There
# is no v6 exception: if that address ever stops matching, the way back in is an
# SSH tunnel (ssh -L 8181:localhost:81 root@40.160.231.11), because traffic to
# the host's own loopback never traverses FORWARD and so is never filtered here.
ins4 -i "$WAN" -s "$ADMIN_ALLOW" -p tcp -m conntrack --ctorigdstport 81 -j ACCEPT

echo "docker-portguard: rules applied"
