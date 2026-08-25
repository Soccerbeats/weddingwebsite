# Honeymoon Portal — Improvement Pass

**Date:** 2026-08-25 · **Scope:** `/admin/honeymoon/*` — Dashboard, Map, Itinerary, Travel, Places, Stays, Excursions, To Do, Guide, Settings, plus `lib/honeymoon.ts`, `honeymoonDb.ts`, the `[resource]`, `geocode` and `ics` routes.

This is the *improvement* pass — what's missing, what could be better, feature ideas. Bugs are in `bug-audit-2026-08-25.md` (B-11, B-12, B-33–B-45, B-76–B-80 are honeymoon-specific).

**How the ranking works.** Each item scored on four things: *how often you'd hit it while planning* (frequency), *how much it changes what the portal can do for you on the trip itself* (trip value), *how much of the existing data model it reuses* (fit), and *build size* (cost, inverted). Rank is by the first two mostly; cost breaks ties. Tier 1 is "you'd feel it this week", Tier 5 is "nice on a rainy Sunday".

**What's already strong and I'm not proposing to change:** the whole-payload-refetch model (honest, simple), the undo-instead-of-confirm philosophy, the day/stop/travel schema with `arrive_day_offset`, the map's split view and lasso, the print sheet and `.ics` export, the country focus filter, the shortlist ranking with pin numbers.

---

## Tier 1 — Highest impact (do these first)

| # | Improvement | Why it ranks here |
|---|---|---|
| 1 | **Trip-mode / "Today" view** — a phone-first read-only page for day N: this morning's stops in order, times, addresses, the base you're sleeping at, tonight's travel, a "Navigate" button per stop that opens Google/Apple Maps. Auto-selects today's day from `start_date`. | The portal is built for *planning*; on the trip you'll open it at breakfast with one thumb. Everything needed is already in the payload. |
| 2 | **Offline snapshot (PWA)** — cache the payload + the Today view + the print sheet in a service worker so the itinerary opens with no signal (airport, boat, Ubud back roads). The print sheet's own comment says "hotel desk with no signal" — deliver that without paper. | Highest trip-time value; the admin manifest already exists. |
| 3 | **Booking vault per place/leg** — structured fields on stays, excursions and travel legs: confirmation number (exists on travel only), check-in/out times, cost paid vs due, cancellation deadline, contact phone, a "booked with" URL, attach a PDF/screenshot (reuse the receipts upload route). Surface "deposit due in 6 days" on the dashboard. | `status: booked` exists but holds nothing. This is the single biggest gap between "shortlist tool" and "trip file". |
| 4 | **Real travel times between stops** — replace/augment the straight-line "47 km" hop with driving time from OSRM (public demo server, free, no key) or Google Distance Matrix, cached per pair. Show "~1h 40m drive" and warn when a day's driving exceeds a threshold. | The `SPREAD_WARNING_KM` comment admits straight-line lies about Bali roads. The `arcPoints`/`dayHops` plumbing is already there. |
| 5 | **Trip budget** — per-place `price_note` is free text; add a numeric `cost`, `currency`, `per` (night/person/total) and `paid` fields, compute a real trip total (nights × rate for the base of each day), show against a `trip.budget`. Optionally link to a Finance budget section so the honeymoon appears in the wedding budget. | The dashboard's "Rough cost" card apologises for itself ("a sense of scale, not a budget"). |
| 6 | **Optimistic updates for the hot paths** — rating pills, done ticks, drag reorder, stop time. Apply locally, PATCH, refetch quietly; roll back on failure. Keep whole-payload refetch as the consistency backstop. | Every toggle today costs a 9-query round trip and a full re-render; on a phone it's the difference between snappy and sluggish. |
| 7 | **Day-level timeline with durations** — give stops an optional `duration_minutes` and lay the day out as a timeline (09:00–10:30 breakfast → 40 min drive → 11:10 temple…), computing arrivals from start time + durations + travel time. Flag overlaps and "you can't make this". | Turns a list into a plan. Uses #4. |
| 8 | **Batch endpoints everywhere the UI loops** — `applyRange` (one POST per day), map `addToDay` (one per place), `addLinks` (one per URL), `fetchMissingLocations/Images` (one per stay). `createMany` exists; add `updateMany`-with-per-row-fields and a `preview-many` for fetch-meta. | A 14-day range or a 20-link paste currently takes 14–20 round trips + refetches. |
| 9 | **Checklist due dates that do something** — show overdue/due-this-week badges, sort by due, a "Next 7 days" strip on the dashboard, and optional email reminders (SMTP already configured for RSVPs). Add todo → place/leg links ("Book Ubud driver" → the Ubud day). | `due_on` is stored and never surfaced; the dashboard's "Needs attention" doesn't know about dates. |
| 10 | **Share a read-only link with your partner** — a signed URL (`/honeymoon/view?token=…`) that renders the Today view / itinerary without the admin login. Optional per-link expiry. Later: comments. | Single-admin is the model, but the trip is for two. Cheap with the existing JWT helper. |
| 11 | **Photos on places** — the `photos` JSONB column exists and is always `[]`. Upload via the existing photos volume, show a strip on the card and in the map popup, pick a cover. | Booking screenshots, menu photos, "the exact beach entrance". Column already there. |
| 12 | **Session expiry handling** — when a save gets 401 (2h JWT), show "Signed out — sign in again" with a re-auth modal that retries the request, instead of a red "Unauthorized" banner. | Planning sessions run long; this hits every tab. (Also in the bug audit as B-21.) |

## Tier 2 — High impact

| # | Improvement | Why |
|---|---|---|
| 13 | **Weather per day** — Open-Meteo (free, no key) 7-day forecast for each day's base coordinates once within range; historical climate averages before that ("Sept in Ubud: 29°/23°, 40% rain days"). Show on itinerary cards and Today view. | Decides beach vs temple days. |
| 14 | **Opening hours + "open now"** — pull `opening_hours` from OSM/Nominatim `extratags` when geocoding; store; warn when a stop is scheduled outside hours or on a closed day. | The classic honeymoon fail. |
| 15 | **Time zone awareness on legs** — flights between countries: store `depart_tz`/`arrive_tz` (or derive from coords), show local times both ends and real duration. `.ics` gets `TZID`. | Bali→Singapore is same TZ, but any long-haul leg home isn't. |
| 16 | **Airline/flight lookup** — paste "GA 401" + date → depart/arrive times, terminals, aircraft via AeroDataBox/AviationStack free tier; fill the leg. | Removes the most error-prone typing. |
| 17 | **Sunrise/sunset on each day** — from coords + date (pure math, no API). Show on the day card; flag a "sunset dinner" stop scheduled after dark. | Cheap, delightful, useful for photo planning. |
| 18 | **Region auto-assignment** — when a place gets coordinates and has no region, pick the nearest region centre (or point-in-polygon if regions get boundaries). Bulk "assign regions by location" action. | 200 places × manual dropdown is the current path. |
| 19 | **Map routing lines for driving legs** — draw actual road geometry (OSRM route polyline) for `car` legs and between stops on the selected day, instead of straight/curved lines. | Pairs with #4; makes the map honest. |
| 20 | **Itinerary conflicts panel** — one place scheduled twice the same day, two stops with the same time, a stop 60 km from the base, a day with no base while another has two stays booked, checklist items due after the trip starts. | Most of the signals exist; nothing collects them. |
| 21 | **Base-stay continuity** — show nights per stay (Day 3–6 at X = 3 nights), warn when a day's base differs from the previous day's with no travel leg between them, and when a booked stay's dates don't match its days. | The base picker is per-day; the stay is per-stretch. |
| 22 | **Global undo stack** — keep the last ~10 undo offers (deletes *and* bulk edits, rating changes, reorders), ⌘Z to undo the most recent. | The one-slot undo is good; a stack is what people expect once they trust it. |
| 23 | **Custom map layers** — satellite (Esri World Imagery, free), terrain, and a "my pins only" clean style; remember per browser. | Beaches and waterfalls read better on imagery; OSM raster is beige everywhere. |
| 24 | **Bulk import from spreadsheet/Google My Maps** — CSV/KML with name, lat, lng, category, notes → places; dedupe by name+distance. | The seed script did this once for the Bali guide; friends' lists arrive as spreadsheets. |
| 25 | **Place detail page/drawer** — a full view of one place (photos, all links with previews, notes, which days it's on, distance to the current base, opening hours, weather) instead of only the editor modal. | The map's selected-place card and the editor both truncate. |
| 26 | **"Nearby" for a stop** — from any place: other library places within N km, sorted by distance, add-to-same-day in one click. Fills the gap between a temple and dinner. | Uses `distanceKm`; no new data. |
| 27 | **Per-person notes and packing list** — a packing checklist (template: beach/temple/hiking), per-day "bring" hints derived from categories (sunscreen for beach days, sarong for temples). | Natural extension of To Do; templates are static data. |
| 28 | **Documents folder** — passports, visas, insurance PDF, vaccination cards, e-tickets: upload, tag, show on Today view. Reuse the receipt upload path with an `honeymoon_documents` table. | Offline access (#2) makes this genuinely useful. |
| 29 | **Currency helper** — store a fixed rate per trip currency pair (or fetch daily from exchangerate.host), show converted totals next to IDR/SGD prices; a quick converter in the Today view. | `home_currency` exists; nothing converts. |
| 30 | **Search improvements** — index place-linked stop names for day hits, addresses, price notes, travel legs, confirmation refs; fuzzy match (typos); recent searches; `/` to focus. | ⌘K exists and is good; make it find everything. |

## Tier 3 — Medium impact

| # | Improvement | Why |
|---|---|---|
| 31 | Drag a place from the Places panel **onto a day card** in split view (cross-container DnD) instead of the "Move to day…" menu. | The split view comment says this is the point of it. |
| 32 | Drag stops **between day cards** on the Itinerary (one DnD context, per-day sortable lists). | Moving a stop is a menu today. |
| 33 | **Duplicate/copy a stop** to another day; **copy a whole day** to a target position (not only the end). | Duplicate exists but appends. |
| 34 | **Reorder travel legs** within a day (no `sort_order` on `honeymoon_travel`); sort by `depart_time` as default. | Legs are `ORDER BY id`. |
| 35 | **Leg templates**: "airport transfer" auto-adds a car leg from the airport to the day's base with the geocoded ends. | Common, repetitive. |
| 36 | **Stay comparison table** — side-by-side of ranked stays: price, area, distance to your top-rated excursions, rating, links. Toggle from the Ranking view. | Ranking answers order; a table answers why. |
| 37 | **Scrape more from listings** — Booking's JSON-LD carries `starRating`, `priceRange`, amenities; Airbnb/Agoda have different markers. Show as chips on the stay card. | fetch-meta already parses JSON-LD. |
| 38 | **Price-drop / availability check** — re-fetch a stay's page weekly and diff the price node; flag changes. Booking blocks server fetches (they note this) — do it as a bookmarklet like the Target import. | Shortlists sit for weeks. |
| 39 | **Notes with Markdown** — bold, lists, links in guide notes and place descriptions (the changelog viewer already has an inline tokeniser). | Notes are getting long. |
| 40 | **Guide notes → places** — link a note to a region or place; show region notes on the day card when that region is the day's base. | Guide and itinerary don't talk. |
| 41 | **Day templates** — "Beach day", "Temple morning + spa", "Travel day" that pre-fill stop slots by category. | Speeds first-draft planning. |
| 42 | **Auto-suggest a day** — given a base and free time, propose 3–4 nearby top-rated unscheduled places by category mix and distance. | Uses rating, distance, category; a fun stretch goal. |
| 43 | **Map: heat/spread view** — cluster colours by rating (👍 green) or by scheduled/unscheduled, so "what have we not placed yet" is visible. | Cheap toggle over existing `iconCreateFunction`. |
| 44 | **Map: measure tool** — click two points for distance/bearing; **draw a region boundary** (polygon) and save it on the region (enables #18 precisely). | Lasso code is 80% of this. |
| 45 | **Map: street view / Mapillary link** on the selected place. | One anchor tag. |
| 46 | **Keyboard shortcuts** — `n` new place, `d` new day, `[`/`]` prev/next day in Today view, `?` to list. | Power-user speed. |
| 47 | **Per-browser filter memory** on the Places tab (region/category/status filters reset on every visit; Map remembers split only). | Consistency with Stays/Itinerary. |
| 48 | **Saved views** — named filter sets ("Ubud eats", "Unpinned South Bali") with a share-to-map button. | Once #47 exists, naming them is small. |
| 49 | **Bulk edit on the Stays and Excursions tabs** (multi-select + rating/status/region), matching Places/Map. | Same verbs, different tab. |
| 50 | **Excursions: archive semantics** — "Remove" should archive like Stays (Removed bucket, restore, delete-for-good) instead of flipping `is_excursion`. | Two shortlists, one behaviour. |
| 51 | **Rating history / who rated** — with two of you rating, store `rating_by` so 👍/👎 conflicts are visible ("A: yes, H: no"). | Pairs with #10. |
| 52 | **Comments on a place** — short threaded notes with author + time, for the two of you. | Pairs with #10/#51. |
| 53 | **Dashboard: "Unbooked stays for booked days"** — days whose base is `shortlisted`/`idea`, or no base at all, within N days of departure. | The most expensive mistake to catch late. |
| 54 | **Dashboard: countdown to non-refundable deadlines** from #3. | |
| 55 | **Dashboard: itinerary completeness score** — % of days with a base, ≥2 stops, travel where the base changes. | Gamifies the last 20%. |
| 56 | **Trip-wide notes as a proper page** (`trip.notes` is one text input). Sections: emergency numbers, embassy, insurance policy no., driver's WhatsApp. | Today view should show these. |
| 57 | **Emergency card** — one screen: local emergency number for the country of today's base, embassy, insurer hotline, hotel front desk, partner's number. | Trip value, tiny build. |
| 58 | **Print sheet options** — pick days, include map thumbnails per day (static tile render), include guide notes or not, A5 booklet layout. | Print exists; it's all-or-nothing. |
| 59 | **`.ics` improvements** — `TZID`, `LOCATION` on stops (address + geo), `URL` to the booking, alarms 30 min before timed stops, one calendar per trip name. | The export is good; these are what phones use. |
| 60 | **Google Calendar / Apple Calendar subscribe URL** — a tokenised `.ics` feed (`/api/honeymoon/feed?token=`) that updates as you edit, rather than a one-off download. | Download goes stale the day after. |

## Tier 4 — Smaller improvements

| # | Improvement |
|---|---|
| 61 | Show **nights** on the trip header only when `end_date` set; show **"Day N of M"** on each day card. |
| 62 | **Dates on the Travel tab list** (it shows day numbers; the date is one call away). |
| 63 | **Stop time picker**: quick chips (09:00, 12:30, 19:00) and "+30 min after previous". |
| 64 | **Inline "+ stop" between two stops** rather than only at the bottom. |
| 65 | **Colour per region** on the map (toggle between category colour and region colour). |
| 66 | **Custom category colour/icon picker** in Manage categories (they're editable rows; only the label is editable in UI). |
| 67 | **Place source badges** with colour; filter "everything Amy suggested I haven't rated". |
| 68 | **"Rate later" queue** — a swipe deck of unrated stays/excursions (👍/😐/👎), photo big, one at a time. Fast triage on a phone. |
| 69 | **Excursion booking link per provider** (GetYourGuide/Viator/Klook) detected like `STAY_HOSTS`, with the right label. |
| 70 | **Per-place "best time to visit"** field (morning/sunset/avoid weekends) surfaced when scheduling. |
| 71 | **Walking-distance flag**: stops within 800 m of the base get a 🚶 badge; no car needed. |
| 72 | **Travel leg cost + who booked** fields; totals feed #5. |
| 73 | **Region description on the Itinerary** day header when the base changes region ("Welcome to Ubud — …"). |
| 74 | **Empty-state seeding**: on a blank trip offer "Load the Bali guide" button (runs the seed) instead of telling you to run npm. |
| 75 | **Photo of the day's base** as the day-card background (from `image_url`). |
| 76 | **Compact/dense mode** for the Places list (200 rows). |
| 77 | **Sort options on Places** (name, recently added, region, status, distance from a chosen base). |
| 78 | **Export places as CSV / GeoJSON / KML** (for Google My Maps on the trip). |
| 79 | **Import back from Google Maps saved lists** (Takeout JSON) — names + coords straight in. |
| 80 | **"Since your last visit"** — highlight places/notes changed in the last N days (needs `updated_at` on the tables; only places have `created_at`). |
| 81 | **Trip history**: keep archived trips (`honeymoon_trip` is a singleton). Even a "clone trip as template" would let the portal outlive the honeymoon. |
| 82 | **Dark mode** for the Today view (you'll read it at 05:30). |
| 83 | **Haptics/sounds off by default, big-thumb targets** audit of the Today view specifically. |
| 84 | **Settings: date/time format** (12/24h; the trip is in a 24h country). |
| 85 | **Settings: distance unit** (km/mi) — `formatDistance` is km-only. |

## Tier 5 — Ideas worth writing down

| # | Idea |
|---|---|
| 86 | **AI itinerary assistant** — "we have day 5 free near Ubud, we like waterfalls and slow lunches" → three proposals from the library (reuses ratings/categories/distances; the Claude API is a fetch away). |
| 87 | **Post-trip mode** — mark stops as "did it / skipped", attach your own photos, star favourites; the portal becomes the trip journal and the seed for the public "Our Story" timeline. |
| 88 | **Live location on the trip** — with #10's shared link, a "we're here" pin so the family at home can follow (opt-in, obviously). |
| 89 | **Restaurant reservation tracker** — time, party size, confirmation, dress code, cancellation window; a stop subtype. |
| 90 | **Spending log on the trip** — quick "paid 350k IDR cash for lunch" entries geotagged to the current stop; totals vs #5. |
| 91 | **Language card** per country — 20 phrases, tipping norms, taxi apps, SIM advice, as a Guide note template. |
| 92 | **Public "Where we're going" teaser** — an optional public page with the map and a few pins (the portal is admin-only by design; this would be an explicit opt-in subset). |

---

## Quick wins (small builds from the tiers above)

If you want a satisfying afternoon: **#8** (batch endpoints), **#12** (401 handling), **#17** (sunrise/sunset), **#33** (copy stop), **#34** (leg sort), **#47** (remember filters), **#61/#62** (dates), **#66** (category colours), **#85** (km/mi). None needs a new table except #34 (one column).

## Things that need a schema change (plan together)

- #3 booking vault: `honeymoon_bookings` (place_id/leg_id, confirmation, check_in, check_out, cost, currency, paid, due_on, cancel_by, contact, url, document paths).
- #5 budget: `cost`, `cost_currency`, `cost_per` on places; `budget` on trip.
- #7 durations: `duration_minutes` on stops.
- #14 hours: `opening_hours` (OSM string) on places.
- #15 time zones: `depart_tz`, `arrive_tz` on travel.
- #28 documents: `honeymoon_documents`.
- #34 leg order: `sort_order` on travel.
- #44 boundaries: `boundary JSONB` on regions.
- #51/#52: `rating_by`, `honeymoon_comments`.
- #80: `updated_at` on every honeymoon table.

Remember convention #2: anything added at runtime in `honeymoonDb.ts` must also land in `database/init.sql` (the audit found `honeymoon_categories` already missing there).
