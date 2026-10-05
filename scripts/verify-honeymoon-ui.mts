/**
 * The honeymoon portal's UI contracts, in a real browser.
 *
 *   BASE=http://10.0.0.253:3399 ADMIN_PASSWORD=… npm run check:honeymoon:ui
 *   BASE=https://weddingwebsitedemo.com DEMO=1 npm run check:honeymoon:ui
 *
 * Needs a server with honeymoon data (the demo seed is ideal) and a browser, so
 * like `check:hero` it is a manual check, not a CI gate. What it pins down is
 * the v0.10 rework — the things that were broken before it:
 *
 * - a place opens the **same panel, with the same sections**, from every place
 *   you can click one;
 * - the itinerary's toolbar stays on screen as the page scrolls, with
 *   Stacked/Clock to the left of Days/Timeline/Calendar;
 * - a day's travel is drawn on both timeline shapes;
 * - on a phone, no tab scrolls sideways and no control is smaller than a
 *   fingertip (44px, counted by a checkbox's label rather than the box);
 * - the overview's cards never overlap.
 */
import { chromium, type Page } from 'playwright';

const BASE = (process.env.BASE ?? 'http://10.0.0.253:3399').replace(/\/$/, '');
const DEMO = process.env.DEMO === '1';
const PASSWORD = process.env.ADMIN_PASSWORD ?? '';
const HM = `${BASE}/admin/honeymoon`;

let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail = '') {
    checks += 1;
    if (!ok) failures += 1;
    console.log(`${ok ? '  ✓' : '  ✗'} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
}

if (!DEMO && !PASSWORD) {
    console.error('Set ADMIN_PASSWORD (or DEMO=1 against the demo instance).');
    process.exit(2);
}

const browser = await chromium.launch(
    process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {},
);

async function page(phone: boolean): Promise<Page> {
    const context = await browser.newContext(phone
        ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1440, height: 900 } });
    if (!DEMO) {
        const res = await context.request.post(`${BASE}/api/auth/login`, { data: { password: PASSWORD } });
        if (!res.ok()) throw new Error(`login failed: ${res.status()}`);
    }
    const p = await context.newPage();
    p.on('pageerror', (error) => console.log(`    page error: ${error.message.slice(0, 160)}`));
    return p;
}

async function go(p: Page, path: string) {
    await p.goto(`${HM}${path}`, { waitUntil: 'networkidle', timeout: 90_000 });
    await p.waitForTimeout(700);
}

/** Click the first match; false (not a throw) when there is nothing to click. */
async function clickFirst(p: Page, selector: string): Promise<boolean> {
    const target = p.locator(selector).first();
    if (!(await target.count())) return false;
    await target.click({ timeout: 10_000 }).catch(() => undefined);
    return true;
}

/** The panel that opened, as "id:sections" — or null if none did. */
async function openedPanel(p: Page): Promise<string | null> {
    const sheet = p.locator('[data-place-sheet]').first();
    try { await sheet.waitFor({ timeout: 8000 }); } catch { return null; }
    const id = await sheet.getAttribute('data-place-sheet');
    const sections = await sheet.getAttribute('data-sections');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    return `${id}:${sections}`;
}

const sectionsOf = (panel: string | null) => panel?.split(':')[1] ?? '';

/* ---------------------------------------------------------------- desktop */
console.log('\nOne place panel, from every entry point');
{
    const p = await page(false);

    await go(p, '/places');
    const fromPlaces = (await clickFirst(p, '[data-place-row] button')) ? await openedPanel(p) : null;
    check('a Places row opens the panel', fromPlaces != null);

    // The panel's own ⋯ menu lives in a layer above it; a press there must not
    // count as a press "outside" the panel and close it under your finger.
    let formOpened = false;
    if (await clickFirst(p, '[data-place-row] button')) {
        await p.waitForTimeout(400);
        if (await clickFirst(p, '[data-sheet-panel] button[aria-label="More actions"]')) {
            await p.waitForTimeout(300);
            await p.getByRole('button', { name: 'Edit everything' }).last().click({ timeout: 5000 }).catch(() => undefined);
            await p.waitForTimeout(500);
            formOpened = (await p.locator('[data-place-sheet="form"]').count()) === 1;
        }
        await p.keyboard.press('Escape');
        await p.waitForTimeout(300);
    }
    check("the panel's ⋯ → Edit everything opens the form in the same panel", formOpened);

    await go(p, '/stays');
    const fromStays = (await clickFirst(p, '[data-place-card] button[aria-label^="Open"]')) ? await openedPanel(p) : null;
    check('a stay card opens the panel, with the stay section', sectionsOf(fromStays).includes('stay'), String(fromStays));

    await go(p, '/excursions');
    const fromExcursions = (await clickFirst(p, '[data-place-card] button[aria-label^="Open"]')) ? await openedPanel(p) : null;
    check('an excursion card opens the same panel as any place',
        fromExcursions != null && sectionsOf(fromExcursions) === sectionsOf(fromPlaces),
        `${fromExcursions} vs ${fromPlaces}`);

    await go(p, '/itinerary');
    // The Sleep line's place, and a stop's name, are the two that used to open
    // different windows from the same day card.
    const fromSleep = (await clickFirst(p, '[data-sleep-place]')) ? await openedPanel(p) : null;
    check('the itinerary Sleep line opens the panel', fromSleep != null);
    const stopLabel = (await p.locator('button.group\\/place').first().textContent().catch(() => ''))?.trim() ?? '';
    const fromStop = (await clickFirst(p, 'button.group\\/place')) ? await openedPanel(p) : null;
    check('an itinerary stop opens the panel — not an edit form', fromStop != null, stopLabel);

    await go(p, '');
    const shortlist = p.locator('text=Shortlist').locator('xpath=ancestor::*[@data-card][1]//button').first();
    if (await shortlist.count()) {
        await shortlist.click();
        check('an overview shortlist entry opens the panel', (await openedPanel(p)) != null);
    }

    await p.keyboard.press('Control+k');
    await p.waitForTimeout(300);
    await p.keyboard.type((stopLabel.split(/\s+/)[0] ?? '').slice(0, 6));
    await p.waitForTimeout(500);
    await p.keyboard.press('Enter');
    check('a search hit opens the panel', (await openedPanel(p)) != null);

    console.log('\nItinerary toolbar and timeline');
    await go(p, '/itinerary');
    await p.getByRole('button', { name: /Timeline/ }).first().click().catch(() => undefined);
    await p.waitForTimeout(500);
    const shape = await p.locator('[data-segmented="Timeline shape"]').boundingBox({ timeout: 3000 }).catch(() => null);
    const view = await p.locator('[data-segmented="Itinerary view"]').boundingBox({ timeout: 3000 }).catch(() => null);
    check('Stacked / Clock sits to the left of Days / Timeline / Calendar',
        shape != null && view != null && shape.x < view.x);
    check('the stacked bar draws travel', (await p.locator('[data-leg-slice]').count()) > 0);
    await p.getByRole('button', { name: /Clock/ }).first().click().catch(() => undefined);
    await p.waitForTimeout(500);
    check('the clock draws travel', (await p.locator('[data-leg-slice]').count()) > 0);
    await p.evaluate(() => {
        const scroller = [...document.querySelectorAll<HTMLElement>('*')]
            .find((el) => el.scrollHeight > el.clientHeight + 800 && getComputedStyle(el).overflowY === 'auto');
        if (scroller) scroller.scrollTop = 2500;
    });
    await p.waitForTimeout(400);
    const bar = await p.locator('[data-tab-toolbar]').first().boundingBox({ timeout: 3000 }).catch(() => null);
    check('the toolbar is still on screen after scrolling', bar != null && bar.y >= 0 && bar.y < 320,
        bar ? `y=${Math.round(bar.y)}` : 'missing');

    console.log('\nOverview');
    await go(p, '');
    const boxes = await p.locator('[data-card]').evaluateAll((els) => els.map((el) => {
        const r = el.getBoundingClientRect();
        return [r.left, r.top, r.width, r.height];
    }));
    let overlaps = 0;
    for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
            const [a, b] = [boxes[i], boxes[j]];
            if (a[0] < b[0] + b[2] - 1 && b[0] < a[0] + a[2] - 1 && a[1] < b[1] + b[3] - 1 && b[1] < a[1] + a[3] - 1) overlaps += 1;
        }
    }
    check('no two overview cards overlap', boxes.length > 0 && overlaps === 0, `${overlaps} of ${boxes.length}`);

    console.log('\nFiles');
    check('Files is a tab', (await p.locator('a:has-text("Files")').count()) > 0);
    await go(p, '/settings');
    check('Settings no longer has a Documents section', (await p.locator('h3:has-text("Documents")').count()) === 0);
    await go(p, '/files');
    if (await p.locator('[data-file]').count()) {
        await p.locator('[data-file]').first().click();
        await p.waitForTimeout(600);
        const viewer = await p.locator('[data-file-viewer]').getAttribute('data-file-viewer').catch(() => '');
        check('a file opens in the viewer', !!viewer);
        await p.keyboard.press('Escape');
    } else {
        check('with no files, the tab says what goes there', (await p.locator('text=The papers you would hate to lose').count()) === 1);
    }
    await p.context().close();
}


/* ------------------------------------------------------------------ phone */
console.log('\nPhone (390×844)');
{
    const p = await page(true);
    for (const tab of ['', 'today', 'itinerary', 'map', 'places', 'stays', 'excursions', 'travel', 'guide', 'checklist', 'settings']) {
        await go(p, `/${tab}`);
        const result = await p.evaluate(() => {
            const root = document.querySelector('[data-admin-frame]') ?? document.body;
            const controls = [...root.querySelectorAll<HTMLElement>(
                'button, a, input:not([type=hidden]), select, textarea, [role=button]',
            )].filter((el) => {
                const r = el.getBoundingClientRect();
                if (!r.width || !r.height || r.right <= 0 || r.left >= innerWidth) return false;
                // Leaflet's own markers and attribution, and the closed admin drawer.
                if (el.closest('.leaflet-control-attribution, .leaflet-marker-icon, [data-admin-sidebar]')) return false;
                const style = getComputedStyle(el);
                return style.visibility !== 'hidden' && style.opacity !== '0';
            });
            const small = controls.filter((el) => {
                const r = (el.closest('label') ?? el).getBoundingClientRect();
                return r.height < 40 || r.width < 40;
            });
            return {
                overflow: document.documentElement.scrollWidth > innerWidth,
                small: small.map((el) => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30)),
            };
        });
        const name = tab || 'overview';
        check(`${name}: no sideways scroll`, !result.overflow);
        check(`${name}: every control is at least 44px`, result.small.length === 0, result.small.slice(0, 4).join(' | '));
    }
    await go(p, '/itinerary');
    check('the phone itinerary shows one day, with a day strip',
        (await p.locator('[data-strip-day]').count()) > 1 && (await p.locator('[data-day-id]').count()) === 1);
    await p.getByRole('button', { name: /Timeline/ }).first().click().catch(() => undefined);
    await p.waitForTimeout(400);
    check('the phone timeline is a vertical agenda', (await p.locator('[data-day-agenda]').count()) === 1);
    check('the bottom tab bar is there', await p.locator('[data-mobile-tabbar]').isVisible().catch(() => false));

    // Nothing inside a card may run past the edge of the screen — the page not
    // scrolling sideways is not enough, a card can clip its own contents.
    const spill = async () => p.evaluate(() => {
        const out: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>('[data-admin-frame] *, [data-sheet-panel] *')) {
            const r = el.getBoundingClientRect();
            if (!r.width || r.right <= 0 || r.left >= innerWidth) continue;
            if (el.closest('.leaflet-container, [data-admin-sidebar], .overflow-x-auto, .overflow-hidden, .truncate, [data-segmented]')) continue;
            if (r.right > innerWidth + 1) out.push(el.tagName + ' ' + (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24));
        }
        return out;
    });
    for (const tab of ['', 'itinerary', 'travel', 'files', 'settings', 'checklist']) {
        await go(p, `/${tab}`);
        const out = await spill();
        check(`${tab || 'overview'}: nothing spills past the screen edge`, out.length === 0, out.slice(0, 3).join(' | '));
    }

    await go(p, '/today');
    await p.getByRole('button', { name: /More/ }).last().click().catch(() => undefined);
    await p.waitForTimeout(400);
    check('More includes Files', (await p.locator('[data-sheet-panel] a:has-text("Files")').count()) === 1);
    await p.keyboard.press('Escape');

    await go(p, '/settings');
    const range = p.locator('[data-date-range]').first();
    check('on a touch screen the trip dates start locked', (await range.getAttribute('data-date-range')) === 'locked');
    await range.getByRole('button', { name: 'Change dates', exact: true }).click().catch(() => undefined);
    await p.waitForTimeout(200);
    check('Change dates unlocks them', (await range.getAttribute('data-date-range')) === 'editing');
    await range.getByRole('button', { name: 'Done', exact: true }).click().catch(() => undefined);
    await p.waitForTimeout(200);
    check('and Done locks them again', (await range.getAttribute('data-date-range')) === 'locked');

    await go(p, '/itinerary');
    await p.getByRole('button', { name: /Calendar/ }).first().click().catch(() => undefined);
    await p.waitForTimeout(500);
    const cells = await p.locator('[data-calendar-day]').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().right <= innerWidth));
    check('the phone calendar fits the screen', cells.length > 0 && cells.every(Boolean), `${cells.length} days`);

    await go(p, '/places');
    if (await clickFirst(p, '[data-place-row] button')) {
        await p.waitForTimeout(500);
        const handle = await p.locator('[data-sheet-handle]').boundingBox();
        if (handle) {
            await p.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
            await p.mouse.down();
            await p.mouse.move(handle.x + handle.width / 2, handle.y + 260, { steps: 8 });
            await p.mouse.up();
            await p.waitForTimeout(400);
        }
        check('pulling a panel down closes it', (await p.locator('[data-sheet-panel]').count()) === 0);
    }

    await p.context().close();
}

await browser.close();
console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed.\n`);
process.exit(failures === 0 ? 0 : 1);
