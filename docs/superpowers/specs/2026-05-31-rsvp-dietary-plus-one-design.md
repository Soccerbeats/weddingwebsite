# RSVP: Per-Person Dietary Restrictions & Plus-One Display

**Date**: 2026-05-31  
**Status**: Approved

---

## Overview

Three related improvements to the RSVP system:

1. Replace the single dietary restrictions text field with per-person checkbox cards (one card per guest in party)
2. Show plus-one name in the admin RSVP table when party size is 2
3. Fix four schema gaps found during audit

---

## 1. Dietary Restrictions — Per-Person Checkboxes

### Data Shape

Replace `dietary_restrictions TEXT` in the `rsvps` table with `dietary_restrictions JSONB`. Structure:

```json
[
  { "name": "Jane Smith", "vegetarian": false, "vegan": false, "gluten_free": true, "nut_allergy": false },
  { "name": "John Smith", "vegetarian": true, "vegan": false, "gluten_free": false, "nut_allergy": false }
]
```

Array length always equals `number_of_guests` at submission time.

### Public RSVP Form (`RSVPForm.tsx`)

- Remove the dietary restrictions textarea
- Add a "Dietary Restrictions" section that renders one card per confirmed guest (only when `attending = yes`)
- Guest 1 card: always labeled with the verified guest's name
- Guest 2 card (if `guestCount = 2`): labeled with `plus_one_name` from `verifiedGuest` if present, otherwise "Guest 2"
- Each card has four checkboxes: **Vegetarian**, **Vegan**, **Gluten Free**, **Nut Allergy**
- When `guestCount` drops from 2 → 1, the second card disappears and its data is excluded from submission
- `formData.dietaryRestrictions` becomes an array of per-person objects, initialized dynamically when `guestCount` or `attending` changes

### API (`/api/rsvp` POST and PUT)

- Accept `dietaryRestrictions` as either an array (new) or string (legacy fallback)
- Store as JSONB
- Server-side validate `guestCount <= verifiedGuest.party_size` (currently only enforced client-side)

### Admin RSVP Table (`/admin/rsvps`)

- "Dietary" column: render per-person lines instead of raw text
  - Format: `[Name]: Vegan, Gluten Free` — only list the restrictions that are `true`
  - If no restrictions checked: show `-`
  - Legacy string data: render as plain text unchanged
- "Name" column: show plus-one name on a second line when `number_of_guests >= 2 AND plus_one_name` exists
  - Requires joining `guest_list` on `guest_name` in the admin RSVP API

### Admin RSVP API (`/api/admin/rsvps` GET)

- JOIN `guest_list gl ON LOWER(gl.guest_name) = LOWER(r.guest_name)` to pull `gl.plus_one_name`
- Return `plus_one_name` in each RSVP row

---

## 2. DB Migration

Column change: `dietary_restrictions TEXT` → `dietary_restrictions JSONB`

Migration strategy (runs in `init.sql` via `IF NOT EXISTS` guards and conditional ALTER):

```sql
-- Add plus_one_name and address to guest_list if missing
ALTER TABLE guest_list ADD COLUMN IF NOT EXISTS plus_one_name VARCHAR(255);
ALTER TABLE guest_list ADD COLUMN IF NOT EXISTS address TEXT;

-- Add updated_at to rsvps if missing
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Migrate dietary_restrictions from TEXT to JSONB
-- Step 1: rename old column (only if it's still TEXT)
-- Step 2: add new JSONB column
-- Step 3: migrate existing data
-- Note: handled via DO block to be idempotent
```

Full idempotent migration uses a `DO $$ ... $$` block that checks `pg_attribute` before altering.

---

## 3. Schema Gaps Fixed

| Gap | Fix |
|-----|-----|
| `guest_list.plus_one_name` missing from `init.sql` | Add `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` |
| `guest_list.address` missing from `init.sql` | Add `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` |
| `rsvps.updated_at` missing | Add column with `DEFAULT NOW()` |
| `guestCount` not validated server-side | Add check in POST/PUT handler against `guest_list.party_size` |

---

## 4. Files Changed

| File | Change |
|------|--------|
| `database/init.sql` | Add missing columns, JSONB migration block |
| `src/app/api/rsvp/route.ts` | Accept JSONB dietary, add server-side party size validation |
| `src/app/api/admin/rsvps/route.ts` | JOIN guest_list to return plus_one_name |
| `src/components/RSVPForm.tsx` | Replace textarea with per-person checkbox cards |
| `src/app/admin/rsvps/page.tsx` | Update Name + Dietary columns in RSVP table |

---

## 5. Non-Goals

- No new dietary options beyond the four specified (Vegetarian, Vegan, Gluten Free, Nut Allergy)
- No admin ability to edit dietary data directly (guests update via re-RSVP)
- No email changes for dietary content
