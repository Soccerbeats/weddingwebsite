# Log Donation from Donations Tab — Design

**Date:** 2026-07-16
**Status:** Approved (user said "build it")

## Goal

Let the admin record a donation directly from the RSVPs → Donations tab (not
only from the Registry "Log a Gift" modal), advancing the chosen fund's
progress exactly as the Registry flow does.

## Current State

- Donations are recorded from Registry (`src/app/admin/registry/page.tsx`) via
  the "Log a Gift" modal. There the fund item is implicit (you clicked it), and
  saving both `POST`s a donation row (`/api/admin/donations`) and bumps that
  fund item's `funded` in `site.json`.
- The RSVPs page (`src/app/admin/rsvps/page.tsx`) has a **Donations** tab that
  lists donation rows and a per-guest **Donated** total, but it is read-only —
  there is no way to add a donation there.
- The RSVPs page already loads site config into `config` state via
  `fetchConfig()`, so `config.registry.items` (the funds) are available.

## What We're Building

A **"+ Log Donation"** button in the Donations tab header that opens a modal to
record a donation. All changes live in `src/app/admin/rsvps/page.tsx` — no new
API routes, no DB changes.

### Modal fields

- **Guest** — search-as-you-type filtering the guest list (same control style as
  the Registry modal); selecting a guest captures `guest_id` + `guest_name`.
- **Amount** — dollar amount (number).
- **Fund** — a **required** `<select>` of existing Registry funds, sourced from
  `config.registry.items` (`{ id, title, price, funded }`). Empty/disabled if
  there are no funds.
- **Event** — `<select>`: Bridal Shower / Engagement Party / Wedding Day / Other.
  Choosing **Other** reveals a text input; the typed value (fallback "Other" if
  blank) is stored as `event`.

Save is disabled until a guest, a numeric amount, and a fund are all chosen.

### On save (mirrors Registry "Log a Gift")

1. **Advance fund progress, persisted safely:** fetch the latest config from
   `GET /api/admin/site-config`, find the chosen fund in `config.registry.items`,
   set its `funded = Math.min(price, funded + amount)`, and `POST` the whole
   config back (the server shallow-merges). Fetching fresh config at save time —
   exactly like the Registry `save()` — avoids clobbering other config fields.
2. **Record the donation row:** `POST /api/admin/donations` with
   `{ guest_id, guest_name, amount, fund_item_id, fund_item_title, event }` —
   the existing endpoint, unchanged.
3. **Refresh UI:** re-run `fetchDonations()` and `fetchConfig()` so the Donations
   table, guest totals, and any config-derived values update; close and reset the
   modal.

### Consistency with Registry flow

Same donation record shape, same `funded` cap logic (`Math.min(price, funded +
amount)`), same event resolution (Other→custom). A donation logged here is
indistinguishable from one logged in Registry.

## Scope

**In:** the "+ Log Donation" button + modal on the Donations tab; fund-progress
advance; UI refresh.

**Out:** editing/deleting a donation (unchanged from prior scope); reversing a
fund's `funded` if a donation is later removed.

## Files Touched

- `src/app/admin/rsvps/page.tsx` — new state, modal, save handler, button.

## Testing

- Open RSVPs → Donations → "+ Log Donation": guest search filters and selects;
  fund dropdown lists the Registry funds; event Other reveals a text box.
- Save with guest + amount + fund → new row appears in the Donations table, the
  guest's Donated total increases, and the Registry page shows that fund's
  progress advanced by the amount (capped at its price).
- Save button stays disabled until guest + numeric amount + fund are set.
- With no Registry funds configured, the fund dropdown is empty and save is
  disabled (no crash).
