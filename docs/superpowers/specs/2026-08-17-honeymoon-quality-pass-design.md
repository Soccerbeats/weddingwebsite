# Honeymoon portal — quality pass

**Date:** 2026-08-17
**Status:** approved in advance ("do everything you would recommend and then build it")

## Why

The portal grew feature by feature over twenty-seven builds. Each addition was
sound on its own; taken together they leave gaps that only show up once you use
the thing to plan a real trip. This pass closes them.

Two of those gaps are about *losing work*, and they matter more than any feature
here. Every delete in the module is final — `confirm()` and it's gone, including
a bulk delete over a hundred lassoed places and a day delete that cascades its
stops. And closing the place editor throws away everything typed into it without
a word. Someone planning their own honeymoon is spending evenings on this; the
cost of losing an evening's work is not measured in rows.

## Scope

### 1. Trip dates as a draggable range

Settings currently has a bare `<input type="date">` for the start, and no end
date at all — the trip's length is whatever number of `honeymoon_days` rows
happen to exist, built one "+ Add day" at a time.

Replace it with a month calendar you drag across: press on the first day,
release on the last. The range shades live while dragging, and either end can be
re-dragged afterwards.

Committing a range does two things:

- writes `start_date` and a new `end_date` column
- **reconciles the day rows to match the range** — this is the point of the
  feature. Extending to fourteen nights creates the missing days; shortening
  deletes the trailing ones, but only after a confirm that names exactly what
  is on them ("Day 12–14 have 7 stops and 1 travel leg").

Moving only the start (same length) shifts every date and touches no rows.

`calendarMonths()` already builds trip-anchored month grids. It gets refactored
onto a `monthMatrix(year, month)` primitive so the picker can show any month,
including for a trip with no dates set yet.

### 2. Undo for every delete

A shared undo layer: capture the rows before deleting, show a toast with an
**Undo** for ten seconds, and re-create them on demand.

Covers places (single and bulk), days (with their stops and travel legs), stops,
travel legs, guide notes and to-dos. Restored rows get new ids — acceptable
everywhere except a restored day, whose stops must be re-pointed at the new day
id, which the restore does explicitly.

Undo is not a transaction log and does not pretend to be: it holds exactly the
last delete, in memory, until the toast expires. That is the window in which
people realise their mistake.

Where undo exists, the `confirm()` before it goes — a confirm that can be undone
is two speed bumps for one hazard. The bulk delete keeps its confirm, because
"116 places" is worth reading twice.

### 3. Dialogs stop eating work

- **Escape closes** every dialog. Currently only the ✕ and a backdrop click do.
- **A dirty place editor refuses to close silently** — Escape, ✕ and the
  backdrop all ask first. Saving or an untouched form closes as before.
- **⌘/Ctrl+Enter saves** from anywhere in the editor.

### 4. Find anything (⌘K)

Places search exists on the Places tab and nowhere else, so a guide note or a
to-do can only be found by remembering which tab it is on. A ⌘K palette searches
places, guide notes, to-dos, days and regions at once, with arrow-key navigation,
and goes to the right tab — opening the place editor directly for a place.

### 5. Take it with you

For the trip itself, not the planning:

- **`.ics` export** — one all-day event per day carrying its stops in the
  description, plus timed events for travel legs and any stop with a time. Drops
  the whole trip into a phone calendar.
- **Print view** — the itinerary printed as a clean day-by-day sheet, no
  chrome, no navigation.
- **JSON backup** in Settings — one button, the whole payload. A botched bulk
  edit stops being fatal.

### 6. Itinerary depth

- `honeymoon_days.notes` and `honeymoon_stops.notes` both exist in the schema
  with **no UI at all**. Wire them up.
- **Move a stop to another day** from its ⋯ menu. Cross-day dragging would mean
  restructuring the nested DnD contexts for a fraction more value.
- **Duplicate a day**, structure and stops, for the second beach day.

### 7. Parity across tabs

- The Places tab gets the ⋯ bulk-field menu and **Add to day…**, so the same
  selection verbs exist whether you selected on the map or in the list.
- A scheduled place says *which* day it is on, in the list and in the editor.

### 8. Settings finishes its job

`honeymoon_trip.home_currency` drives `formatPerNight` and every price on the
dashboard, and there has never been a control for it. Add one.

### 9. Mobile

The module was built at 1600px. Rather than guess, walk every tab at 390×844 in
a browser and fix what is actually broken.

## Deliberately not doing

- **Weather or season data** — needs a third-party API and a key, for something
  a search answers better.
- **Cross-day drag and drop for stops** — the nested DnD contexts make it a
  rewrite; the ⋯ menu gets there in two clicks.
- **Importing a JSON backup** — a half-working restore is worse than none. The
  backup is for reading and for handing to me.
- **The `photos` JSONB column on places** — `image_url` covers the one thing it
  was for. Leaving dead weight is better than inventing a gallery nobody asked
  for.

## Testing

Pure logic (`monthMatrix`, range reconciliation, `.ics` generation, search
ranking) goes in `npm run check:honeymoon`, which needs no database and no
network. Everything else is verified in a real browser against a real database,
at desktop and mobile widths — including the undo path, which is verified by
deleting real rows and restoring them.
