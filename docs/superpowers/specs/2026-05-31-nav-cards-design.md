# Nav Cards Design Spec

## Summary
Add a 2-column grid of image cards at the bottom of the home page (below the About/FAQ section). Each card links to a site page, shows a full-bleed background photo with a dark gradient overlay, and displays the page title + that page's existing subtitle. Cards are hidden for any pages marked hidden in WIP Control. A new "Nav Cards" admin page lets the admin upload one background image per page.

---

## Card Appearance
- **Style:** Full-bleed background image, dark-to-transparent gradient overlay at bottom
- **Content:** Small gold eyebrow label (page category), page title in serif, subtitle in small muted text below
- **Hover (desktop):** Card lifts up (`translateY(-6px)`) + background image subtly zooms in (`scale(1.05)`). Transition `0.35s ease`.
- **Mobile:** 1-column grid, no hover effect needed (CSS handles this)
- **Placeholder (no image set):** Accent-colored gradient background so cards always look decent

## Layout
- Grid: `grid-cols-1 md:grid-cols-2`, `gap-6`, max-width constrained, centered
- Card height: `h-64` (256px)
- Placed at bottom of home page, below FAQ section, inside its own padded section with a heading like "Explore"

## Which Pages Get Cards
All non-Home nav pages: About, Timeline, Wedding Party, Schedule, Photos, Registry, RSVP — **minus** any pages where `is_hidden = true` in the `wip_toggles` DB table. Registry is also excluded if `registry.enabled = false` in site config.

## Subtitle Source (auto-pulled, not editable on the Nav Cards page)
| Page | Config key |
|---|---|
| About (`/#about`) | `aboutSubtitle` ← **new** |
| Timeline (`/our-story`) | `timelineSubtitle` ← exists |
| Wedding Party (`/wedding-party`) | `weddingPartySubtitle` ← exists |
| Schedule (`/schedule`) | `scheduleSubtitle` ← **new** |
| Photos (`/photos`) | `photosSubtitle` ← exists |
| Registry (`/registry`) | `registryPageSubtitle` ← **new** |
| RSVP (`/rsvp`) | `rsvpSubtitle` ← **new** |

---

## Admin: Nav Cards Page (`/admin/nav-cards`)
One row per page. Each row shows:
- Page name + destination path (read-only label)
- Current image thumbnail (or "No image" placeholder)
- Upload button → file input → uploads image, replaces existing
- Remove button (shown only if image exists)

Images saved to `public/photos/nav-cards/<slug>.jpg` (slug = path-derived, e.g. `about`, `our-story`, `rsvp`).
Filenames stored in `site.json` under `navCards: { about: 'about.jpg', 'our-story': 'our-story.jpg', ... }`.

---

## New Subtitle Fields Added to Existing Admin Pages
- `admin/about` → "Nav Card Subtitle" text input → saves `aboutSubtitle` to site.json
- `admin/schedule` → "Nav Card Subtitle" text input → saves `scheduleSubtitle` to site.json
- `admin/registry` → "Nav Card Subtitle" text input → saves `registryPageSubtitle` to site.json
- `admin/rsvp` → "Nav Card Subtitle" text input → saves `rsvpSubtitle` to site.json

---

## APIs
| Route | Method | Purpose |
|---|---|---|
| `/api/nav-cards` | GET | Public — returns active card list (filtered by WIP hidden + registry enabled) |
| `/api/admin/nav-cards` | POST | Upload image for a page (multipart) |
| `/api/admin/nav-cards` | DELETE | Remove image for a page |

### GET /api/nav-cards response
```json
[
  { "href": "/#about", "label": "About", "eyebrow": "Our Story", "subtitle": "Where it all began", "image": "about.jpg" },
  { "href": "/our-story", "label": "Timeline", "eyebrow": "Our Journey", "subtitle": "The journey of our love", "image": "our-story.jpg" }
]
```

---

## Data Storage
- Images: `public/photos/nav-cards/<slug>` (Docker volume, persisted)
- Config: `site.json` — new `navCards` key + 4 new subtitle keys
- SiteConfig interface updated in `src/lib/config.ts`
