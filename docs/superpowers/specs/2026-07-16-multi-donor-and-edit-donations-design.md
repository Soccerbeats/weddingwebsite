# Multi-Donor Donations + Edit/Delete — Design

**Date:** 2026-07-16
**Status:** Approved (user said "Build it")

## Goal

Support group gifts (multiple people on one donation) and let the admin edit or
delete a donation from the Donations tab, with fund progress reconciled on both.

## Decisions (from brainstorming)

- **Attribution = option C:** the **primary donor** receives the full amount
  (credited to their guest-list total and driving fund progress). **Co-givers**
  are recorded and displayed but get $0 in their own total.
- **Co-givers** are added from the guest-list search; **if the user types a name
  and presses Enter without picking a match, the typed text is added** as a
  co-giver (id = null). Primary donor must be picked from the list (needs a
  guest id to credit the total).
- Donations table **lists all names** (primary first, then co-givers).
- Multi-donor logging applies to **both** modals (Registry + Donations tab).
- **Edit and Delete** live on the Donations tab; both reconcile fund progress.
  Edit can change **all** fields.

## Current State

- `donations` table (already exists in prod, currently empty): `id, guest_id,
  guest_name, amount, fund_item_id, fund_item_title, event, created_at`.
- `/api/admin/donations` (`src/app/api/admin/donations/route.ts`) has GET + POST.
- Registry "Log a Gift" modal (`src/app/admin/registry/page.tsx`): single donor
  (`selectedDonor`), event, amount; on save POSTs the donation + bumps fund
  `funded` in site.json.
- RSVPs Donations tab (`src/app/admin/rsvps/page.tsx`): "+ Log Donation" modal
  (`saveDonation`) with single `donationDonor`, and a read-only donations table.
- Fund progress lives in `site.json` (`config.registry.items[].funded`), bumped
  client-side by fetching fresh config and POSTing it back.

## Data Model

Add one column to `donations`:

- `co_donors JSONB DEFAULT '[]'::jsonb` — an array of `{ id: number | null,
  name: string }`. Applied via `ALTER TABLE donations ADD COLUMN IF NOT EXISTS`
  inside `ensureTable()` (the table already exists in prod, so a plain re-create
  won't add it).

`guest_id` / `guest_name` remain the **primary donor** — unchanged semantics, so
existing per-guest totals and fund logic keep working with no migration of rows.

The `Donation` shape becomes:
`{ id, guest_id, guest_name, amount, fund_item_id, fund_item_title, event,
created_at, co_donors: { id: number|null; name: string }[] }`.

## API (`/api/admin/donations`)

- **GET** — also selects `co_donors` (coalesced to `[]`).
- **POST** — accepts `co_donors` (array; defaults to `[]`), inserts it.
- **PUT** — edit by `id`. Body: `{ id, guest_id, guest_name, amount,
  fund_item_id, fund_item_title, event, co_donors }`. Updates the row, returns
  it. Validates `id`, `guest_name`, numeric `amount`.
- **DELETE** — remove by `id` (body `{ id }`). Returns `{ success: true }`.

The API does **not** touch site.json; fund reconciliation is done client-side
(the pages hold config and know old vs. new amounts).

## Fund Reconciliation (client-side, Donations tab)

Compute a per-fund delta map against **fresh** config, then clamp each affected
item's `funded` to `[0, price]`, and POST the whole config back (mirrors the
existing `save()` pattern). This correctly handles same-fund edits.

- **Add** (existing): `delta[fundId] += amount`.
- **Edit:** `delta[oldFundId] -= oldAmount; delta[newFundId] += newAmount`.
- **Delete:** `delta[fundId] -= amount`.

Apply: `funded = clamp(funded + (delta[id] || 0), 0, price)`.

## UI

### Co-giver control (shared pattern, both modals)

Below the primary-donor picker: a search input + a list of removable chips.
Typing filters the guest list; clicking a match adds `{ id, name }`; pressing
**Enter** with a non-empty query and no click adds `{ id: null, name: typed }`.
Each chip has an ✕ to remove. Stored in a `coGivers` array in modal state.

### Registry modal (`registry/page.tsx`)

Add co-giver control; include `co_donors: coGivers` in the POST body. (Registry
only logs — no edit/delete here.)

### Donations tab (`rsvps/page.tsx`)

- The log modal gains the co-giver control and becomes **reusable for edit**:
  an `editingDonationId` state (null = add mode). Opening Edit pre-fills primary
  donor, co-givers, amount, fund, event, and records the donation's *original*
  amount + fund for reconciliation.
- **Save** branches: add mode → POST + `delta[fund] += amount`; edit mode → PUT
  + `delta[oldFund] -= oldAmount; delta[newFund] += newAmount`. Both POST the
  reconciled config, then refresh.
- Each donations-table row gets **Edit** and **Delete** actions. Delete confirms,
  reconciles (`delta[fund] -= amount`), calls DELETE, refreshes.
- The donor cell lists all names: primary, then co-giver names.

## Scope

**In:** `co_donors` column + PUT + DELETE; multi-donor logging in both modals;
edit + delete on the Donations tab with fund reconciliation; display all names.

**Out:** editing donations from the Registry page; reconciling a *guest rename*
into past donation snapshots; undo of a delete.

## Files Touched

- `src/app/api/admin/donations/route.ts` — co_donors column, GET/POST update, PUT, DELETE.
- `src/app/admin/registry/page.tsx` — co-giver control + co_donors in POST.
- `src/app/admin/rsvps/page.tsx` — co-giver control, edit/delete, reconciliation, display.

## Testing

- Log a group gift (primary + 2 co-givers, one typed-and-Entered) → row shows all
  names; only the primary's guest-list total rises; fund advances by the amount.
- Edit that donation: change amount and fund → old fund drops by old amount, new
  fund rises by new amount (clamped); table reflects new values.
- Edit primary donor → old primary's total drops, new primary's rises.
- Delete a donation → fund drops by its amount (not below 0); row gone.
- Existing single-donor donations (no co_donors) still load and display.
