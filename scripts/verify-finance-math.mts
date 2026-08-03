/**
 * Verifies the finance engine reproduces the original spreadsheet's figures
 * exactly. Run: npx tsx scripts/verify-finance-math.mts
 */
import {
    buildSummary, budgetTotal, itemTotal, DEFAULT_SETTINGS,
    type Category, type BudgetItem, type Contributor, type Payer, type Purchase, type FinanceSettings,
} from '../src/lib/finance';
import {
    SEED_CATEGORIES, SEED_SETTINGS, SEED_PAYERS, SEED_PURCHASES, SEED_CONTRIBUTORS,
} from '../src/lib/financeSeed';

let itemId = 0;
const nameToId = new Map<string, number>();

const categories: Category[] = SEED_CATEGORIES.map((cat, ci) => ({
    id: ci + 1,
    name: cat.name,
    sort_order: ci,
    items: cat.items.map((it, ii): BudgetItem => {
        const id = ++itemId;
        nameToId.set(it.name, id);
        return {
            id,
            category_id: ci + 1,
            name: it.name,
            unit_cost: it.unit_cost,
            quantity: it.quantity,
            qty_source: it.qty_source,
            use_subitems: !!it.subitems,
            is_paid: false,
            notes: null,
            sort_order: ii,
            subitems: (it.subitems ?? []).map((s, si) => ({
                id: si + 1, item_id: id, name: s.name,
                unit_cost: s.unit_cost, quantity: s.quantity, sort_order: si,
            })),
        };
    }),
}));

const settings: FinanceSettings = { ...DEFAULT_SETTINGS, ...SEED_SETTINGS };
const payers: Payer[] = SEED_PAYERS.map((p, i) => ({ id: i + 1, name: p.name, share_pct: p.share_pct, sort_order: i }));
const payerId = new Map(payers.map(p => [p.name, p.id]));

const purchases: Purchase[] = SEED_PURCHASES.map((p, i) => ({
    id: i + 1,
    payer_id: payerId.get(p.payer) ?? null,
    item_id: p.item ? nameToId.get(p.item) ?? null : null,
    description: p.description,
    amount: p.amount,
    purchased_on: null,
    notes: null,
}));

let receiptId = 0;
const contributors: Contributor[] = SEED_CONTRIBUTORS.map((c, i) => ({
    id: i + 1, name: c.name, pledged: c.pledged, notes: null, sort_order: i,
    receipts: c.receipts.map(r => ({
        id: ++receiptId, contributor_id: i + 1, amount: r.amount,
        received_on: null, item_id: r.item ? nameToId.get(r.item) ?? null : null, note: r.note,
    })),
}));

let failures = 0;
function check(label: string, actual: number, expected: number) {
    const ok = Math.abs(actual - expected) < 0.005;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(42)} got ${actual}  want ${expected}`);
}

console.log('\n--- Budget (vs spreadsheet) ---');
check('grand total', budgetTotal(categories, settings), 33046.26);
const appetizers = categories[0].items.find(i => i.name === 'Appetizers')!;
check('appetizers from sub-items', itemTotal(appetizers, settings), 1700);
const dinner = categories[0].items.find(i => i.name === 'Dinner')!;
check('dinner (35 x 124 adults)', itemTotal(dinner, settings), 4340);
const kids = categories[0].items.find(i => i.name === 'Dinner Kids')!;
check('dinner kids (12 x 11 minors)', itemTotal(kids, settings), 132);
const bar = categories[0].items.find(i => i.name === 'Bar')!;
check('bar (37 x 124 adults)', itemTotal(bar, settings), 4588);

console.log('\n--- Purchases (vs spreadsheet column totals) ---');
const s = buildSummary({ categories, payers, purchases, contributors, settings, weddingDate: 'October 16, 2026', now: new Date('2026-08-03') });
check('Austin spent', s.payers[0].spent, 5756);
check('Heaven spent', s.payers[1].spent, 10894);
check('total spent', s.spentTotal, 16650);

console.log('\n--- Sheet parity: original (uncorrected) receipts ---');
// The sheet's own contributions block claimed $6,200 received; reproduce its
// exact arithmetic by dropping the $680 receipt it failed to roll up.
const sheetContributors = contributors.map(c => ({
    ...c, receipts: c.receipts.filter(r => r.note !== 'Veil'),
}));
const sheet = buildSummary({ categories, payers, purchases, contributors: sheetContributors, settings, weddingDate: 'October 16, 2026', now: new Date('2026-08-03') });
check('pledged total', sheet.pledgedTotal, 17200);
check('received total', sheet.receivedTotal, 6200);
check('deficit if pledges land', sheet.deficitPledged, 15846.26);
check('deficit cash in hand', sheet.deficitCash, 26846.26);
check('Austin share (pledged)', sheet.payers[0].sharePledged, 7923.13);
check('Heaven share (pledged)', sheet.payers[1].sharePledged, 7923.13);
check('Austin share (cash)', sheet.payers[0].shareCash, 13423.13);
check('Austin remaining (pledged)', sheet.payers[0].remainingPledged, 2167.13);
check('Heaven remaining (pledged)', sheet.payers[1].remainingPledged, -2970.87);
check('Austin remaining (cash)', sheet.payers[0].remainingCash, 7667.13);
check('Heaven remaining (cash)', sheet.payers[1].remainingCash, 2529.13);

console.log('\n--- Drift correction ---');
check('corrected received (incl. Kim veil)', s.receivedTotal, 6880);
check('corrected pledged (Kim over-delivered)', s.pledgedTotal, 17880);

console.log('\n--- Budget vs actual ---');
const venue = s.items.find(i => i.name === 'Venue')!;
check('venue budgeted', venue.total, 4500);
check('venue spent (2 payments)', venue.spent, 9680);
check('venue overrun', venue.variance, 5180);
check('venue earmarked (Rob)', venue.earmarked, 5000);
const tux = s.items.find(i => i.name === 'Tux')!;
check('tux double-paid overrun', tux.variance, 300);
check('unlinked spend (AirBnb)', s.unlinkedSpend, 1957);
check('venue % of budget', venue.pct, 13.62);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
