# Finance Suite — Design

**Date:** 2026-08-03
**Status:** Approved (Austin delegated remaining decisions: "do what you would recommend from here on out, then build it")

## Goal

Replace the `Heav & Aust Wedding Spreadsheet — Budget` tab with an admin suite at `/admin/finances` that tracks the wedding budget, purchases, and funding contributions, and rolls all three into reporting. Everything must be easily editable inline.

## Source of truth analysed

The existing spreadsheet contains seven distinct blocks, all reproduced here:

| Block | Cells | Contents |
|---|---|---|
| Budget | `B:G` | Line items in 3 sections, `Cost × Qty = Total`, % of grand total. **$33,046.26** |
| Headcount | `I5:J7` | 124 adults / 11 minors / 135 total — drives Dinner, Dinner Kids, Bar quantities |
| Contributions | `I14:M19` | Name, pledged, received, %, note. $17,200 pledged / $6,200 received |
| Purchases | `R:U` | Two payer columns: Austin $5,756 (5 items), Heaven $10,894 (9 items) |
| Receipt log | `W:Y` | Rob $5,000→Venue, Kim $1,200→Dress, Kim $680→Veil = $6,880 |
| Derived | `P18:P20`, `I32:K34` | Payment plan; remaining-after-paid per person |
| Appetizer calc | `AA:AD` | 135 × 5 ÷ 3 = 225 each; itemised to $1,700 → feeds the Appetizers line |

### Two problems the spreadsheet has

1. **Drift.** The receipt log totals $6,880 but the contributions block says $6,200 received — Kim's $680 Veil receipt was never rolled up. Fix: receipts are the only place money-in is entered; every total is *derived*.
2. **Formatting as data.** "Bold means its been payed" encodes the paid flag as bold text, which CSV export discards. Fix: `is_paid` becomes a real boolean column.

Verified reproduction of the sheet's math (all figures tie exactly):
```
deficit_pledged  = 33,046.26 − 17,200 = 15,846.26
deficit_cash     = 33,046.26 −  6,200 = 26,846.26
share (50/50)    = 7,923.13 / 13,423.13
Austin remaining = 7,923.13 −  5,756 =  2,167.13
Heaven remaining = 7,923.13 − 10,894 = −2,970.87   (ahead of her share)
```

## Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Editable payer list**, not hard-coded Austin/Heaven | Sheet already leaks third payers: "Decor (from Amy)", "AirBnb (others will contribute)" |
| 2 | **Adjustable split, 50/50 default** | Austin's choice |
| 3 | **Manual headcount with a live suggestion** from `guest_list` | A $33k total that silently re-totals when a cousin declines is worse than one updated deliberately. No adult/minor marker exists on guests, so full automation isn't possible anyway |
| 4 | **Purchases link to a budget line** (nullable) | Enables budget-vs-actual per line; surfaces drift like Suit $300 / "Austin Suit" $300 both hitting one $300 Tux line |
| 5 | **Generic sub-items** on any budget line | Appetizer calculator becomes one instance of a general feature; Decor and Floral obviously want it too |
| 6 | **Postgres**, `ensureTable()` + `ADD COLUMN IF NOT EXISTS` | Transactional money data; matches `rsvps` / `guest_list` / `donations`. JSON config files hold page copy and colours, not ledgers |
| 7 | **Keep `donations` separate** | Guest wedding/shower gifts (guest-linked, registry fund items, thank-you tracking) are a different concept from money funding the budget. Two tables, no merge |
| 8 | **Payment plan derived from `weddingDate`** | Sheet hard-codes "12 Months"; deriving from the real date (2026-10-16) is self-updating. Horizon overridable |
| 9 | **Seed Austin's real data** on first init, only when tables are empty | 30 budget lines + 14 purchases + 4 contributors is too much retyping. Paid flags omitted — CSV lost the bold |

## Data model

```
finance_settings    singleton: adult_count, minor_count, plan_horizon_months (null → derive),
                    paycheck_interval_days (14)
finance_categories  name, sort_order
finance_items       category_id, name, unit_cost, quantity,
                    qty_source ('manual'|'adults'|'minors'|'total'),
                    use_subitems, is_paid, notes, sort_order
finance_subitems    item_id, name, unit_cost, quantity, sort_order
finance_payers      name, share_pct, sort_order
finance_purchases   payer_id, item_id (nullable), description, amount, purchased_on, notes
finance_contributors name, pledged, notes, sort_order
finance_receipts    contributor_id, amount, received_on, item_id (nullable earmark), note
```

**Derived, never stored:** item totals, category totals, grand total, % of budget, pledged/received sums, deficits, per-payer share and remaining, payment plan.

An item's total is `sum(subitems)` when `use_subitems`, else `unit_cost × effective_quantity`, where `effective_quantity` resolves `qty_source` against the headcount settings.

For the optimistic scenario, a contributor's expected amount is `max(pledged, received)` so over-delivery (Kim: $1,200 pledged, $1,880 given) isn't lost.

A payer with `share_pct = 0` (e.g. Amy) owes nothing, so their spend shows as a credit — the unified model handles non-responsible purchasers without a special case.

## Components

- `src/lib/finance.ts` — pure calculation engine. All reporting math lives here so every surface agrees and it's testable independently of HTTP or React.
- `src/app/api/admin/finances/{budget,purchases,contributions,settings,summary}/route.ts` — CRUD per resource; `summary` returns the computed report.
- `src/app/admin/finances/page.tsx` — tabbed suite: **Overview** (reporting), **Budget**, **Purchases**, **Contributions**, **Settings**.

Auth needs no work: `middleware.ts` already protects `/admin/:path*`. Admin-only — no public page.

## Reporting (Overview tab)

Budget total · spent to date · pledged vs received · deficit under both scenarios · per-payer share and remaining · payment plan (per month / per paycheck / per day to the wedding date) · % breakdown by category · budget-vs-actual per line with over/under flags.

## Out of scope

Public-facing finance page; multi-currency; receipt image uploads; recurring/scheduled payments; merging with `donations`.
