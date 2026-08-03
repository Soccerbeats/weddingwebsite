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
// Deletes go through window.confirm; Playwright dismisses dialogs by default,
// which would silently turn every delete into a no-op.
page.on('dialog', (d) => d.accept());

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
check('paid-to-vendors shown', text.includes('$22,850.00'), 'own 16,650 + gift 6,200');
check('own-pocket split shown', text.includes('$16,650.00'));
check('bill still owed shown', text.includes('$10,196.26'));
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
check('per-payer totals stay own-pocket', text.includes('$5,756.00') && text.includes('$10,894.00'));

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

for (const tab of ['Purchases', 'Gift Money', 'Settings', 'Overview']) {
    await page.click(`button:has-text("${tab}")`);
    await page.waitForTimeout(600);
    const ov = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${tab} fits 390px`, ov <= 1, `${ov}px overflow`);
}

// A narrow Android viewport is the real floor, not the iPhone width.
await page.setViewportSize({ width: 360, height: 800 });
for (const tab of ['Budget', 'Purchases', 'Gift Money']) {
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
