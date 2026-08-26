<h1 align="center">Wedding Website</h1>

<p align="center">
  <strong>Self-host the whole wedding, not just the website.</strong><br>
  An admin panel deep enough to actually run a wedding from — RSVPs and a guest list,
  a seating chart, a budget, a photo gallery, a registry — and a private honeymoon
  planner with a map. One Docker image, on your own server.
</p>

<p align="center">
  <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs&logoColor=white" alt="Next.js 16"></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white" alt="React 19"></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-3178c6?logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4"></a>
  <a href="https://www.postgresql.org"><img src="https://img.shields.io/badge/PostgreSQL-15-4169e1?logo=postgresql&logoColor=white" alt="PostgreSQL 15"></a>
  <a href="https://www.docker.com"><img src="https://img.shields.io/badge/Docker-ready-2496ed?logo=docker&logoColor=white" alt="Docker"></a>
  <a href="https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps"><img src="https://img.shields.io/badge/PWA-installable-5a2ce9?logo=pwa" alt="PWA"></a>
</p>

<p align="center">
  <a href="https://weddingwebsitedemo.com">
    <img src="https://img.shields.io/badge/%F0%9F%8E%AD_Live_demo-weddingwebsitedemo.com-D4AF37?style=for-the-badge" alt="Live demo at weddingwebsitedemo.com" height="28">
  </a>
  &nbsp;
  <a href="https://github.com/Soccerbeats/weddingwebsite/wiki">
    <img src="https://img.shields.io/badge/%F0%9F%93%96_Full_documentation-in_the_wiki-0969da?style=for-the-badge" alt="Full documentation in the wiki" height="28">
  </a>
</p>

<p align="center">
  <img src="docs/images/hero.jpg" width="820" alt="The live site: a full-bleed monochrome hero photograph with the couple's names, the date and RSVP buttons">
</p>

<p align="center">
  <a href="https://weddingwebsitedemo.com"><strong>Try it →&nbsp; weddingwebsitedemo.com</strong></a><br>
  A completely fictional wedding — ninety guests, a budget, a seating chart and a
  sixteen-day honeymoon. No login: the whole admin panel is open, so change
  anything you like. Nothing there is real and nothing you do to it is saved.<br>
  <sub>Run your own with one compose file and one environment variable —
  <a href="https://github.com/Soccerbeats/weddingwebsite/wiki/The-Demo-Instance">how the demo works</a>.</sub>
</p>

## What it does

**For guests** — a home page with a hero slideshow and a countdown, your story as
a timeline, the wedding party, the day's schedule, a photo gallery, a registry with
a honeymoon fund, and an RSVP form that recognises them by name.

**For you** — an admin panel covering:

- **RSVPs and guests** — import a CSV, track a hundred-odd people and their
  parties, dietary notes, addresses, and export a mailing list
- **Seating** — draw the room, drop tables in it, drag guests into seats
- **Money** — a real budget: lines, quantities, who is paying, who has
  contributed, what is still owed and when it is due
- **Photos** — upload, drag to reorder, heart the ones that go public
- **Content** — every page's text, colours, and a work-in-progress toggle per page
- **Honeymoon** — a private planner *and* a trip companion: a map of everywhere
  you are considering, a day-by-day itinerary with real driving times and honest
  arrival times, an accommodation shortlist you can rank, compare and rule out
  without deleting, **travel entered as whole tickets** (every leg, both times,
  the layovers judged) that place themselves on the right days, booking details
  with cancellation deadlines, a trip budget that adds up, weather and daylight
  per day, a phone-first **Today** view that works offline, and a read-only link
  for the other half of the couple

Full list: **[Features](https://github.com/Soccerbeats/weddingwebsite/wiki/Features)**.

## Quick start

The image is on GitHub Container Registry, so there is nothing to build:

```bash
cp docker/.env.example docker/.env        # set POSTGRES_PASSWORD and ADMIN_PASSWORD
docker compose -f docker/docker-compose.prod.yml up -d
```

Then open `http://localhost:3000`, and `/admin` with the password you set.
(`docker/docker-compose.dev.yml` is the development stack — it builds from source
instead of pulling the image.)

Everything works with those two variables. The rest of `docker/.env.example` is
optional and each feature says so in the UI when its variable is missing:

| Variable | Turns on |
|---|---|
| `JWT_SECRET` | A session cookie signed independently of the admin password |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `NOTIFICATION_EMAIL` | Email when an RSVP arrives |
| `FLIGHT_API_KEY` | *Fill in from schedule* on a travel leg — a RapidAPI key subscribed to AeroDataBox |
| `GEOCODER_USER_AGENT` | Identifies you to OpenStreetMap's geocoder, which refuses anonymous-looking callers. Worth setting |
| `NOMINATIM_URL` / `OSRM_URL` | Your own geocoder / routing server instead of the public ones |

- **[Installation](https://github.com/Soccerbeats/weddingwebsite/wiki/Installation)** — Portainer, plain Compose, or local
- **[Deployment](https://github.com/Soccerbeats/weddingwebsite/wiki/Deployment)** — what a merge publishes, and how it reaches a running server on its own
- **[The demo instance](https://github.com/Soccerbeats/weddingwebsite/wiki/The-Demo-Instance)** — how the read-only copy at [weddingwebsitedemo.com](https://weddingwebsitedemo.com) is put together, and how to host your own

## Screenshots

> Every screenshot below comes from the [live demo](https://weddingwebsitedemo.com),
> so the couple, guests, budget and honeymoon in them are fictional — and every
> screen here is one you can go and click through yourself.

### The public site

| Home | Our Story |
|---|---|
| <img src="docs/images/home.jpg" alt="The home page: a full-bleed hero slideshow with the couple's names and a countdown"> | <img src="docs/images/our-story.jpg" alt="A vertical timeline of milestones, photographs alternating left and right"> |
| The hero slideshow, countdown and intro | A vertical timeline that alternates sides |

| Wedding Party | Schedule |
|---|---|
| <img src="docs/images/wedding-party.jpg" alt="Wedding party member cards with photographs and how each person is known to the couple"> | <img src="docs/images/schedule.jpg" alt="The wedding day schedule, each event with a time, a description and a location"> |
| Cards for each side of the party | The day in order, with times and locations |

| Registry | Photos |
|---|---|
| <img src="docs/images/registry.jpg" alt="The registry page with honeymoon fund items showing progress bars, and a product grid"> | <img src="docs/images/photos.jpg" alt="The photo gallery: a grid of hearted photographs that opens into a lightbox"> |
| A honeymoon fund with progress, plus a product registry | The gallery, which shows only your hearted photographs |

### The admin panel

| Dashboard | RSVPs & guests |
|---|---|
| <img src="docs/images/admin-dashboard.jpg" alt="The admin dashboard with overview cards for the countdown, RSVPs, guests, content and seating"> | <img src="docs/images/admin-rsvps.jpg" alt="The RSVP table with stats cards, filters, and party members as sub-rows"> |
| Where everything stands, at a glance | Ninety guests, filterable, with party members as sub-rows |

| Finances | Seating chart |
|---|---|
| <img src="docs/images/admin-finances.jpg" alt="The finance suite: budget lines grouped by category with paid and remaining totals"> | <img src="docs/images/admin-seating.jpg" alt="The seating chart builder with round tables on a floor plan and guests assigned to seats"> |
| A real budget: lines, payers, contributors, what is left | Drag guests onto tables on a floor plan |

| Photos | Changelog |
|---|---|
| <img src="docs/images/admin-photos.jpg" alt="Photo management with drag-to-reorder, heart-to-publish and inline editing"> | <img src="docs/images/changelog.jpg" alt="The changelog viewer: a version nav on the left beside a reading pane of release cards"> |
| Drag to reorder, heart to publish | Every release, read in the panel — see [Versions and the changelog](https://github.com/Soccerbeats/weddingwebsite/wiki/Versions-and-the-Changelog) |

### The honeymoon portal

Private planning for the trip, and the thing you actually open on it. Admin-only,
with no public page — except a read-only link you can hand to one person.

**Planning it.** Every candidate on one clustered map over four base layers
(streets, satellite, terrain, clean), with a measure tool and drawable region
boundaries; a place library that imports from a spreadsheet, Google My Maps or a
Google Takeout and exports as CSV, GeoJSON or KML; a shortlist you can rank,
compare side by side and triage one card at a time; per-person ratings and
comments, because two people rate one shortlist; photos, opening hours and
"best time to go" on a place; and a booking vault holding the confirmation
number, what it cost, what is paid and the date after which cancelling costs
you.

**Getting there.** Travel is entered as a **journey** — one ticket, however many
legs. Paste the flight numbers off the confirmation and each leg is looked up and
filled in (times, terminals, aircraft, both time zones) and placed on the right
trip day by itself: the dates decide, not a dropdown. Layovers are computed
across zones and judged — tight, impossible, or a different airport, which is a
transfer rather than a connection — and a landing time carries "that's 21:00 back
home" whenever the leg crosses zones.

**Making it work.** Driving times from a router instead of straight lines, a
day laid out as a timeline that says when you actually arrive and which stops you
cannot make, weather (a forecast inside sixteen days, a decade of normals beyond
it), sunrise and sunset, and a conflicts panel that collects everything wrong
with the plan — a night with nowhere to sleep, two stays booked over the same
nights, a booking whose dates disagree with the days it covers.

**Taking it with you.** A Today view built for one thumb, cached by a service
worker so it opens with no signal; an emergency card with the local numbers as
tap-to-call buttons; a calendar you can subscribe to rather than download; a
print sheet you can fold into a passport; and a documents folder for the
passports, visas and insurance you would be sorry to be without.

<img src="docs/images/honeymoon-map.jpg" width="820" alt="The honeymoon map: clustered pins across Portugal, Madeira and the Azores, with filters above and a category legend">

*Every place on one map, clustered, filterable, and fitted to whatever is showing.*

| Itinerary | Calendar |
|---|---|
| <img src="docs/images/honeymoon-itinerary.jpg" alt="The itinerary: day cards with a base, travel legs, timed stops and straight-line distances between them"> | <img src="docs/images/honeymoon-calendar.jpg" alt="The same itinerary as a month calendar, each trip day a tile carrying its stops"> |
| Days with a base, travel legs and timed stops | The same trip on a real calendar |

| Dashboard | Guide |
|---|---|
| <img src="docs/images/honeymoon-dashboard.jpg" alt="The honeymoon dashboard: counts, the itinerary, a map of confirmed pins, what needs attention and rough costs"> | <img src="docs/images/honeymoon-guide.jpg" alt="Region write-ups and Know Before You Go notes grouped by category"> |
| The whole trip on one screen | Region write-ups and everything with no coordinates |

> The screenshots above predate v0.9.44–v0.9.50, which added the Today view, the
> booking vault, the budget, road times, weather, the conflicts panel and the rest
> of `docs/honeymoon-improvements-2026-08-25.md`. The layout is the same; there is
> more on each screen.

### On a phone

<img src="docs/images/mobile-home.jpg" width="290" alt="The home page on a phone">

## Changelog

Every release is written up in [CHANGELOG.md](CHANGELOG.md), which is also the
source of truth for the app's version — the topmost `vX.Y.Z` is what the admin
panel displays.

## License

**Free for your wedding. Ask me about anything commercial.**

Source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE.md) —
not an open-source license, deliberately. Run it for your own wedding or a
friend's, read it, change it, self-host it, share your changes: all free, no
permission needed. Charities, schools, public research bodies and government
institutions count as noncommercial too.

Selling it, hosting it as a paid service, or building client sites with it needs
a separate license. That conversation is welcome and the answer is not
automatically no — [open an issue](https://github.com/Soccerbeats/weddingwebsite/issues)
and let's talk.

Dependencies keep their own licenses, and whatever a deployment holds — the
photographs, the guest list, the names — belongs to whoever put it there.
