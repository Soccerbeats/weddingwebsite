# Changelog

All notable changes to this project are documented here.

## [Unreleased]

## [2026-06-01] — Mobile hero collapse animation + about image tilt fix

### Added
- **Mobile hero collapse animation** — On first swipe-up the full-screen hero squishes vertically into the center third while a second photo slides down from above and a third rises up from below, all in the same 900ms cubic ease-in-out as desktop. Swipe down when collapsed to reverse the animation and restore the full hero. Dispatches the same `hero-collapsing` / `hero-expanded` CustomEvents as desktop so the nav pill transition fires simultaneously. Particle burst (gold sparks, white sparks, rose petals) fires at the strip-seam lines at ~70% through both collapse and expand.

### Fixed
- **About section image tilt on mobile** — The couple photo in the "How We Met" section was always rotated 2°. Now the tilt only applies on `md` breakpoint and above (`md:rotate-2`); on mobile the image sits perfectly straight.

## [2026-05-31] — RSVP dietary restrictions overhaul, party member cards, dashboard fixes, nav cards

### Added
- **Per-guest dietary restriction cards** — Each guest in the RSVP form now gets their own card with checkboxes: Vegetarian, Vegan, Gluten Free, Nut Allergy, Other. "Other" reveals a required text field; submission is blocked until it's filled in.
- **Attending toggle per guest card** — Additional party members have an attending toggle; toggling on an unnamed slot reveals a required name input.
- **Party members support (families of 4+)** — `party_members JSONB` column on `guest_list`; supports named and unnamed extra guests. Unnamed slots force the RSVP filler to enter a name. Party size enforced server-side.
- **Party sub-rows in RSVP and Guest List admin tables** — Each head guest row shows soft gray sub-rows for additional party members, with their dietary data if available. Styled with `bg-gray-50/60`, thin `border-l-2 border-gray-200` left accent, compact padding, muted text.
- **"Make Changes" button on RSVP success screen** — Replaces the static info box; re-opens the RSVP form pre-filled.
- **Phone number mandatory** — RSVP form and API both require phone before submission.
- **Resolved member names written back to guest_list** — When a guest names an unnamed party slot during RSVP, that name is persisted to `guest_list.party_members` for future sessions.
- **Nav card default photos** — Bundled royalty-free Unsplash photos (`public/images/nav-defaults/`) for each card slug (our-story, wedding-party, schedule, photos, registry, rsvp). Render in grayscale by default.
- **Nav card gallery picker** — "Gallery" button in Admin → Nav Cards opens a modal of all site photos (loaded as thumbnails via `/api/photos/<filename>/thumb` for fast loading). Clicking picks a photo and copies it to the nav-cards slot.
- **Nav card PATCH API** — `PATCH /api/admin/nav-cards` accepts `{ slug, sourceFilename }` to copy an existing site photo to the nav-cards dir.

### Fixed
- **Dashboard guest list counts all showing 0** — SQL was checking `rsvp_status = 'confirmed'` but RSVP API writes `'attending'`. Fixed to use `'attending'`.
- **Dashboard pending count** — Now correctly excludes `attending`, `declined`, and `likely_not_coming` statuses.
- **party_size overwritten on re-RSVP** — Removed `party_size` mutation from the RSVP submit/update API; the pre-set admin value is now preserved.
- **Nav cards crashing the home page** — `dangerouslySetInnerHTML` caused hydration errors; replaced with proper React JSX SVG components.
- **Gallery button crash** — Photos API returns `{ photos: [] }` not a plain array; fixed parsing with `Array.isArray(data) ? data : data.photos`.
- **Docker deploy speed** — Added `--cache-from` flag; dropped the redundant local `npm run build` before `docker build`. Updated `deploy.md`.

### Changed
- **Nav card images are grayscale** — CSS `grayscale` filter applied to all nav card images (both custom and defaults).
- **Admin nav card thumbnails** — Now show real photo previews (custom or default) instead of a gradient placeholder box.

## [2026-05-27] — Venue photo + Get Directions button

### Added
- **Venue photo** — A photo can now be assigned to the Venue section on the home page. Go to **Admin → Photos**, hover any photo, and click **"Set Venue Photo"**; the image renders below the venue description as a full-width rounded card (`h-72` mobile / `h-96` desktop). The current assignment is previewed in the photo admin assignments strip alongside Home Hero, About Hero, Footer, and Wedding Logo. Config key: `venuePhoto` in `site.json`.

### Changed
- **"Get Directions" link → pill button** — When a venue address is configured, the plain underline link is now a solid accent-colored rounded pill button (matching the RSVP/FAQ CTA style) with an inline map-pin icon; `uppercase tracking-widest text-sm font-bold shadow-lg hover:shadow-xl`.

## [2026-05-27] — UI animations, hero collapse, nav island, About merged into Home

### Added
- **HeroCollapse component** — Desktop: full-screen hero slideshow that animates into a condensed vertical strip on first scroll; scattered polaroid-style photos fly in from off-screen left/right with staggered easing; single wheel event triggers full 900ms RAF animation (not scroll-position-driven); state machine (`full | animating | collapsed`); mobile renders a static non-collapsing hero. Files: `src/components/HeroCollapse.tsx`
- **FadeIn component** — Scroll-triggered entrance animations powered by IntersectionObserver; supports `fade`, `slide-up`, `slide-left`, `slide-right`, `scale`; configurable delay; used on timeline, schedule, wedding party, and home/about sections. Files: `src/components/FadeIn.tsx`, `src/hooks/useInView.ts`
- **HeartBurst component** — Double-click or double-tap anywhere on the page bursts 7 floating hearts from the cursor using CSS `@keyframes heart-float` with `--dx`/`--dy` custom properties. Files: `src/components/HeartBurst.tsx`
- **photoSrc helper** — `photoSrc(filename, size)` and `photoSrcSet(filename)` for responsive image loading; 5 breakpoints (thumb 320, small 640, medium 960, large 1280, xl 1920) via `?w=N` sharp resize; used across timeline, wedding party, hero slideshow. Files: `src/lib/photoSrc.ts`
- **Page transition animation** — `@keyframes page-enter` (fade + slight rise) applied via `key={pathname}` on `<main>` in AppShell; hero text has staggered 200/400/600/800ms entrance delays. Files: `src/app/globals.css`, `src/components/AppShell.tsx`
- **About section merged into Home page** — About content (Our Story, How We Met, The Venue, The Ceremony/Reception, FAQ) now lives at the bottom of the home page under `id="about"`. Nav "About" link changed to `/#about` hash link with auto-scroll. `/about` route redirects to `/#about` so old links still work. Files: `src/app/page.tsx`, `src/app/about/page.tsx`

### Changed
- **Navigation: banner → island animation** — Nav starts as a full-width frosted-glass banner (flush to all screen edges) on every page. On first scroll past 60px it smoothly morphs into a floating pill (rounded corners, centered, inset 16px from edges, content-width). Uses `position: fixed` with CSS-interpolatable `top`/`left`/`right` pixel/calc values — no snap. Pill width is measured from actual DOM logo + link widths. Home page always island (no banner state). `scrolled` state resets on every route change to avoid carry-over.
- **Nav + hero collapse in sync** — HeroCollapse dispatches `hero-collapsing` custom event at animation start and `hero-expanded` at expand start; Navigation listens and transitions simultaneously instead of waiting for the scroll jump.
- **Mobile nav island** — On screens ≤767px the island uses `16px` insets on both sides (full-width pill) so hamburger and Admin button are always enclosed.
- **Responsive images** — Timeline, wedding party, and hero slideshow now use `srcSet` at 5 breakpoints via `photoSrc.ts`; browser picks smallest image that covers the display size.
- **HeroSlideshow** — First image decoded via `img.decode()` before showing; remaining images preloaded silently in background; `fetchPriority="high"` on first slide.

### Fixed
- **`whitespace-nowrap` on nav links** — "Wedding Party" no longer word-wraps to two lines in island mode.
- **About hero image path** — Was using `/photos/` (broken in Docker volume setup); updated to `/api/photos/` to go through the dynamic photo-serving route.

## [2026-05-25] — "Likely Not Coming" guest status

### Added
- **"Likely Not Coming" RSVP status** (`rsvp_status = 'likely_not_coming'`) — admin-only status for guests you know probably won't attend but still want to invite
- **Quick flag button (🙁)** on each guest row — one click to toggle the status without opening the edit modal
- **RSVP Status dropdown in Edit Guest modal** — full admin control: No Response / Attending / Declined / Likely Not Coming
- **"Likely Not Coming" stat card** — orange card added to both RSVP tab and Guest List tab stats
- **"Likely Not Coming" filter tab** — filter button in guest list to view only these guests
- **Row styling** — guests with this status show a light red/gray tinted row with muted text
- **Expected headcount exclusion** — "Expected Guests" stat excludes `likely_not_coming` guests from count
- **Seating chart exclusion** — `likely_not_coming` guests are filtered out of the seating chart sidebar entirely
- **Public RSVP override** — if a guest submits an RSVP (attending or declined), it overwrites `likely_not_coming` with their actual response

## [2026-05-25] — Target registry bookmarklet import

### Added
- **Target registry bookmarklet import** — Target locks their API, so a browser bookmarklet scrapes items from the rendered Manage Registry page and downloads a CSV. Admin panel has an expandable instructions card (🎯 red) with a draggable bookmarklet link, step-by-step instructions, and an Upload CSV button
- **`/api/admin/registry-items/import-target`** — accepts `{ items: [] }` (JSON from bookmarklet) or `{ csv: string }` (CSV fallback); deduplicates by title; tags all items as store: `target`
- **CLAUDE.md "document everything" convention** — README + CHANGELOG + vault + git push + Docker push
- **CHANGELOG.md** — this file

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

## [2026-05-25]

### Fixed
- **Seating chart sidebar scroll broken**: Guest list never scrolled — the `div` wrapping `<ReactFlowProvider>` in `SeatingPage` was a flex item but not a flex container, so `SeatingCanvas`'s `flex-1` had no effect and the component grew to full content height (~1611px). The sidebar inherited that height and had `scrollHeight == clientHeight`, making scroll impossible. Fix: added `flex flex-col` to the wrapper div.
- **Seating chart MiniMap and Controls not visible**: Same root cause — ReactFlow canvas inflated to 1563px, putting Controls and MiniMap (positioned `bottom: 28px`) at y≈1750px, far below the 900px viewport and clipped by `overflow: hidden`. Fixed by the same one-line change above.
- **Previous attempt (`min-h-0` on list div, removing MiniMap style prop) was a no-op** for both bugs because the height chain was broken two levels up; those changes are kept as correct belt-and-suspenders hygiene but weren't the actual fix.
