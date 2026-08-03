/**
 * Invariant audit for the finance engine.
 *
 * Asserts the identities that must hold no matter what data is loaded — if the
 * per-section figures don't add up to the headline figures, one of them is lying
 * to the user. Run: npx tsx scripts/audit-finance-logic.mts
 */
import {
    buildSummary, budgetTotal, DEFAULT_SETTINGS,
    type Category, type BudgetItem, type Contributor, type Payer, type Purchase, type FinanceSettings,
} from '../src/lib/finance';
import { SEED_CATEGORIES, SEED_SETTINGS, SEED_PAYERS, SEED_PURCHASES, SEED_CONTRIBUTORS } from '../src/lib/financeSeed';

let problems = 0;
function invariant(label: string, a: number, b: number, note = '') {
    const ok = Math.abs(a - b) < 0.005;
    if (!ok) problems++;
    console.log(`${ok ? '  ok  ' : ' BREAK'} ${label.padEnd(52)} ${a} vs ${b}${note ? `   (${note})` : ''}`);
}
function note(label: string, detail: string) {
    console.log(`  ??   ${label.padEnd(52)} ${detail}`);
}

// ---- build the seeded world ----
let itemId = 0;
const nameToId = new Map<string, number>();
const catId = new Map(SEED_CATEGORIES.map((c, i) => [c.name, i + 1]));
const categories: Category[] = SEED_CATEGORIES.map((cat, ci) => ({
    id: ci + 1, name: cat.name, sort_order: ci,
    items: cat.items.map((it, ii): BudgetItem => {
        const id = ++itemId;
        nameToId.set(it.name, id);
        return {
            id, category_id: ci + 1, name: it.name, unit_cost: it.unit_cost, quantity: it.quantity,
            qty_source: it.qty_source, use_subitems: !!it.subitems, is_paid: false, notes: null,
            sort_order: ii,
            subitems: (it.subitems ?? []).map((sb, si) => ({
                id: si + 1, item_id: id, name: sb.name,
                unit_cost: sb.unit_cost, quantity: sb.quantity, sort_order: si,
            })),
        };
    }),
}));
const settings: FinanceSettings = { ...DEFAULT_SETTINGS, ...SEED_SETTINGS };
const payers: Payer[] = SEED_PAYERS.map((p, i) => ({ id: i + 1, name: p.name, share_pct: p.share_pct, sort_order: i }));
const payerId = new Map(payers.map((p) => [p.name, p.id]));
const purchases: Purchase[] = SEED_PURCHASES.map((p, i) => ({
    id: i + 1, payer_id: payerId.get(p.payer) ?? null,
    item_id: p.item ? nameToId.get(p.item) ?? null : null,
    category_id: p.section ? catId.get(p.section) ?? null : null,
    description: p.description, amount: p.amount, purchased_on: null, notes: null,
}));
let rid = 0;
const contributors: Contributor[] = SEED_CONTRIBUTORS.map((c, i) => ({
    id: i + 1, name: c.name, pledged: c.pledged, notes: null, sort_order: i,
    receipts: c.receipts.map((r) => ({
        id: ++rid, contributor_id: i + 1, amount: r.amount, received_on: null,
        item_id: r.item ? nameToId.get(r.item) ?? null : null,
        category_id: r.section ? catId.get(r.section) ?? null : null,
        note: r.note,
    })),
}));

const base = { categories, payers, purchases, contributors, settings, weddingDate: 'October 16, 2026', now: new Date('2026-08-03') };
const s = buildSummary(base);

console.log('\n=== 1. Budget composition ===');
invariant('sum(section totals) == budgetTotal',
    s.categories.reduce((a, c) => a + c.total, 0), s.budgetTotal);
invariant('sum(item totals) == budgetTotal',
    s.items.reduce((a, i) => a + i.total, 0), s.budgetTotal);
invariant('sum(section pct) == 100', s.categories.reduce((a, c) => a + c.pct, 0), 100);

console.log('\n=== 2. Payment composition ===');
invariant('budgetedOutOfPocket + giftApplied == paidTotal',
    s.budgetedOutOfPocket + s.giftAppliedTotal, s.paidTotal);
invariant('outOfPocket + giftApplied == cashOutTotal',
    s.outOfPocketTotal + s.giftAppliedTotal, s.cashOutTotal);
invariant('giftApplied + giftUnapplied == received',
    s.giftAppliedTotal + s.giftUnapplied, s.receivedTotal);
invariant('sum(payer spent) == outOfPocketTotal',
    s.payers.reduce((a, p) => a + p.spent, 0), s.outOfPocketTotal);
invariant('sum(section paid) == paidTotal',
    s.categories.reduce((a, c) => a + c.paid, 0), s.paidTotal);
invariant('sum(section ownSpent) == budgetedOutOfPocket',
    s.categories.reduce((a, c) => a + c.ownSpent, 0), s.budgetedOutOfPocket);
invariant('budgetedOutOfPocket + untracked == outOfPocket',
    s.budgetedOutOfPocket + s.unlinkedSpend, s.outOfPocketTotal);
invariant('sum(payer spentOnBudget) == budgetedOutOfPocket',
    s.payers.reduce((a, p) => a + p.spentOnBudget, 0), s.budgetedOutOfPocket);
invariant('sum(section giftApplied) == giftAppliedTotal',
    s.categories.reduce((a, c) => a + c.giftApplied, 0), s.giftAppliedTotal);

console.log('\n=== 3. Remaining figures reconcile ===');
invariant('sum(section remaining) == billRemaining',
    s.categories.reduce((a, c) => a + c.remaining, 0), s.billRemaining,
    'THE headline number vs its own parts');
invariant('budgetTotal - paidTotal == billRemaining',
    s.budgetTotal - s.paidTotal, s.billRemaining);
invariant('deficitCash - budgetedOutOfPocket == stillToSpendCash',
    s.deficitCash - s.budgetedOutOfPocket, s.stillToSpendCash);
invariant('sum(payer shareCash) == deficitCash',
    s.payers.reduce((a, p) => a + p.shareCash, 0), s.deficitCash);
invariant('sum(payer remainingCash) == stillToSpendCash',
    s.payers.reduce((a, p) => a + p.remainingCash, 0), s.stillToSpendCash);

console.log('\n=== 4. Where untracked spend leaks ===');
note('unlinkedSpend', `${s.unlinkedSpend}`);
note('sum(section remaining) - billRemaining', `${(s.categories.reduce((a, c) => a + c.remaining, 0) - s.billRemaining).toFixed(2)}`);
note('does untracked reduce billRemaining?', `budget ${s.budgetTotal} - paid ${s.paidTotal} = ${s.billRemaining}`);
note('does untracked reduce what the couple owes?', `stillToSpendCash ${s.stillToSpendCash}`);

console.log('\n=== 5. Zero-share payer semantics ===');
const withAmy = buildSummary({
    ...base,
    payers: [...payers, { id: 99, name: 'Amy', share_pct: 0, sort_order: 9 }],
    purchases: [...purchases, {
        id: 999, payer_id: 99, item_id: nameToId.get('Decor')!, category_id: null,
        description: 'Amy decor', amount: 250, purchased_on: null, notes: null,
    }],
});
const amy = withAmy.payers.find((p) => p.name === 'Amy')!;
note('Amy share / spent / remaining', `${amy.shareCash} / ${amy.spent} / ${amy.remainingCash}`);
note('Amy isContributorOnly', `${amy.isContributorOnly}`);
note("Amy's spend reduces couple's stillToSpend?",
    `${s.stillToSpendCash} -> ${withAmy.stillToSpendCash}`);

console.log('\n=== 6. Degenerate inputs ===');
const allZeroShares = buildSummary({ ...base, payers: payers.map((p) => ({ ...p, share_pct: 0 })) });
note('all shares 0: unallocatedDeficitCash', `${allZeroShares.unallocatedDeficitCash} (surfaced now)`);
const overFunded = buildSummary({
    ...base,
    contributors: [{ id: 1, name: 'Rich uncle', pledged: 60000, notes: null, sort_order: 0, receipts: [
        { id: 1, contributor_id: 1, amount: 60000, received_on: null, item_id: null, category_id: null, note: null },
    ] }],
});
note('over-funded: isOverFunded flag', `${overFunded.isOverFunded}, deficitCash ${overFunded.deficitCash}`);
note('over-funded: payer remainingCash', `${overFunded.payers.map((p) => p.remainingCash).join(' / ')}`);
note('over-funded: billRemaining', `${overFunded.billRemaining} (all 60k unearmarked, so nothing paid)`);
const noBudget = buildSummary({ ...base, categories: [] });
note('empty budget: paidPct/pct guards', `budgetTotal ${noBudget.budgetTotal}, deficitCash ${noBudget.deficitCash}`);

console.log('\n=== 7. is_paid vs actual payments ===');
const flagged = categories.map((c) => ({ ...c, items: c.items.map((i) => ({ ...i, is_paid: true })) }));
const allFlagged = buildSummary({ ...base, categories: flagged });
note('every line flagged paid', `paidItemCount ${allFlagged.paidItemCount}/${allFlagged.itemCount}, but paidTotal is still ${allFlagged.paidTotal} of ${allFlagged.budgetTotal}`);
const venueLine = s.items.find((i) => i.name === 'Venue')!;
note('Venue line: flagged?/paid', `is_paid=${venueLine.isPaid}, paid=${venueLine.paid}, budget=${venueLine.total}`);

console.log('\n=== 8. Subitem + qty_source interaction ===');
const appet = categories[0].items.find((i) => i.name === 'Appetizers')!;
const appetSourced: BudgetItem = { ...appet, qty_source: 'adults' };
const mixed = buildSummary({
    ...base,
    categories: [{ ...categories[0], items: categories[0].items.map((i) => i.id === appet.id ? appetSourced : i) }, ...categories.slice(1)],
});
note('subitem line with qty_source=adults',
    `${mixed.items.find((i) => i.name === 'Appetizers')!.total} (should ignore qty_source: 1700)`);

console.log(`\n${problems === 0 ? 'No broken invariants.' : `${problems} BROKEN INVARIANT(S)`}\n`);
