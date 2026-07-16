# Donation Tracking — Design

**Date:** 2026-07-16
**Status:** Approved (pending spec review)

## Goal

Let the admin record who donated when logging a Registry fund contribution, and
surface each guest's total donated amount in the guest list, with a dedicated
Donations page for the full breakdown.

## Current State

- Registry admin (`src/app/admin/registry/page.tsx`) has a "Log contribution"
  modal. You click a fund item, enter an amount, and `logContribution` bumps
  that item's `funded` value in `site.json`. Contributions are **anonymous** —
  no record of who gave, how much individually, or from what event.
- Guest list lives in the PostgreSQL `guest_list` table, managed on the RSVPs
  admin page (`src/app/admin/rsvps/page.tsx`), which has two tabs:
  `'rsvps' | 'guestlist'`.

## What We're Building

### 1. Data model — new `donations` table (PostgreSQL)

Created on demand with `CREATE TABLE IF NOT EXISTS`, matching how other tables
are handled.

| Column          | Type      | Notes                                             |
|-----------------|-----------|---------------------------------------------------|
| id              | serial PK |                                                   |
| guest_id        | integer   | FK-ish reference to `guest_list.id` (nullable)    |
| guest_name      | text      | Snapshot of donor name at time of entry           |
| amount          | numeric   | Donation amount                                   |
| fund_item_id    | text      | The registry FundItem id it went toward           |
| fund_item_title | text      | Snapshot of fund item title                       |
| event           | text      | "Bridal Shower" \| "Engagement Party" \| "Wedding Day" \| custom text for Other |
| created_at      | timestamp | default NOW()                                     |

Snapshots (`guest_name`, `fund_item_title`) keep historical rows readable even
if a guest or fund item is later renamed or removed.

The existing `site.json` `funded` amounts stay as-is. This table is **purely
additive** — the existing registry display and progress bars are untouched.

### 2. API — `/api/admin/donations/route.ts`

- **GET** — returns all donation rows (newest first). Used by both the guest
  list (client aggregates per-guest totals) and the Donations table.
- **POST** — inserts a donation row. Body:
  `{ guest_id, guest_name, amount, fund_item_id, fund_item_title, event }`.

No edit/delete endpoint in v1 (see Scope).

### 3. Registry admin — expand the "Log contribution" modal

The fund item is already implicit (it's the item you clicked) and the amount
field already exists. Add:

- **Guest** — a search-as-you-type text input that filters the guest list
  (fetched from `/api/admin/guest-list`) and lets you pick a guest. Selecting a
  guest captures `guest_id` + `guest_name`.
- **Event** — selector with presets *Bridal Shower · Engagement Party ·
  Wedding Day · Other*. Choosing **Other** reveals a text input to name the
  event; the typed value is stored as `event`.

On save, `logContribution` does what it does today (bump `funded` in site.json)
**and** POSTs a donation row to `/api/admin/donations`.

Also add a **"View donations"** button in the Registry admin tab that links to
`/admin/rsvps?tab=donations`.

### 4. RSVPs admin — guest list total + new Donations tab

- Widen the tab type to `'rsvps' | 'guestlist' | 'donations'`; add a
  **Donations** tab button to the right of Guest List.
- On load, read a `?tab=` query param so the Registry button can deep-link
  straight to the Donations tab.
- Fetch donations once (`GET /api/admin/donations`). Aggregate per guest
  client-side.
- **Guest list rows:** show a single **Donated: $X** total per row (sum of that
  guest's donation rows; blank/$0 if none).
- **Donations tab:** a table of raw donation info — Guest · Amount · Fund ·
  Event · Date — newest first.

## Scope (v1)

**In:** logging donations (with guest + event), guest-list total column, the
Donations table page, the Registry deep-link button.

**Out:** editing or deleting an individual donation after the fact. Deleting a
donation would require reconciling the fund item's `funded` number in
site.json, which we'll add deliberately later rather than half-build now.

## Files Touched

- `src/app/api/admin/donations/route.ts` — **new** (GET/POST + table bootstrap)
- `src/app/admin/registry/page.tsx` — modal fields + POST + "View donations" button
- `src/app/admin/rsvps/page.tsx` — Donations tab, guest total column, `?tab=` handling

## Testing

- Log a donation for a guest → appears in Donations table with correct fund/event.
- Guest list row shows that guest's summed total; guests with no donations show none.
- Registry "View donations" button opens RSVPs page on the Donations tab.
- Fund item `funded` / progress bar still increments as before (no regression).
- "Other" event with custom text stores and displays the typed name.
