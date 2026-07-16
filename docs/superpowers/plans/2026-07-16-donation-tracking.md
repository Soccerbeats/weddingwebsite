# Donation Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin record who donated (plus amount, fund, and event) when logging a Registry contribution, show each guest's total donated in the guest list, and add a Donations breakdown tab reachable from the Registry admin.

**Architecture:** Additive PostgreSQL `donations` table written via a new `/api/admin/donations` route. The Registry "Log a Gift" modal gains a guest search + event selector and POSTs a donation row alongside its existing `funded` bump in site.json. The RSVPs admin page fetches donations, shows a per-guest total in the guest list, and renders a new Donations tab; a Registry button deep-links to it.

**Tech Stack:** Next.js 16 (App Router), TypeScript, React 19, Tailwind, PostgreSQL via `pg` (`src/lib/db.ts`).

## Global Constraints

- Docker image name is always `ghcr.io/soccerbeats/weddingwebsite:latest` — never any other name.
- No unit-test framework exists in this repo. Each task's verification cycle is: `npm run lint` passes, `npm run build` succeeds, plus the stated functional check. Do NOT introduce a test framework.
- PostgreSQL tables are created on demand with `CREATE TABLE IF NOT EXISTS` inside the route (matching the pattern in `src/app/api/admin/guest-list/route.ts`, which creates its unique index on the fly).
- API routes return JSON: success shapes like `NextResponse.json(row)` / `{ success: true }`, errors like `NextResponse.json({ error: 'message' }, { status: 500 })`.
- All DB access goes through the default pool export in `src/lib/db.ts` (`import pool from '@/lib/db'`).
- Commit after each task with a `feat:`/`chore:` message.

---

### Task 1: Donations API route

**Files:**
- Create: `src/app/api/admin/donations/route.ts`

**Interfaces:**
- Consumes: `pool` from `src/lib/db.ts`.
- Produces:
  - `GET /api/admin/donations` → `Donation[]` newest-first, where
    `Donation = { id: number; guest_id: number | null; guest_name: string; amount: number; fund_item_id: string; fund_item_title: string; event: string; created_at: string }`.
  - `POST /api/admin/donations` with body `{ guest_id?: number | null; guest_name: string; amount: number; fund_item_id: string; fund_item_title: string; event: string }` → the inserted `Donation` row.

- [ ] **Step 1: Create the route file**

Create `src/app/api/admin/donations/route.ts`:

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
}

export async function GET() {
  try {
    await ensureTable();
    const result = await pool.query(
      `SELECT id, guest_id, guest_name, amount::float8 AS amount,
              fund_item_id, fund_item_title, event, created_at
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
    const { guest_id, guest_name, amount, fund_item_id, fund_item_title, event } = await request.json();
    if (!guest_name || amount == null || isNaN(Number(amount))) {
      return NextResponse.json({ error: 'guest_name and a numeric amount are required' }, { status: 400 });
    }
    const result = await pool.query(
      `INSERT INTO donations (guest_id, guest_name, amount, fund_item_id, fund_item_title, event)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, guest_id, guest_name, amount::float8 AS amount, fund_item_id, fund_item_title, event, created_at`,
      [guest_id ?? null, guest_name, Number(amount), fund_item_id ?? null, fund_item_title ?? null, event ?? null]
    );
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding donation:', error);
    return NextResponse.json({ error: 'Failed to add donation' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Lint and build**

Run: `npm run lint && npm run build`
Expected: no errors; build completes. (The new route compiles as `/api/admin/donations`.)

- [ ] **Step 3: Functional check (against a running dev server with DATABASE_URL set)**

Run:
```bash
curl -s -X POST http://localhost:3000/api/admin/donations \
  -H 'Content-Type: application/json' \
  -d '{"guest_id":1,"guest_name":"Test Guest","amount":50,"fund_item_id":"abc","fund_item_title":"Honeymoon","event":"Wedding Day"}'
curl -s http://localhost:3000/api/admin/donations
```
Expected: POST returns the inserted row with `id` and `amount: 50`; GET returns an array containing it. (If no dev DB is available, this check is performed post-deploy instead; note that in the task summary.)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/donations/route.ts
git commit -m "feat: donations API route (GET/POST) with on-demand table"
```

---

### Task 2: Registry "Log a Gift" modal — guest search, event, and donation POST

**Files:**
- Modify: `src/app/admin/registry/page.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/guest-list` (returns rows with `id`, `guest_name`), `POST /api/admin/donations` (Task 1).
- Produces: a fully-populated donation row per logged gift; a "View donations" link to `/admin/rsvps?tab=donations`.

- [ ] **Step 1: Add guest + event state and a guest list fetch**

In `src/app/admin/registry/page.tsx`, add these state hooks next to the existing `contributingItem` / `contributionAmount` hooks (around line 57-58):

```typescript
    const [donorGuests, setDonorGuests] = useState<{ id: number; guest_name: string }[]>([]);
    const [donorSearch, setDonorSearch] = useState('');
    const [selectedDonor, setSelectedDonor] = useState<{ id: number; guest_name: string } | null>(null);
    const [donationEvent, setDonationEvent] = useState('Wedding Day');
    const [otherEvent, setOtherEvent] = useState('');
```

In the existing `useEffect` that runs on mount (the one that fetches `/api/admin/site-config` and `/api/admin/registry-items`), add a third fetch:

```typescript
        fetch('/api/admin/guest-list')
            .then(r => r.json())
            .then(data => setDonorGuests(Array.isArray(data) ? data.map((g: { id: number; guest_name: string }) => ({ id: g.id, guest_name: g.guest_name })) : []));
```

- [ ] **Step 2: Update `logContribution` to POST a donation**

Replace the existing `logContribution` function (lines 251-266) with:

```typescript
    const logContribution = async () => {
        if (!contributingItem) return;
        const amount = parseFloat(contributionAmount);
        if (!amount || isNaN(amount)) return;
        const eventValue = donationEvent === 'Other' ? (otherEvent.trim() || 'Other') : donationEvent;
        const updated = {
            ...fund,
            items: fund.items.map(i => i.id === contributingItem.id
                ? { ...i, funded: Math.min(i.price, i.funded + amount) }
                : i
            ),
        };
        setFund(updated);
        if (selectedDonor) {
            try {
                await fetch('/api/admin/donations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        guest_id: selectedDonor.id,
                        guest_name: selectedDonor.guest_name,
                        amount,
                        fund_item_id: contributingItem.id,
                        fund_item_title: contributingItem.title,
                        event: eventValue,
                    }),
                });
            } catch (e) {
                console.error('Failed to record donation:', e);
            }
        }
        setContributingItem(null);
        setContributionAmount('');
        setDonorSearch('');
        setSelectedDonor(null);
        setDonationEvent('Wedding Day');
        setOtherEvent('');
        save(updated);
    };
```

- [ ] **Step 3: Add guest search + event fields to the modal**

In the "Log contribution modal" (lines 860-888), insert the following JSX between the amount `<input>` (ends line 875) and the `<div className="flex gap-2">` button row (line 876):

```tsx
                        <label className="block text-sm font-medium text-gray-700 mb-1">Who donated?</label>
                        {selectedDonor ? (
                            <div className="flex items-center justify-between border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4">
                                <span>{selectedDonor.guest_name}</span>
                                <button type="button" onClick={() => { setSelectedDonor(null); setDonorSearch(''); }} className="text-gray-400 hover:text-gray-600">✕</button>
                            </div>
                        ) : (
                            <div className="mb-4">
                                <input
                                    type="text"
                                    value={donorSearch}
                                    onChange={e => setDonorSearch(e.target.value)}
                                    placeholder="Search guest list..."
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                />
                                {donorSearch.trim() && (
                                    <div className="mt-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
                                        {donorGuests
                                            .filter(g => g.guest_name.toLowerCase().includes(donorSearch.toLowerCase()))
                                            .slice(0, 8)
                                            .map(g => (
                                                <button
                                                    key={g.id}
                                                    type="button"
                                                    onClick={() => { setSelectedDonor(g); setDonorSearch(''); }}
                                                    className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                                                >
                                                    {g.guest_name}
                                                </button>
                                            ))}
                                        {donorGuests.filter(g => g.guest_name.toLowerCase().includes(donorSearch.toLowerCase())).length === 0 && (
                                            <p className="px-3 py-2 text-sm text-gray-400">No matching guest</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                        <label className="block text-sm font-medium text-gray-700 mb-1">From what event?</label>
                        <select
                            value={donationEvent}
                            onChange={e => setDonationEvent(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
                        >
                            <option>Bridal Shower</option>
                            <option>Engagement Party</option>
                            <option>Wedding Day</option>
                            <option>Other</option>
                        </select>
                        {donationEvent === 'Other' && (
                            <input
                                type="text"
                                value={otherEvent}
                                onChange={e => setOtherEvent(e.target.value)}
                                placeholder="Name the event"
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
                            />
                        )}
```

Also update the modal-close handlers so cancelling clears the new fields. Replace the backdrop `onClick` (line 863) and the Cancel button `onClick` (line 881) `() => setContributingItem(null)` with:

```tsx
() => { setContributingItem(null); setDonorSearch(''); setSelectedDonor(null); setDonationEvent('Wedding Day'); setOtherEvent(''); }
```

- [ ] **Step 4: Add "View donations" button in the Registry header**

In the header actions `div` (lines 285-288, which contains the `message` span and "View page →" link), add before the "View page →" anchor:

```tsx
                    <a href="/admin/rsvps?tab=donations" className="text-sm text-accent hover:text-accent-dark underline">View donations →</a>
```

- [ ] **Step 5: Lint and build**

Run: `npm run lint && npm run build`
Expected: no errors; build completes.

- [ ] **Step 6: Functional check**

Start the app (`npm run dev` or the running container), open `/admin/registry`, click a fund item's "Log a Gift", confirm: the amount field still works; a guest search box filters the guest list and lets you pick a guest (chip appears with an ✕ to clear); the event dropdown shows the four options and "Other" reveals a text box. Save with a guest selected → the fund's progress still increments AND a row appears via `curl -s http://localhost:3000/api/admin/donations`.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/registry/page.tsx
git commit -m "feat: registry gift modal records donor + event; view-donations link"
```

---

### Task 3: RSVPs page — guest total column + Donations tab

**Files:**
- Modify: `src/app/admin/rsvps/page.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/donations` (Task 1) → `Donation[]`; existing `?tab=` URL param.
- Produces: per-guest `Donated: $X` in the guest list; a Donations tab table.

- [ ] **Step 1: Add the Donation type and donations state**

In `src/app/admin/rsvps/page.tsx`, widen the tab type (line 48) and add a Donation interface near the other interfaces (after the `Guest` interface, ~line 46):

```typescript
type Tab = 'rsvps' | 'guestlist' | 'donations';

interface Donation {
    id: number;
    guest_id: number | null;
    guest_name: string;
    amount: number;
    fund_item_id: string | null;
    fund_item_title: string | null;
    event: string | null;
    created_at: string;
}
```

Add donations state next to the other `useState` hooks (~line 62):

```typescript
    const [donations, setDonations] = useState<Donation[]>([]);
```

- [ ] **Step 2: Fetch donations and honor the `?tab=` param on mount**

Replace the mount `useEffect` (lines 82-86) with:

```typescript
    useEffect(() => {
        fetchRsvps();
        fetchGuests();
        fetchConfig();
        fetchDonations();
        const params = new URLSearchParams(window.location.search);
        const tab = params.get('tab');
        if (tab === 'donations' || tab === 'guestlist' || tab === 'rsvps') {
            setActiveTab(tab as Tab);
        }
    }, []);
```

Add the fetch function next to `fetchGuests` (~line 122):

```typescript
    const fetchDonations = async () => {
        try {
            const response = await fetch('/api/admin/donations');
            const data = await response.json();
            setDonations(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Error fetching donations:', error);
        }
    };
```

- [ ] **Step 3: Add a per-guest donation total helper**

Add this helper inside the component, after `filteredGuests` is defined (~line 436, before the `return`):

```typescript
    const donationTotalByGuestId = donations.reduce<Record<number, number>>((acc, d) => {
        if (d.guest_id != null) acc[d.guest_id] = (acc[d.guest_id] || 0) + d.amount;
        return acc;
    }, {});
```

- [ ] **Step 4: Add a Donated column to the guest list table**

In the guest list `<thead>` (lines 772-779), add a header after the "Address" `<th>` (line 777):

```tsx
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Donated</th>
```

In the guest row body, add a matching cell. Locate the Address `<td>` in the row (the cell rendering `guest.address`) and add immediately after it:

```tsx
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                                {donationTotalByGuestId[guest.id] ? `$${donationTotalByGuestId[guest.id].toLocaleString()}` : '-'}
                                            </td>
```

(If the exact Address `<td>` is hard to locate, add the new `<td>` immediately before the Actions `<td>` so column count matches the 8 headers → now 9.)

- [ ] **Step 5: Add the Donations tab button**

After the "Guest List" tab button (closing `</button>` at line 504), add:

```tsx
                    <button
                        onClick={() => setActiveTab('donations')}
                        className={`px-4 py-2 rounded-xl font-medium transition-all duration-300 shadow-md ${
                            activeTab === 'donations'
                                ? 'bg-accent text-white shadow-lg'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 hover:shadow-lg'
                        }`}
                    >
                        Donations
                    </button>
```

- [ ] **Step 6: Render the Donations tab panel**

Add this block after the guest list tab's closing (find where `{activeTab === 'guestlist' && ( ... )}` ends, ~line 631 opens it; place this after that block closes, before the modals region):

```tsx
            {activeTab === 'donations' && (
                <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                        <p className="text-sm text-gray-500">{donations.length} donation{donations.length === 1 ? '' : 's'} · Total ${donations.reduce((s, d) => s + d.amount, 0).toLocaleString()}</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Guest</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fund</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {donations.length === 0 ? (
                                    <tr><td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-400">No donations recorded yet.</td></tr>
                                ) : donations.map(d => (
                                    <tr key={d.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{d.guest_name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${d.amount.toLocaleString()}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{d.fund_item_title || '-'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{d.event || '-'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(d.created_at).toLocaleDateString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
```

- [ ] **Step 7: Lint and build**

Run: `npm run lint && npm run build`
Expected: no errors; build completes.

- [ ] **Step 8: Functional check**

Open `/admin/rsvps`: the guest list shows a "Donated" column with `$X` for guests who donated (from Task 2) and `-` otherwise. Click the new "Donations" tab → the table lists each donation (guest, amount, fund, event, date) newest-first with a total. Open `/admin/registry` and click "View donations →" → lands on `/admin/rsvps` with the Donations tab already active.

- [ ] **Step 9: Commit**

```bash
git add src/app/admin/rsvps/page.tsx
git commit -m "feat: guest-list donation totals + Donations tab on RSVPs page"
```

---

## Post-Implementation

After all three tasks pass, follow the project's "After Every Code Change" rule in `CLAUDE.md`: build and push the Docker image so it can be pulled in Portainer:

```bash
docker build -t ghcr.io/soccerbeats/weddingwebsite:latest --target production .
docker push ghcr.io/soccerbeats/weddingwebsite:latest
```

(If Austin later says "document everything," also update README.md, CHANGELOG.md, and the vault per the CLAUDE.md convention.)

## Self-Review Notes

- **Spec coverage:** donations table (Task 1) ✓; guest search + event with Other→custom (Task 2) ✓; funded stays additive in site.json (Task 2 keeps existing bump) ✓; single Donated total per guest row (Task 3 Step 4) ✓; Donations tab table with guest/amount/fund/event/date (Task 3 Step 6) ✓; Registry deep-link button (Task 2 Step 4 + Task 3 Step 2 `?tab=`) ✓; edit/delete out of scope ✓ (no such endpoints/UI).
- **Type consistency:** `Donation` shape matches the API `RETURNING` columns in Task 1 and the consumer in Task 3; `amount` is `float8`/number in both. `donorGuests` items are `{ id, guest_name }` in Task 2 throughout.
- **Placeholder scan:** no TBD/TODO; all code shown inline.
