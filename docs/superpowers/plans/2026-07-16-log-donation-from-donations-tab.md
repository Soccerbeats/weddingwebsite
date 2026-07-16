# Log Donation from Donations Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a "+ Log Donation" button + modal to the RSVPs → Donations tab that records a donation and advances the chosen Registry fund's progress, mirroring the Registry "Log a Gift" flow.

**Architecture:** All changes in `src/app/admin/rsvps/page.tsx`. Reuses the existing `POST /api/admin/donations` (donation row) and `/api/admin/site-config` (fund `funded` bump) endpoints — no new routes, no DB changes. Funds come from `config.registry.items`, already loaded by `fetchConfig()`.

**Tech Stack:** Next.js 16 App Router, TypeScript, React 19, Tailwind.

## Global Constraints

- Docker image name is always `ghcr.io/soccerbeats/weddingwebsite:latest`.
- No unit-test framework. Verification cycle: `npm run build` succeeds and no NEW lint errors in the touched file (repo has ~90 PRE-EXISTING unrelated lint errors — ignore those).
- The donation POST body must be exactly `{ guest_id, guest_name, amount, fund_item_id, fund_item_title, event }`.
- The `funded` bump must cap at the fund's price: `Math.min(price, funded + amount)` — identical to the Registry flow (`src/app/admin/registry/page.tsx` `logContribution`).
- Persist the fund bump by fetching fresh config (`GET /api/admin/site-config`), mutating only `config.registry.items`, and POSTing the whole config back — exactly like the Registry `save()` (lines ~213-233) so no other config fields are clobbered.
- Commit at the end with a `feat:` message ending in:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: "+ Log Donation" button + modal on the Donations tab

**Files:**
- Modify: `src/app/admin/rsvps/page.tsx`

**Interfaces:**
- Consumes: `config.registry.items` (`FundItem[] = { id: string; title: string; price: number; funded: number }`), `GET/POST /api/admin/site-config`, `POST /api/admin/donations`, existing `fetchDonations()` and `fetchConfig()`.
- Produces: a donation row + advanced fund progress, both visible after refresh.

- [ ] **Step 1: Add modal state**

Add these hooks near the other `useState` declarations (the `donations` state is at line ~68; add after it):

```typescript
    const [showDonationModal, setShowDonationModal] = useState(false);
    const [donationDonorSearch, setDonationDonorSearch] = useState('');
    const [donationDonor, setDonationDonor] = useState<{ id: number; guest_name: string } | null>(null);
    const [donationAmount, setDonationAmount] = useState('');
    const [donationFundId, setDonationFundId] = useState('');
    const [donationEvent, setDonationEvent] = useState('Wedding Day');
    const [donationOtherEvent, setDonationOtherEvent] = useState('');
    const [savingDonation, setSavingDonation] = useState(false);
```

- [ ] **Step 2: Add a reset helper and the save handler**

Add these functions next to `fetchDonations` (around line 150). `FundItem` is imported below (Step 3).

```typescript
    const resetDonationModal = () => {
        setShowDonationModal(false);
        setDonationDonorSearch('');
        setDonationDonor(null);
        setDonationAmount('');
        setDonationFundId('');
        setDonationEvent('Wedding Day');
        setDonationOtherEvent('');
    };

    const saveDonation = async () => {
        const amount = parseFloat(donationAmount);
        if (!donationDonor || !amount || isNaN(amount) || !donationFundId) return;
        const funds: FundItem[] = config?.registry?.items || [];
        const fund = funds.find(f => f.id === donationFundId);
        if (!fund) return;
        const eventValue = donationEvent === 'Other' ? (donationOtherEvent.trim() || 'Other') : donationEvent;
        setSavingDonation(true);
        try {
            // 1. Advance fund progress against fresh config (mirrors Registry save())
            const configRes = await fetch('/api/admin/site-config');
            const freshConfig = await configRes.json();
            const items: FundItem[] = (freshConfig.registry?.items || []).map((i: FundItem) =>
                i.id === donationFundId ? { ...i, funded: Math.min(i.price, i.funded + amount) } : i
            );
            freshConfig.registry = { ...(freshConfig.registry || {}), items };
            await fetch('/api/admin/site-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(freshConfig),
            });
            // 2. Record the donation row
            await fetch('/api/admin/donations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    guest_id: donationDonor.id,
                    guest_name: donationDonor.guest_name,
                    amount,
                    fund_item_id: fund.id,
                    fund_item_title: fund.title,
                    event: eventValue,
                }),
            });
            // 3. Refresh UI
            await fetchDonations();
            await fetchConfig();
            resetDonationModal();
        } catch (e) {
            console.error('Failed to save donation:', e);
        } finally {
            setSavingDonation(false);
        }
    };
```

- [ ] **Step 3: Import the `FundItem` type**

At the top of the file, add the import (the type lives in `src/lib/config.ts`, exported as `FundItem`, and is already imported this way in the registry admin page):

```typescript
import type { FundItem } from '@/lib/config';
```

Place it with the other imports. If a `@/lib/config` import already exists, add `FundItem` to it instead of duplicating.

- [ ] **Step 4: Add the "+ Log Donation" button to the Donations tab header**

In the Donations tab panel header (the `<div className="px-6 py-4 border-b ...">` at line ~960 that currently holds only the count/total `<p>`), add the button after the `<p>`:

```tsx
                        <button
                            onClick={() => setShowDonationModal(true)}
                            className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
                        >
                            + Log Donation
                        </button>
```

(The parent `<div>` already has `flex items-center justify-between`, so the button lands on the right.)

- [ ] **Step 5: Render the donation modal**

Immediately after the Donations tab panel's closing `)}` (line ~990, before the `{/* Delete RSVP Modal */}` comment), add:

```tsx
            {/* Log Donation Modal */}
            {showDonationModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40" onClick={resetDonationModal} />
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10">
                        <h2 className="text-lg font-bold text-gray-900 mb-4">Log a Donation</h2>

                        <label className="block text-sm font-medium text-gray-700 mb-1">Who donated?</label>
                        {donationDonor ? (
                            <div className="flex items-center justify-between border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4">
                                <span>{donationDonor.guest_name}</span>
                                <button type="button" onClick={() => { setDonationDonor(null); setDonationDonorSearch(''); }} className="text-gray-400 hover:text-gray-600">✕</button>
                            </div>
                        ) : (
                            <div className="mb-4">
                                <input
                                    type="text"
                                    value={donationDonorSearch}
                                    onChange={e => setDonationDonorSearch(e.target.value)}
                                    placeholder="Search guest list..."
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                />
                                {donationDonorSearch.trim() && (
                                    <div className="mt-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
                                        {guests
                                            .filter(g => g.guest_name.toLowerCase().includes(donationDonorSearch.toLowerCase()))
                                            .slice(0, 8)
                                            .map(g => (
                                                <button
                                                    key={g.id}
                                                    type="button"
                                                    onClick={() => { setDonationDonor({ id: g.id, guest_name: g.guest_name }); setDonationDonorSearch(''); }}
                                                    className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                                                >
                                                    {g.guest_name}
                                                </button>
                                            ))}
                                        {guests.filter(g => g.guest_name.toLowerCase().includes(donationDonorSearch.toLowerCase())).length === 0 && (
                                            <p className="px-3 py-2 text-sm text-gray-400">No matching guest</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        <label className="block text-sm font-medium text-gray-700 mb-1">Amount received ($)</label>
                        <input
                            type="number"
                            value={donationAmount}
                            onChange={e => setDonationAmount(e.target.value)}
                            placeholder="0"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
                        />

                        <label className="block text-sm font-medium text-gray-700 mb-1">Fund</label>
                        <select
                            value={donationFundId}
                            onChange={e => setDonationFundId(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
                        >
                            <option value="">Select a fund...</option>
                            {(config?.registry?.items || []).map((f: FundItem) => (
                                <option key={f.id} value={f.id}>{f.title}</option>
                            ))}
                        </select>

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
                                value={donationOtherEvent}
                                onChange={e => setDonationOtherEvent(e.target.value)}
                                placeholder="Name the event"
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
                            />
                        )}

                        <div className="flex gap-2 mt-2">
                            <button
                                onClick={saveDonation}
                                disabled={savingDonation || !donationDonor || !donationAmount || !donationFundId}
                                className="flex-1 bg-accent text-white py-2 rounded-lg text-sm font-medium disabled:opacity-40"
                            >
                                {savingDonation ? 'Saving...' : 'Save'}
                            </button>
                            <button onClick={resetDonationModal} className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
```

- [ ] **Step 6: Build and lint-check**

Run: `npm run build`
Expected: build succeeds, `/admin/rsvps` compiles. Confirm no NEW lint errors in `src/app/admin/rsvps/page.tsx` (compare against the file's pre-existing errors — the two `any` errors and unused-var warning already there don't count; note the `config` state is typed `any`, so `config?.registry?.items` needs no extra typing).

- [ ] **Step 7: Functional check (if a running instance with data is available)**

Open `/admin/rsvps` → Donations tab → "+ Log Donation". Confirm: guest search filters and selects; the fund dropdown lists Registry funds; Event "Other" reveals a text box; Save is disabled until guest + amount + fund are set. Save → a new row appears in the Donations table, the guest's Donated total rises, and on the Registry page that fund's progress advanced by the amount. (If no running instance/DB is available, note this is deferred to post-deploy verification.)

- [ ] **Step 8: Commit**

```bash
git add src/app/admin/rsvps/page.tsx
git commit -m "feat: log a donation directly from the RSVPs Donations tab"
```

---

## Post-Implementation

Per `CLAUDE.md` "After Every Code Change", the Docker image should be built and
pushed — but `deploy.md` says not to push without an explicit deploy request, so
confirm with the user before pushing image/GitHub.

## Self-Review Notes

- **Spec coverage:** button + modal (Steps 4-5) ✓; guest search (Step 5) ✓;
  required fund dropdown from config (Step 5, save guard Step 2) ✓; event
  Other→custom (Steps 2, 5) ✓; fund `funded` bump capped at price via fresh
  config POST (Step 2) ✓; donation row POST with exact body (Step 2) ✓; UI
  refresh (Step 2) ✓; save disabled until guest+amount+fund (Step 5) ✓; empty
  funds → empty dropdown, save disabled (Step 5 maps nothing, guard blocks) ✓.
- **Type consistency:** `FundItem` imported once (Step 3); donor object shape
  `{ id: number; guest_name: string }` consistent between state, selection, and
  POST; `config` is `any` so `.registry?.items` access is safe.
- **Placeholder scan:** none — all code inline.
