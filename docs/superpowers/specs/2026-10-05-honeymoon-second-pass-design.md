# Honeymoon portal — second pass

**Date:** 2026-10-05
**Status:** approved in advance — "write the plan, do what you would recommend,
then build it… then build me a visual document."

## What Austin asked for

1. **A tap before the dates can be dragged, on a phone.** In Settings the trip
   calendar fills the screen, and a scroll that starts on it changes the range.
2. **A Files tab** — in More on the phone and a tab on the desktop — that is "a
   nice file explorer" for every travel document, and the documents section comes
   out of Settings entirely.
3. Another pass of improvements, found by looking for thirty minutes with the UI
   skills, then planned and built.

## What the audit found (v0.10.0, demo data, 1440×900 and 390×844)

| # | Where | Problem |
|---|---|---|
| A1 | Settings, phone | The date calendar is two full-width months of 44px cells; any scroll that starts on it drags a new range. (Austin's #1) |
| A2 | Settings → Documents | A small list in the middle of a long settings page: no preview, no search, no way to edit a file's details, no grouping. (Austin's #2) |
| A3 | Documents | **The copy promises something that is not true.** It says files are "cached by the offline snapshot, so they open at a border with no signal". The service worker caches the portal's pages, the trip payload and the app's own scripts — never `/api/photos/…`, which is where documents are served. With no signal, a passport scan does not open. |
| A4 | Itinerary → Calendar, phone | Seven columns of truncated text ("La…", "09:…"). The phone version planned last pass (a month grid with dots, tap a date) was never built. |
| A5 | Place panel → Edit everything | The form lays out by the *window* width, not the panel's, so inside the 640px panel on a laptop it squeezes four columns ("Restauran", "— from regio"). On a phone the form opens at half height. |
| A6 | Travel → a leg's editor, phone | The date and time inputs sit on one row and run off the card. A stop's add-row time input does the same. |
| A7 | Today | The day arrows are a bare ‹ and › in wide pills; the disabled one is invisible, so the row looks broken on day one. |
| A8 | Bottom sheets, phone | Only the × closes a sheet. Every phone sheet people know closes when you pull it down. |
| A9 | Map | "Show on the map" centres the place on the whole map, so on a laptop it lands half under the open panel (deferred last pass). |
| A10 | Everywhere | Buttons have no pressed state and no consistent keyboard focus ring; the portal's own controls rely on the browser default, which several of them remove. |
| A11 | Settings | Long explanations as paragraphs under every card, and an "Adding places" card that is only documentation. |
| A12 | README | The honeymoon screenshots still show the pre-v0.10 layout (deferred last pass). |

## Decisions

### Files tab (A2, A3)

A tab of its own at `/admin/honeymoon/files` — between Checklist and Guide on the
desktop row, and in **More** on the phone. Settings loses its Documents card.

**Layout — a file explorer, not a list:**
- **Left: folders.** *All files*, then one per kind that has files (Passports,
  Visas, Insurance, Tickets, Vaccinations, Reservations, Other) with counts, then
  one per person ("Austin", "Heaven", "Shared"). On a phone the folders are a
  scrolling chip row at the top.
- **Main: the files** as a grid of tiles (image thumbnail, or a PDF tile) or a
  list (name, kind, whose, expiry) — a segmented Grid/List switch, remembered.
  Search across names and notes.
- **Click a file → a viewer** in the shared `Sheet`: the image or the PDF itself,
  big, with ← → to step through the folder, and its details editable in place:
  name, kind, whose, expiry, what it is for (a place or a travel leg), notes.
  Open in a new tab, and Delete (undoable, as everywhere).
- **Add files:** a drop zone on the page (drag files anywhere onto it) and an
  "+ Add files" button. The kind is **guessed from the filename** (`passport`,
  `visa`, `insurance`/`policy`, `ticket`/`boarding`/`eticket`, `vaccin`/`yellow
  fever`, `booking`/`reservation`/`confirmation`) and editable after.
- **Warnings that matter at a border:** a passport or visa that expires during
  the trip, or within six months of the last day (the rule many countries
  enforce), is flagged on its tile and at the top of the page. A trip with no
  passport on file says so.

**Offline, for real (A3):** the service worker gains a `honeymoon-files` cache.
The Files tab tells the worker which files exist; it fetches and keeps them, and
`/api/photos/…` requests fall back to that cache when the network fails. The
page shows "Saved for offline: 6 of 6" so the promise is checkable. The copy
that promised it before now describes what actually happens.

### Tap to change dates (A1)

On a touch screen (`pointer: coarse`) the calendar is **locked** by default: it
shows the range, scrolls like any other part of the page, and has a **Change
dates** button. Tapping it unlocks dragging (the grid takes the gesture and
highlights), with **Done** to lock it again. A mouse or trackpad is never locked
— dragging there cannot be confused with scrolling.

### The rest

- **A4 — phone calendar:** below 768px each day is a square with its date, a
  dot per stop (up to three) and a ✈ when there is travel; tap opens the day, as
  the big tiles already do.
- **A5 — the form:** lays out by its own width (container queries), so it is two
  columns in the panel on a laptop and one on a phone; the panel opens tall in
  form mode on a phone; the help paragraphs under Cost and Opening hours become ⓘ.
- **A6:** date and time stack on a phone in the leg editor; the stop time input
  stops overflowing.
- **A7 — Today:** the arrows say where they go ("‹ Day 1", "Day 3 ›") and the
  disabled one is visibly disabled. Also a "Travel documents →" link to Files
  from the admin Today view (not the read-only share link — documents are private).
- **A8 — sheets:** drag the handle down to close, up to expand.
- **A9 — map:** when the place panel is open, flying to a place leaves room for it.
- **A10 — states:** every kit button and the portal's `Button` get a pressed
  state (`active:scale-[0.98]`) and one visible focus ring; motion respects
  `prefers-reduced-motion`.
- **A11 — Settings:** card descriptions shortened to one line with the rest
  behind ⓘ; the "Adding places" card goes (its tips move into the place form's ⓘ).
- **A12:** README screenshots retaken from the demo data.

## Testing

- `check:honeymoon`: `guessDocumentKind`, `documentWarnings` (expiry during trip,
  within six months, no passport), `documentFolders` (counts, order, people).
- `check:honeymoon:ui`: Files is a tab and in More; Settings has no Documents
  section; a file opens the viewer; on a touch phone a drag across the Settings
  calendar does not change the dates until **Change dates** is tapped; the phone
  calendar's day squares fit; no element inside a card runs past the screen edge
  on any tab (the check last pass did not have); a sheet closes on a downward
  drag.
- Everything else stays green; production build.

## Out of scope

No schema changes (every document field already exists and is editable). No
document storage changes — files stay in the photos volume, still served
unlisted rather than secret, which the Files tab says once, plainly.

Ships as **v0.10.1** (a patch: the version only moves minor when Austin says so).
