# Changelog

All notable changes to this project are documented here.

## [Unreleased]

## [2026-05-25] — Seating chart overhaul + registry imports

### Added
- **Amazon registry CSV import** — Upload `.csv` from Amazon registry export; each row imports as a separate item with ASIN-based image URLs. Skips duplicates by title. (`/api/admin/registry-items/import`)
- **Seating chart: RSVP color mode** — Toggle between Party view (green/yellow party cohesion) and RSVP view (green = RSVPed, white = no response)
- **Seating chart: seat reorder modal** — Drag names within a table to set who sits next to who. Rendered via React portal (z:99999) so it always appears on top
- **Seating chart: drag seated person between tables** — Seat chips are now draggable; drop on another table moves that person individually. Splits a party → yellow warning appears
- **Seating chart: guest list filters** — Filter sidebar by side (bride/groom), RSVP status, invited status, and party size
- **Seating chart: snap-to-grid** — Tables snap to a 20px grid when dragging for easy alignment
- **RSVP guest list: bulk "Mark as Not Invited"** — Select guests → bulk uncheck invited status (with confirmation)
- **GitHub topics** — 20 topics added to the repository for discoverability
- **"Document everything" convention** — Defined in CLAUDE.md; includes README, vault, CHANGELOG, git push, and Docker push

### Fixed
- **Seating chart: room layer z-index** — Room SVG now renders before ReactFlow in the DOM so tables are never tinted by the room fill
- **Seating chart: room edges** — Always solid (removed dashed style)

---

## [2026-05-25] — Registry redesign + admin panel additions

### Added
- **Registry page** — Redesigned with two tabs: Honeymoon Fund and Registry (product grid)
- **Registry Items admin tab** — Paste a Target or Amazon URL → auto-fetches OG metadata (title, image, description, price); edit before saving; grouped by store
- **Hero slideshow** — Toggle on/off, pick photos, set interval; crossfade with no black flash; dot indicators; `img.decode()` GPU-ready preloading
- **FAQ hyperlink support** — Markdown `[text](url)` in FAQ answers, with "🔗 Insert Link" button
- **WIP "Hidden from Nav"** — Second per-page toggle that removes a page from nav entirely (vs WIP which shows "coming soon")
- **Basic Mode** — Pre-release mode showing only Home/About/Timeline/Photos; optional venue sub-toggle
- **RSVP stats overhaul** — Total Attending (individual guests), Declined per-guest, Missing RSVPs card
- **Admin nav button** — Accent pill in site nav, visible only when logged in (desktop + mobile)
- **Photo thumbnail API** — `/api/photos/[filename]/thumb` (300×200, 70% quality)

### Fixed
- **iPhone hero crossfade** — Reveal-behind z-index technique + `img.decode()` eliminates black flash
- **Viewport height** — JS probe element technique fixes `vh` cross-browser issues on mobile

---

## [2026-05-24] — Guest list CSV import fixes

### Added
- `address` field to `guest_list` table and admin UI
- CSV import upsert: Added / Updated / Failed result counts
- Proper quoted-field CSV parser (handles commas in addresses)

### Fixed
- Upsert now preserves `email`, `phone`, `invited`, `notes`, `side` on reimport
- Duplicate guest blocking unique index creation (case-insensitive index)
- RSVP submission syncs `email`, `phone`, `rsvp_status` back to `guest_list`

---

## [2025-12-31] — Initial launch

### Added
- Public site: Home (countdown), About, Timeline, Wedding Party, Schedule, Photos, RSVP
- Admin panel: RSVP management, guest list, photo upload/reorder/heart, timeline editor, content editors, settings
- PostgreSQL database with Docker volumes for persistence
- Docker multi-stage build → GitHub Container Registry → Portainer deployment
