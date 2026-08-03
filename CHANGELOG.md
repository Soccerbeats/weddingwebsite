# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Added
- **Finances suite (`/admin/finances`)** — replaces the `Heav & Aust Wedding Spreadsheet — Budget` tab. Five tabs: **Overview** (reporting), **Budget**, **Purchases**, **Gift Money**, **Settings**. Everything edits inline — commit on blur or Enter, revert on `Esc`, no Save button — and every derived figure recalculates from a single refetch so the grand total, percentages, both deficits and both payment plans can't disagree with each other.

  **Budget** holds sections → line items → optional component parts. A line is either `unit_cost × quantity` or the sum of its parts (Appetizers reaches $1,700 from six dishes). `qty_source` lets a line draw its quantity from the headcount (`adults` / `minors` / `total`) instead of a typed number, so Dinner, Dinner Kids and Bar all move together. `is_paid` becomes a real boolean, replacing the spreadsheet's "bold means it's been payed" convention.

  **Purchases** records what, when, who paid, and what it counts toward — either a single budget line or a whole section. Section-level targeting exists because bills like the venue's cover every line in the section and are paid down in installments; attaching those to the single Venue line both misattributed them and raised a false "over budget by $5,180" on a $4,500 line. `item_id` and `category_id` are mutually exclusive, enforced server-side in the same statement, so a payment can never be counted twice. Each section footer shows budgeted / paid so far / still owed with a progress bar, its installment log, and how much of the total came from gift money. Unlinked spend is kept and surfaced separately rather than silently excluded.

  **Gift money that has been earmarked counts as a payment against that bill**, because it is one — Rob's $5,000 toward the venue leaves the venue $5,000 more paid off. Earmarked receipts roll into a section's and a line's paid total, appear in the Purchases list as badged green rows (editable in place, with a filter pill of their own), and sit in each section footer alongside own-pocket installments. Previously they were only a footnote, so the venue read $9,680 paid when $14,680 had actually gone to it.

  The two roles gift money plays are kept strictly apart to avoid double counting: `outOfPocketTotal` (payers' own money) drives the per-payer shares and *left to cover*, while `paidTotal` = own + earmarked gift drives bill progress. The deficit already nets off contributions, so adding them to spend as well would understate what's left — a regression test pins `stillToSpendCash` at $9,516.26 across the change. Unearmarked receipts are reported separately as `giftUnapplied` (cash in hand, not yet a payment).

  **Gift Money** tracks money toward the wedding bill (parents, family) as a pledge per contributor plus individually logged receipts, each optionally earmarked to a whole section or a single line. Deliberately separate from the existing `donations` table, which tracks wedding/shower *gifts from guests* on the Registry page and stays guest-linked for thank-you notes.

  **Overview** shows per-section payment progress (paid vs budgeted, installment counts, still owed) and reports both planning scenarios side by side — *cash in hand* (received only) and *if pledges land* (all pledges) — with the per-payer share, remaining, and a payment plan in per-month / per-paycheck / per-day terms. The horizon derives from `weddingDate` so it tightens on its own; the spreadsheet hard-coded "12 Months". When no days remain (date passed or unset) the plan says *Due now* instead of printing the whole balance as a monthly figure.

  **Settings** exposes headcount, an editable payer list with adjustable shares (50/50 default; `0%` for someone who buys things but owes nothing, whose spend then reads as a credit), and the plan horizon. Live guest-list counts are offered as a one-click suggestion but never read automatically — a late RSVP shouldn't move a $33k total, and `guest_list` carries no adult/minor marker.

  New `src/lib/finance.ts` holds the whole calculation engine as pure functions; `src/lib/financeDb.ts` owns nine tables via the existing idempotent `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` pattern. One `GET /api/admin/finances` returns data + computed summary + live headcount in a single round trip; `POST|PATCH|DELETE /api/admin/finances/[resource]` is a generic CRUD endpoint over a strict table/column whitelist with parameterised queries only — unknown resources 404, unknown columns are dropped, bad enums fall back. `PATCH` with a bare array reorders in one transaction.

  On first run the original spreadsheet is imported (3 sections, 27 line items, 2 payers, 14 purchases, 4 contributors), guarded to run only when the tables are empty and wrapped in a transaction with a re-check so concurrent boots can't duplicate it. Paid flags are not imported — CSV export discarded the bold. Kim's $680 Veil receipt *is* imported, so seeded totals intentionally run $680 ahead of the old sheet, which never rolled it into its received column.

  Verified by three independent scripts: `verify-finance-math.mts` (49 assertions reproducing the spreadsheet to the penny, including its % column and the −$2,970.87 "Heaven is ahead" figure), `verify-finance-db.mts` (58 assertions — schema, seed, cross-restart idempotency, CRUD, SQL-injection attempts, item/section target exclusivity, FK behaviour on both line and section deletion, settings singleton), and `verify-finance-ui.mts` (55 assertions driving a real Chromium through all five tabs — inline edits moving the grand total, logging an installment and watching the section total move, paid flag surviving a reload, payer filtering, split changes reaching the Overview, and no horizontal overflow at 390px).

- **Bulk editing on the guest list** — with guests ticked, the action bar keeps **Mark as Invited** and **Delete Selected** inline and puts everything else behind a **⋯** overflow menu to the right of *Delete Selected*: Mark as Not Invited, **⚠️ Flag as Issue** and **📌 Flag as Need** (idempotent toggles: if every selected guest already has the flag, it clears it), and **✏️ Edit Selected…** — a modal covering flag, note, side and RSVP status. The menu closes on outside click or `Esc`, and on the selection emptying. Every field defaults to *Leave unchanged* so a bulk edit only writes what was actually set. Notes have three modes — **Add to existing** (default; appends on a new line via `CASE WHEN COALESCE(NULLIF(TRIM(notes),''),'') = '' THEN … ELSE notes || E'\n' || … END`, so existing notes are never clobbered and guests with no note don't get a leading blank line), **Replace**, and **Clear**. A green confirmation pill reports what changed. Backed by a widened `PATCH /api/admin/guest-list` that now accepts `{ ids: [...], flag?, side?, invited?, rsvp_status?, notes?, noteMode? }` and builds the `SET` clause from only the keys present, updating in a single statement via `WHERE id = ANY($n)`; the original `{ id, address }` single-guest shape is untouched so the CSV address-reconcile tool keeps working.

- **Guest list mailing-list export** — an **Export CSV (n)** button beside *Import CSV* downloads exactly the rows currently on screen; both the filter tabs and the search box narrow the export, and the count is in the button label. Filename `guest-list-<filter>-<date>.csv`. New `src/lib/mailing.ts` builds the rows: a `Mail Name` envelope column (1 person → `John Smith`; 2 with a shared surname → `John & Jane Smith`; 2 with different surnames → `John & Jane`; 2 with an unnamed plus-one → `John Smith & Guest`; 3+ → `Smith Family` using the most common surname in the party with ties going to the head guest), plus the free-text address split into `Street` / `City State Zip` / `City` / `State` / `Zip`, an `Address Issue` column naming what didn't parse, a `Shares Address With` column that cross-references the batch to catch two invitations aimed at one house, and the rest of the guest record. Names are cleaned before use — parenthetical notes dropped (`Natalie Williams (Zack's Girlfriend)`, and a plus-one of only `(Collin's Date)` counts as unnamed) and suffixes ignored when comparing surnames (`Nick Lucas Jr.` + `Nicole Lucas` → `Nick & Nicole Lucas`). `party_size` decides the rule rather than the number of names on file, because `plus_one_name` sometimes repeats a party member under a different surname (member `Sallianne Ballard` vs plus-one `Sallianne Roher`) and would otherwise push a couple into the "family" case. Address parsing was written against all 90 production rows and covers line breaks used in place of commas, an apartment either comma-separated or glued onto the city (`Apt. 5 Pewaukee` → unit moved back to the street line), a state riding along with the city (`Muskego WI, 53150`), state-only and ZIP-only tails, and ZIP+4; 88/90 rows parse clean and the 2 that don't are genuine data problems, flagged rather than mangled. CSV is emitted with a UTF-8 BOM and fully quoted fields so Excel keeps accents and leading-zero ZIPs.
- **Gift field on donations** — a donation can now record money, a physical gift, or both. `amount` is optional as long as a gift is named (new `gift` column); the **Fund** selector is disabled for gift-only entries since there is no money to allocate against a fund's progress. New Gift column in the donations table, and the guest list's Donated column now reads `Gift` / `$X + Gift` instead of `-` for gift givers.
- **Thank-you tracking on donations** — row checkboxes and a select-all header checkbox (matching the guest list), with bulk **Mark Thank You Sent** / **Unmark** actions, plus a per-row pill (`✓ Thank you sent`, hover shows the date, or `Not sent`). Header summary gained `X/Y thanked`. Backed by a new `PATCH /api/admin/donations` taking `{ ids, thank_you_sent }` which stamps `thank_you_sent_at`.

### Fixed
- **Every photo thumbnail was a broken image** — `/api/photos/<file>/thumb` returned **404** for all inputs, so the admin home page's Hero Slideshow photo picker (both the picker grid and the selected-order list) and the nav-cards gallery modal showed broken-image icons. In `src/app/api/photos/[...filepath]/route.ts` the `fs.existsSync()` guard ran **before** the thumb branch that strips the trailing `thumb` segment, so it stat'd `public/photos/<file>/thumb` — a path that can never exist — and returned early. Broken since the route was converted to a catch-all for subfolder support (`5520021`); the follow-up that added thumb handling to the catch-all (`bc62cea`) put the new branch after the existence check, so it never ran. The route now resolves the source path first (dropping a trailing `thumb`), then does the containment and existence checks once against that real path. Confirmed by curling the live container before the fix (`404 text/plain 14b` vs `200 image/jpeg` for the same file without `/thumb`) and re-verified against the rebuilt production image. Also tightened the traversal guard: the old check permitted `filePath === photosDir`, which fell through to `readFileSync` on a directory and a 500; a zero-segment request is now a 404.
- **Added `npm run check:photos`** (`scripts/check-photo-route.mts`) — calls the photo route handler directly and asserts thumbs (root **and** subfolder), full-size, `?w=` resize, 404s for missing files, and the traversal guard. This route has now broken twice with no symptom other than broken-image icons, so it gets a regression guard.
- **Guest-list select-all ignored the active filter** — the header checkbox's *checked* state was computed from `filteredGuests` but `toggleSelectAll` selected/deselected **every** guest in the table. Filtering to *⚠️ Issue* and clicking select-all therefore swept all 90 guests into the selection while the UI implied only the visible ones, which "Delete Selected" already made dangerous and bulk note/flag editing makes worse. Now it unions/subtracts only the visible rows and leaves selections outside the filter alone.
- **Side was silently unsaveable from the guest edit modal** — the modal has always had a Side field and `guestForm` carried it, but `PUT /api/admin/guest-list` never destructured or wrote `side`, so editing it did nothing (the column kept its old value, with no error). Added to the update.
- **Portainer "Pull and redeploy" 500 — actually diagnosed and fixed.** Docker Compose discovers a project's containers by filtering on the *presence* of the `com.docker.compose.config-hash` label, which compose writes **only on containers it creates itself**. `wedding-web-prod` had been recreated by hand with `docker run`, so it could never carry that label — compose saw **zero** containers for service `web`, tried to create a fresh one, and collided with the pinned `container_name`. The pull always succeeded, so the site silently kept serving the old image. The 2026-07-27 diagnosis (missing `oneoff`/`container-number`) was wrong and its fix never worked; labels are immutable on an existing container, so **no `docker run` recipe can fix this** — the container must be created by compose. Recreated it via `docker compose … up -d --no-deps web` against a mirror of the stack files at Portainer's own paths; `up -d --dry-run` now reports both containers as `Running` instead of `Creating`. The README's manual-deploy recipe was rewritten to use `docker compose` (the old `docker run` recipe was the cause, not the workaround).
- **Database left down by the failed redeploy** — a failed swap leaves `wedding-db-prod` created-but-never-started, so the web container fails DNS on `db` (`EAI_AGAIN`) while still returning 200 on pages that don't touch the DB. Started it; all data intact (90 guests, 9 RSVPs, 16 donations).

## [2026-07-27] — RSVP attendance choice, party-member login, guest table repair, rapid check-off

### Added
- **Explicit attending / not attending per guest (public RSVP)** — Every party member now has **two mutually-exclusive checkboxes** (ticking one clears the other; clicking a ticked box clears it back to unanswered), and **the RSVP cannot be sent until every guest has one ticked**. Unanswered cards are highlighted amber, a live line reads "*N guests still need to be marked attending or not attending*", and Send RSVP is disabled with a server-side check behind it naming the specific person. A bolded note under the welcome banner explains the requirement. Card attendance became a tri-state (`'yes' | 'no' | null`) instead of a boolean — previously an unticked box was indistinguishable from "not answered yet", so anyone the submitter forgot to tick was **silently counted as declined and the party under-counted with no warning**. The primary guest stays locked to Attending (already answered by the "Will you be attending?" select; declining there covers the whole party).
- **Any party member can look up the RSVP by their own name** — `POST /api/guest-verification` now matches `guest_name`, `plus_one_name`, **or** any named entry in `party_members` (case- and whitespace-insensitive), so e.g. Kenzie Miller can enter her own name and pull up Max Kulik's party RSVP. Match order is deterministic: an exact primary-guest match beats being listed inside someone else's party, then lowest id. Guarded with `jsonb_typeof` so the rows holding `NULL` `party_members` (23 of 90) can't error. **Names that can log in went from 77 to 140.** The response gained `matched: { name, isPrimary }` so the form greets whoever signed in and notes whose party they belong to instead of showing a stranger's name; login copy now says anyone in the party can use their own name.
- **Rapid guest check-off (admin guest list)** — Type a name in the guest-list search and press **Enter** to tick the top match; the box clears and keeps focus for the next name. Enter is additive and never unticks (reports "*X was already checked*"). Party-member names match too, and the confirmation names whoever was actually ticked. No match keeps the typed text so a typo can be corrected. Takes the top match within the active filter tab.

### Fixed
- **Responsive guest table never dropped any columns** — The measured column-dropping system shipped previously never ran at all: the guest table only renders on the guestlist tab, but the measure effect's deps were `[guests, guestFilter, guestSearch]`. On mount the ref is `null` so the effect early-returned, and clicking the tab changed no dep, so it never re-ran and no `ResizeObserver` was ever attached — all 11 columns crammed at every width. Added `activeTab` to the deps. (Proved by a discriminating test: typing in the search box, which *is* a dep, instantly dropped 11 columns → 5 with zero code change.)
- **Name column could never shrink, clipping Actions off the right edge** — In `table-layout: auto`, `overflow-hidden` does **not** reduce a cell's min-content contribution, so with `truncate` inside and no `max-width` the column was pinned to the longest guest name (~300px), forcing table min-content to ~705px. Fixed with the `w-full max-w-0` flexible-truncating-column pattern (on the main row and the party-member sub-row).
- **Edit/Delete pills stacked vertically, rows 117–135px tall** — `flex-wrap` makes a cell's min-content only as wide as its *widest single button*, so `table-auto` squeezed the Actions column and the pills wrapped. `flex-nowrap` keeps them on one line; rows are now a uniform 78px.
- **"Not Invited" / "No Response" wrapping onto two lines** — Added `whitespace-nowrap` to the Invited/RSVP cells (columns spec'd never to shrink). Flag badges (⚠️ Issue / 📌 Need / 📝 Note) also wrapped one-per-line and ballooned row height; they now stay on one line and clip.
- **Bulk-select checkbox was dropped first** on narrow-ish widths — it is only 40px, so dropping it first lost bulk-select on a 1920px monitor while saving almost no space. Hide order is now `contact → notes → address → donated → relation → select`.
- **Re-opening a submitted RSVP showed blank checkboxes** — Removing the pre-fill entirely also blanked the boxes when a guest re-opened an RSVP they had already sent, which reads as if their answers were lost. Split the cases: a brand-new RSVP still starts completely blank, but re-opening a submitted one restores what was chosen. Attendance isn't stored per member — a submitted RSVP lists exactly its attendees in `dietary_restrictions` (the admin view reads that array as "who's coming") and submitting requires answering everyone, so absence from that list means the member was marked not attending.
- **Existing-RSVP lookup keyed off the typed name** — A plus-one would never have found the party's existing RSVP and would have submitted a duplicate instead of editing it. It now resolves to the primary guest's name first.

### Changed
- Column measurement now uses the wrapper's **border-box** width instead of `clientWidth`, so a scrollbar appearing/disappearing can't feed back into another hide/show cycle (verified stable under ±1px resize).
- The guest table wrapper gained `overflow-x-auto` as a last-resort floor. Below ~640px the five mandatory columns need 479–543px but the wrapper is only 341–446px, and its rounded parent is `overflow-hidden` — so without this the Edit/Delete pills were clipped and **completely unreachable**. Worst case is actually 768–820px, where the admin sidebar squeezes the wrapper to ~446px. Desktop widths (1024+) remain scroll-free.

### Verification
Built a Playwright harness driving the app in a real browser (no test framework in this repo, and no local Postgres — API responses stubbed via `page.route`). The guest table passes at **all 12 widths from 375–1920px**: no clipped-unreachable cells, no stacked action buttons, Name always present, no page h-scroll, uniform 78px rows, stable under ±1px resize. The RSVP flow was verified for a simulated family of four (mutual exclusivity, submit genuinely blocked with no POST fired, correct `guestCount` vs `resolvedMembers` on submit) and the guest-verification SQL was tested **read-only against production data** — "Kenzie Miller", "KENZIE MILLER" and "  max kulik  " all resolve to Max Kulik; unknown names still fail.

## [2026-07-06 session 2] — Home page section styling: shadows, larger radius, rounded FAQ card

### Added
- **Drop shadows on all home page bands** — Each stacked section below the hero (Intro/Countdown, About header, How We Met, Venue, FAQ) now carries an **upward-casting** shadow (`shadow-[0_-8px_24px_-4px_rgba(0,0,0,0.12)]`). Upward is intentional: each band pulls up `-mt-8` over the one above it, so a normal downward shadow would be buried under the next band. This makes each section's rounded top edge lift off the section above it.

### Changed
- **Section corner radius 22px → 40px** — All home page bands (`rounded-t-[40px]`) for a softer, more pronounced rounded look.
- **Explore (nav cards) section is now white** — Wrapper background changed from `aboutBgColor` to `bg-white`.
- **Details & FAQ is now a fully-rounded card** — Changed from `rounded-t-[40px]` (top only) to `rounded-[40px]` (all four corners) with a two-sided shadow (up + down) so both the rounded top and bottom read as a floating card.

### Fixed
- **Pink strip above the Explore section** — A `mb-14` gap that had been added under the FAQ card exposed a full-width strip of the blush home-page background (`bgColor`, which intentionally peeks through the rounded-corner notches of each white band). Removed the gap; the white Explore section now tucks flush under the FAQ (`-mt-10`), with the FAQ layered on top (`z-10`) so its rounded bottom + shadow render against white instead of the pink background.

## [2026-07-06] — Photo display fix, admin photo UX, dashboard RSVP deadline stat

### Fixed
- **Admin & public gallery photos not displaying** — The admin photo grid (and its hero previews) and the public `PhotoGallery` were the only components still referencing images via the raw `/photos/<file>` static path (through Next's image optimizer). Next.js standalone's static file handler only serves `public/` files that existed when the container **started**, so any photo uploaded to the volume afterward returned 404 there (and a 400 from `/_next/image`), leaving the admin card showing just the filename placeholder. Root cause confirmed with live `curl` inside the container: `/photos/<new>` → 404, `/_next/image?url=/photos/<new>` → 400, `/api/photos/<new>` → 200. Both files now route through the `fs`-based `/api/photos/<file>` route used everywhere else, so runtime-uploaded photos always display and future uploads never regress.
- **Hearting a photo jumped the page to the top** — Hearting re-sorts the photo toward the top of the admin grid; the reorder + focused button scrolled the viewport up. Now the scroll position is captured and restored (`requestAnimationFrame` + button `blur()`), so the photo moves up while the viewport stays put.

### Added
- **Scroll-to-top button (admin photos)** — Small fixed **↑** button (bottom-right) that smooth-scrolls the photo management page back to the top.
- **RSVP Deadline stat (dashboard)** — New count stat in the **RSVPs & Guests** card showing days left before the RSVP deadline (`siteConfig.rsvpDeadline`). Amber within 7 days, red once passed, "—" when no deadline is set. `GET /api/admin/dashboard` now returns `countdown.rsvpDaysLeft`.

## [2026-06-01 session 2] — Mobile hero polish: scroll hijack, padding, UX fixes

### Added
- **Mobile hero scroll hijack** — Outer section is 200svh with sticky inner, mirroring the desktop pattern. Any downward touch/wheel is consumed entirely by the collapse animation; after completion `window.scrollTo` jumps past the section so normal scroll begins immediately. Upward scroll back to section boundary auto-triggers expand (including during iOS momentum via `scroll` event listener). Wheel handler added alongside touch so phone-sized desktop browser windows work identically.
- **Collage padding** — When collapsed, 90px top padding (clears nav bar) and 30px bottom padding animate in with the strips. All strip positions/heights computed in px from `window.innerHeight` so padding is exact.
- **Post-collapse scroll hint** — "scroll ↓" fades in on the bottom strip after animation completes, positioned inside the strip (`padBot + 14px` from bottom).
- **Scrollbar layout shift fix** — `scrollbar-width: none` + `::webkit-scrollbar { display: none }` on mobile in `globals.css` so no reserved scrollbar gutter.

### Fixed
- **Separator lines animate with mid strip** — Lines are `borderTop`/`borderBottom` on the mid strip div, riding the squish from full-screen to center third.
- **Text overlay stays centered in mid strip** — Text translateY follows mid strip center offset `(PTOP−PBOT)/2 × e` as asymmetric padding grows; scales 1.0→0.65 to squeeze text into the smaller strip instead of fading.
- **iOS momentum expand** — Scroll event listener auto-triggers expand when `scrollY ≤ sectionScrollRoom − 80px` so users don't have to stop and re-swipe.
- **Double-animation on expand** — `scrollTo(0)` now fires while state is still `animating`, preventing the race where the job-1 snap-to-collapsed triggered immediately after expand.
- **DevTools phone-size viewport** — `isMobile` now updates via `MediaQueryList` change event; mobile `useLayoutEffect` runs after DOM commit so refs are always populated.
- **Image quality** — Mobile hero slideshow bumped from `medium` (960px) to `large` (1280px) for sharp retina display.
- **Date/location** — Two lines on mobile (`<br className="md:hidden">`), both center-aligned.
- **About image tilt** — `rotate-2` → `md:rotate-2`; image sits straight on mobile.
- **Slideshow dots** — Raised 10px in hero mode (bottom: 66px); lowered 30px in collage mode (bottom: 36px), animated continuously.
- **Scroll hint / dots overlap** — Dots at bottom: 66px, pre-collapse hint at bottom: 20px — no overlap.

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
