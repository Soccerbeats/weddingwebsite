# Multi-Donor Donations + Edit/Delete — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Support group gifts (a primary donor + co-givers) on donations, and let the admin edit/delete a donation from the Donations tab with fund progress reconciled.

**Architecture:** Add a `co_donors` JSONB column and PUT/DELETE to `/api/admin/donations`. Both log modals gain a co-giver multi-select (guest search + type-and-Enter free text). The Donations tab reuses its modal for edit and adds edit/delete row actions; fund `funded` in `site.json` is reconciled client-side via a per-fund delta map.

**Tech Stack:** Next.js 16 App Router, TypeScript, React 19, Tailwind, PostgreSQL (`pg`).

## Global Constraints

- Docker image name is always `ghcr.io/soccerbeats/weddingwebsite:latest`.
- No unit-test framework. Verification = `npm run build` succeeds + no NEW lint errors in touched files (repo has ~90 pre-existing unrelated errors; `rsvps/page.tsx` and `registry/page.tsx` each already have pre-existing `any`/unused-var findings that don't count).
- **Attribution = option C:** `guest_id`/`guest_name` = the primary donor (full amount, drives fund progress + guest-list total). `co_donors` = `{ id: number|null; name: string }[]`, display/record only ($0 individual credit).
- Co-giver add: click a guest match → `{ id, name }`; press Enter with non-empty query and no click → `{ id: null, name: typed }`. Primary donor must be a guest-list pick.
- The `donations` table ALREADY EXISTS in production (empty). Add the new column with `ALTER TABLE donations ADD COLUMN IF NOT EXISTS co_donors JSONB DEFAULT '[]'::jsonb` inside `ensureTable()` — a bare `CREATE TABLE IF NOT EXISTS` will NOT add a column to the existing table.
- Fund reconciliation is client-side only: build a per-fund delta map, fetch FRESH config, apply `funded = clamp(funded + (delta[id]||0), 0, price)` to each item, POST the whole config back (mirrors the existing Registry `save()` and `saveDonation` pattern). The `/api/admin/donations` route must NOT touch site.json.
- Commit after each task; message ends with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: API — `co_donors` column, PUT, DELETE

**Files:**
- Modify: `src/app/api/admin/donations/route.ts`

**Interfaces:**
- Produces:
  - GET returns rows including `co_donors: { id: number|null; name: string }[]`.
  - POST accepts optional `co_donors` (array; default `[]`).
  - PUT body `{ id, guest_id, guest_name, amount, fund_item_id, fund_item_title, event, co_donors }` → updated row.
  - DELETE body `{ id }` → `{ success: true }`.

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `src/app/api/admin/donations/route.ts` with:

```typescript
import { NextResponse } from 'next/server';
import pool from '@/lib/db';

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS donations (
      id SERIAL PRIMARY KEY,
      guest_id INTEGER,
      guest_name TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      fund_item_id TEXT,
      fund_item_title TEXT,
      event TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE donations ADD COLUMN IF NOT EXISTS co_donors JSONB DEFAULT '[]'::jsonb`);
}

export async function GET() {
  try {
    await ensureTable();
    const result = await pool.query(
      `SELECT id, guest_id, guest_name, amount::float8 AS amount,
              fund_item_id, fund_item_title, event, created_at,
              COALESCE(co_donors, '[]'::jsonb) AS co_donors
       FROM donations ORDER BY created_at DESC, id DESC`
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching donations:', error);
    return NextResponse.json({ error: 'Failed to fetch donations' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureTable();
    const { guest_id, guest_name, amount, fund_item_id, fund_item_title, event, co_donors } = await request.json();
    if (!guest_name || amount == null || isNaN(Number(amount))) {
      return NextResponse.json({ error: 'guest_name and a numeric amount are required' }, { status: 400 });
    }
    const result = await pool.query(
      `INSERT INTO donations (guest_id, guest_name, amount, fund_item_id, fund_item_title, event, co_donors)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, guest_id, guest_name, amount::float8 AS amount, fund_item_id, fund_item_title, event, created_at,
                 COALESCE(co_donors, '[]'::jsonb) AS co_donors`,
      [guest_id ?? null, guest_name, Number(amount), fund_item_id ?? null, fund_item_title ?? null, event ?? null,
       JSON.stringify(Array.isArray(co_donors) ? co_donors : [])]
    );
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding donation:', error);
    return NextResponse.json({ error: 'Failed to add donation' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await ensureTable();
    const { id, guest_id, guest_name, amount, fund_item_id, fund_item_title, event, co_donors } = await request.json();
    if (!id || !guest_name || amount == null || isNaN(Number(amount))) {
      return NextResponse.json({ error: 'id, guest_name and a numeric amount are required' }, { status: 400 });
    }
    const result = await pool.query(
      `UPDATE donations
       SET guest_id = $1, guest_name = $2, amount = $3, fund_item_id = $4,
           fund_item_title = $5, event = $6, co_donors = $7
       WHERE id = $8
       RETURNING id, guest_id, guest_name, amount::float8 AS amount, fund_item_id, fund_item_title, event, created_at,
                 COALESCE(co_donors, '[]'::jsonb) AS co_donors`,
      [guest_id ?? null, guest_name, Number(amount), fund_item_id ?? null, fund_item_title ?? null, event ?? null,
       JSON.stringify(Array.isArray(co_donors) ? co_donors : []), id]
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Donation not found' }, { status: 404 });
    }
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating donation:', error);
    return NextResponse.json({ error: 'Failed to update donation' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureTable();
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    await pool.query('DELETE FROM donations WHERE id = $1', [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting donation:', error);
    return NextResponse.json({ error: 'Failed to delete donation' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds; `/api/admin/donations` compiles with GET/POST/PUT/DELETE.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/donations/route.ts
git commit -m "feat: donations API co_donors column + PUT/DELETE endpoints"
```

---

### Task 2: Registry modal — co-givers

**Files:**
- Modify: `src/app/admin/registry/page.tsx`

**Interfaces:**
- Consumes: `donorGuests` (already fetched: `{ id: number; guest_name: string }[]`).
- Produces: donation POST body now includes `co_donors`.

Note the existing single-donor state (lines ~59-63): `donorGuests`, `donorSearch`, `selectedDonor`, `donationEvent`, `otherEvent`. The modal is `{contributingItem && (...)}` (~line 905); the primary-donor "Who donated?" block is at ~920. `logContribution` is at ~259 and already POSTs to `/api/admin/donations` inside `if (selectedDonor)`.

- [ ] **Step 1: Add co-giver state**

Add next to the existing donor state (after `otherEvent`, ~line 63):

```typescript
    const [coGivers, setCoGivers] = useState<{ id: number | null; name: string }[]>([]);
    const [coGiverSearch, setCoGiverSearch] = useState('');
```

- [ ] **Step 2: Add co-giver helpers**

Add these near `logContribution` (before it, ~line 258):

```typescript
    const addCoGiver = (person: { id: number | null; name: string }) => {
        const name = person.name.trim();
        if (!name) return;
        if (coGivers.some(c => c.name.toLowerCase() === name.toLowerCase())) { setCoGiverSearch(''); return; }
        setCoGivers([...coGivers, { id: person.id, name }]);
        setCoGiverSearch('');
    };
    const removeCoGiver = (name: string) => setCoGivers(coGivers.filter(c => c.name !== name));
```

- [ ] **Step 3: Include co_donors in the POST and reset it**

In `logContribution`, add `co_donors: coGivers,` to the donation POST body (the object with `guest_id`, `guest_name`, `amount`, `fund_item_id`, `fund_item_title`, `event`). Then, wherever the modal state is reset at the end of `logContribution` (alongside `setSelectedDonor(null)` etc.), add:

```typescript
        setCoGivers([]);
        setCoGiverSearch('');
```

Also add the same two resets to the modal-close handler used by the backdrop `onClick` and Cancel button (the arrow that currently resets `setContributingItem(null); setDonorSearch(''); setSelectedDonor(null); setDonationEvent('Wedding Day'); setOtherEvent('');`).

- [ ] **Step 4: Render the co-giver control in the modal**

In the modal, immediately AFTER the primary-donor "Who donated?" block (the `{selectedDonor ? (...) : (...)}` block ends around line 957, before the Event label), insert:

```tsx
                        <label className="block text-sm font-medium text-gray-700 mb-1">Co-givers (optional)</label>
                        {coGivers.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                                {coGivers.map(c => (
                                    <span key={c.name} className="inline-flex items-center gap-1 bg-gray-100 rounded-full px-2 py-1 text-xs">
                                        {c.name}
                                        <button type="button" onClick={() => removeCoGiver(c.name)} className="text-gray-400 hover:text-gray-600">✕</button>
                                    </span>
                                ))}
                            </div>
                        )}
                        <input
                            type="text"
                            value={coGiverSearch}
                            onChange={e => setCoGiverSearch(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && coGiverSearch.trim()) { e.preventDefault(); addCoGiver({ id: null, name: coGiverSearch }); } }}
                            placeholder="Add a co-giver (type & Enter, or pick below)"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        />
                        {coGiverSearch.trim() && (
                            <div className="mt-1 max-h-32 overflow-y-auto border border-gray-200 rounded-lg mb-4">
                                {donorGuests
                                    .filter(g => g.guest_name.toLowerCase().includes(coGiverSearch.toLowerCase()))
                                    .slice(0, 8)
                                    .map(g => (
                                        <button key={g.id} type="button" onClick={() => addCoGiver({ id: g.id, name: g.guest_name })}
                                            className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-100">
                                            {g.guest_name}
                                        </button>
                                    ))}
                            </div>
                        )}
                        {!coGiverSearch.trim() && <div className="mb-4" />}
```

- [ ] **Step 5: Build & commit**

Run: `npm run build` (expect success, no new lint errors in the file).

```bash
git add src/app/admin/registry/page.tsx
git commit -m "feat: registry gift modal supports co-givers (group gifts)"
```

---

### Task 3: Donations tab — co-givers, edit, delete, reconciliation, display

**Files:**
- Modify: `src/app/admin/rsvps/page.tsx`

**Interfaces:**
- Consumes: `guests` (`Guest[]` with `id`, `guest_name`), `config.registry.items` (`FundItem[]`), donations API GET/POST/PUT/DELETE.
- Produces: multi-donor logging, edit/delete with fund reconciliation.

Existing anchors: `Donation` interface (~line 264 area, add `co_donors`); donation modal state (~lines 70-76); `resetDonationModal` (~169) and `saveDonation` (~179); the Donations tab panel `{activeTab === 'donations' && (...)}` (~1022) with its table; the log modal `{showDonationModal && (...)}` (~1063).

- [ ] **Step 1: Extend the `Donation` type and add state**

Add `co_donors` to the `Donation` interface:

```typescript
    co_donors?: { id: number | null; name: string }[];
```

Add modal state next to the existing donation state (after `donationOtherEvent`, ~line 76):

```typescript
    const [coGivers, setCoGivers] = useState<{ id: number | null; name: string }[]>([]);
    const [coGiverSearch, setCoGiverSearch] = useState('');
    const [editingDonationId, setEditingDonationId] = useState<number | null>(null);
    const [origDonation, setOrigDonation] = useState<{ amount: number; fund_item_id: string | null } | null>(null);
    const [deletingDonation, setDeletingDonation] = useState<Donation | null>(null);
```

- [ ] **Step 2: Co-giver helpers + reset extension**

Add these helpers next to `resetDonationModal` (~line 168):

```typescript
    const addCoGiver = (person: { id: number | null; name: string }) => {
        const name = person.name.trim();
        if (!name) return;
        if (coGivers.some(c => c.name.toLowerCase() === name.toLowerCase())) { setCoGiverSearch(''); return; }
        setCoGivers([...coGivers, { id: person.id, name }]);
        setCoGiverSearch('');
    };
    const removeCoGiver = (name: string) => setCoGivers(coGivers.filter(c => c.name !== name));
```

Extend `resetDonationModal` to also clear the new state (add inside it):

```typescript
        setCoGivers([]);
        setCoGiverSearch('');
        setEditingDonationId(null);
        setOrigDonation(null);
```

- [ ] **Step 3: Add an `openEditDonation` helper**

Add after `resetDonationModal`:

```typescript
    const openEditDonation = (d: Donation) => {
        setEditingDonationId(d.id);
        setOrigDonation({ amount: d.amount, fund_item_id: d.fund_item_id });
        setDonationDonor(d.guest_id != null ? { id: d.guest_id, guest_name: d.guest_name } : { id: 0, guest_name: d.guest_name });
        setDonationAmount(String(d.amount));
        setDonationFundId(d.fund_item_id || '');
        const presets = ['Bridal Shower', 'Engagement Party', 'Wedding Day'];
        if (d.event && presets.includes(d.event)) { setDonationEvent(d.event); setDonationOtherEvent(''); }
        else { setDonationEvent('Other'); setDonationOtherEvent(d.event || ''); }
        setCoGivers(Array.isArray(d.co_donors) ? d.co_donors : []);
        setCoGiverSearch('');
        setShowDonationModal(true);
    };
```

- [ ] **Step 4: Rewrite `saveDonation` to handle add + edit with delta-map reconciliation**

Replace the existing `saveDonation` (lines ~179-222) with:

```typescript
    const saveDonation = async () => {
        const amount = parseFloat(donationAmount);
        if (!donationDonor || !amount || isNaN(amount) || !donationFundId) return;
        const funds: FundItem[] = config?.registry?.items || [];
        const fund = funds.find(f => f.id === donationFundId);
        if (!fund) return;
        const eventValue = donationEvent === 'Other' ? (donationOtherEvent.trim() || 'Other') : donationEvent;
        setSavingDonation(true);
        try {
            // Build per-fund delta map (edit reverses the original first)
            const delta: Record<string, number> = {};
            if (editingDonationId && origDonation?.fund_item_id) {
                delta[origDonation.fund_item_id] = (delta[origDonation.fund_item_id] || 0) - origDonation.amount;
            }
            delta[donationFundId] = (delta[donationFundId] || 0) + amount;
            await applyFundDeltas(delta);
            // Write the donation row
            const body = {
                guest_id: donationDonor.id || null,
                guest_name: donationDonor.guest_name,
                amount,
                fund_item_id: fund.id,
                fund_item_title: fund.title,
                event: eventValue,
                co_donors: coGivers,
            };
            if (editingDonationId) {
                await fetch('/api/admin/donations', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...body, id: editingDonationId }),
                });
            } else {
                await fetch('/api/admin/donations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
            }
            await fetchDonations();
            await fetchConfig();
            resetDonationModal();
        } catch (e) {
            console.error('Failed to save donation:', e);
        } finally {
            setSavingDonation(false);
        }
    };

    // Fetch fresh config, apply per-fund funded deltas clamped to [0, price], POST it back.
    const applyFundDeltas = async (delta: Record<string, number>) => {
        const configRes = await fetch('/api/admin/site-config');
        const freshConfig = await configRes.json();
        const items: FundItem[] = (freshConfig.registry?.items || []).map((i: FundItem) => {
            const d = delta[i.id];
            if (!d) return i;
            return { ...i, funded: Math.max(0, Math.min(i.price, i.funded + d)) };
        });
        freshConfig.registry = { ...(freshConfig.registry || {}), items };
        await fetch('/api/admin/site-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(freshConfig),
        });
    };

    const confirmDeleteDonation = async () => {
        if (!deletingDonation) return;
        setSavingDonation(true);
        try {
            if (deletingDonation.fund_item_id) {
                await applyFundDeltas({ [deletingDonation.fund_item_id]: -deletingDonation.amount });
            }
            await fetch('/api/admin/donations', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: deletingDonation.id }),
            });
            await fetchDonations();
            await fetchConfig();
            setDeletingDonation(null);
        } catch (e) {
            console.error('Failed to delete donation:', e);
        } finally {
            setSavingDonation(false);
        }
    };
```

Note: `openEditDonation` sets `donationDonor.id = 0` for a legacy row with no `guest_id`; `saveDonation` sends `guest_id: donationDonor.id || null`, so `0` becomes `null` — correct.

- [ ] **Step 5: Modal — add co-giver control, dynamic title, and use it for edit**

In the log modal (`{showDonationModal && (...)}`, ~1063):

(a) Make the title dynamic — replace `Log a Donation` heading text with:
```tsx
{editingDonationId ? 'Edit Donation' : 'Log a Donation'}
```

(b) Insert the co-giver control right AFTER the primary-donor "Who donated?" block (the `{donationDonor ? (...) : (...)}` block), before the Amount label:

```tsx
                        <label className="block text-sm font-medium text-gray-700 mb-1">Co-givers (optional)</label>
                        {coGivers.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                                {coGivers.map(c => (
                                    <span key={c.name} className="inline-flex items-center gap-1 bg-gray-100 rounded-full px-2 py-1 text-xs">
                                        {c.name}
                                        <button type="button" onClick={() => removeCoGiver(c.name)} className="text-gray-400 hover:text-gray-600">✕</button>
                                    </span>
                                ))}
                            </div>
                        )}
                        <input
                            type="text"
                            value={coGiverSearch}
                            onChange={e => setCoGiverSearch(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && coGiverSearch.trim()) { e.preventDefault(); addCoGiver({ id: null, name: coGiverSearch }); } }}
                            placeholder="Add a co-giver (type & Enter, or pick below)"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
                        />
                        {coGiverSearch.trim() && (
                            <div className="-mt-3 mb-4 max-h-32 overflow-y-auto border border-gray-200 rounded-lg">
                                {guests
                                    .filter(g => g.guest_name.toLowerCase().includes(coGiverSearch.toLowerCase()))
                                    .slice(0, 8)
                                    .map(g => (
                                        <button key={g.id} type="button" onClick={() => addCoGiver({ id: g.id, name: g.guest_name })}
                                            className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-100">
                                            {g.guest_name}
                                        </button>
                                    ))}
                            </div>
                        )}
```

- [ ] **Step 6: Donations table — list all names + Edit/Delete actions**

In the Donations tab table (`{activeTab === 'donations' && (...)}`, ~1022):

(a) Add an "Actions" header `<th>` after the "Date" header:
```tsx
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
```

(b) Update the empty-state row `colSpan` from `5` to `6`.

(c) In the row body, change the Guest cell to list all names, and add an Actions cell. Replace the guest `<td>` (`{d.guest_name}`) with:
```tsx
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                                            {[d.guest_name, ...((d.co_donors || []).map(c => c.name))].join(', ')}
                                        </td>
```
and add, as the last cell in the row (after the Date `<td>`):
```tsx
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                            <button onClick={() => openEditDonation(d)} className="text-accent hover:text-accent-dark mr-3">Edit</button>
                                            <button onClick={() => setDeletingDonation(d)} className="text-red-600 hover:text-red-800">Delete</button>
                                        </td>
```

- [ ] **Step 7: Delete confirmation modal**

After the log modal's closing `)}`, add:

```tsx
            {/* Delete Donation Modal */}
            {deletingDonation && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setDeletingDonation(null)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10">
                        <h2 className="text-lg font-bold text-gray-900 mb-2">Delete donation?</h2>
                        <p className="text-sm text-gray-500 mb-4">
                            {deletingDonation.guest_name} — ${deletingDonation.amount.toLocaleString()} toward {deletingDonation.fund_item_title || 'a fund'}. This subtracts the amount from that fund's progress and cannot be undone.
                        </p>
                        <div className="flex gap-2">
                            <button onClick={confirmDeleteDonation} disabled={savingDonation}
                                className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-40">
                                {savingDonation ? 'Deleting...' : 'Delete'}
                            </button>
                            <button onClick={() => setDeletingDonation(null)} className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
```

- [ ] **Step 8: Build**

Run: `npm run build`
Expected: succeeds; `/admin/rsvps` compiles; no new lint errors in the file.

- [ ] **Step 9: Functional check (if a running instance is available)**

Log a group gift (primary + a picked co-giver + a typed-and-Entered co-giver) → row lists all names, primary's guest total rises, fund advances. Edit it (change amount + fund) → old fund down, new fund up. Delete it → fund down (not below 0), row removed. If no running instance, note deferral to post-deploy.

- [ ] **Step 10: Commit**

```bash
git add src/app/admin/rsvps/page.tsx
git commit -m "feat: donations tab supports co-givers, edit, and delete with fund reconciliation"
```

---

## Post-Implementation

Per `CLAUDE.md`, the Docker image should be built/pushed — but `deploy.md` says not to push without an explicit deploy request. Confirm with the user before pushing.

## Self-Review Notes

- **Spec coverage:** co_donors column + PUT + DELETE (Task 1) ✓; co-givers with pick + type-and-Enter, both modals (Task 2, Task 3 Steps 2/5) ✓; primary donor stays the credited donor (guest_id unchanged; Task 3 sends `donationDonor.id || null`) ✓; edit all fields (Task 3 Steps 3-5) ✓; delete (Task 3 Steps 6-7) ✓; fund reconciliation via delta map clamped [0,price] on add/edit/delete (Task 3 Step 4 `applyFundDeltas`) ✓; display all names (Task 3 Step 6) ✓; legacy single-donor rows still load (GET coalesces co_donors to `[]`; display spreads `d.co_donors || []`) ✓.
- **Type consistency:** `coGivers` / `co_donors` are `{ id: number|null; name: string }[]` in the API, both modals, and the `Donation` type. `applyFundDeltas` shared by save + delete. `origDonation` carries the pre-edit amount/fund for reversal.
- **Placeholder scan:** none — all code inline.
- **Reconciliation correctness:** same-fund edit → `delta[fund] = -old + new` applied once, clamped; cross-fund edit → two keys; delete → single negative key; clamp prevents negative funded and over-price.
