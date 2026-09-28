/**
 * Verifies the finance engine reproduces the original spreadsheet's figures
 * exactly. Run: npx tsx scripts/verify-finance-math.mts
 */
import {
    buildSummary, budgetTotal, effectiveQuantity, itemTotal, DEFAULT_SETTINGS,
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

const catId = new Map(SEED_CATEGORIES.map((c, i) => [c.name, i + 1]));

const purchases: Purchase[] = SEED_PURCHASES.map((p, i) => ({
    id: i + 1,
    payer_id: payerId.get(p.payer) ?? null,
    item_id: p.item ? nameToId.get(p.item) ?? null : null,
    category_id: p.section ? catId.get(p.section) ?? null : null,
    description: p.description,
    amount: p.amount,
    purchased_on: null,
    notes: null,
}));

let receiptId = 0;
const contributors: Contributor[] = SEED_CONTRIBUTORS.map((c, i) => ({
    id: i + 1, name: c.name, pledged: c.pledged, notes: null, sort_order: i,
    thank_you_sent: false, thank_you_sent_at: null,
    receipts: c.receipts.map(r => ({
        id: ++receiptId, contributor_id: i + 1, amount: r.amount, received_on: null,
        item_id: r.item ? nameToId.get(r.item) ?? null : null,
        category_id: r.section ? catId.get(r.section) ?? null : null,
        note: r.note,
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
check('out-of-pocket total (all cash)', s.outOfPocketTotal, 16650);

console.log('\n--- Sheet parity: reproduce the spreadsheet exactly ---');
// Two things must be undone to compare like with like:
//  1. the sheet's contributions block claimed $6,200 received, missing the $680
//     Veil receipt it never rolled up;
//  2. the sheet counted every dollar in Heaven's column against her share,
//     including the AirBnb, which has no budget line. Attribute it here so the
//     arithmetic is comparable — the divergence is asserted separately below.
const sheetContributors = contributors.map(c => ({
    ...c, receipts: c.receipts.filter(r => r.note !== 'Veil'),
}));
const sheetPurchases = purchases.map(p => p.description.startsWith('AirBnb')
    ? { ...p, item_id: nameToId.get('Rehearsal Dinner')! }
    : p);
const sheet = buildSummary({ categories, payers, purchases: sheetPurchases, contributors: sheetContributors, settings, weddingDate: 'October 16, 2026', now: new Date('2026-08-03') });
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

console.log('\n--- Deliberate divergences from the sheet ---');
check('corrected received (incl. Kim veil)', s.receivedTotal, 6880);
check('corrected pledged (Kim over-delivered)', s.pledgedTotal, 17880);
check('Heaven remaining, sheet method', sheet.payers[1].remainingCash, 2529.13);
check('Heaven remaining, corrected', s.payers[1].remainingCash, 4146.13);
// The gap between those two is a mix of both corrections, so isolate the AirBnb
// by re-attributing it against the corrected receipts and nothing else.
const airbnbAttributed = buildSummary({
    categories, payers, contributors, settings,
    purchases: purchases.map(p => p.description.startsWith('AirBnb')
        ? { ...p, item_id: nameToId.get('Rehearsal Dinner')! } : p),
    weddingDate: 'October 16, 2026', now: new Date('2026-08-03'),
});
check('AirBnb alone moves Heaven by its full amount',
    s.payers[1].remainingCash - airbnbAttributed.payers[1].remainingCash, 1957);
// And the Veil receipt accounts for the rest: it shrinks the deficit by $680,
// so each 50% share drops $340.
check('Veil receipt alone moves each share by half of it',
    sheet.payers[1].shareCash - s.payers[1].shareCash, 340);

console.log('\n--- Section-level (lump-sum) payments ---');
// The venue bill covers the whole section and is paid in installments, so the
// installments must land on the section, not on the single Venue line.
const venueSection = s.categories.find(c => c.name === 'Venue Cost')!;
check('section budgeted', venueSection.total, 18358.9);
check('own-pocket installments', venueSection.directSpent, 9680);
// Rob's $5,000 went to the venue, so the bill is that much further down.
check('gift money applied to section', venueSection.giftApplied, 5000);
check('section PAID includes gift money', venueSection.paid, 14680);
check('section own-pocket only', venueSection.ownSpent, 9680);
check('payment count includes the gift', venueSection.installmentCount, 3);
check('section still owed', venueSection.remaining, 3678.9);
check('section paid %', venueSection.paidPct, 79.96);

const venue = s.items.find(i => i.name === 'Venue')!;
check('venue LINE no longer overruns', venue.variance, -4500);
check('venue line spend is zero', venue.paid, 0);
check('venue % of budget', venue.pct, 13.62);

console.log('\n--- Gift money counts toward bills, not out-of-pocket ---');
check('out-of-pocket excludes gift money', s.outOfPocketTotal, 16650);
check('gift applied (Rob venue + Kim dress)', s.giftAppliedTotal, 6200);
check('gift held but unapplied (Kim veil)', s.giftUnapplied, 680);
check('all cash out', s.cashOutTotal, 22850);
check('Austin cash out', s.payers[0].spent, 5756);
check('Heaven cash out', s.payers[1].spent, 10894);

console.log('\n--- Spending outside the budget must not flatter the budget ---');
// The AirBnb has no budget line, so it can't discharge a budget obligation.
// Counting it made the headline "still owed" disagree with the sum of sections.
check('budgeted out-of-pocket excludes AirBnb', s.budgetedOutOfPocket, 14693);
check('paid toward budget', s.paidTotal, 20893);
check('bill still owed', s.billRemaining, 12153.26);
check('sections sum to the headline',
    s.categories.reduce((a, c) => a + c.remaining, 0), s.billRemaining);
check('Heaven budgeted spend excludes AirBnb', s.payers[1].spentOnBudget, 8937);
check('Austin has no off-budget spend', s.payers[0].spentOnBudget, 5756);
check('still-to-spend uses budgeted spend only', s.stillToSpendCash, 11473.26);
check('payer remainders sum to still-to-spend',
    s.payers.reduce((a, p) => a + p.remainingCash, 0), s.stillToSpendCash);

const dress = s.items.find(i => i.name === 'Dress')!;
check('dress paid entirely by gift money', dress.paid, 1200);
check('dress own-pocket is zero', dress.ownSpent, 0);
check('dress fully covered', dress.variance, 0);

console.log('\n--- Line-level tracking still works ---');
const tux = s.items.find(i => i.name === 'Tux')!;
check('tux double-paid overrun', tux.variance, 300);
const other = s.categories.find(c => c.name === 'Other')!;
// 70 stamps + 250 + 136 decor + 300 + 300 suits + 20 vases + 53 invites + 1284 ring
check('other section rolls up line spend', other.itemSpent, 2413);
check('other section has no installments', other.directSpent, 0);
check('other section gift money (dress)', other.giftApplied, 1200);
check('other section paid total', other.paid, 3613);
check('unlinked spend (AirBnb)', s.unlinkedSpend, 1957);

console.log('\n--- Under-21 guests and the bar line ---');
// "Under 21" says nothing about a plate — an 18-year-old eats the adult dinner.
// It says only that the bar is not being drunk, so the bar line tracks its own
// count and every other per-head line goes on tracking the adults.
const drinkSettings: FinanceSettings = {
    ...DEFAULT_SETTINGS, adult_count: 100, minor_count: 10, drinking_count: 84,
};
const barLine: BudgetItem = {
    id: 9001, category_id: 1, name: 'Bar', unit_cost: 25, quantity: 1,
    qty_source: 'drinkers', use_subitems: false, is_paid: false, notes: null,
    sort_order: 0, subitems: [],
};
check('bar line counts drinkers', effectiveQuantity(barLine, drinkSettings), 84);
check('bar charge skips the 16 under-21s', itemTotal(barLine, drinkSettings), 2100);
check('a dinner line still counts every adult',
    effectiveQuantity({ ...barLine, qty_source: 'adults' }, drinkSettings), 100);
// The drinkers are a subset of the adults, never another slice of the party:
// adding them into the headcount would invent 84 guests who do not exist.
check('all-guests total ignores the drinkers count',
    effectiveQuantity({ ...barLine, qty_source: 'total' }, drinkSettings), 110);

const barSummary = buildSummary({
    categories: [{ id: 1, name: 'Reception', sort_order: 0, items: [barLine] }],
    payers: [], purchases: [], contributors: [], settings: drinkSettings,
});
check('per-head cost still divides by every guest', barSummary.guestCost.guests, 110);
// One more adult guest is one more drinker, so the bar belongs in the marginal
// cost — it dropped out of it the moment the line stopped tracking adults.
check('one more guest adds the bar', barSummary.guestCost.marginalPerAdult, 25);

// Switching a line to Drinkers before anybody has counted them takes the bar to
// $0 without saying so — the budget quietly loses a few thousand dollars and
// every total below it still looks right. Say it out loud.
const unset = buildSummary({
    categories: [{ id: 1, name: 'Reception', sort_order: 0, items: [barLine] }],
    payers: [], purchases: [], contributors: [],
    settings: { ...drinkSettings, drinking_count: 0 },
});
check('a drinkers line with nobody counted is flagged',
    unset.warnings.filter(w => w.kind === 'no-drinkers').length, 1);
check('and the flag names the line, once, however many lines there are',
    buildSummary({
        categories: [{
            id: 1, name: 'Reception', sort_order: 0,
            items: [barLine, { ...barLine, id: 9002, name: 'Beer' }],
        }],
        payers: [], purchases: [], contributors: [],
        settings: { ...drinkSettings, drinking_count: 0 },
    }).warnings.filter(w => w.kind === 'no-drinkers').length, 1);
check('counted drinkers raise nothing',
    barSummary.warnings.filter(w => w.kind === 'no-drinkers').length, 0);
check('and a budget with no bar at all raises nothing',
    buildSummary({
        categories: [{
            id: 1, name: 'Reception', sort_order: 0,
            items: [{ ...barLine, qty_source: 'adults' }],
        }],
        payers: [], purchases: [], contributors: [],
        settings: { ...drinkSettings, drinking_count: 0 },
    }).warnings.filter(w => w.kind === 'no-drinkers').length, 0);


console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
