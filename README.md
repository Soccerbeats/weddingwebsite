# Wedding Website

A beautiful, customizable wedding website built with Next.js 16. Features include photo galleries, a relationship timeline, RSVP management, a tabbed registry (honeymoon fund + product registry), seating chart builder, and a comprehensive admin panel for content management.

## Features

### Public Site
- **Home Page**: Hero slideshow that collapses into a condensed strip on scroll (desktop), countdown timer, intro text, and About section all on one page. Content below the hero is built as a stack of overlapping "bands" — each section has rounded top corners (40px radius) and a soft drop shadow so the section boundaries and rounded edges read clearly against the blush page background. The Details & FAQ section is a fully-rounded white card, and the Explore (nav cards) section below it is white.
- **About (merged into Home)**: Our Story, How We Met, The Venue (with optional venue photo), Ceremony/Reception cards, and FAQ — all appear below the home intro; nav "About" link auto-scrolls to `#about` anchor; `/about` redirects there; "Get Directions" renders as a styled pill button with a map-pin icon when a venue address is set
- **Timeline**: Interactive vertical timeline of relationship milestones with photos; scroll-triggered entrance animations
- **Wedding Party**: Member cards with scroll-triggered animations; responsive images at 5 breakpoints
- **Schedule**: Wedding day timeline and events with scroll-triggered animations
- **Photo Gallery**: Beautiful gallery with lightbox (only shows "hearted" photos)
- **Registry**: Tabbed page with two sections:
  - 🌴 **Honeymoon Fund** — Experience items with contribution flow via Venmo, Cash App, Zelle, PayPal (deep links, app-first)
  - 🛍️ **Registry** — Product grid linked to Target and Amazon; shows thumbnail, title, price, description; clicking opens the product page directly
- **RSVP**: Guest RSVP form with name verification against guest list
- **Animations**:
  - Hero collapse (desktop): scroll down → hero condenses to strip + scattered polaroid photos fly in; scroll up → reverses
  - Hero collapse (mobile): swipe up → hero squishes vertically into center third while top/bottom photos slide in from edges; swipe down reverses; particle burst (gold sparks + rose petals) fires at strip seams on both collapse and expand
  - Nav banner → island: full-width frosted glass bar morphs into floating pill on scroll (all pages); both desktop and mobile hero dispatches fire this simultaneously
  - FadeIn: scroll-triggered `fade`, `slide-up`, `slide-left`, `slide-right`, `scale` on page sections
  - HeartBurst: double-click/double-tap anywhere spawns floating hearts
  - Page transitions: fade+rise animation on every route change
- **Responsive Design**: Mobile-friendly across all pages; nav island adapts width per screen size

### Admin Panel
- **Dashboard**: At-a-glance overview cards (countdown, RSVPs, guest list, content, seating, Q&A). The **RSVPs & Guests** card includes an **RSVP Deadline** stat showing days left before the RSVP cutoff — amber within 7 days, red once the deadline has passed, "—" if no deadline is set.
- **RSVP Management**:
  - Stats cards: Total RSVPs, Total Attending (individual guest count), Declined, Missing RSVPs (invited but no response)
  - Filter by: All, No Response, Attending, Declined, Not Invited, Bride's Side, Groom's Side
  - Name search — **type a name and press Enter to check that guest off**; the box clears and keeps focus so names can be worked through rapidly (see *Guest List — Rapid Check-Off*)
  - Party sub-rows: additional party members appear as soft gray sub-rows under the head guest row, with their dietary data
  - Responsive guest table: columns are measured and dropped by priority as the window narrows (Contact → Notes → Address → Donated → Relation → checkbox), so Name/Party/Invited/RSVP/Actions always stay readable and Edit/Delete are never cut off or stacked
- **Guest List**:
  - Import from CSV (handles quoted fields, commas in addresses)
  - **Export CSV** — downloads whatever the filter/search is currently showing as a mailing-list-ready CSV (see *Guest List — Mailing List Export*)
  - **Bulk editing** — tick guests, then *Mark as Invited* / *Delete Selected* inline, with a **⋯** overflow menu for Mark as Not Invited, ⚠️ Issue / 📌 Need flagging, and **Edit Selected…** (note, flag, side, RSVP status across the selection) — see *Guest List — Bulk Editing*
  - Manual add/edit/delete
  - Fields: name, email, phone, party_size, side, notes, party_members (JSONB), address
  - Supports families of 4+ with named/unnamed party member slots
  - Upsert on reimport — preserves email, phone, invited, notes, side; updates party_size, party_members, address
  - Import results: Added / Updated / Failed counts
  - RSVP submission syncs email/phone/rsvp_status and resolved party member names back to guest_list
  - Party sub-rows visible in guest list table
- **Photo Management**: Upload, drag-reorder, heart to publish, thumbnail API (`/api/photos/[filename]/thumb`), edit titles/descriptions, delete; **"Set Venue Photo"** button assigns a photo to display in the Venue section on the home page. Hearting a photo re-sorts it to the top without jumping the page (scroll position preserved); a floating **↑** button scrolls back to the top of the grid
- **Timeline Editor**: Create and manage milestones with up to 2 photos each; oldest-first order
- **Content Editors**: Home, About, Wedding Party, Schedule, Q&A (with Markdown `[text](url)` hyperlink support via "🔗 Insert Link" button)
- **General Settings**: Wedding date/time/venue, color scheme (accent/light/dark), page background colors, countdown display mode
- **Hero Slideshow**: Toggle on/off, pick specific photos, set interval; crossfade with no black flash (reveal-behind z-index technique); dot indicators; `img.decode()` for GPU-ready preloading
- **Registry Admin** (three sub-tabs):
  - *Honeymoon Fund*: Add/edit/remove experience items; log contributions received; progress bars; "Fully Funded" badge
  - *Registry Items*: Paste a product URL → auto-fetches OG metadata (title, image, description, price); edit any field before saving; grouped by store (Target / Amazon / Other); edit and delete saved items
  - *Settings*: Page title, subtitle, description text, background color, payment method handles (Zelle/Venmo/Cash App/PayPal)
- **Nav Cards**: Set background images for the home page navigation cards. Each card has a bundled grayscale default photo; use **Upload** to replace with a custom image or **Gallery** to pick from photos already on the site.
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
# Build and push (--cache-from speeds up repeat builds significantly)
docker pull ghcr.io/soccerbeats/weddingwebsite:latest 2>/dev/null || true && \
docker build --cache-from ghcr.io/soccerbeats/weddingwebsite:latest --target production \
  -t ghcr.io/soccerbeats/weddingwebsite:latest . && \
docker push ghcr.io/soccerbeats/weddingwebsite:latest

# Then in Portainer: Pull and redeploy
```

> ⚠️ Always use image name `ghcr.io/soccerbeats/weddingwebsite:latest` — do not change it.
> The Dockerfile runs `npm run build` internally — no need to run it locally before `docker build`.

### If Portainer's "Pull and redeploy" returns 500

**Root cause (confirmed 2026-07-29):** Docker Compose discovers a project's containers by filtering on the *presence* of the `com.docker.compose.config-hash` label — a label compose writes **only on containers it creates itself**. A container made by hand with `docker run` can never have it (you cannot add a label to an existing container). So compose sees **zero** containers for service `web`, tries to create a fresh one, and collides with the name that is already taken:

```
Stack pull successful
Container wedding-web-prod  Error response from daemon: Conflict.
The container name "/wedding-web-prod" is already in use by container "..."
```

**The image pull itself succeeds** — only the container swap fails. Two side effects:

- The web container keeps running the **old** image, so it looks like the deploy silently did nothing.
- A failed redeploy can leave `wedding-db-prod` created-but-stopped, i.e. **the database down**. Always check after a failed attempt:
  ```bash
  docker ps -a | grep wedding-db-prod   # start it if it isn't running
  ```

Diagnose in one command — if `wedding-web-prod` is missing from this list, that is the bug:

```bash
docker ps -a --filter label=com.docker.compose.project=weddingwebsite \
             --filter label=com.docker.compose.config-hash --format '{{.Names}}'
```

**Fix:** the container must be *created by compose*. Adding labels by hand cannot work — see *Manual deploy* below, which uses `docker compose` for exactly this reason. After the fix, `docker compose ... up -d --dry-run` reports both containers as `Running` instead of `Creating`, and Portainer's button works again.

> ⚠️ **Never recreate `wedding-web-prod` with `docker run`.** It produces a container with no `config-hash`, which silently re-breaks Portainer's "Pull and redeploy" until someone recreates it with compose again.

Portainer-EE itself runs in **Proxmox LXC 210**, not on docker-server (which only runs `portainer_agent`). Direct SSH to `10.0.0.210` fails; reach it via `ssh root@10.0.0.100` then `pct exec 210 -- ...`. Stack id is `146`; its compose file lives inside that container at `/var/lib/docker/volumes/portainer_data/_data/compose/146/v1/docker-compose.yml`, and the stack's env vars (`DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_DB`) live in Portainer's own database, not in that file.

### Manual deploy (bypassing Portainer)

Use **`docker compose`**, never `docker run` — this is what keeps the `config-hash` label intact so Portainer can still manage the stack afterwards.

A mirror of the Portainer stack lives on docker-server at `/data/compose/146/v1/` (`docker-compose.yml` + `stack.env`, mode 600 — it holds the DB password and `ADMIN_PASSWORD`). The paths deliberately match the ones inside the Portainer container so the resulting labels line up.

```bash
ssh root@10.0.0.188
cd /data/compose/146/v1
docker pull ghcr.io/soccerbeats/weddingwebsite:latest

# --no-deps so the database is left running untouched
docker compose -p weddingwebsite --env-file stack.env -f docker-compose.yml \
  up -d --no-deps --force-recreate web
```

If the stack files are ever missing, re-copy them from Portainer:

```bash
ssh root@10.0.0.100 'pct exec 210 -- cat /var/lib/docker/volumes/portainer_data/_data/compose/146/v1/docker-compose.yml'
ssh root@10.0.0.100 'pct exec 210 -- cat /var/lib/docker/volumes/portainer_data/_data/compose/146/v1/stack.env'
```

Verify:

```bash
docker inspect wedding-web-prod --format '{{.Config.Labels}}' | grep -o 'config-hash:[^ ]*'  # must be present
curl -o /dev/null -w '%{http_code}\n' http://localhost:3000/             # 200
curl -o /dev/null -w '%{http_code}\n' http://localhost:3000/admin/rsvps  # 307 (login redirect)
docker compose -p weddingwebsite --env-file stack.env -f docker-compose.yml ps
```

The image's own entrypoint/cmd are correct (`docker-entrypoint.sh` + `sh -c "/app/init-db.sh && node server.js"`) — do not override them.

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

### Guest List — Rapid Check-Off

In **Admin → RSVPs & Guests → Guest List**, use the search box to tick guests off a list quickly (handy when working through replies by phone or paper):

1. Type part of a guest's name
2. Press **Enter** — the top match is ticked, the box clears, and the cursor stays put
3. Type the next name and repeat

Details:
- Enter is **additive and never unticks**. Entering a name twice reports "*X was already checked*" rather than silently toggling it back off.
- **Party members match too.** Typing a member's name ticks their parent guest, and the confirmation names whoever was actually ticked, so it is never silent when the row checked isn't the name typed.
- **No match keeps the typed text** so a typo can be corrected instead of retyped, and warns in amber.
- The top match is taken **within the active filter tab** — with *Attending* selected, Enter picks from that subset only.
- A confirmation pill appears next to the "Showing N of M guests" line; the existing "{n} selected" bar tracks the running total for bulk actions.

### Guest List — Bulk Editing

Tick guests with the row checkboxes (or the header checkbox to take everything currently visible), then use the bar above the table:

| Button | What it does |
| --- | --- |
| **Mark as Invited** | Marks the whole selection invited |
| **Delete Selected** | Deletes the selection (confirms first) |
| **⋯** | Overflow menu holding the rest of the bulk actions (below) |

The **⋯** menu — sits to the right of *Delete Selected*, closes on outside click or `Esc`:

| Menu item | What it does |
| --- | --- |
| **Mark as Not Invited** | Clears the invited flag across the selection |
| **⚠️ Flag as Issue** | Flags every selected guest as an issue. **Pick it again later to clear** — if all selected guests already have the flag, it removes it |
| **📌 Flag as Need** | Same, for the need flag |
| **✏️ Edit Selected…** | Opens the bulk edit modal below |

A green pill next to the buttons confirms what happened (e.g. *Marked 6 guests as 📌 Need*).

**The Edit Selected… modal** applies only the fields you actually set — everything defaults to **Leave unchanged**, so a bulk edit can't quietly reset a column you didn't touch:

- **Flag** — Issue, Need, or Clear flag
- **Note** — three modes:
  - *Add to existing* (default) — appends on a new line and **keeps whatever note each guest already had**. This is the safe one.
  - *Replace* — overwrites the note on every selected guest
  - *Clear notes* — wipes them
- **Side** — bride's / groom's side, or clear
- **RSVP Status** — Likely Not Coming, Attending, Declined, or clear to No Response. This is what guests actually replied, so it's labelled as an admin override

Leaving the note box blank skips the note entirely, so you can use the modal purely to set a flag or side.

> **Select-all takes the visible rows only.** With a filter active (say *⚠️ Issue*), the header checkbox selects just those rows, and clicking it again deselects just those rows — guests hidden by the filter are never silently swept into a bulk edit or delete.

### Guest List — Mailing List Export

In **Admin → RSVPs & Guests → Guest List**, the blue **Export CSV (n)** button sits to the right of *Import CSV* and downloads the guest list as a CSV built for addressing envelopes and mail merges.

**What gets exported:** exactly the rows on screen. The button label shows the count, and the active filter tab **and** the search box both narrow the export — filter to *Invited*, and only invited households are in the file. Filename is `guest-list-<filter>-<YYYY-MM-DD>.csv` (`guest-list-search-…` when a search term is active).

**Columns:**

| Column | What it holds |
| --- | --- |
| `Mail Name` | Envelope name for the household — see the rules below |
| `Street` | Street line, with any apartment/unit kept on it |
| `City State Zip` | Ready-made second label line, e.g. `Racine, WI 53402` |
| `City`, `State`, `Zip` | The same, split out for sorting or a mail merge |
| `Address Issue` | Blank when the address parsed cleanly; otherwise `No address`, `missing state`, `Could not split city / state / zip`, etc. **Sort by this column to find addresses that need fixing before printing labels.** |
| `Shares Address With` | Other guests on the export at the same address — catches two invitations headed to one house (e.g. parents and an adult child) |
| `Full Address` | The raw address exactly as stored, on one line |
| `Party Size`, `Guest Name`, `Party Members` | Household size, the head guest, and the other members (unnamed slots show as `Guest`) |
| `Email`, `Phone`, `Side`, `Relationship`, `Invited`, `RSVP Status`, `Flag`, `Notes` | The rest of the guest record |

**Mail Name rules:**

| Household | Result |
| --- | --- |
| 1 person | `John Smith` |
| 2 people, same surname | `John & Jane Smith` |
| 2 people, different surnames | `John & Jane` (first names only) |
| 2 people, second person unnamed | `John Smith & Guest` |
| 3 or more | `Smith Family` — the most common surname in the party, ties going to the head guest, so a mixed household still gets the name the mail belongs to |

Names are cleaned first: parenthetical notes are dropped (`Natalie Williams (Zack's Girlfriend)` → `Natalie Williams`, and a plus-one recorded as only `(Collin's Date)` counts as unnamed), and suffixes are ignored when comparing surnames so `Nick Lucas Jr.` + `Nicole Lucas` still reads `Nick & Nicole Lucas`. `Party Size` — not the number of names on file — decides which rule applies.

**Address parsing** handles the shapes actually present in the list: line breaks used instead of commas, an apartment comma-separated (`…, Apt 208, Middleton, WI 53562`) *or* glued onto the city (`…, Apt. 5 Pewaukee, WI 53072` — the unit is moved back onto the street line), a state riding along with the city (`Muskego WI, 53150`), and `ZIP+4`. Anything it can't split is flagged in `Address Issue` rather than silently mangled. The file is written with a UTF-8 BOM so Excel opens accented names and curly apostrophes correctly, and every field is quoted so leading zeros in ZIPs survive.

### Guest List CSV Format

```csv
name,email,phone,party_size,side,notes,plus_one_name,address
John Doe,john@email.com,555-1234,2,groom,Vegan meal,Jane Doe,"123 Main St, Milwaukee, WI"
```

- Addresses with commas must be quoted
- `side`: `bride` or `groom`
- Duplicate names are upserted (not duplicated)
- For families of 4+, set `party_size` accordingly; add known names via the admin edit modal after import using the party members slots

### RSVP — Who Can Log In

Guests reach their RSVP by typing their **own** name — the lookup matches the primary guest name, `plus_one_name`, **or** any named entry in `party_members`. So if the invitation is filed under *Max Kulik* and his plus-one is *Kenzie Miller*, Kenzie can enter "Kenzie Miller" and pull up the party's RSVP for both of them. Matching ignores case and surrounding whitespace.

The form greets whoever signed in and, when that person isn't the primary guest, notes whose party they belong to. The RSVP itself is always filed under the primary guest, so everyone in a party edits the same submission rather than creating duplicates.

If a name were ever listed in two places, an exact primary-guest match wins over being listed inside someone else's party (then lowest guest id), so the result is deterministic.

### RSVP — Marking Each Guest Attending or Not Attending

Every party member has **two checkboxes — Attending / Not attending** — and they are mutually exclusive (ticking one clears the other; clicking a ticked box clears it back to unanswered).

**The RSVP cannot be sent until every guest has one of the two ticked.** While anyone is unanswered:
- their card is highlighted **amber**
- a line above the buttons reads "*N guests still need to be marked attending or not attending*"
- **Send RSVP is disabled** (with a server-side check behind it that names the specific person)

Pre-fill behaviour:
- **A brand-new RSVP starts completely blank** — nothing is guessed on the guest's behalf.
- **Re-opening an RSVP that was already sent restores what was chosen**, so it never looks like their answers were lost.

The primary guest shows a fixed green **Attending** pill rather than checkboxes, because they have already answered via the "Will you be attending?" dropdown above — picking *Regretfully Declines* there declines the whole party.

> **Note:** attendance is not stored per member. A submitted RSVP lists exactly its attendees in `dietary_restrictions` (the admin view reads that array as "who's coming"), so "absent from that list" means *not attending*. That is exact for RSVPs sent through this form, since submitting requires answering everyone.

### RSVP — Per-Guest Dietary Restrictions

Each party member gets their own card on the RSVP form with checkboxes:
- Vegetarian, Vegan, Gluten Free, Nut Allergy
- **Other** — checking this reveals a required text input; the form cannot be submitted until it is filled in

Dietary checkboxes appear once a member is marked **Attending**. Saved dietary choices are restored when re-opening a submitted RSVP. Unnamed guest slots require the submitter to enter a name before marking them as attending.

### Nav Cards — Setting Images

In **Admin → Nav Cards**:
1. Each page card shows a preview thumbnail (grayscale default photo if no custom image is set)
2. **Upload** — upload a new image from your device
3. **Gallery** — opens a modal of all photos already uploaded to the site; click any to use it
4. **Remove** — reverts to the default bundled photo

All nav card images display in black and white on the public site.

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

### Finances

**Admin → Finances.** Five tabs. Every field edits in place — type, then click away or press Enter; `Esc` cancels. Nothing needs a Save button, and totals recalculate as soon as an edit lands.

On first run the suite imports the original *Heav & Aust Wedding Spreadsheet — Budget* tab: 3 sections, 27 line items, 2 payers, 14 purchases and 4 contributors. It only seeds when the tables are empty, so it never duplicates or overwrites later edits. Two things it can't bring over: the **paid** flags (the spreadsheet stored those as bold text, which CSV export drops — tick them yourself), and the sheet's own $680 rounding gap (see *Gift Money* below).

**Overview** — the report. Budget total, spent to date, gift money received, and what's left to cover, then the per-person split and payment plan. The **planning scenario** toggle switches every figure between:
- *Cash in hand* — counts only money actually received. The safe number.
- *If pledges land* — counts every pledge as money you'll get.

Below that: where the money goes by section, your ten biggest line items, and a **Worth a look** panel listing lines where spending has passed the budget plus any purchase with no budget line attached.

**Budget** — sections and line items. Each line is `Unit cost × Qty`, and **Qty from** decides where the quantity comes from: *Fixed* (you type it), or *Adults* / *Minors* / *All guests* (driven by the headcount in Settings, so a headcount change ripples through dinner, kids' meals and the bar at once). The **Paid** toggle replaces the spreadsheet's bold convention.

Click the ▶ on any line to expand it for notes, a list of payments made against it, and **Break into parts** — build a line from components that sum into it, the way Appetizers reaches $1,700 from six dishes. A line using parts ignores its own cost and quantity.

**Purchases** — the spend log. Each entry records what, when, who paid, and which budget line it counts against. Filter by payer or search; the footer totals whatever is on screen. Leaving the budget line as *— no line —* is fine, but that spend won't count against any line and gets flagged on the Overview.

**Gift Money** — money toward the wedding bill: parents, family, anyone chipping in. Each contributor has a **pledge**, then you log each payment as it actually arrives. Totals are always derived from the logged payments, which is what stops the drift the spreadsheet had (its receipt log said $6,880 received while its summary said $6,200 — the $680 was never rolled up). Give more than pledged and the extra is kept, not discarded. Each payment can be earmarked to a budget line.

> Wedding and shower **gifts from guests** are a different thing and stay on the **Registry** page, where they remain tied to a guest for thank-you notes.

**Settings** — headcount, payers and the payment plan.
- *Headcount*: adult and minor counts. Your guest list is shown alongside as a reference with a one-click **Use** button, but it is never read automatically — a late RSVP shouldn't quietly move a $33k total, and the guest list has no adult/minor marker anyway.
- *Who pays*: an editable list with a share percentage each, 50/50 by default. Shares split whatever the contributions don't cover. Someone who buys things but owes nothing — a parent picking up the decor — gets **0%**; their spending still shows, as a credit. Shares that don't total 100% still work; each person is charged their slice of the total.
- *Payment plan*: leave the horizon blank to count down to your wedding date automatically, or set a fixed number of months. Days-between-paychecks drives the per-paycheck figure (14 for every other week).

Verification scripts, all runnable independently:

```bash
npx tsx scripts/verify-finance-math.mts     # engine vs. the original spreadsheet, to the penny
DATABASE_URL=... npx tsx scripts/verify-finance-db.mts    # schema, seed, CRUD, injection safety
BASE=... ADMIN_PASSWORD=... npx tsx scripts/verify-finance-ui.mts   # real browser, all five tabs
```

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
| `donations` | Wedding/shower gifts from guests (Registry page) |
| `finance_settings` | Headcount and payment-plan config (single row) |
| `finance_categories` / `finance_items` / `finance_subitems` | Budget sections, line items, and component parts |
| `finance_payers` | Who pays, with share percentages |
| `finance_purchases` | Spend log, linked to a payer and a budget line |
| `finance_contributors` / `finance_receipts` | Gift-money pledges and the payments actually received |

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
| Thumbnails show broken-image icons | `/api/photos/<file>/thumb` is 404ing. Run `npm run check:photos` — it exercises thumbs, full-size, `?w=` resize and the traversal guard against the route handler directly. In `src/app/api/photos/[...filepath]/route.ts` the trailing `thumb` segment must be stripped **before** the `fs.existsSync()` check, or it stats `<file>/thumb` and 404s everything |
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
