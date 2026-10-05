# Honeymoon portal — UI rework and mobile

**Date:** 2026-10-05
**Status:** draft for review. Austin's brief: "use brainstorming and do what you
would recommend, then build the plan… I will review… then build everything in
one go." Every open question below has a recommended answer already chosen;
the review is where to overturn any of them.

## What Austin asked for

1. **One place popout, everywhere.** Clicking a place opens different windows
   depending on where you click it, showing different things. There should be
   one all-inclusive popout that is the same wherever it's opened from. Find
   every other inconsistency like it.
2. **Itinerary:** the controls scroll away with the page and shouldn't.
   Stacked / Clock belongs to the *left* of Days / Timeline / Calendar.
   Transportation must appear in the timelines — the point of timeline mode is
   to see everything on a day, when you need to be there and when it ends.
3. **The UI overall needs reworking.** The map page is the one Austin likes, and
   even it needs changes.
4. **Then mobile — the big one.** Some things are unusable on a phone, others
   are just bad.

**Success looks like:** you can click a place anywhere and always get the same
panel; every tab is built from the same handful of parts, so it looks and
behaves like one app; the itinerary's timeline answers "where are we, when, and
how do we get there" for a day at a glance; on a phone every tab can actually be
used with a thumb.

## What the audit found

Audited on the demo instance (same code, fictional trip) at 1440×900 and
390×844, plus the source.

### A. The place popout — five different things

| Where you click a place | What opens | What it shows |
|---|---|---|
| Places tab, a row | `PlaceDrawer` (right-hand drawer, read view) | Everything — but its **header (the name!) sits under the site nav**, so the drawer opens with no title |
| Itinerary, the *Sleep* line | `PlaceDrawer` | Same as above |
| Itinerary, a stop's name | `PlaceEditor` (big edit modal) | A form; no comments, nearby, days, photos |
| Map, a pin | A small card in the map's corner → **Edit** → `PlaceEditor` | Name, chips, 3 lines of notes, links |
| Map split view, a row | `PlaceEditor` directly | A form |
| Search (⌘K), a place | `PlaceEditor` | A form |
| Stays, a card | Nothing opens — the **card itself is an inline editor**; ⋯ → Edit → `PlaceEditor` | Card fields only |
| Excursions, a card | Same as stays: inline-editable card; ⋯ → Edit | Type, cost, notes, rating |
| Leaflet pin popups (`TripMap`) | A bare Leaflet popup | A label |

So within *one itinerary day card*, clicking the hotel opens a read view and
clicking the restaurant opens a form.

### B. Other inconsistencies

1. **Three card/list designs for the same object.** Places is a read-only list,
   Stays and Excursions are grids of inline-editable cards, each with its own
   layout.
2. **Rating pills implemented four times** (Places, Stays, Excursions, Map).
3. **View toggles implemented twice** (`ViewToggle` in Itinerary and in Stays,
   different styles), plus a third style for Stacked / Clock.
4. **Three filter-bar designs**: Places (two rows of full-width selects), Map (a
   card of 10 selects/chips that wraps to two rows), Stays (rating chips + a row
   of view buttons + selects + a third row with one button).
5. **Toolbars stick on some tabs and not others.** Places, Stays and Excursions
   have a sticky bulk bar; the Itinerary's view controls scroll away.
6. **Time format ignored in places.** The clock view prints `09:30` while the
   list prints `09:30 AM` for the same stop; the trip has a 12h/24h setting.
7. **Dashboard clips its own cards on desktop** ("Needs attention", "Cost of the
   trip", "Shortlist" are cut off mid-row) because it forces itself to fill the
   viewport; on a phone the same rule makes the cards **overlap each other**.
8. **The Stays map opens zoomed out to the whole world** with the stays in one
   corner and a grey block below the tiles.
9. **Long help text inline everywhere** ("Drag a day by its ⠿ handle…", "A base
   is set per day; a stay is a stretch…", paragraphs under Cost fields) — it
   pushes controls apart and, on a phone, wraps into a narrow column beside the
   buttons.
10. **Itinerary opens on two warning boxes** ("Worth a look", 11 items, and
    "Where you sleep") above the first day, every time.
11. **Add-place lives in four places** with different entry forms: Places "+ Add"
    (editor), Map "+ Add" (editor), Stays "paste booking links", Excursions
    "paste any link".
12. **Eleven tabs in one pill row** — on a phone it scrolls sideways and most of
    it is off-screen.

### C. Mobile — measured

Every tab at 390×844:

| Tab | Controls | Under 40px | Text under 12px |
|---|---|---|---|
| Dashboard | 75 | 68 | 90 |
| Itinerary | 423 | 371 | 301 |
| Places | 274 | 185 | 475 |
| Map | 34 | 34 | 1 |
| Stays | 101 | 85 | 19 |
| Checklist | 85 | 83 | 17 |
| Settings | 117 | 97 | 19 |

About 85% of the controls are smaller than a fingertip (the 44px minimum).

What's actually broken on a phone, from the screenshots:

- **Two headers stacked** (the site's own nav + "Admin Panel") take the top
  160px before the trip even starts; then the title, search and tab strip take
  another 130px. On the Map that leaves half the screen for the map.
- **Dashboard:** the cards overlap and can't be read.
- **Itinerary:** the help text wraps into a one-word-wide column; the view
  toggle is cut off at the screen edge; drag handles do nothing on touch.
- **Map:** the filter card takes more room than the map.
- **Checklist:** the date picker squeezes each to-do's text to "Renew bot…".
- **Stays / Travel / Excursions:** you scroll past two large paste boxes before
  seeing a single stay or journey.
- **Modals** (the place editor) are desktop-sized dialogs on a phone.

Today and Travel are closest to usable already.

## Decisions (each with the alternatives considered)

### 1. One place panel — `PlaceSheet`

**Recommended:** merge `PlaceDrawer` and `PlaceEditor` into one panel that
**reads first and edits in place**. Every field is shown as text; click it to
edit it (the `InlineText` pattern the portal already has), it saves on blur.
One "Edit everything" button in the header opens the full form inside the same
panel for bulk edits or a new place.

- *Alternative B:* keep a read drawer and an edit modal, but route every click
  to the drawer. Less work, but still two different windows for one thing —
  the exact complaint.
- *Alternative C:* one big modal. Covers the map and the list you clicked from,
  which loses the "look at the place next to where it is" that makes the map
  page good.

**One way in.** The shell exposes `openPlace(id)` (and `newPlace(defaults)`)
through the existing `HoneymoonContext`. Every surface calls it: map pins, list
rows, stay/excursion cards, itinerary stops *and* the sleep line, calendar
cells, search, dashboard shortlist, the Today tab. Nothing renders its own
place window again. The map's small corner card and the Leaflet pin popups go.

**Same content everywhere; sections appear by data, not by caller.** Top to
bottom:

1. Header — photo (if any), name, category, status, the shared rating, close.
2. **Plan** — which days it's on (as stop or as base), "Add to day…".
3. **Where** — mini map, address, Directions / Street View, region, country.
4. **Booking & cost** — cost and what it's per, the booking panel.
5. **Stay** *(stays only)* — nights, check-in/out, price history from price watch.
6. **Practical** — opening hours, best time, star rating, amenities.
7. **Notes & links.**
8. **What you two think** — per-person ratings, comments.
9. **Photos.**
10. **Nearby.**

Empty sections collapse to a single "+ Add …" line instead of vanishing, so the
panel's shape is the same for every place.

**Shape:** a right-hand drawer from `md` up (the map stays visible beside it,
and it sits *above* the site nav — the current drawer's missing title is fixed
by construction); a bottom sheet on a phone that opens at half height and drags
to full.

### 2. One set of building blocks

New shared parts in `src/app/admin/honeymoon/kit/`, and every tab moves onto
them:

| Part | Replaces |
|---|---|
| `TabToolbar` — sticky bar, left: view switches; right: primary action + ⋯ overflow | Each tab's own control row; fixes "controls scroll away" everywhere, not just Itinerary |
| `Segmented` — one segmented control | Both `ViewToggle`s, Stacked/Clock, rating-filter chips |
| `FilterButton` + `FilterPanel` — one "Filters (3)" button, active filters shown as removable chips | The three filter-bar designs |
| `RatingPills` | The four rating implementations |
| `PlaceCard` (grid) / `PlaceRow` (list) — read-only, click → `openPlace` | Places rows, Stays cards, Excursions cards, map split-view rows |
| `Sheet` — drawer on desktop, bottom sheet on phone | `PlaceDrawer`'s shell, and the modals that are really panels (filters, print options, import, packing suggestions) |
| `Hint` — a small ⓘ that shows help text on tap/hover | The inline help paragraphs |
| `useTimeFormat()` | Every place a time is printed — fixes 24h/12h drift |

Cards stop being inline editors; editing happens in `PlaceSheet`. Quick actions
that people use in bulk — the rating pills and the status — stay on the card,
because rating twenty stays one panel at a time would be a regression.

### 3. Navigation — fewer, clearer tabs

**Recommended:** fold **Stays** and **Excursions** into **Places** as segments
(*All · Stays · Excursions*), sharing one list, one card, one filter panel and
one add flow. Stay-only views (**Ranking**, **Compare**, **Price watch**) appear
in the toolbar when the Stays segment is on. `/stays` and `/excursions` keep
working and open Places on that segment, so bookmarks don't break.

Result: **Overview · Today · Itinerary · Map · Places · Travel · Checklist ·
Guide · Settings** (9, from 11; "Dashboard" renamed Overview, "To Do" renamed
Checklist to match what it holds).

- *Alternative:* keep 11 tabs and only restyle. Leaves three lists of the same
  object, which is the root of inconsistencies B1, B2 and B11.

**One add flow:** "+ Add place" opens `PlaceSheet` in new mode, which accepts a
name, a search, a Google Maps link *or* a pasted booking/tour link (the
existing link readers). The Stays and Excursions paste boxes and the price-watch
box move behind toolbar buttons instead of sitting on top of the list.

### 4. Itinerary

- **Sticky toolbar** (`TabToolbar`). Left to right:
  `[Stacked | Clock]` *(only in Timeline mode)* · `[Days | Timeline | Calendar]`
  · spacer · `⋯` (Print, Export calendar, Share). Exactly the order Austin asked
  for; Print and Export move into the overflow menu per the existing
  "only primary actions inline" convention.
- **The two warning boxes** become one collapsed strip under the toolbar:
  "⚠ 11 things to check · 6 nights booked" — tap to expand. Nothing above day 1
  by default.
- **Transport in the timeline — both views.** Travel legs become first-class
  items in the day, alongside stops:
  - **Clock:** a leg is a bar from its departure to its arrival on the same
    time axis as the stops, drawn in a distinct transport style (striped, with
    the mode icon), labelled "✈ CLT → LIS 18:40–08:15 +1". A leg that lands the
    next day runs to the edge of the day with a "→ next day" cap, and appears on
    the arrival day from its start.
  - **Stacked:** legs become slices in sequence order, with their real length
    when times are known.
  - Hotel **check-out and check-in** times (from the stay's booking) appear as
    markers on the clock, because "when do we need to be out" is exactly the
    question this mode is for.
- **Every item says when it starts *and* ends** — the clock currently labels
  only the start. Labels are `09:30–11:00` (in the trip's time format).
- **Untimed stops** are listed under the bar as "Not timed yet: …" instead of
  being silently placed.
- All of this goes into the pure layer (`honeymoonTimeline.ts`:
  `daySegments` and `clockLayout` take legs and markers) so `check:honeymoon`
  covers it; `DayShape.tsx` stays pixels only.

### 5. Map (keep what works, fix the rest)

Austin likes this page, so the changes are narrow — and said "even that has
some things that need to be changed" without listing them. **Review question:
tell me which; these are mine:**

- The 10-control filter card becomes the `FilterButton` + chips — the map gets
  ~80px back on desktop and most of the screen back on a phone.
- The corner card is replaced by `PlaceSheet`, so a pin opens the same panel as
  everywhere else, beside the map.
- The legend collapses to a single "Legend" chip.
- The split view's right column uses `PlaceRow`, the same rows as Places.

### 6. Overview (dashboard)

Drop the "fill the viewport" layout that clips and overlaps cards; use a normal
grid that grows to fit its contents. Same cards, same links. The download
button moves into the toolbar's ⋯.

### 7. Everything else

Travel, Checklist, Guide, Settings and Today move onto the kit (toolbar,
segmented, filters, hints) without changing what they do. Checklist's due date
becomes a small "Due ▸" chip that opens a date picker, so a to-do's text gets
the full row. The paste boxes on Travel move behind "+ New journey".

## Mobile (after the above, so it's built on the kit — not patched per tab)

Below `md` (768px):

1. **One compact top bar.** On honeymoon pages the site nav and the
   "Admin Panel" bar are hidden (the mechanism Full screen already uses), and
   replaced by a 52px bar: ← admin, trip title, search, ⋯. Recovers ~240px.
2. **Bottom tab bar.** Five thumb-reach tabs: **Today · Itinerary · Map ·
   Places · More**. *More* opens a sheet with Overview, Travel, Checklist,
   Guide, Settings. Respects the iPhone home-indicator inset.
3. **Touch sizes:** every control at least 44×44; body text 15–16px; inputs
   16px (below that, iPhone zooms the page when you tap a field).
4. **Sheets, not modals:** `PlaceSheet`, filters, print options and every form
   open as bottom sheets.
5. **No drag on touch.** Drag-to-reorder becomes "Move…" in the ⋯ menu (to a
   day, up, down); drag-to-resize on the stacked bar becomes tapping the slice
   and setting a duration.
6. **Per tab:**
   - **Itinerary** — one day at a time with a swipeable day strip
     ("Day 3 · Wed 16 Jun ▸"), instead of 16 cards in a column. **Timeline on a
     phone is vertical** — time runs down the left edge, stops and legs are
     blocks against it (a horizontal 24-hour axis can't be read at 390px).
     Calendar becomes a month grid with dots; tap a date to open that day.
   - **Map** — full-bleed between the top bar and the tab bar; floating Filters
     and Add buttons; a tapped pin raises `PlaceSheet` at half height so the map
     stays visible above it.
   - **Places** — single-column `PlaceRow`s, the segment control and Filters
     button in the sticky toolbar, the five stat boxes reduced to one summary
     line. Compare becomes swipeable cards (a table can't fit). Ranking uses
     up/down buttons instead of drag.
   - **Overview** — one column, the map card last.
   - **Checklist** — full-width rows, due chip under the text.
   - **Settings** — sections as an accordion, one open at a time.
   - **Travel / Today / Guide** — kit sizes and spacing; already closest to fine.

## Testing

1. **`npm run check:honeymoon`** — new assertions for the timeline with legs
   (ordering, overnight legs on both days, start–end labels, check-in/out
   markers, untimed stops), the time-format helper, and the place-sheet's
   section rules (which sections show for a stay vs an excursion vs a bare
   place). Written failing first.
2. **New `npm run check:honeymoon:ui`** (Playwright, like `check:hero` — a
   manual check, not a CI gate) at 390×844 and 1440×900:
   - opening a place from each entry point (map pin, Places row, Stays segment,
     itinerary stop, itinerary sleep line, calendar, search, overview
     shortlist) opens the **same panel with the same sections**;
   - the itinerary toolbar is still on screen after scrolling, and Stacked/Clock
     sits left of the view switch;
   - a day with a flight shows the flight in both timeline views;
   - no horizontal scroll on any tab; on a phone no tap target under 44px
     (allow-listed exceptions documented in the test);
   - the dashboard's cards don't overlap or clip.
3. **Screenshot pass**: every tab at both sizes, before and after, attached to
   the changelog entry's notes for Austin's final test.
4. Existing checks (`check:types`, `lint`, all `check:*`) stay green.

## Out of scope

- No data or schema changes — this is presentation. `init.sql` is untouched.
- The public share link (`/honeymoon/<token>`) and the offline HTML export keep
  their current look.
- No new features beyond what's listed (no new booking types, no new map tools).

## Shipping

Built in one go as Austin asked, in this order so each step stands on the last:
kit → `PlaceSheet` + `openPlace` → Places hub → Itinerary → Map → Overview and
the remaining tabs → mobile → tests and screenshots. One release at the end.
**Recommended version: v0.10.0** (a minor bump — this changes how the whole
module is laid out; minor bumps are Austin's call, so it's in the review
questions). The push is the deploy; Austin redeploys in Portainer and does the
final test.

## Review questions (recommended answer first)

1. Fold Stays and Excursions into Places as segments? **(Yes.)**
2. Cards stop being inline editors — rating and status stay on the card,
   everything else in the panel? **(Yes.)**
3. What did you want changed on the map, beyond the list in §5?
4. Ship as v0.10.0? **(Yes.)**
