/**
 * The offline service worker's rules, without a browser.
 *
 *   npm run check:offline
 *
 * `public/sw.js` is plain JavaScript (a worker cannot import the app's
 * TypeScript), so its decisions are written as pure functions and loaded here
 * in a sandbox: which strategy each request gets, which responses may be saved,
 * when the saved copy is stale. Also checks that every page in `src/app` is in
 * the offline page list, or deliberately left out of it.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { ADMIN_PAGES, EXCLUDED_PAGES, PUBLIC_PAGES, isWarmStale } from '../src/lib/offline';

let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail = '') {
    checks += 1;
    if (!ok) failures += 1;
    console.log(`${ok ? '  ✓' : '  ✗'} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
}

const sandbox: { module: { exports: Record<string, (...args: never[]) => unknown> }; URL: typeof URL } = { module: { exports: {} }, URL };
vm.runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), sandbox);
const sw = sandbox.module.exports as unknown as {
    routeFor: (req: { url: string; method?: string; mode?: string; rsc?: boolean; accept?: string; nested?: boolean }, origin: string) => string;
    isCacheablePage: (requestUrl: string, res: { status: number; redirected: boolean; url: string; contentType: string }) => boolean;
    isCacheableData: (res: { status: number; redirected: boolean }) => boolean;
    redirectTarget: (requestUrl: string, res: { status: number; redirected: boolean; url: string; contentType: string }) => string | null;
    isStale: (record: { at: number; buildId: string } | null, buildId: string, now: number) => boolean;
    OFFLINE_WRITE_MESSAGE: string;
};

const O = 'https://example.com';
console.log('\nWhich strategy a request gets');
check('a page load is a page', sw.routeFor({ url: `${O}/admin/rsvps`, mode: 'navigate' }, O) === 'page');
check('the app code is static', sw.routeFor({ url: `${O}/_next/static/chunks/abc.js` }, O) === 'static');
check('a client navigation (RSC) is network-only', sw.routeFor({ url: `${O}/about?_rsc=1x2`, rsc: true }, O) === 'rsc');
check('page data is data', sw.routeFor({ url: `${O}/api/admin/finances` }, O) === 'data');
check('a photo is a photo', sw.routeFor({ url: `${O}/api/photos/a.jpg/thumb` }, O) === 'photo');
check('signing in is never saved', sw.routeFor({ url: `${O}/api/auth/check` }, O) === 'network');
check('the offline manifest is never saved', sw.routeFor({ url: `${O}/api/offline/manifest` }, O) === 'network');
check('the connection probe always asks the server', sw.routeFor({ url: `${O}/api/offline/ping` }, O) === 'network');
check('the worker itself is never saved', sw.routeFor({ url: `${O}/sw.js` }, O) === 'network');
check('another site is left alone', sw.routeFor({ url: 'https://tile.openstreetmap.org/1/1/1.png' }, O) === 'passthrough');
check('a write goes to the network', sw.routeFor({ url: `${O}/api/rsvp`, method: 'POST' }, O) === 'write');
check('a write from the hidden warm-up frame is refused',
    sw.routeFor({ url: `${O}/api/admin/honeymoon/weather`, method: 'POST', nested: true }, O) === 'block-write');
check('a GET from the warm-up frame is still saved', sw.routeFor({ url: `${O}/api/admin/honeymoon`, nested: true }, O) === 'data');
check('an icon is an asset', sw.routeFor({ url: `${O}/api/app-icon?size=192` }, O) === 'data'
    || sw.routeFor({ url: `${O}/favicon.ico` }, O) === 'asset');
check('the favicon is an asset', sw.routeFor({ url: `${O}/favicon.ico` }, O) === 'asset');

console.log('\nWhat may be saved');
const html = 'text/html; charset=utf-8';
check('a page that loaded is saved',
    sw.isCacheablePage(`${O}/admin`, { status: 200, redirected: false, url: `${O}/admin`, contentType: html }));
check('a page that redirected (to the login) is not',
    !sw.isCacheablePage(`${O}/admin`, { status: 200, redirected: true, url: `${O}/admin/login`, contentType: html }));
check('a page that came back as another path is not',
    !sw.isCacheablePage(`${O}/rsvp`, { status: 200, redirected: false, url: `${O}/work-in-progress`, contentType: html }));
check('an error page is not', !sw.isCacheablePage(`${O}/x`, { status: 500, redirected: false, url: `${O}/x`, contentType: html }));
check('a JSON body is not saved as a page',
    !sw.isCacheablePage(`${O}/x`, { status: 200, redirected: false, url: `${O}/x`, contentType: 'application/json' }));
check('a page that redirects is saved as the redirect (/admin → the dashboard)',
    sw.redirectTarget(`${O}/admin`, { status: 200, redirected: true, url: `${O}/admin/dashboard`, contentType: html }) === '/admin/dashboard');
check('/about → the home page is kept too',
    sw.redirectTarget(`${O}/about`, { status: 200, redirected: true, url: `${O}/`, contentType: html }) === '/');
check('a redirect to the login is never kept',
    sw.redirectTarget(`${O}/admin/rsvps`, { status: 200, redirected: true, url: `${O}/admin/login?next=/admin/rsvps`, contentType: html }) === null);
check('a page that did not redirect has no redirect',
    sw.redirectTarget(`${O}/rsvp`, { status: 200, redirected: false, url: `${O}/rsvp`, contentType: html }) === null);
check('a redirect to another site is never kept',
    sw.redirectTarget(`${O}/x`, { status: 200, redirected: true, url: 'https://evil.example/x', contentType: html }) === null);
check('data that loaded is saved', sw.isCacheableData({ status: 200, redirected: false }));
check('a refused request (401) is not', !sw.isCacheableData({ status: 401, redirected: false }));

console.log('\nWhen the saved copy is stale');
const now = Date.UTC(2026, 9, 5, 12);
check('never saved is stale', sw.isStale(null, 'b1', now));
check('saved from an older build is stale', sw.isStale({ at: now - 60_000, buildId: 'b0' }, 'b1', now));
check('saved 13 hours ago is stale', sw.isStale({ at: now - 13 * 3600_000, buildId: 'b1' }, 'b1', now));
check('saved an hour ago from this build is fresh', !sw.isStale({ at: now - 3600_000, buildId: 'b1' }, 'b1', now));
for (const [label, record] of [['none', null], ['old build', { at: now - 60_000, buildId: 'b0' }],
    ['13h', { at: now - 13 * 3600_000, buildId: 'b1' }], ['1h', { at: now - 3600_000, buildId: 'b1' }]] as const) {
    check(`the page and the worker agree on staleness (${label})`,
        isWarmStale(record, 'b1', now) === sw.isStale(record, 'b1', now));
}
check('the offline message says what happened and what to do',
    /offline/i.test(sw.OFFLINE_WRITE_MESSAGE) && /wasn.t saved/i.test(sw.OFFLINE_WRITE_MESSAGE));

console.log('\nEvery page is in the offline list');
const pages: string[] = [];
const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === 'page.tsx') {
            const route = '/' + path.relative('src/app', path.dirname(full)).split(path.sep).filter(Boolean).join('/');
            pages.push(route === '/' ? '/' : route.replace(/\/$/, ''));
        }
    }
};
walk('src/app');
const listed = new Set<string>([...PUBLIC_PAGES, ...ADMIN_PAGES, ...EXCLUDED_PAGES]);
const missing = pages.filter((page) => !listed.has(page));
check('no page is missing from the lists', missing.length === 0, missing.join(', '));
const stale = [...listed].filter((page) => !pages.includes(page));
check('no listed page has been removed', stale.length === 0, stale.join(', '));

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed.\n`);
process.exit(failures === 0 ? 0 : 1);
