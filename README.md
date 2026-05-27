# Wedding Website

A beautiful, customizable wedding website built with Next.js 16. Features include photo galleries, a relationship timeline, RSVP management, a tabbed registry (honeymoon fund + product registry), seating chart builder, and a comprehensive admin panel for content management.

## Features

### Public Site
- **Home Page**: Hero slideshow that collapses into a condensed strip on scroll (desktop), countdown timer, intro text, and About section all on one page
- **About (merged into Home)**: Our Story, How We Met, The Venue, Ceremony/Reception cards, and FAQ — all appear below the home intro; nav "About" link auto-scrolls to `#about` anchor; `/about` redirects there
- **Timeline**: Interactive vertical timeline of relationship milestones with photos; scroll-triggered entrance animations
- **Wedding Party**: Member cards with scroll-triggered animations; responsive images at 5 breakpoints
- **Schedule**: Wedding day timeline and events with scroll-triggered animations
- **Photo Gallery**: Beautiful gallery with lightbox (only shows "hearted" photos)
- **Registry**: Tabbed page with two sections:
  - 🌴 **Honeymoon Fund** — Experience items with contribution flow via Venmo, Cash App, Zelle, PayPal (deep links, app-first)
  - 🛍️ **Registry** — Product grid linked to Target and Amazon; shows thumbnail, title, price, description; clicking opens the product page directly
- **RSVP**: Guest RSVP form with name verification against guest list
- **Animations**:
  - Hero collapse: scroll down → hero condenses to strip + scattered polaroid photos fly in; scroll up → reverses
  - Nav banner → island: full-width frosted glass bar morphs into floating pill on scroll (all pages); both animations run simultaneously
  - FadeIn: scroll-triggered `fade`, `slide-up`, `slide-left`, `slide-right`, `scale` on page sections
  - HeartBurst: double-click/double-tap anywhere spawns floating hearts
  - Page transitions: fade+rise animation on every route change
- **Responsive Design**: Mobile-friendly across all pages; nav island adapts width per screen size

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

## Installation

### Portainer (Recommended)

The easiest way to self-host. No cloning required — Portainer pulls the pre-built image from GitHub Container Registry.

**1. Open Portainer → Stacks → Add Stack**

Give it a name (e.g. `wedding`) and paste the following into the Web editor:

```yaml
version: '3.8'

services:
  web:
    image: ghcr.io/soccerbeats/weddingwebsite:latest
    container_name: wedding-web-prod
    restart: always
    ports:
      - '3000:3000'
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
      - NODE_ENV=production
    volumes:
      - photos_data:/app/public/photos
      - config_data:/app/public/config
    depends_on:
      - db

  db:
    image: postgres:15-alpine
    container_name: wedding-db-prod
    restart: always
    environment:
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
  photos_data:
  config_data:
```

**2. Set environment variables** in the Portainer UI under the compose editor (Environment variables section):

| Variable | Example value | Notes |
|---|---|---|
| `ADMIN_PASSWORD` | `yourStrongPassword!` | Password for `/admin` login |
| `POSTGRES_USER` | `wedding_user` | Database username |
| `POSTGRES_PASSWORD` | `yourDbPassword!` | Database password |
| `POSTGRES_DB` | `wedding_db` | Database name |
| `DATABASE_URL` | `postgresql://wedding_user:yourDbPassword!@db:5432/wedding_db` | Must match the three values above |

**3. Deploy the stack** — Portainer pulls the image and starts both containers. The database schema initialises automatically on first boot.

**4. Access the site:**
- Public site: `http://your-server-ip:3000`
- Admin panel: `http://your-server-ip:3000/admin`

> **Tip:** Put a reverse proxy (Nginx Proxy Manager, Traefik, Caddy) in front of port 3000 to serve over HTTPS on a custom domain.

---

### Docker Compose (without Portainer)

```bash
git clone https://github.com/Soccerbeats/weddingwebsite.git
cd weddingwebsite

# Set your environment variables
export ADMIN_PASSWORD=yourStrongPassword!
export POSTGRES_USER=wedding_user
export POSTGRES_PASSWORD=yourDbPassword!
export POSTGRES_DB=wedding_db
export DATABASE_URL=postgresql://wedding_user:yourDbPassword!@db:5432/wedding_db

docker-compose -f docker-compose.prod.yml up -d
```

Site will be available at `http://localhost:3000`.

---

### Local Development

```bash
git clone https://github.com/Soccerbeats/weddingwebsite.git
cd weddingwebsite
npm install
cp .env.example .env.local   # fill in values
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

#### Bulk import from Target registry (bookmarklet method)

Target doesn't offer a native CSV export, so a one-click bookmarklet handles it:

1. In **Admin → Registry → Registry Items**, expand **🎯 Import from Target Registry** → click **Show bookmarklet instructions**
2. Drag the **"🎯 Export Target Registry"** link to your browser bookmarks bar
3. Go to **target.com** → your registry → **Manage registry**; scroll until all items are visible
4. Click the bookmark — a `target-registry.csv` file downloads automatically
5. Back in the admin panel, click **Upload CSV** — every item imports with title, price, image, and link
6. Duplicate items (same title) are skipped automatically

#### Bulk import from Amazon registry (recommended for Amazon)

1. Go to your Amazon registry → **Manage** → **Download list as spreadsheet (.csv)**
2. In **Admin → Registry → Registry Items**, click **Upload CSV**
3. Select the downloaded file — every item imports individually with title, price, image, and link auto-populated
4. Duplicate items (same title) are skipped automatically

#### Add individual items by URL

1. Paste a product URL (e.g. `https://www.target.com/p/...`) → click **Fetch →**
2. The site auto-fills title, image, description, and price from the page
3. Edit any field if the auto-fetch is incomplete (Amazon may block single-URL fetches)
4. Click **Save Item** — it appears on the public Registry tab immediately
5. Items are grouped by store on both admin and public pages

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
