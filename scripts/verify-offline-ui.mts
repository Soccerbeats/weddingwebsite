/**
 * The whole site with no connection, in a real browser.
 *
 *   BASE=http://10.0.0.253:3006 ADMIN_PASSWORD=… npm run check:offline:ui
 *
 * Run it against a **production build** (`next build && next start`): in dev the
 * app's code is served differently and the worker cannot save it. Needs a
 * browser, so like `check:hero` it is a manual check, not a CI gate. It writes
 * four to-dos (deleted again), the trip's title and the schedule subtitle (both
 * put back).
 *
 * What it proves: after one "Save for offline", every page in the offline lists
 * opens with the network cut — real content, not the browser's error and not
 * the "not saved yet" fallback — the offline bar shows, a link between pages
 * still works, the map keeps the tiles it showed, and the photo library's
 * unused photos were never saved. Then
 * editing offline: a to-do added with no connection shows at once and survives
 * reopening the page, a create-then-edit chain made offline reaches the server
 * with real ids once the connection is back, something that cannot wait (a
 * share link) still says it was not saved, and a save that reached the server
 * but lost its answer on the way back is applied once, not twice. Then the installed app, opened after
 * the server changed, brings its saved copy up to date on its own. Finally,
 * signing out clears every saved admin page.
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
/**
 * A path whose next writes reach the server but whose answers are lost on the
 * way back. Several, because the browser quietly retries a request cut off like
 * that on its own (Chromium twice, with the same outbox key, so the server
 * answers each retry from the first time); only when those are lost too does it
 * become the outbox's job.
 */
let loseAnswerFor: string | null = null;
let answersToLose = 0;
const proxy = http.createServer((req, res) => {
    if (!reachable) { req.socket.destroy(); return; }
    if (loseAnswerFor && answersToLose > 0 && req.method === 'POST' && req.url === loseAnswerFor) {
        answersToLose -= 1;
        const upstream = http.request({
            host: TARGET.hostname, port: TARGET.port || 80, method: req.method, path: req.url,
            headers: { ...req.headers, host: TARGET.host },
        }, (reply) => { reply.resume(); reply.on('end', () => req.socket.destroy()); });
        upstream.on('error', () => req.socket.destroy());
        req.pipe(upstream);
        return;
    }
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

{
    // Only the photos the site shows: the gallery's hearted ones (every one, not
    // just the first screenful) — never the rest of the library.
    const library = await (await context.request.get(`${BASE}/api/admin/photos`)).json() as { photos: { filename: string; hearted?: boolean }[] };
    const config = JSON.stringify(await (await context.request.get(`${BASE}/api/admin/site-config`)).json());
    const savedPhotos = await p.evaluate(async () => (await (await caches.open('site-photos-v1')).keys()).map((k) => decodeURIComponent(new URL(k.url).pathname)));
    const shown = library.photos.filter((photo) => photo.hearted).map((photo) => photo.filename);
    const unused = library.photos.filter((photo) => !photo.hearted && !config.includes(photo.filename)).map((photo) => photo.filename);
    const has = (name: string) => savedPhotos.some((path) => path.endsWith(`/${name}`));
    if (shown.length) check(`every gallery photo is saved (${shown.length})`, shown.every(has), shown.filter((n) => !has(n)).join(', '));
    if (unused.length) check(`no unused library photo is saved (${unused.length} unused)`, !unused.some(has), unused.filter(has).join(', '));
}

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

{
    // Map tiles come from OpenStreetMap: the ones the map showed are kept.
    await p.goto(`${BASE}/admin/honeymoon/map`, { waitUntil: 'load' });
    await p.waitForTimeout(4000);
    const tiles = await p.evaluate(() => [...document.querySelectorAll('img.leaflet-tile')]
        .filter((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0).length);
    check('the map still has its tiles offline (the ones it showed before)', tiles > 0, `${tiles} tiles drawn`);
}

console.log('\nEditing offline');
const stamp = Date.now().toString(36);
const typed = `Written offline ${stamp}`;
// A to-do's text is drawn in an editable field, so look in fields as well as text.
const onPage = (text: string) => p.evaluate((wanted) => document.body.innerText.includes(wanted)
    || [...document.querySelectorAll('input, textarea')].some((el) => (el as HTMLInputElement).value === wanted), text);
await p.goto(`${BASE}/admin/honeymoon/checklist`, { waitUntil: 'load' });
await p.waitForTimeout(1500);
const box = p.locator('input[placeholder^="Renew passports"]').first();
check('the checklist opens offline with its add box', (await box.count()) > 0);
if (await box.count()) {
    await box.fill(typed);
    await p.getByRole('button', { name: 'Add', exact: true }).first().click();
    await p.waitForTimeout(1200);
    check('a to-do added offline shows at once', await onPage(typed));
    check('nothing says it was not saved', (await p.locator("text=/wasn.t saved/").count()) === 0);
    check('the bar says one change is waiting',
        (await p.locator('[data-offline-banner]').getAttribute('data-pending').catch(() => null)) === '1');
    await p.reload({ waitUntil: 'load' });
    await p.waitForTimeout(2000);
    check('…and it is still there after reopening the page offline', await onPage(typed));
}
// Create, then edit what was created — the edit has only the temporary id.
const chain = await p.evaluate(async (text) => {
    const made = await fetch('/api/admin/honeymoon/todos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
    });
    const row = await made.json();
    const ticked = await fetch('/api/admin/honeymoon/todos', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, done: true }),
    });
    const many = await fetch('/api/admin/honeymoon/todos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ text: `${text} A` }]),
    });
    const share = await fetch('/api/admin/honeymoon/shares', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'x', scope: 'today' }),
    });
    return {
        status: made.status, id: row.id, queued: row.queued, ticked: ticked.status,
        many: (await many.json()).created?.[0]?.id, share: share.status, shareBody: await share.text(),
    };
}, `Chained ${stamp}`);
// A site setting — the path most of the admin's content pages save through.
const subtitle = `Subtitle ${stamp}`;
const config = await p.evaluate(async (value) => {
    const before = (await (await fetch('/api/admin/site-config')).json()).scheduleSubtitle ?? '';
    await fetch('/api/admin/site-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scheduleSubtitle: value }),
    });
    const now = (await (await fetch('/api/admin/site-config')).json()).scheduleSubtitle;
    return { before, now };
}, subtitle);
check('a site setting changed offline shows straight away', config.now === subtitle, JSON.stringify(config));
check('a create offline is answered with a temporary id', chain.status === 202 && chain.queued === true && chain.id < 0, JSON.stringify(chain));
check('an edit of it is accepted too', chain.ticked === 202);
check('creating several at once hands back temporary ids', typeof chain.many === 'number' && chain.many < 0);
check('a share link (needs the server) still says it was not saved',
    chain.share === 503 && /wasn.t saved/.test(chain.shareBody));

await goOffline(context, false);
await p.reload({ waitUntil: 'load' });
// Sending starts a moment after the page settles; wait for the last write to land.
type Todos = { todos: { id: number; text: string; done: boolean }[] };
let after: Todos = { todos: [] };
for (let waited = 0; waited < 90; waited += 2) {
    after = await (await context.request.get(`${BASE}/api/admin/honeymoon`)).json() as Todos;
    if (after.todos.some((todo) => todo.text === `Chained ${stamp} A`)) break;
    await p.waitForTimeout(2000);
}
await p.locator('[data-offline-banner]').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);
check('back online, the waiting changes are sent and the bar goes',
    (await p.locator('[data-offline-banner]').count()) === 0
    && after.todos.some((todo) => todo.text === `Chained ${stamp} A`));
const landed = after.todos.filter((todo) => todo.text.includes(stamp));
const find = (text: string) => landed.find((todo) => todo.text === text);
check('the to-do typed offline is on the server', !!find(typed));
check('the created-then-ticked one arrived ticked, under a real id',
    find(`Chained ${stamp}`)?.done === true && (find(`Chained ${stamp}`)?.id ?? 0) > 0);
check('the one from the batch arrived', !!find(`Chained ${stamp} A`));
check('each arrived exactly once', landed.length === 3, landed.map((t) => t.text).join(' | '));
check('it shows on the page with its real id (no temporary ids left)',
    await onPage(typed)
    && await p.evaluate(async () => (await (await fetch('/api/admin/honeymoon')).json()).todos.every((t: { id: number }) => t.id > 0)));
const serverConfig = await (await context.request.get(`${BASE}/api/admin/site-config`)).json() as { scheduleSubtitle?: string };
check('the site setting reached the server', serverConfig.scheduleSubtitle === subtitle);
await context.request.post(`${BASE}/api/admin/site-config`, { data: { scheduleSubtitle: config.before } });
for (const todo of landed) await context.request.delete(`${BASE}/api/admin/honeymoon/todos?id=${todo.id}`);

console.log('\nA save that landed but lost its answer is not made twice');
{
    const text = `Lost answer ${stamp}`;
    loseAnswerFor = '/api/admin/honeymoon/todos';
    answersToLose = 10;
    const status = await p.evaluate(async (value) => (await fetch('/api/admin/honeymoon/todos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: value }),
    })).status, text);
    check('with no answer, the page is told it was kept for later', status === 202, String(status));
    loseAnswerFor = null;
    // Send the outbox now (normally: the next open, or the connection coming back).
    await p.evaluate(async () => { (await navigator.serviceWorker.ready).active?.postMessage({ type: 'site-sw:flush' }); });
    let rows: { id: number; text: string }[] = [];
    for (let waited = 0; waited < 30; waited += 1) {
        await p.waitForTimeout(1000);
        const pending = await p.evaluate(`new Promise((res) => { const r = indexedDB.open('site-outbox', 1); r.onsuccess = () => { const g = r.result.transaction('writes').objectStore('writes').count(); g.onsuccess = () => res(g.result); }; })`);
        if (pending === 0) break;
    }
    rows = ((await (await context.request.get(`${BASE}/api/admin/honeymoon`)).json()) as Todos).todos.filter((todo) => todo.text === text);
    check('the server applied it exactly once', rows.length === 1, `${rows.length} rows`);
    for (const row of rows) await context.request.delete(`${BASE}/api/admin/honeymoon/todos?id=${row.id}`);
}

console.log('\nThe installed app picks up changes on the server by itself');
{
    const before = await (await context.request.get(`${BASE}/api/admin/honeymoon`)).json() as { trip: { title: string } };
    const title = `Trip ${stamp}`;
    await context.request.patch(`${BASE}/api/admin/honeymoon/trip`, { data: { title } });
    // Postgres publishes its write counts within about ten seconds.
    await new Promise((resolve) => setTimeout(resolve, 12_000));
    const app = await context.newPage();
    // As text: the script runner would otherwise wrap the function in a helper the page lacks.
    await app.addInitScript({ content: "Object.defineProperty(navigator, 'standalone', { get: () => true })" });
    await app.goto(`${BASE}/admin/dashboard`, { waitUntil: 'load' });
    const server = await (await context.request.get(`${BASE}/api/offline/manifest`)).json() as { data: string };
    const deadline = Date.now() + 5 * 60_000;
    let record: { data?: string } | null = null;
    while (Date.now() < deadline) {
        record = await app.evaluate(() => JSON.parse(localStorage.getItem('site-offline-saved') || 'null'));
        if (record?.data === server.data) break;
        await app.waitForTimeout(2000);
    }
    check('opening the app refreshed the saved copy to match the server', record?.data === server.data,
        `${record?.data} vs ${server.data}`);
    await goOffline(context, true);
    const seen = await app.evaluate(async () => (await (await fetch('/api/admin/honeymoon')).json()).trip.title);
    check('offline, the saved copy has the change', seen === title, String(seen));
    await goOffline(context, false);
    await context.request.patch(`${BASE}/api/admin/honeymoon/trip`, { data: { title: before.trip.title } });
    await app.close();
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
