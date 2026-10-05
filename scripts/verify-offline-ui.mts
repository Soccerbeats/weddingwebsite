/**
 * The whole site with no connection, in a real browser.
 *
 *   BASE=http://10.0.0.253:3006 ADMIN_PASSWORD=… npm run check:offline:ui
 *
 * Run it against a **production build** (`next build && next start`): in dev the
 * app's code is served differently and the worker cannot save it. Needs a
 * browser, so like `check:hero` it is a manual check, not a CI gate. Its only
 * write is a to-do it tries to add *while offline*, which cannot arrive.
 *
 * What it proves: after one "Save for offline", every page in the offline lists
 * opens with the network cut — real content, not the browser's error and not
 * the "not saved yet" fallback — the offline bar shows, a link between pages
 * still works, a save attempt says it was not saved, and signing out clears it.
 */
import http from 'http';
import { chromium, type Page } from 'playwright';
import { ADMIN_PAGES, PUBLIC_PAGES } from '../src/lib/offline';

const TARGET = new URL((process.env.BASE ?? 'http://10.0.0.253:3006').replace(/\/$/, ''));

/*
 * "Offline" has to mean the server cannot be reached. Playwright's offline
 * switch does not apply to a service worker's own requests in Chromium, so a
 * test that only flips it would pass with the network still there. Instead the
 * browser talks to this little proxy, and going offline makes the proxy drop
 * every connection — exactly what losing signal looks like to the phone.
 */
let reachable = true;
const proxy = http.createServer((req, res) => {
    if (!reachable) { req.socket.destroy(); return; }
    const upstream = http.request({
        host: TARGET.hostname, port: TARGET.port || 80, method: req.method, path: req.url,
        headers: { ...req.headers, host: TARGET.host },
    }, (reply) => { res.writeHead(reply.statusCode ?? 502, reply.headers); reply.pipe(res); });
    upstream.on('error', () => { res.destroy(); });
    req.pipe(upstream);
});
await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
const BASE = `http://localhost:${(proxy.address() as { port: number }).port}`;
const goOffline = async (ctx: { setOffline: (v: boolean) => Promise<void> }, offline: boolean) => {
    reachable = !offline;
    await ctx.setOffline(offline);
};
const PASSWORD = process.env.ADMIN_PASSWORD ?? '';
let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail = '') {
    checks += 1;
    if (!ok) failures += 1;
    console.log(`${ok ? '  ✓' : '  ✗'} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
}
if (!PASSWORD) { console.error('Set ADMIN_PASSWORD.'); process.exit(2); }

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const login = await context.request.post(`${BASE}/api/auth/login`, { data: { password: PASSWORD } });
if (!login.ok()) { console.error(`login failed: ${login.status()}`); process.exit(2); }
const p: Page = await context.newPage();

console.log('\nSaving');
await p.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
await p.evaluate(async () => { await navigator.serviceWorker.ready; });
// Reload once so the page is controlled by the worker it just installed.
await p.reload({ waitUntil: 'networkidle' });
check('the page is controlled by the site worker',
    await p.evaluate(() => navigator.serviceWorker.controller?.scriptURL.endsWith('/sw.js') ?? false));
await p.locator('[data-offline-status] button').click();
const started = Date.now();
await p.locator('[data-offline-status][data-phase="done"], [data-offline-status][data-phase="failed"]')
    .waitFor({ timeout: 10 * 60_000 });
check('saving for offline finished', (await p.locator('[data-offline-status]').getAttribute('data-phase')) === 'done');
console.log(`    (saved in ${Math.round((Date.now() - started) / 1000)}s)`);
const counts = await p.evaluate(async () => {
    const out: Record<string, number> = {};
    for (const name of await caches.keys()) out[name] = (await (await caches.open(name)).keys()).length;
    return out;
});
console.log(`    ${JSON.stringify(counts)}`);
check('every page is saved', (counts['site-pages-v1'] ?? 0) >= PUBLIC_PAGES.length + ADMIN_PAGES.length,
    String(counts['site-pages-v1']));
check('the app code is saved', (counts['site-static-v1'] ?? 0) > 20, String(counts['site-static-v1']));
check('page data is saved', (counts['site-data-v1'] ?? 0) > 10, String(counts['site-data-v1']));

console.log('\nWith the network cut');
await goOffline(context, true);
const bodyOf = async () => p.evaluate(() => ({
    text: document.body.innerText.trim(),
    fallback: !!document.querySelector('h1') && /You.re offline/.test(document.querySelector('h1')?.textContent ?? ''),
}));
for (const path of [...PUBLIC_PAGES, ...ADMIN_PAGES]) {
    if (path === '/offline') continue;
    let ok = false;
    let detail = '';
    try {
        const response = await p.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 30_000 });
        await p.waitForTimeout(1500);
        const body = await bodyOf();
        ok = !!response && response.status() < 500 && !body.fallback && body.text.length > 120;
        detail = `${response?.status()} ${body.fallback ? 'fallback page' : `${body.text.length} chars`}`;
    } catch (error) {
        detail = (error as Error).message.slice(0, 80);
    }
    check(`${path} opens offline`, ok, detail);
}
await p.goto(`${BASE}/admin/honeymoon`, { waitUntil: 'load' });
await p.waitForTimeout(1500);
check('the offline bar shows', await p.locator('[data-offline-banner]').isVisible().catch(() => false));
check('the honeymoon data is there, not an empty shell',
    (await p.locator('text=/\\d+ places/').count()) > 0);

await p.goto(`${BASE}/`, { waitUntil: 'load' });
await p.waitForTimeout(1000);
const link = p.locator('a[href="/schedule"]').first();
if (await link.count()) {
    await link.click();
    await p.waitForTimeout(3000);
    check('a link between pages works offline', new URL(p.url()).pathname === '/schedule'
        && (await bodyOf()).text.length > 120);
}

await p.goto(`${BASE}/admin/honeymoon/checklist`, { waitUntil: 'load' });
await p.waitForTimeout(1500);
const box = p.locator('input[placeholder^="Renew passports"]').first();
if (await box.count()) {
    await box.fill('Written offline — must not arrive');
    await p.getByRole('button', { name: 'Add', exact: true }).first().click();
    await p.waitForTimeout(1200);
    check('a save offline says it was not saved', (await p.locator("text=/offline — this wasn.t saved/").count()) > 0);
}

console.log('\nSigning out');
await goOffline(context, false);
await p.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
const left = await p.evaluate(async () => {
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Logout');
    button?.click();
    await new Promise((r) => setTimeout(r, 2500));
    const out: string[] = [];
    for (const name of await caches.keys()) {
        for (const key of await (await caches.open(name)).keys()) {
            const path = new URL(key.url).pathname;
            // The public config the login page itself reloads is fine; nothing private may stay.
            if (path.startsWith('/admin') || (path.startsWith('/api/admin/') && path !== '/api/admin/site-config')) out.push(path);
        }
    }
    return out;
});
check('signing out clears every saved admin page and its data', left.length === 0, left.slice(0, 5).join(', '));

await browser.close();
proxy.close();
console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed.\n`);
process.exit(failures === 0 ? 0 : 1);
