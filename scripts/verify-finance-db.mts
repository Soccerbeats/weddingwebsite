/**
 * End-to-end check of the finance persistence + API layer against a real
 * Postgres. Exercises table creation, the one-time seed, its idempotency, and
 * CRUD through the actual route handlers.
 *
 * Run: DATABASE_URL=postgres://... npx tsx scripts/verify-finance-db.mts
 */
import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';
import { ensureFinanceTables, loadFinanceData } from '../src/lib/financeDb';
import { buildSummary } from '../src/lib/finance';
import { GET } from '../src/app/api/admin/finances/route';
import { POST, PATCH, DELETE } from '../src/app/api/admin/finances/[resource]/route';

const sql = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Re-entrant mode: a *fresh process* runs the ensure/seed path again and reports
 * counts. That is the only honest way to test seed idempotency, since
 * ensureFinanceTables memoises per process — the real risk is two containers
 * booting against one database, not two calls in one process.
 */
if (process.argv[2] === 'seedcheck') {
    await ensureFinanceTables();
    const data = await loadFinanceData();
    console.log(JSON.stringify({
        categories: data.categories.length,
        items: data.categories.flatMap(c => c.items).length,
        purchases: data.purchases.length,
        receipts: data.contributors.flatMap(c => c.receipts).length,
    }));
    await sql.end();
    process.exit(0);
}

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
}
function near(label: string, actual: number, expected: number) {
    check(label, Math.abs(actual - expected) < 0.005, `got ${actual}, want ${expected}`);
}

const params = (resource: string) => ({ params: Promise.resolve({ resource }) });
const req = (body: unknown) =>
    new Request('http://localhost/api/admin/finances/x', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });

console.log('\n--- Schema + seed ---');
await ensureFinanceTables();
const first = await loadFinanceData();
check('categories seeded', first.categories.length === 3, `${first.categories.length} sections`);
check('items seeded', first.categories.flatMap(c => c.items).length === 27,
    `${first.categories.flatMap(c => c.items).length} items`);
check('payers seeded', first.payers.length === 2);
check('purchases seeded', first.purchases.length === 14);
check('contributors seeded', first.contributors.length === 4);
check('receipts seeded', first.contributors.flatMap(c => c.receipts).length === 3);
check('headcount seeded', first.settings.adult_count === 124 && first.settings.minor_count === 11);

const sub = first.categories[0].items.find(i => i.name === 'Appetizers');
check('section renamed to Venue Cost', first.categories.some(c => c.name === 'Venue Cost'),
    first.categories.map(c => c.name).join(', '));
check('appetizers has sub-items', (sub?.subitems.length ?? 0) === 6);
check('appetizers flagged use_subitems', sub?.use_subitems === true);

const s1 = buildSummary({ ...first, weddingDate: 'October 16, 2026' });
near('budget total from DB', s1.budgetTotal, 33046.26);
near('spent total from DB', s1.spentTotal, 16650);
near('received from DB', s1.receivedTotal, 6880);

console.log('\n--- Seed is idempotent across a cold restart ---');
const again = JSON.parse(execFileSync(
    'npx', ['--yes', 'tsx', import.meta.filename, 'seedcheck'],
    { encoding: 'utf8', env: process.env },
).trim());
check('no duplicate categories', again.categories === 3, `${again.categories}`);
check('no duplicate items', again.items === 27, `${again.items}`);
check('no duplicate purchases', again.purchases === 14, `${again.purchases}`);
check('no duplicate receipts', again.receipts === 3, `${again.receipts}`);

console.log('\n--- Route: GET ---');
const getRes = await GET();
check('GET 200', getRes.status === 200);
const payload = await getRes.json();
check('GET returns summary', typeof payload.summary?.budgetTotal === 'number');
near('GET budget total', payload.summary.budgetTotal, 33046.26);
check('GET includes headcount block', payload.headcount !== undefined);

console.log('\n--- Route: create / update / delete ---');
const created = await POST(req({ category_id: first.categories[2].id, name: 'Test Line', unit_cost: 12.5, quantity: 4 }), params('items'));
check('POST item 201-ish', created.status === 200);
const item = await created.json();
check('POST returns row with id', typeof item.id === 'number');

const afterCreate = await loadFinanceData();
near('total grew by 50.00', buildSummary({ ...afterCreate, weddingDate: null }).budgetTotal, 33096.26);

const patched = await PATCH(req({ id: item.id, unit_cost: 100, quantity: 2 }), params('items'));
check('PATCH 200', patched.status === 200);
const afterPatch = await loadFinanceData();
near('total reflects patch', buildSummary({ ...afterPatch, weddingDate: null }).budgetTotal, 33246.26);

console.log('\n--- Route: validation + injection safety ---');
const badResource = await POST(req({ name: 'x' }), params('finance_items; DROP TABLE finance_items'));
check('unknown resource rejected', badResource.status === 404);
const missingRequired = await POST(req({ unit_cost: 5 }), params('items'));
check('missing required field rejected', missingRequired.status === 400);
const badEnum = await PATCH(req({ id: item.id, qty_source: 'evil' }), params('items'));
check('bad enum coerced not injected', badEnum.status === 200);
const enumRow = await (badEnum as Response).json();
check('enum fell back to manual', enumRow.qty_source === 'manual', enumRow.qty_source);
const unknownColumn = await PATCH(req({ id: item.id, is_paid: true, evil_column: 1 }), params('items'));
check('unknown column ignored', unknownColumn.status === 200);
const tablesStillThere = await sql.query(`SELECT COUNT(*)::int AS n FROM finance_items`);
check('finance_items intact after injection attempts', tablesStillThere.rows[0].n > 0);

console.log('\n--- Route: money parsing ---');
const moneyPatch = await PATCH(req({ id: item.id, unit_cost: '$1,234.56' }), params('items'));
const moneyRow = await (moneyPatch as Response).json();
// Silently writing 0 over a real amount is the worst failure mode for a ledger,
// so currency formatting must survive the server boundary too.
near('formatted currency string parsed', Number(moneyRow.unit_cost), 1234.56);
const blankAmount = await PATCH(req({ id: item.id, unit_cost: '' }), params('items'));
near('blank amount becomes 0', Number((await (blankAmount as Response).json()).unit_cost), 0);
const junkAmount = await PATCH(req({ id: item.id, unit_cost: 'abc' }), params('items'));
near('junk amount becomes 0', Number((await (junkAmount as Response).json()).unit_cost), 0);

console.log('\n--- Route: reorder + delete ---');
const reordered = await PATCH(
    req([{ id: first.categories[2].id }, { id: first.categories[0].id }, { id: first.categories[1].id }]),
    params('categories'),
);
check('bulk reorder 200', reordered.status === 200);
const afterReorder = await loadFinanceData();
check('reorder applied', afterReorder.categories[0].id === first.categories[2].id,
    `first is now ${afterReorder.categories[0].name}`);

const del = await DELETE(new Request(`http://x/?id=${item.id}`, { method: 'DELETE' }), params('items'));
check('DELETE 200', del.status === 200);
const afterDelete = await loadFinanceData();
near('total back to original', buildSummary({ ...afterDelete, weddingDate: null }).budgetTotal, 33046.26);

console.log('\n--- Section-level payments ---');
const sectionData = await loadFinanceData();
const venueCat = sectionData.categories.find(c => c.name === 'Venue Cost')!;
const sSec = buildSummary({ ...sectionData, weddingDate: null });
const venueStats = sSec.categories.find(c => c.id === venueCat.id)!;
near('installments landed on section', venueStats.directSpent, 9680);
check('installment count is 2', venueStats.installmentCount === 2, `${venueStats.installmentCount}`);
near('section remaining', venueStats.remaining, 8678.9);
near('gift earmarked to section', venueStats.earmarked, 5000);

// item_id and category_id must never both be set on one row.
const excl = await PATCH(req({ id: sectionData.purchases.find(p => p.category_id === venueCat.id)!.id,
    item_id: venueCat.items[0].id }), params('purchases'));
const exclRow = await (excl as Response).json();
check('setting a line clears the section', exclRow.category_id === null, String(exclRow.category_id));
const excl2 = await PATCH(req({ id: exclRow.id, category_id: venueCat.id }), params('purchases'));
const exclRow2 = await (excl2 as Response).json();
check('setting a section clears the line', exclRow2.item_id === null, String(exclRow2.item_id));
const both = await PATCH(req({ id: exclRow.id, item_id: venueCat.items[0].id, category_id: venueCat.id }),
    params('purchases'));
const bothRow = await (both as Response).json();
check('both at once resolves to one target',
    (bothRow.item_id === null) !== (bothRow.category_id === null),
    `item=${bothRow.item_id} category=${bothRow.category_id}`);
// restore
await PATCH(req({ id: exclRow.id, category_id: venueCat.id }), params('purchases'));

console.log('\n--- Referential behaviour ---');
// The venue installments target the section, so the Venue *line* carries none.
const venue = afterDelete.categories.flatMap(c => c.items).find(i => i.name === 'Venue')!;
check('venue line has no line-level payments',
    afterDelete.purchases.filter(p => p.item_id === venue.id).length === 0);

// Deleting a budget line must keep its purchases, just unlinked. Decor has three.
const decor = afterDelete.categories.flatMap(c => c.items).find(i => i.name === 'Decor')!;
check('decor has 3 linked payments',
    afterDelete.purchases.filter(p => p.item_id === decor.id).length === 3);
await DELETE(new Request(`http://x/?id=${decor.id}`, { method: 'DELETE' }), params('items'));
const afterVenueDelete = await loadFinanceData();
check('purchases survived line deletion', afterVenueDelete.purchases.length === 14,
    `${afterVenueDelete.purchases.length} purchases`);
// AirBnb was already untracked; Decor's three join it.
check('orphaned purchases went unlinked',
    afterVenueDelete.purchases.filter(p => p.item_id === null && p.category_id === null).length === 4,
    `${afterVenueDelete.purchases.filter(p => p.item_id === null && p.category_id === null).length}`);

// Deleting a section must not destroy its installments either.
const venueCatId = afterVenueDelete.categories.find(c => c.name === 'Venue Cost')!.id;
await DELETE(new Request(`http://x/?id=${venueCatId}`, { method: 'DELETE' }), params('categories'));
const afterCatDelete = await loadFinanceData();
check('installments survived section deletion', afterCatDelete.purchases.length === 14,
    `${afterCatDelete.purchases.length}`);
check('installments went unlinked, not deleted',
    afterCatDelete.purchases.filter(p => p.category_id === null && p.item_id === null).length === 6);
// Deleting a contributor must cascade their receipts.
const kim = afterVenueDelete.contributors.find(c => c.name === 'Kim')!;
await DELETE(new Request(`http://x/?id=${kim.id}`, { method: 'DELETE' }), params('contributors'));
const afterKim = await loadFinanceData();
check('contributor receipts cascaded',
    afterKim.contributors.flatMap(c => c.receipts).length === 1);

console.log('\n--- Settings singleton ---');
const setRes = await POST(req({ adult_count: 130, minor_count: 9, plan_horizon_months: 18 }), params('settings'));
check('settings POST 200', setRes.status === 200);
const afterSettings = await loadFinanceData();
check('headcount updated', afterSettings.settings.adult_count === 130);
const sSet = buildSummary({ ...afterSettings, weddingDate: 'October 16, 2026' });
check('horizon honours override', sSet.horizon.derived === false);
near('18-month horizon in days', sSet.horizon.days, Math.ceil(18 * 30.4375));
const rows = await sql.query('SELECT COUNT(*)::int AS n FROM finance_settings');
check('settings stayed a singleton', rows.rows[0].n === 1);

console.log(`\n${failures === 0 ? 'ALL DB CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
await sql.end();
process.exit(failures === 0 ? 0 : 1);
