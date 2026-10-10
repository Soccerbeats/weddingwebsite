/**
 * The offline service worker's rules, without a browser.
 *
 *   npm run check:offline
 *
 * `public/sw.js` is plain JavaScript (a worker cannot import the app's
 * TypeScript), so its decisions are written as pure functions and loaded here
 * in a sandbox: which strategy each request gets, which responses may be saved,
 * when the saved copy is stale, which edits may wait in the outbox and how their
 * temporary ids are swapped for real ones. Then the honeymoon overlay — an
 * edit made offline applied to the saved payload as the server will apply it.
 * Also checks that every page in `src/app` is in the offline page list, or
 * deliberately left out of it.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { ADMIN_PAGES, EXCLUDED_PAGES, PUBLIC_PAGES, isWarmStale, updateNeeded } from '../src/lib/offline';
import { applyQueuedWrites, type QueuedWrite } from '../src/lib/honeymoonOffline';
import type { HoneymoonPayload } from '../src/lib/honeymoon';
import { once } from '../src/lib/outboxReplay';

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
    routeFor: (req: { url: string; method?: string; mode?: string; rsc?: boolean; accept?: string; nested?: boolean; destination?: string }, origin: string) => string;
    isCacheablePage: (requestUrl: string, res: { status: number; redirected: boolean; url: string; contentType: string }) => boolean;
    isCacheableData: (res: { status: number; redirected: boolean }) => boolean;
    redirectTarget: (requestUrl: string, res: { status: number; redirected: boolean; url: string; contentType: string }) => string | null;
    isStale: (record: { at: number; buildId: string } | null, buildId: string, now: number) => boolean;
    OFFLINE_WRITE_MESSAGE: string;
    isQueueable: (req: { url: string; method?: string; contentType?: string }, origin: string) => boolean;
    tempIdCount: (method: string, body: unknown) => number;
    queuedResponseBody: (method: string, body: unknown, tempIds: number[]) => Record<string, unknown>;
    remapIds: (value: unknown, map: Record<string, number>) => unknown;
    remapUrl: (path: string, map: Record<string, number>, origin?: string) => string;
    createdIds: (body: unknown) => (number | null)[];
    outcomeFor: (status: number, attempts: number) => string;
    mergeSiteConfig: (config: Record<string, unknown>, bodies: unknown[]) => Record<string, unknown>;
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
check('another site is left alone', sw.routeFor({ url: 'https://example.org/api/data' }, O) === 'passthrough');
check('another site\'s picture (a map tile, a hotel photo) is kept as seen',
    sw.routeFor({ url: 'https://tile.openstreetmap.org/1/1/1.png', destination: 'image' }, O) === 'remote-image');
check('another site\'s script is left alone',
    sw.routeFor({ url: 'https://cdn.example.org/x.js', destination: 'script' }, O) === 'passthrough');
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

console.log('\nWhich edits wait in the outbox');
const json = 'application/json';
check('an admin edit (JSON) is queued',
    sw.isQueueable({ url: `${O}/api/admin/honeymoon/stops`, method: 'PATCH', contentType: json }, O));
check('a delete with no body is queued',
    sw.isQueueable({ url: `${O}/api/admin/honeymoon/places?id=4`, method: 'DELETE' }, O));
check('a site setting is queued', sw.isQueueable({ url: `${O}/api/admin/site-config`, method: 'POST', contentType: json }, O));
check('a guest-list edit is queued', sw.isQueueable({ url: `${O}/api/admin/guest-list`, method: 'PUT', contentType: json }, O));
check('a read is never queued', !sw.isQueueable({ url: `${O}/api/admin/honeymoon`, method: 'GET' }, O));
check('an upload is not queued',
    !sw.isQueueable({ url: `${O}/api/admin/photos`, method: 'POST', contentType: 'multipart/form-data; boundary=x' }, O));
check('a weather lookup is not queued',
    !sw.isQueueable({ url: `${O}/api/admin/honeymoon/weather`, method: 'POST', contentType: json }, O));
check('a route lookup is not queued',
    !sw.isQueueable({ url: `${O}/api/admin/honeymoon/routes`, method: 'POST', contentType: json }, O));
check('a share link (needs the server\'s token) is not queued',
    !sw.isQueueable({ url: `${O}/api/admin/honeymoon/shares`, method: 'POST', contentType: json }, O));
check('restoring an archive is not queued',
    !sw.isQueueable({ url: `${O}/api/admin/honeymoon/archives?id=2`, method: 'POST', contentType: json }, O));
check('a guest\'s RSVP is not queued', !sw.isQueueable({ url: `${O}/api/rsvp`, method: 'POST', contentType: json }, O));
check('signing in is not queued', !sw.isQueueable({ url: `${O}/api/auth/login`, method: 'POST', contentType: json }, O));
check('another site is not queued',
    !sw.isQueueable({ url: 'https://evil.example/api/admin/x', method: 'POST', contentType: json }, O));

console.log('\nThe stand-in answer and temporary ids');
check('a POST of one row gets one id', sw.tempIdCount('POST', { name: 'x' }) === 1);
check('a POST of three rows gets three', sw.tempIdCount('POST', [{}, {}, {}]) === 3);
check('a PATCH creates nothing', sw.tempIdCount('PATCH', { id: 1 }) === 0);
const single = sw.queuedResponseBody('POST', { name: 'Villa' }, [-5]);
check('a created row comes back with its temporary id', single.id === -5 && single.name === 'Villa' && single.queued === true);
const many = sw.queuedResponseBody('POST', [{ a: 1 }, { a: 2 }], [-5, -6]) as { created: { id: number; a: number }[] };
check('created rows come back as `created`, like the server',
    many.created.length === 2 && many.created[1].id === -6 && many.created[1].a === 2);
check('an edit comes back as success', sw.queuedResponseBody('PATCH', { id: 1 }, []).success === true);

console.log('\nSwapping temporary ids for real ones');
const T = -1791234567890000;
const map = { [String(T)]: 41, [String(T - 1)]: 42 };
const remapped = sw.remapIds({ day_id: 3, place_id: T, cost: -12.5, lat: -8.6, ids: [T, 7, T - 1] }, map) as Record<string, unknown>;
check('a reference to a created row is rewritten', remapped.place_id === 41);
check('an array of ids is rewritten', JSON.stringify(remapped.ids) === '[41,7,42]');
check('ordinary negative numbers are left alone', remapped.cost === -12.5 && remapped.lat === -8.6);
check('a real id is left alone', remapped.day_id === 3);
check('a reorder body is rewritten', JSON.stringify(sw.remapIds([{ id: T }, { id: 2 }], map)) === '[{"id":41},{"id":2}]');
check('?id= in a delete is rewritten', sw.remapUrl(`/api/admin/honeymoon/places?id=${T}`, map) === '/api/admin/honeymoon/places?id=41');
check('?ids= is rewritten', decodeURIComponent(sw.remapUrl(`/api/admin/honeymoon/stops?ids=${T},9`, map)) === '/api/admin/honeymoon/stops?ids=41,9');
check('an unknown temporary id stays as it was',
    sw.remapUrl('/api/admin/honeymoon/places?id=-5', map) === '/api/admin/honeymoon/places?id=-5');
check('a created row\'s id is read back', JSON.stringify(sw.createdIds({ id: 41, name: 'x' })) === '[41]');
check('created rows\' ids are read back in order', JSON.stringify(sw.createdIds({ success: true, created: [{ id: 5 }, { id: 6 }] })) === '[5,6]');

console.log('\nWhat a failed send means');
check('a 2xx is sent', sw.outcomeFor(200, 1) === 'sent');
check('a 401 waits for you to sign in', sw.outcomeFor(401, 1) === 'login');
check('a 502 (server restarting) is retried later', sw.outcomeFor(502, 9) === 'retry');
check('a 429 is retried later', sw.outcomeFor(429, 1) === 'retry');
check('a 500 is retried twice, then set aside', sw.outcomeFor(500, 1) === 'retry' && sw.outcomeFor(500, 3) === 'failed');
check('a 400 is set aside at once (the server said no)', sw.outcomeFor(400, 1) === 'failed');
check('a 404 is set aside', sw.outcomeFor(404, 1) === 'failed');

console.log('\nThe outbox sent in order, against a pretend server');
{
    // Create a place, then a stop at it, then rename the place, then delete it —
    // all offline. The server hands out real ids; every later write must use them.
    const queue: { method: string; url: string; body: unknown; tempIds: number[] }[] = [];
    const add = (method: string, url: string, body: unknown) => {
        const ids = Array.from({ length: sw.tempIdCount(method, body) }, (_, i) => T - 10 - queue.length * 10 - i);
        queue.push({ method, url, body, tempIds: ids });
        return sw.queuedResponseBody(method, body, ids);
    };
    const place = add('POST', '/api/admin/honeymoon/places', { name: 'Warung' }) as { id: number };
    add('POST', '/api/admin/honeymoon/stops', { day_id: 2, place_id: place.id });
    add('PATCH', '/api/admin/honeymoon/places', { id: place.id, name: 'Warung Babi' });
    add('DELETE', `/api/admin/honeymoon/places?id=${place.id}`, null);
    const ids: Record<string, number> = {};
    const seen: string[] = [];
    let nextId = 500;
    for (const write of queue) {
        const url = sw.remapUrl(write.url, ids);
        const body = sw.remapIds(write.body, ids);
        seen.push(`${write.method} ${url} ${JSON.stringify(body)}`);
        if (write.method === 'POST') {
            const answer = { ...(body as object), id: nextId++ };
            sw.createdIds(answer).forEach((real, index) => { if (real != null) ids[String(write.tempIds[index])] = real; });
        }
    }
    check('the place is created first', seen[0] === 'POST /api/admin/honeymoon/places {"name":"Warung"}');
    check('the stop points at the place\'s real id', seen[1].includes('"place_id":500'));
    check('the rename uses the real id', seen[2].includes('"id":500'));
    check('the delete uses the real id', seen[3] === 'DELETE /api/admin/honeymoon/places?id=500 null');
    check('no temporary id reaches the server', !seen.some((line) => /-\d{12,}/.test(line)), seen.join(' | '));
}

console.log('\nA write sent twice is applied once (the server side)');
{
    let runs = 0;
    const handler = async () => { runs += 1; return Response.json({ id: 100 + runs }); };
    const req = (key?: string) => new Request('http://x/api/admin/honeymoon/todos', {
        method: 'POST', headers: key ? { 'X-Outbox-Key': key } : {},
    });
    const first = await once(req('k1'), handler);
    const again = await once(req('k1'), handler);
    check('the repeat does not run the handler again', runs === 1);
    check('…and gets the first answer back', (await again.json()).id === (await first.json()).id);
    check('…marked as a replay', again.headers.get('X-Outbox-Replayed') === '1');
    await once(req('k2'), handler);
    check('a different key is a different write', runs === 2);
    await once(req(), handler);
    await once(req(), handler);
    check('a write with no key always runs', runs === 4);
    const both = await Promise.all([once(req('k3'), handler), once(req('k3'), handler)]);
    check('two at once with the same key run once', runs === 5
        && (await both[0].json()).id === (await both[1].json()).id);
    let failing = 0;
    const broken = async () => { failing += 1; return Response.json({ error: 'no' }, { status: 500 }); };
    await once(req('k4'), broken);
    await once(req('k4'), broken);
    check('a failed answer is not kept, so a resend really is tried again', failing === 2);
}

console.log('\nSite settings edited offline');
const merged = sw.mergeSiteConfig({ coupleNames: 'A & B', pageBgColors: { home: '#fff', registry: '#000' } },
    [{ coupleNames: 'A & C' }, { pageBgColors: { home: '#eee' } }]);
check('later edits win', merged.coupleNames === 'A & C');
check('page colours merge one level down, as the route does',
    JSON.stringify(merged.pageBgColors) === '{"home":"#eee","registry":"#000"}');

console.log('\nWhen the installed app refreshes its saved copy');
const server = { buildId: 'b1', data: 'd1', admin: true };
check('nothing saved: save everything', updateNeeded(null, server, now) === 'full');
check('a new release: save everything', updateNeeded({ at: now, buildId: 'b0', data: 'd1', admin: true }, server, now) === 'full');
check('signed in, but the copy was saved signed out: save everything',
    updateNeeded({ at: now, buildId: 'b1', data: 'd1', admin: false }, server, now) === 'full');
check('something on the server changed: refresh the data',
    updateNeeded({ at: now, buildId: 'b1', data: 'd0', admin: true }, server, now) === 'data');
check('a copy saved before fingerprints existed: refresh the data',
    updateNeeded({ at: now, buildId: 'b1', admin: true }, server, now) === 'data');
check('over twelve hours old: refresh the data',
    updateNeeded({ at: now - 13 * 3600_000, buildId: 'b1', data: 'd1', admin: true }, server, now) === 'data');
check('nothing changed: nothing to do', updateNeeded({ at: now - 60_000, buildId: 'b1', data: 'd1', admin: true }, server, now) === null);

console.log('\nThe honeymoon portal, edited offline');
{
    const base = {
        trip: { id: 1, title: 'Bali', start_date: '2026-11-01', end_date: '2026-11-04', home_currency: 'USD', notes: null,
            focus_country: '', budget: null, partner_names: '', info: {}, time_format: '24h', distance_unit: 'km', phase: 'planning' },
        categories: [{ id: 1, key: 'misc', label: 'Other', color: '#6b7280', icon: '●', sort_order: 0 },
            { id: 2, key: 'beach', label: 'Beach', color: '#f59e0b', icon: '🏝️', sort_order: 1 }],
        regions: [{ id: 1, name: 'Ubud', country: 'Indonesia', description: null, center_lat: null, center_lng: null, sort_order: 0, boundary: null }],
        places: [
            { id: 10, name: 'Villa', category: 'stay', region_id: 1, status: 'booked', photos: [], links: [], sort_order: 0 },
            { id: 11, name: 'Beach', category: 'beach', region_id: 1, status: 'idea', photos: [], links: [], sort_order: 1 },
        ],
        days: [
            { id: 1, day_number: 1, title: null, base_place_id: null, notes: null,
                stops: [{ id: 100, day_id: 1, place_id: 11, custom_label: null, start_time: '09:00', notes: null, sort_order: 0 }],
                travel: [{ id: 200, day_id: 1, mode: 'car', depart_date: '2026-11-01', arrive_date: null, arrive_day_offset: 0, sort_order: 0, journey_id: null }] },
            { id: 2, day_number: 2, title: null, base_place_id: null, notes: null, stops: [], travel: [] },
            { id: 3, day_number: 3, title: null, base_place_id: null, notes: null, stops: [], travel: [] },
        ],
        notes: [{ id: 1, title: 'Tips', body: '', category: null, source: null, sort_order: 0, region_id: 1, place_id: 11 }],
        todos: [{ id: 1, text: 'Pack', done: false, sort_order: 0, kind: 'packing', place_id: 11, day_id: 2 }],
        bookings: [{ id: 300, place_id: 11, kind: 'excursion', travel_id: null, stop_id: null, journey_id: null }],
        documents: [], comments: [{ id: 1, place_id: 11, author: '', body: 'nice' }], views: [], rates: [],
        shares: [], price_checks: [], archives: [], journeys: [],
    } as unknown as HoneymoonPayload;
    const original = JSON.stringify(base);
    let seq = 0;
    const w = (method: string, url: string, body: unknown, tempIds: number[] = []): QueuedWrite => ({
        seq: ++seq, method, url, body: body == null ? null : JSON.stringify(body), tempIds, at: now,
    });

    const tick = applyQueuedWrites(base, [w('PATCH', '/api/admin/honeymoon/todos', { id: 1, done: true })]);
    check('ticking a to-do shows ticked', tick.todos[0].done === true);
    check('the saved payload itself is never changed', JSON.stringify(base) === original);

    const made = applyQueuedWrites(base, [
        w('POST', '/api/admin/honeymoon/places', { name: 'Warung', category: '' }, [T]),
        w('POST', '/api/admin/honeymoon/stops', { day_id: 1, place_id: T, start_time: '9:30' }, [T - 1]),
    ]);
    const warung = made.places.find((p) => p.id === T);
    check('a place made offline appears', !!warung && warung.name === 'Warung');
    check('…with the fallback category, as the server gives it', warung?.category === 'misc');
    check('…and empty lists where a place has lists', Array.isArray(warung?.photos) && Array.isArray(warung?.links));
    const newStop = made.days[0].stops.find((stop) => stop.id === T - 1);
    check('a stop at it lands on its day, after the others', !!newStop && made.days[0].stops[1].id === T - 1);
    check('…pointing at the new place', newStop?.place_id === T);
    check('…with its time tidied as the server tidies it', newStop?.start_time === '09:30');
    check('…and the next sort order in its day', newStop?.sort_order === 1);

    const moved = applyQueuedWrites(base, [w('PATCH', '/api/admin/honeymoon/stops', { id: 100, day_id: 3 })]);
    check('moving a stop to another day moves it', moved.days[0].stops.length === 0 && moved.days[2].stops[0]?.id === 100);

    const reordered = applyQueuedWrites(base, [w('PATCH', '/api/admin/honeymoon/days', [{ id: 3 }, { id: 1 }, { id: 2 }])]);
    check('reordering days renumbers them', reordered.days.map((d) => d.id).join(',') === '3,1,2'
        && reordered.days[0].day_number === 1);

    const leg = applyQueuedWrites(base, [w('POST', '/api/admin/honeymoon/travel',
        { day_id: 1, mode: 'flight', depart_date: '2026-11-03', arrive_date: '2026-11-04' }, [T - 2])]);
    const filed = leg.days.find((d) => d.travel.some((t) => t.id === T - 2));
    check('a leg added offline is filed onto the day its date falls on', filed?.id === 3);
    check('…with its overnight span worked out', filed?.travel.find((t) => t.id === T - 2)?.arrive_day_offset === 1);

    const gone = applyQueuedWrites(base, [w('DELETE', '/api/admin/honeymoon/places?id=11', null)]);
    check('a deleted place is gone', !gone.places.some((p) => p.id === 11));
    check('…its stops stay, unlinked (ON DELETE SET NULL)', gone.days[0].stops[0]?.place_id === null);
    check('…its bookings and comments go with it (CASCADE)', gone.bookings.length === 0 && gone.comments.length === 0);
    check('…its to-dos and notes are unlinked', gone.todos[0].place_id === null && gone.notes[0].place_id === null);

    const dayGone = applyQueuedWrites(base, [w('DELETE', '/api/admin/honeymoon/days?id=1', null)]);
    check('a deleted day takes its stops and legs', dayGone.days.length === 2
        && !dayGone.days.some((d) => d.stops.length || d.travel.length));

    const many = applyQueuedWrites(base, [w('DELETE', '/api/admin/honeymoon/places?ids=10,11', null)]);
    check('deleting a selection deletes all of it', many.places.length === 0);

    const misc = applyQueuedWrites(base, [w('DELETE', '/api/admin/honeymoon/categories?id=1', null)]);
    check('the fallback category cannot be deleted', misc.categories.some((c) => c.key === 'misc'));
    const beach = applyQueuedWrites(base, [w('DELETE', '/api/admin/honeymoon/categories?id=2', null)]);
    check('deleting a category refiles its places under Other', beach.places.find((p) => p.id === 11)?.category === 'misc');

    const trip = applyQueuedWrites(base, [w('PATCH', '/api/admin/honeymoon/trip', { title: 'Bali & Gili', budget: '5000' })]);
    check('a trip edit shows', trip.trip.title === 'Bali & Gili' && trip.trip.budget === 5000);

    const day = applyQueuedWrites(base, [w('POST', '/api/admin/honeymoon/days', { title: 'Extra' }, [T - 3])]);
    check('a day added offline gets the next number', day.days[3]?.day_number === 4 && day.days[3]?.title === 'Extra');

    const ranked = applyQueuedWrites(base, [w('PATCH', '/api/admin/honeymoon/places', { rank: [11, 10] })]);
    check('ranking stays writes rank', ranked.places.find((p) => p.id === 11)?.rank === 1);

    const bulk = applyQueuedWrites(base, [w('PATCH', '/api/admin/honeymoon/places', { ids: [10, 11], status: 'shortlisted' })]);
    check('a bulk edit edits every row', bulk.places.every((p) => p.status === 'shortlisted'));

    const rows = applyQueuedWrites(base, [w('PATCH', '/api/admin/honeymoon/stops', { rows: [{ id: 100, start_time: '10:15' }] })]);
    check('a many-rows edit edits each row', rows.days[0].stops[0].start_time === '10:15');

    const arr = applyQueuedWrites(base, [w('POST', '/api/admin/honeymoon/todos', [{ text: 'A' }, { text: 'B' }], [T - 4, T - 5])]);
    check('creating many rows at once adds them all', arr.todos.length === 3 && arr.todos[2].id === T - 5);

    const missing = applyQueuedWrites(base, [w('POST', '/api/admin/honeymoon/todos', { done: true }, [T - 6])]);
    check('a row missing a required field is not shown (the server would refuse it)', missing.todos.length === 1);

    const other = applyQueuedWrites(base, [w('POST', '/api/admin/site-config', { a: 1 })]);
    check('edits elsewhere in the outbox leave the portal alone', other === base);
}

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
