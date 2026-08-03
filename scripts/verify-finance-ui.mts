/**
 * Drives the finance suite in a real browser: loads every tab, edits values
 * inline, and confirms the derived totals actually move. Catches what a type
 * check and an API test can't — client-side crashes, broken commit-on-blur, and
 * totals that don't refresh.
 *
 * Run against a dev server with a seeded database:
 *   BASE=http://10.0.0.253:3399 ADMIN_PASSWORD=testpw npx tsx scripts/verify-finance-ui.mts
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://10.0.0.253:3399';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'testpw';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });

const consoleErrors: string[] = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

// --- log in ---
await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20_000 });

// --- overview ---
await page.goto(`${BASE}/admin/finances`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=Total budget', { timeout: 20_000 });
const body = async () => (await page.textContent('body')) ?? '';
/** Editable names live in <input value=...>, which textContent never sees. */
const inputValues = async () =>
    page.locator('input').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
/** The grid row that owns a given delete button. */
const rowFor = (name: string) =>
    page.locator('div.grid').filter({ has: page.locator(`button[aria-label="Delete ${name}"]`) }).first();

console.log('\n--- Overview ---');
let text = await body();
check('budget total shown', text.includes('$33,046.26'), 'expected seeded total');
check('spent total shown', text.includes('$16,650.00'));
check('gift money shown', text.includes('$6,880.00'));
check('both payers listed', text.includes('Austin') && text.includes('Heaven'));
check('category breakdown', text.includes('Main Cost') && text.includes('Staff And Extras'));
check('overruns surfaced', text.includes('Worth a look') && text.includes('Over budget') === false);
check('venue overrun flagged', /Venue/.test(text) && text.includes('+$5,180.00'));

// Scenario toggle must change the figures.
await page.click('text=If pledges land');
await page.waitForTimeout(200);
const pledgedText = await body();
check('scenario toggle changes numbers', pledgedText !== text && pledgedText.includes('$17,880.00'));
await page.click('text=Cash in hand');

console.log('\n--- Budget tab ---');
await page.click('button:has-text("Budget")');
await page.waitForSelector('text=Add line item', { timeout: 10_000 });
text = await body();
let values = await inputValues();
check('all three sections render',
    ['Main Cost', 'Staff And Extras', 'Other'].every((s) => values.includes(s)),
    `sections found: ${values.filter((v) => ['Main Cost', 'Staff And Extras', 'Other'].includes(v)).join(', ')}`);
check('line item names render',
    ['Venue', 'Appetizers', 'Dinner', 'Photographer', 'Rehearsal Dinner'].every((n) => values.includes(n)));
check('27 line items present', (await page.locator('button[aria-label^="Delete "]').count()) >= 27,
    `${await page.locator('button[aria-label^="Delete "]').count()} delete buttons`);
check('appetizers shows "from parts"', text.includes('from parts'));
check('derived qty renders 124', text.includes('124'));

// Inline edit: change Dessert's unit cost and confirm the grand total moves.
const dessertRow = rowFor('Dessert');
const costInput = dessertRow.locator('input[inputmode="decimal"]').first();
await costInput.fill('500');
await costInput.blur();
await page.waitForTimeout(1200);
text = await body();
check('inline cost edit updated grand total', text.includes('$33,246.26'),
    'dessert 300 -> 500 should add 200');

// Put it back.
await costInput.fill('300');
await costInput.blur();
await page.waitForTimeout(1200);
check('revert restored total', (await body()).includes('$33,046.26'));

// Paid toggle persists.
await page.locator('button[aria-label="Mark Dessert paid"]').first().click();
await page.waitForTimeout(1000);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=Total budget', { timeout: 20_000 });
await page.click('button:has-text("Budget")');
await page.waitForSelector('text=Add line item', { timeout: 10_000 });
check('paid flag persisted across reload',
    (await page.locator('button[aria-label="Mark Dessert paid"][aria-pressed="true"]').count()) === 1);

console.log('\n--- Purchases tab ---');
await page.click('button:has-text("Purchases")');
await page.waitForSelector('text=Log purchase', { timeout: 10_000 });
text = await body();
values = await inputValues();
check('purchases listed', values.includes('Venue Payment') && values.includes('Aust Ring'));
check('unlinked spend flagged', text.includes('$1,957.00'));
check('per-payer totals', text.includes('$5,756.00') && text.includes('$10,894.00'));

// Filter by payer.
await page.click('button:has-text("Austin")');
await page.waitForTimeout(300);
const filteredValues = await inputValues();
check('payer filter narrows list', !filteredValues.includes('Venue Payment'),
    "Heaven's purchase should be hidden");
await page.click('button:has-text("Everyone")');

console.log('\n--- Gift Money tab ---');
await page.click('button:has-text("Gift Money")');
await page.waitForSelector('text=Add contributor', { timeout: 10_000 });
text = await body();
values = await inputValues();
check('contributors listed',
    ['Karie & Dave', 'Kim', 'Rob', 'A Gram'].every((n) => values.includes(n)),
    `found: ${values.filter((v) => ['Karie & Dave', 'Kim', 'Rob', 'A Gram'].includes(v)).join(', ')}`);
check('pledged total', text.includes('$17,880.00'));
check('received total', text.includes('$6,880.00'));
check('over-delivery called out', text.includes('over the pledge'));
check('links to registry for guest gifts', text.includes('Registry'));

console.log('\n--- Settings tab ---');
await page.click('button:has-text("Settings")');
await page.waitForSelector('text=Who pays', { timeout: 10_000 });
text = await body();
check('headcount fields', text.includes('Headcount') && text.includes('135 guests'));
check('payers with shares', text.includes('Who pays'));
check('payment plan section', text.includes('Payment plan'));
check('paycheck interval hint', text.includes('paychecks left'));

// Changing the split must flow through to the overview.
const shareInputs = page.locator('input[inputmode="decimal"]');
await shareInputs.nth(2).fill('75');
await shareInputs.nth(2).blur();
await page.waitForTimeout(1200);
await page.click('button:has-text("Overview")');
await page.waitForSelector('text=Total budget', { timeout: 10_000 });
check('split change reached overview', (await body()).includes('75% share'));

// Restore 50/50.
await page.click('button:has-text("Settings")');
await page.waitForSelector('text=Who pays', { timeout: 10_000 });
await shareInputs.nth(2).fill('50');
await shareInputs.nth(2).blur();
await page.waitForTimeout(1200);

console.log('\n--- Mobile layout ---');
await page.setViewportSize({ width: 390, height: 900 });
await page.click('button:has-text("Budget")');
await page.waitForTimeout(500);
const overflowX = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('no horizontal overflow at 390px', overflowX <= 1, `${overflowX}px overflow`);

console.log('\n--- Console cleanliness ---');
// Reloading mid-flight aborts pending fetches; that is an artifact of this
// script navigating, not something a user would ever trigger.
const realErrors = consoleErrors.filter((e) =>
    !e.includes('favicon')
    && !/Download the React DevTools/.test(e)
    && !/Failed to fetch/.test(e));
check('no console errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n${failures === 0 ? 'ALL UI CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
