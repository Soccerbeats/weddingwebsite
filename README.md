# Wedding Website

A beautiful, customizable wedding website built with Next.js 16. Features include photo galleries, a relationship timeline, RSVP management, a tabbed registry (honeymoon fund + product registry), seating chart builder, and a comprehensive admin panel for content management.

## Features

### Public Site
- **Home Page**: Welcome message with countdown timer (days/hours/minutes/seconds, configurable display modes) and optional hero slideshow
- **About**: Love story with customizable text, photos, details, and FAQ section
- **Timeline**: Interactive vertical timeline of relationship milestones with photos
- **Wedding Party**: Display bridesmaids, groomsmen, and important people
- **Schedule**: Wedding day timeline and events
- **Photo Gallery**: Beautiful gallery with lightbox (only shows "hearted" photos)
- **Registry**: Tabbed page with two sections:
  - 🌴 **Honeymoon Fund** — Experience items with contribution flow via Venmo, Cash App, Zelle, PayPal (deep links, app-first)
  - 🛍️ **Registry** — Product grid linked to Target and Amazon; shows thumbnail, title, price, description; clicking opens the product page directly
- **RSVP**: Guest RSVP form with name verification against guest list
- **Responsive Design**: Mobile-friendly across all pages

### Admin Panel
- **RSVP Management**:
  - Stats cards: Total RSVPs, Total Attending (individual guest count), Declined, Missing RSVPs (invited but no response)
  - Filter by: All, No Response, Attending, Declined, Not Invited, Bride's Side, Groom's Side
  - Name search
- **Guest List**:
  - Import from CSV (handles quoted fields, commas in addresses)
  - Manual add/edit/delete
  - Fields: name, email, phone, party_size, side, notes, plus_one_name, address
  - Upsert on reimport — preserves email, phone, invited, notes, side; updates party_size, plus_one_name, address
  - Import results: Added / Updated / Failed counts
  - RSVP submission syncs email/phone/rsvp_status back to guest_list
- **Photo Management**: Upload, drag-reorder, heart to publish, thumbnail API (`/api/photos/[filename]/thumb`), edit titles/descriptions, delete
- **Timeline Editor**: Create and manage milestones with up to 2 photos each; oldest-first order
- **Content Editors**: Home, About, Wedding Party, Schedule, Q&A (with Markdown `[text](url)` hyperlink support via "🔗 Insert Link" button)
- **General Settings**: Wedding date/time/venue, color scheme (accent/light/dark), page background colors, countdown display mode
- **Hero Slideshow**: Toggle on/off, pick specific photos, set interval; crossfade with no black flash (reveal-behind z-index technique); dot indicators; `img.decode()` for GPU-ready preloading
- **Registry Admin** (three sub-tabs):
  - *Honeymoon Fund*: Add/edit/remove experience items; log contributions received; progress bars; "Fully Funded" badge
  - *Registry Items*: Paste a product URL → auto-fetches OG metadata (title, image, description, price); edit any field before saving; grouped by store (Target / Amazon / Other); edit and delete saved items
  - *Settings*: Page title, subtitle, description text, background color, payment method handles (Zelle/Venmo/Cash App/PayPal)
- **Seating Chart**: Visual floor plan builder — add/resize room shape, place tables (round/rectangle/sweetheart), drag-drop guests from sidebar, party cohesion coloring
- **WIP Control**:
  - Per-page **WIP** toggle (shows "coming soon" to non-admins)
  - Per-page **Hidden** toggle (removes page from nav entirely)
  - **Basic Mode**: Pre-release mode showing only Home/About/Timeline/Photos; optional venue sub-toggle
- **Admin Navigation**: Admin button visible in nav only when logged in (desktop + mobile)

## Quick Start

### Using Portainer (Recommended)

1. **Copy** `docker-compose.prod.yml`
2. **Create a new Stack** in Portainer → paste the contents
3. **Add environment variables**:
   ```env
   ADMIN_PASSWORD=your_secure_password
   POSTGRES_USER=wedding_user
   POSTGRES_PASSWORD=secure_db_password
   POSTGRES_DB=wedding_db
   DATABASE_URL=postgresql://wedding_user:secure_db_password@db:5432/wedding_db
   NODE_ENV=production
   ```
4. **Deploy** — public site at `:3000`, admin at `:3000/admin`

### Docker Compose (Local)

```bash
git clone <repository-url>
cd weddingwebsite
cp .env.example .env   # edit values
docker-compose up -d --build
```

### Local Development

```bash
npm install
cp .env.example .env.local
npm run dev
# open http://localhost:3000
```

## Deployment (Portainer Production)

```bash
# Build and push
docker build -t ghcr.io/soccerbeats/weddingwebsite:latest --target production .
docker push ghcr.io/soccerbeats/weddingwebsite:latest

# Then in Portainer: Pull and redeploy
```

> ⚠️ Always use image name `ghcr.io/soccerbeats/weddingwebsite:latest` — do not change it.

## Admin Panel Guide

### Registry — Honeymoon Fund

1. Go to **Admin → Registry → Honeymoon Fund**
2. Click **+ Add Experience** — enter emoji, title, price, description
3. Use **+ Log Gift** to record contributions received via Venmo/Zelle/etc.
4. Items show progress bars and "Fully Funded" badge when complete

### Registry — Product Items (Target & Amazon)

1. Go to **Admin → Registry → Registry Items**
2. Paste a product URL (e.g. `https://www.target.com/p/...`) → click **Fetch →**
3. The site auto-fills title, image, description, and price from the page
4. Edit any field if the auto-fetch is incomplete (Amazon may block)
5. Click **Save Item** — it appears on the public Registry tab immediately
6. Items are grouped by store on both admin and public pages

### Guest List CSV Format

```csv
name,email,phone,party_size,side,notes,plus_one_name,address
John Doe,john@email.com,555-1234,2,groom,Vegan meal,Jane Doe,"123 Main St, Milwaukee, WI"
```

- Addresses with commas must be quoted
- `side`: `bride` or `groom`
- Duplicate names are upserted (not duplicated)

### Countdown Display Modes

In **General Settings → Countdown Mode**:
- `full` — Days / Hours / Minutes / Seconds
- `simple` — Days / Hours
- `days-only` — Days only (large display)

### WIP & Hidden Toggles

In **Admin → Work in Progress**:
- **WIP**: Shows a "coming soon" page to non-admins; admins see full page
- **Hidden**: Removes the page from the nav entirely for non-admins
- **Basic Mode**: Hides most pages for a pre-launch look

## File Storage

| Data | Location | Persisted via |
|------|----------|---------------|
| Uploaded photos | `public/photos/` | Docker volume |
| Site config | `public/config/site.json` | Docker volume |
| Photo metadata | `public/config/photos.json` | Docker volume |
| Timeline | `public/config/timeline.json` | Docker volume |
| Registry items | inside `site.json` (`registryItems[]`) | Docker volume |
| RSVPs / guest list | PostgreSQL | Docker volume |

> Photos are served via `/api/photos/[filename]` — not as static files — because Next.js standalone doesn't serve runtime volume files statically.

## Database Tables

| Table | Purpose |
|-------|---------|
| `rsvps` | Guest RSVP submissions |
| `guest_list` | Pre-populated guest list with contact info |
| `wip_toggles` | Per-page WIP/Hidden toggle state |
| `seating_*` | Seating chart room/table/assignment data |

## Backup

```bash
# Database
docker-compose exec db pg_dump -U wedding_user wedding_db > backup-$(date +%Y%m%d).sql

# Photos + config
docker cp <container>:/app/public/photos ./backup/photos
docker cp <container>:/app/public/config ./backup/config
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Photos not showing | Must use `/api/photos/[filename]` path, not `/photos/[filename]` |
| Can't log in | Verify `ADMIN_PASSWORD` env var; try incognito |
| RSVP not found | Guest name must match guest_list exactly (case-insensitive) |
| Registry fetch blank | Amazon blocks scrapes — fill in manually after fetch attempt |
| WIP page showing | Admin → WIP Control → toggle page to Live |
| Build fails | Run `rm -rf .next` then rebuild — stale cache causes false errors |

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Node.js 20
- **Database**: PostgreSQL 15
- **Auth**: Cookie-based with bcrypt
- **File Storage**: Docker volumes, served via API route
- **Deployment**: Docker multi-stage build → GitHub Container Registry → Portainer

## Developer Docs

See `CLAUDE.md` for full technical architecture, file structure, data flow, and implementation details.

---

**Made with ❤️ for Heaven & Austin's wedding**
