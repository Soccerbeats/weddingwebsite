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
| B-44 | Honeymoon | Excursions are removed by flag; stays are archived — two removal semantics | Design call — belongs with the improvement pass | M |
| B-32 | Finance UI | `finances/ui.tsx` `Modal` is not portalled; site nav may paint over dialog titles | Needs a visual check first | S |
| B-42 | Honeymoon | Blocked-iframe fallback never shows (Chrome fires `onLoad` anyway) | No reliable detection exists | M |
| B-59 | Public | Four fetches of `/api/admin/site-config` per public page; nav flashes | Perf, not correctness | M |
| B-61 | Public | Lightbox has no touch swipe | A feature, not a bug | S |
| B-74 | Admin API | guest-list PUT nulls omitted fields; address can't be cleared | Client always sends every field | S |
| B-76 | Honeymoon | Search hits for regions/days/todos only switch tab, don't scroll/highlight | A feature | M |
| B-80 | Honeymoon | Nominatim: no cache/rate limit; enum coercion hides bad input | Perf/policy; low traffic | M |
| B-84 | Admin | Schedule/wedding-party editors still mutate some state in place | Partially fixed in v0.9.42; rest is lint-only | S |
| B-86 | Docker | No `HEALTHCHECK`; prod compose publishes 3000 on the host as well as via NPM | Ops; needs a Portainer change | S |
| OPS-1 | Deploy | `JWT_SECRET` not set in the Portainer stack | Needs Austin at Portainer | XS |

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

### B-44 — Two removal semantics in the honeymoon shortlists
Stays are archived (v0.9.39, recoverable bucket); excursions are removed by
flipping `is_excursion`, which loses the place from that view with no undo.
**Fix:** treat "Remove" in ExcursionsTab the same as StaysTab — archive, with the
archived bucket — and exclude archived places from the excursion list (the
dashboard already does since v0.9.42). Fits naturally with the improvement pass.

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
Geocoding calls Nominatim with no cache and no rate limiting; their policy is
1 request/s. The geocode route's enum coercion also maps any unknown `status`
to `idea` and unknown `mode` to `flight`, and the json coercion replaces a
non-array `links` with `[]` — all silent. **Fix:** a small in-memory LRU keyed on
the query (24 h TTL), a 1 r/s token bucket, and 400s instead of coercion for
unknown enum values.

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

### OPS-1 — Set `JWT_SECRET`
Since v0.9.42 the admin cookie is signed with `JWT_SECRET`, falling back to
`ADMIN_PASSWORD` when unset (previously a hard-coded string). It works as-is,
but a dedicated secret means rotating the password does not log everyone out
and vice versa. **Do:** add `JWT_SECRET=<long random string>` to the Portainer
stack's environment, redeploy. Every admin session is invalidated once.
