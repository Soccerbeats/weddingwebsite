# Wedding Website

A wedding website with an admin panel deep enough to actually run a wedding from:
RSVPs and a guest list, a seating chart, a budget, a photo gallery, a registry —
and a private honeymoon planner with a map. Built with Next.js 16 and PostgreSQL,
self-hosted in Docker.

**📖 [Full documentation is in the wiki](https://github.com/Soccerbeats/weddingwebsite/wiki)**

<img src="docs/images/hero.jpg" width="820" alt="The live site: a full-bleed monochrome hero photograph with the couple's names, the date and RSVP buttons">

*The live site.*

> Everything under **Screenshots** below comes from the [demo instance](https://github.com/Soccerbeats/weddingwebsite/wiki/The-Demo-Instance)
> instead, so the couple, guests, budget and honeymoon in those are fictional.

## Screenshots

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
| Drag to reorder, heart to publish | Every release, read in the panel — see [Versions and the changelog](#versions-and-the-changelog) |

### The honeymoon portal

Private planning for the trip — admin-only, with no public page.

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

### On a phone

<img src="docs/images/mobile-home.jpg" width="290" alt="The home page on a phone">

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
- **Honeymoon** — a private planner: a map of everywhere you are considering, a
  day-by-day itinerary, accommodation and excursion shortlists, and the guide
  notes that have no coordinates

Full list: **[Features](https://github.com/Soccerbeats/weddingwebsite/wiki/Features)**.

## Quick start

The image is on GitHub Container Registry, so there is nothing to build:

```bash
docker compose -f docker/docker-compose.yml up -d   # see the wiki for the compose file and env vars
```

Then open `http://localhost:3000`, and `/admin` with the password you set.

- **[Installation](https://github.com/Soccerbeats/weddingwebsite/wiki/Installation)** — Portainer, plain Compose, or local
- **[Deployment](https://github.com/Soccerbeats/weddingwebsite/wiki/Deployment)** — building, pushing and redeploying

## Documentation

| | |
|---|---|
| **[Installation](https://github.com/Soccerbeats/weddingwebsite/wiki/Installation)** | Portainer, Docker Compose, or running it locally |
| **[Deployment](https://github.com/Soccerbeats/weddingwebsite/wiki/Deployment)** | Build, push, redeploy — and the Portainer 500 |
| **[The demo instance](https://github.com/Soccerbeats/weddingwebsite/wiki/The-Demo-Instance)** | A second stack with a fictional wedding in it |
| **[Guests and RSVPs](https://github.com/Soccerbeats/weddingwebsite/wiki/Guests-and-RSVPs)** | Guest list, bulk editing, mailing-list export, CSV format |
| **[Registry](https://github.com/Soccerbeats/weddingwebsite/wiki/Registry)** | Honeymoon fund and the Target/Amazon product registry |
| **[Finances](https://github.com/Soccerbeats/weddingwebsite/wiki/Finances)** | Budget, payers, contributors, receipts, schedule |
| **[Honeymoon portal](https://github.com/Soccerbeats/weddingwebsite/wiki/Honeymoon-Portal)** | Map, itinerary, places, stays, excursions, guide |
| **[Content and settings](https://github.com/Soccerbeats/weddingwebsite/wiki/Content-and-Settings)** | Nav cards, countdown modes, WIP toggles |
| **[Features](https://github.com/Soccerbeats/weddingwebsite/wiki/Features)** | The exhaustive list |
| **[Architecture](https://github.com/Soccerbeats/weddingwebsite/wiki/Architecture)** | Where data lives, the tables, the stack |
| **[Versions and the changelog](https://github.com/Soccerbeats/weddingwebsite/wiki/Versions-and-the-Changelog)** | How versions work and the in-app viewer |
| **[Development](https://github.com/Soccerbeats/weddingwebsite/wiki/Development)** | Local setup, check scripts, seeds |
| **[Troubleshooting](https://github.com/Soccerbeats/weddingwebsite/wiki/Troubleshooting)** | What has gone wrong before, and the fix |

Every release is written up in [CHANGELOG.md](CHANGELOG.md), which is also the
source of truth for the app's version — the topmost `vX.Y.Z` is what the admin
panel displays.

## Built with

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 ·
PostgreSQL 15 · Leaflet · @dnd-kit · sharp · Docker
