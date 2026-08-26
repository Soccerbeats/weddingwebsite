# Parking lot

Work that is known, understood, and **deliberately not done yet**. Each entry says
why it is parked and what doing it would look like, so it can be picked up cold.
Items come off this list into `CHANGELOG.md` when they ship, or get struck through
with a reason when they are dropped.

IDs starting `B-` refer to `docs/bug-audit-2026-08-25.md`; the honeymoon feature
ideas have their own ranked list in `docs/honeymoon-improvements-2026-08-25.md`
and are not repeated here.

## At a glance

| # | Area | Item | Why it's parked | Effort |
|---|---|---|---|---|
| B-17 | Public API | `guest-verification` returns email/phone to anyone who types a matching name | Design call — the form prefills from it | S |
| B-31 | Finance | Deleting a budget line cascades away its installment schedule | Design call — arguably correct | S |
| ~~B-44~~ | ~~Honeymoon~~ | ~~Excursions are removed by flag; stays are archived~~ | **Shipped v0.9.48** — excursions archive into a Removed bucket, exactly as stays do | — |
| B-32 | Finance UI | `finances/ui.tsx` `Modal` is not portalled; site nav may paint over dialog titles | Needs a visual check first | S |
| B-42 | Honeymoon | Blocked-iframe fallback never shows (Chrome fires `onLoad` anyway) | No reliable detection exists | M |
| B-59 | Public | Four fetches of `/api/admin/site-config` per public page; nav flashes | Perf, not correctness | M |
| B-61 | Public | Lightbox has no touch swipe | A feature, not a bug | S |
| B-74 | Admin API | guest-list PUT nulls omitted fields; address can't be cleared | Client always sends every field | S |
| B-76 | Honeymoon | Search hits for regions/days/todos only switch tab, don't scroll/highlight | A feature | M |
| B-80 | Honeymoon | Nominatim: no cache or rate limit; enum coercion hides bad input | Partly addressed in v0.9.53 (fallback + real errors); the cache and the token bucket are still missing | M |
| B-84 | Admin | Schedule/wedding-party editors still mutate some state in place | Partially fixed in v0.9.42; rest is lint-only | S |
| B-86 | Docker | No `HEALTHCHECK`; prod compose publishes 3000 on the host as well as via NPM | Ops; needs a Portainer change | S |
| OPS-1 | Deploy | `JWT_SECRET` not set in the Portainer stack | Needs Austin at Portainer | XS |
| OPS-2 | Deploy | `GEOCODER_USER_AGENT` not set, so OpenStreetMap can block the server | Needs Austin at Portainer | XS |
| HM-1 | Honeymoon / Finance | The honeymoon total is not a line in the wedding budget | Design call — which side owns the number | S |

Effort: XS = minutes, S = under an hour, M = an afternoon.

## Details

### B-17 — Verification returns contact details
`POST /api/guest-verification` answers a matching name with the guest's email and
phone so the RSVP form can prefill them. Anyone who can guess a name on the list
gets those two fields. **Options:** (a) drop `email`/`phone` from the response —
`existingRsvp` already prefills them for returning guests, so only a *first*
RSVP loses the prefill; (b) keep them but require a second factor such as an
invitation code printed on the card. (a) is a five-line change; (b) is a feature.

### B-31 — Schedule rows cascade with their budget line
`finance_schedule.item_id` is `ON DELETE CASCADE` while `finance_purchases` is
`SET NULL`. Deleting a budget line silently deletes its payment schedule. This
may be exactly right — a schedule without its line is meaningless — but purchases
survive, so the two are inconsistent. **If changed:** `SET NULL` plus an
"unassigned" bucket in the Schedule tab, or a confirm dialog that says how many
installments will go.

### ~~B-44 — Two removal semantics in the honeymoon shortlists~~ — shipped v0.9.48
Excursions now archive into a Removed bucket you can restore from, exactly as
stays do, and "Not an excursion" is a separate action from "Remove from the
shortlist". The word means the same thing on both tabs.

### B-32 — Finance modals not portalled
`finances/ui.tsx` has its own `Modal` that renders inline. The shared
`components/admin/Modal` was portalled to `document.body` precisely because the
fixed site nav painted over dialog title bars. TemplatePicker, BulkEdit,
ReceiptUpload and SplitBill use the inline one. **First step:** open each on a
phone-width window and see whether the title bar is hidden. **If so:** swap the
import to the shared Modal (same props shape, ten-minute change).

### B-42 — Blocked iframe fallback
`LinkPreview` shows a "this site won't display here" fallback when the iframe
fails to load, but Chrome fires `onLoad` for frames refused by
`X-Frame-Options`/CSP, so the fallback never appears and the user sees a 60vh
grey box. There is no cross-origin signal for this. **Workable alternatives:**
a server-side `HEAD` through `safeFetch` that reads `X-Frame-Options` /
`Content-Security-Policy: frame-ancestors` and tells the client not to bother;
or a timeout that offers "Open in new tab" after ~3 s regardless.

### B-59 — Repeated site-config fetches
Navigation, registry, our-story and RSVPForm each fetch `/api/admin/site-config`
on mount — four identical requests per public page, and the nav's link set
flashes as it arrives. **Fix:** read the config once server-side in
`app/layout.tsx` (`getSiteConfig()` is synchronous) and pass it down via a
context provider; components take the prop and stop fetching. Removes the
flash as well. Touches five files.

### B-61 — Lightbox swipe
`PhotoLightbox` navigates by buttons and arrow keys only. On a phone a swipe is
expected. **Fix:** pointer-down/up delta with a 40 px threshold, same pattern as
the honeymoon `DateRangePicker` pointer handling.

### B-74 — guest-list PUT is a full overwrite
Fields omitted from a PUT body become `NULL` (`party_members`, `invited`,
`party_size`), and an address cannot be cleared because `null` is treated as
"not provided". The admin client always sends every field, so nothing breaks
today — but any second client (a script, the seeder, a future import) will
silently blank columns. **Fix:** `COALESCE(new, existing)` per column, and a
distinct sentinel (`""`) for "clear this".

### B-76 — Search hits don't scroll to the hit
`SearchPalette` results for regions, days and todos switch to the right tab but
nothing scrolls to or highlights the matching row. **Fix:** put `id="day-N"` /
`id="region-N"` anchors on the rows, pass the target through the tab switch, and
`scrollIntoView` + a 1.5 s ring on arrival. The place hits already do this via
the map.

### B-80 — Nominatim hygiene
Still no cache and no rate limiting on the geocoder; their policy is 1 request/s.
**Partly addressed in v0.9.53**, after the deployed instance started getting
`403 Access denied`: the User-Agent now identifies the project (their policy's
actual requirement), `GEOCODER_USER_AGENT` overrides it, Photon answers when
Nominatim will not, and a refusal says what happened instead of "lookup failed".
What is still missing is the part that stops us being refused in the first place:
**a small LRU keyed on the query (24 h TTL) and a 1 r/s token bucket** — the
"get locations for N stays" button is the one that provokes it. The enum-coercion
half of this item is unchanged: unknown `status` silently becomes `idea` and
unknown `mode` becomes `flight`, where a 400 would be honest.

### B-84 — In-place state mutation
v0.9.42 made the schedule and wedding-party editors' main update paths
immutable. `react-hooks/immutability` still flags a few spots (drag reorder
helpers, nested field setters). Nothing visible is wrong; the remaining
warnings are in `npm run lint`'s 34. **Fix:** finish the sweep, warnings → 0.

### B-86 — Container health and host port
The image has no `HEALTHCHECK`, so Portainer shows "running" for a container
whose Next server has died. The prod compose file also publishes `3000:3000` on
the host, so the site is reachable by IP without going through Nginx Proxy
Manager (and without its TLS or access rules). **Fix:** `HEALTHCHECK CMD wget -qO-
http://localhost:3000/api/wip-status || exit 1` in the Dockerfile; drop the
`ports:` block from the prod compose and rely on the NPM network. The second
half needs a stack edit in Portainer.

### HM-1 — The honeymoon total is not in the wedding budget
`buildBudget()` produces a real trip total (v0.9.47) and the Finance suite has a
category-and-items model that could hold it as one line. Deliberately not wired
up: the question is **which side owns the number**. If Finance holds a copy, it
goes stale every time a stay's rate changes; if it reads through, a honeymoon
that is half-planned quietly deflates the wedding total; and if both, the wedding
budget double-counts, which is the failure that matters because that is the
budget being spent from. **Options:** (a) a read-only "Honeymoon" row in the
budget that renders `buildBudget().total` live and is excluded from the
committed/paid columns; (b) a manual figure in Finance that the honeymoon
dashboard *compares itself against* and warns when they diverge; (c) leave them
separate and put the honeymoon total on the finance dashboard as a note. (b) is
the least wrong if the wedding budget must stay authoritative. Needs a decision
from Austin before code.

### OPS-2 — Set `GEOCODER_USER_AGENT`
OpenStreetMap's geocoder answered the production host with `403 Access denied`
because the default User-Agent did not identify a contactable operator (fixed as
far as it can be in v0.9.53 — the default now carries the project URL, and Photon
covers the refusal). Setting a real one is what actually gets the better
geocoder back as primary, and it is the one that returns opening hours and phone
numbers with a pin. **Do:** add
`GEOCODER_USER_AGENT=WeddingWebsite/1.0 (your-email@example.com)` to the
Portainer stack and redeploy. See also B-80 — the cache is the durable fix.

### OPS-1 — Set `JWT_SECRET`
Since v0.9.42 the admin cookie is signed with `JWT_SECRET`, falling back to
`ADMIN_PASSWORD` when unset (previously a hard-coded string). It works as-is,
but a dedicated secret means rotating the password does not log everyone out
and vice versa. **Do:** add `JWT_SECRET=<long random string>` to the Portainer
stack's environment, redeploy. Every admin session is invalidated once.
**Note (v0.9.51):** until that release the compose file did not pass
`JWT_SECRET` through to the container at all, so setting it on the stack would
have done nothing. It does now.
