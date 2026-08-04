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
// A dev server compiles each route on first hit, which can take a while after an
// edit. Generous default so the suite isn't flaky for a reason that isn't a bug.
page.setDefaultTimeout(90_000);

const consoleErrors: string[] = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
// Deletes go through window.confirm; Playwright dismisses dialogs by default,
// which would silently turn every delete into a no-op.
page.on('dialog', (d) => d.accept());

// --- log in ---
await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[type="password"]', PASSWORD);
// Wait on the auth response rather than the client-side redirect that follows
// it — the redirect fires no `load` event, so waiting for navigation is flaky.
await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/auth/login') && r.status() === 200),
    page.click('button[type="submit"]'),
]);
await page.waitForTimeout(500);

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
check('paid-toward-budget shown', text.includes('$20,893.00'), 'budgeted 14,693 + gift 6,200');
check('own budgeted spend shown', text.includes('$14,693.00'));
check('bill still owed shown', text.includes('$12,153.26'),
    'must equal the sum of the section remainders');
check('off-budget spending called out', text.includes("isn't attached to any"));
check('gift money shown', text.includes('$6,880.00'));
check('both payers listed', text.includes('Austin') && text.includes('Heaven'));
check('category breakdown', text.includes('Venue Cost') && text.includes('Staff And Extras'));
check('section progress shown', text.includes('Section progress') && text.includes('% paid'));
check('venue section payments counted', text.includes('3 installments'), '2 own + Rob gift');
check('gift money badged on section', text.includes('🎁 $5,000.00'));
check('no bogus venue line overrun', !text.includes('+$5,180.00'),
    'installments belong to the section, not the $4,500 line');

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
    ['Venue Cost', 'Staff And Extras', 'Other'].every((s) => values.includes(s)),
    `sections found: ${values.filter((v) => ['Venue Cost', 'Staff And Extras', 'Other'].includes(v)).join(', ')}`);
check('line item names render',
    ['Venue', 'Appetizers', 'Dinner', 'Photographer', 'Rehearsal Dinner'].every((n) => values.includes(n)));
check('27 line items present', (await page.locator('button[aria-label^="Delete "]').count()) >= 27,
    `${await page.locator('button[aria-label^="Delete "]').count()} delete buttons`);
check('appetizers shows "from parts"', text.includes('from parts'));
check('derived qty renders 124', text.includes('124'));

// Section-level paid-vs-budgeted controls.
check('section footer present', text.includes('Paid toward this section'));
check('section budgeted figure', text.includes('$18,358.90'));
check('section paid includes gift money', text.includes('$14,680.00'), 'Rob 5,000 counted');
check('section still owed', text.includes('$3,678.90'));
check('own vs gift split shown', text.includes('$9,680.00 yours + $5,000.00 gift money'));
check('installments listed', values.includes('Venue 2/4') && values.includes('Venue Payment'));
check('gift payment listed in section', values.includes('Venue 1/4'));
check('payments subtotal', text.includes('Payments subtotal'));
check('log installment control', text.includes('Log an installment'));

// A new installment must move the section's paid total.
const beforeInstall = await page.locator('button:has-text("+ Log an installment")').count();
check('an installment control per section', beforeInstall === 3, `${beforeInstall} controls`);
await page.locator('button:has-text("+ Log an installment")').first().click();
await page.waitForTimeout(1400);
const newRow = rowFor('Venue Cost payment');
check('new installment row appeared', await newRow.count() > 0);
const newAmt = newRow.locator('input[inputmode="decimal"]').first();
await newAmt.fill('1320');
await newAmt.blur();
await page.waitForTimeout(1400);
text = await body();
check('section paid total moved', text.includes('$16,000.00'), '14,680 + 1,320');
check('section still owed moved', text.includes('$2,358.90'));
await page.locator('button[aria-label="Delete Venue Cost payment"]').first().click();
await page.waitForTimeout(1400);
check('removing installment restored total', (await body()).includes('$14,680.00'));

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
check('untracked spend flagged', text.includes('$1,957.00'));
// Earmarked gift money must appear here as a payment, badged, not hidden away.
check('gift payments listed in purchases', values.includes('Venue 1/4') && values.includes('Dress'),
    'Rob and Kim earmarked payments');
check('gift filter pill present', text.includes('🎁 Gift money'));
check('gift total tile', text.includes('$6,200.00'));
check('unapplied gift called out', text.includes('$680.00'));
await page.click('button:has-text("🎁 Gift money")');
await page.waitForTimeout(400);
const giftOnly = await inputValues();
check('gift filter shows only gift rows',
    giftOnly.includes('Venue 1/4') && !giftOnly.includes('Venue Payment'));
await page.click('button:has-text("Everyone")');
await page.waitForTimeout(300);
values = await inputValues();
const options = await page.locator('select option').evaluateAll(
    (els) => els.map((e) => (e as HTMLOptionElement).textContent ?? ''));
check('section option offered in dropdown',
    options.some((o) => o.includes('Venue Cost — whole section')),
    options.filter((o) => o.includes('whole section')).join(' | '));
check('per-payer cash totals shown', text.includes('$5,756.00') && text.includes('$10,894.00'));
check('off-budget flagged as not in the budget', text.includes('Not in the budget'));

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

console.log('\n--- Cost per guest + mistake detection ---');
await page.click('button:has-text("Overview")');
await page.waitForSelector('text=Total budget', { timeout: 20_000 });
text = await body();
check('per-guest cost shown', text.includes('$244.79'), '33,046.26 / 135');
check('marginal guest cost shown', text.includes('$72.00'), 'dinner 35 + bar 37');
check('table of ten shown', text.includes('$720.00'));
check('duplicate suit flagged', text.includes('are both $300.00'));
check('ring overrun flagged', /Austin.s Ring: \$1,284\.00 paid/.test(text));

console.log('\n--- Trend + what-if ---');
check('trend card present', text.includes('Trend'));
check('what-if present', text.includes('What if'));
const guestInput = page.locator('input[type="number"]').first();
await guestInput.fill('160');
await page.waitForTimeout(500);
const whatIfText = await body();
// 36 more adults x (35 dinner + 37 bar) = 2,592 on top of 33,046.26.
check('what-if recomputes the budget', whatIfText.includes('$35,638.26'),
    '160 adults instead of 124');
check('what-if shows the delta', whatIfText.includes('+$2,592.00'));
await guestInput.fill('124');
await page.waitForTimeout(400);
check('what-if never wrote to the database',
    (await body()).includes('$33,046.26'), 'real total untouched');

console.log('\n--- Derived paid state ---');
await page.click('button:has-text("Budget")');
await page.waitForSelector('text=Add line item', { timeout: 10_000 });
text = await body();
check('paid states rendered', text.includes('Part paid') && text.includes('Overpaid'));
check('conflict hint shown', text.includes('Fully covered by payments'));
check('fully-paid count shown', /\d+ fully paid/.test(text));

console.log('\n--- Schedule: split a bill ---');
await page.click('button:has-text("Schedule")');
await page.waitForSelector('text=Split into payments', { timeout: 10_000 });
check('empty schedule explains itself', (await body()).includes('Nothing scheduled yet'));
await page.click('button:has-text("Split into payments")');
await page.waitForSelector('text=Which bill', { timeout: 10_000 });
const numbers = page.locator('input[type="number"]');
await numbers.nth(0).fill('5000');   // deposit
await numbers.nth(1).fill('3');      // instalments
await page.waitForTimeout(300);
const preview = await body();
check('split preview totals the whole bill', preview.includes('Totals $18,358.90'),
    'deposit + instalments must add back up');
check('split preview absorbs rounding', preview.includes('to absorb the rounding'));
await page.click('button:has-text("Create schedule")');
await page.waitForTimeout(2500);
text = await body();
values = await inputValues();
check('schedule rows created',
    values.includes('Venue Cost deposit') && values.includes('Venue Cost 3/3'),
    values.filter((v) => v.startsWith('Venue Cost')).join(', '));
check('scheduled total matches the bill', text.includes('$18,358.90'),
    'deposit + 3 instalments == the section budget');
// The stat tile is always labelled "Overdue", so assert its value rather than
// looking for the word anywhere on the page.
const overdueBadges = await page.locator('span:text-is("Overdue")').count();
check('nothing overdue yet', overdueBadges === 0, `${overdueBadges} overdue badges`);
check('rounding lands on the final payment', values.includes('4452.98'),
    values.filter((v) => v.startsWith('4452')).join(', '));

console.log('\n--- Untracked spend can be adopted ---');
await page.click('button:has-text("Purchases")');
await page.waitForSelector('text=Log purchase', { timeout: 10_000 });
check('untracked payment called out', (await body()).includes('not in the budget'));
await page.click('button:has-text("+ Add to budget")');
await page.waitForTimeout(3000);
text = await body();
check('adopting clears the untracked warning', !text.includes('1 payment not in the budget'),
    'AirBnb should now have a line');
check('budget grew by the adopted amount', text.includes('$35,003.26'),
    '33,046.26 + 1,957');

console.log('\n--- Bulk edit ---');
// Bulk selection has to work on desktop too, not just the mobile layout.
const rowBoxes = page.locator('input[type="checkbox"][aria-label^="Select "]');
check('per-row checkboxes are reachable', await rowBoxes.first().isVisible(),
    'they were md:hidden, making bulk edit desktop-only broken');
await rowBoxes.first().check();
await page.waitForTimeout(300);
check('bulk bar appears on selection', (await body()).includes('1 selected'));
await page.click('button:has-text("Edit selected")');
await page.waitForSelector('text=Leave unchanged', { timeout: 10_000 });
check('bulk modal defaults to leaving fields alone',
    (await body()).includes('stays as it is'));
await page.click('button:has-text("Cancel")');
await page.waitForTimeout(300);

console.log('\n--- Undo a delete, archive a contributor ---');
await page.click('button:has-text("Gift Money")');
await page.waitForSelector('text=Add contributor', { timeout: 10_000 });

// A receipt is a leaf row, so deleting it can genuinely be undone.
const beforeReceipts = (await inputValues()).filter((v) => v === 'Venue 1/4').length;
check('receipt present before delete', beforeReceipts === 1);
await page.locator('button[aria-label^="Delete payment Venue 1/4"]').first().click();
await page.waitForTimeout(1800);
check('undo bar offered after delete', (await body()).includes('Undo'));
await page.click('button:has-text("Undo")');
await page.waitForTimeout(2500);
check('undo restored the receipt',
    (await inputValues()).filter((v) => v === 'Venue 1/4').length === 1);

// A contributor cascades its receipts, so it archives instead — undo couldn't
// rebuild the history.
await page.locator('button[aria-label="Archive A Gram"]').first().click();
await page.waitForTimeout(2000);
check('archived contributor leaves the list',
    !(await inputValues()).includes('A Gram'));

console.log('\n--- Thank-you tracking ---');
text = await body();
check('thank-you control present', text.includes('Thank you?'));
check('thanked counter present', /\d+\/\d+/.test(text) && text.includes('thank-you notes sent'));
await page.locator('button:has-text("Thank you?")').first().click();
await page.waitForTimeout(1600);
check('thank-you marks as sent', (await body()).includes('✓ Thanked'));

console.log('\n--- Templates + archive ---');
await page.click('button:has-text("Budget")');
await page.waitForSelector('text=Add common line items', { timeout: 10_000 });
await page.click('button:has-text("Add common line items")');
await page.waitForSelector('text=Add to section', { timeout: 10_000 });
check('template lists line items', (await body()).includes('Bridal bouquet')
    || (await body()).includes('Venue hire'));
await page.click('button:has-text("Cancel")');
await page.waitForTimeout(400);
await page.click('button:has-text("Settings")');
await page.waitForSelector('text=Who pays', { timeout: 10_000 });
check('archive count reported', (await body()).includes('archived row'));
await page.click('button:has-text("Show archived")');
await page.waitForTimeout(1200);
check('archived contributor listed with a way back',
    (await body()).includes('A Gram') && (await body()).includes('Restore'));
await page.click('button:has-text("Restore")');
await page.waitForTimeout(2000);
await page.click('button:has-text("Gift Money")');
await page.waitForSelector('text=Add contributor', { timeout: 10_000 });
check('restored contributor is back', (await inputValues()).includes('A Gram'));

console.log('\n--- Mobile layout (390px) ---');
await page.setViewportSize({ width: 390, height: 900 });
await page.click('button:has-text("Budget")');
await page.waitForTimeout(700);
const overflowX = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('no horizontal overflow at 390px', overflowX <= 1, `${overflowX}px overflow`);

// Rows collapse to name + total so a 27-line budget stays scannable; the
// editable fields are behind the expander.
const collapsedText = await body();
check('collapsed row shows the line total', collapsedText.includes('$4,500.00'));
// textContent includes display:none nodes (the desktop header row), so this has
// to test what is actually rendered.
const visibleLabels = async (label: string) => page.evaluate((text) => {
    const root = document.querySelector('[data-finance-suite]')!;
    return [...root.querySelectorAll('span, div')]
        .filter((el) => el.textContent?.trim() === text
            && (el as HTMLElement).offsetParent !== null).length;
}, label);
check('collapsed rows hide the editing labels', (await visibleLabels('Unit cost')) === 0,
    'unit cost should only be visible once a row is expanded');
await page.locator('button[aria-label^="Expand Venue"]').first().click();
await page.waitForTimeout(500);
check('expanding reveals labelled fields', (await visibleLabels('Unit cost')) === 1,
    'every field needs a label once the header row is hidden');
check('expanded row labels the quantity source', (await visibleLabels('Qty from')) === 1);
await page.locator('button[aria-label^="Collapse Venue"]').first().click();
await page.waitForTimeout(400);

// iOS Safari zooms the viewport on focusing any input under 16px.
const tooSmallFont = await page.evaluate(() => {
    const out: string[] = [];
    const root = document.querySelector('[data-finance-suite]')!;
    root.querySelectorAll('input, select, textarea').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && parseFloat(getComputedStyle(el).fontSize) < 16) {
            out.push((el as HTMLInputElement).placeholder
                || el.getAttribute('aria-label') || el.tagName);
        }
    });
    return out;
});
check('no sub-16px inputs (iOS would zoom)', tooSmallFont.length === 0, tooSmallFont.join(', '));

// Touch targets, scoped to this feature — the site's own nav chrome predates it.
const tinyTargets = await page.evaluate(() => {
    const out: string[] = [];
    const root = document.querySelector('[data-finance-suite]')!;
    root.querySelectorAll('button, select, input, a').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.height < 32) {
            out.push(`${el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 16)} ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
    });
    return out;
});
check('no under-32px touch targets', tinyTargets.length === 0, tinyTargets.slice(0, 4).join(' | '));

for (const tab of ['Schedule', 'Purchases', 'Gift Money', 'Settings', 'Overview']) {
    await page.click(`button:has-text("${tab}")`);
    await page.waitForTimeout(600);
    const ov = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${tab} fits 390px`, ov <= 1, `${ov}px overflow`);
}

// A narrow Android viewport is the real floor, not the iPhone width.
await page.setViewportSize({ width: 360, height: 800 });
for (const tab of ['Budget', 'Schedule', 'Purchases', 'Gift Money']) {
    await page.click(`button:has-text("${tab}")`);
    await page.waitForTimeout(600);
    const ov = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${tab} fits 360px`, ov <= 1, `${ov}px overflow`);
}
await page.setViewportSize({ width: 1280, height: 1400 });

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
