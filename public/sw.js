/*
 * The whole site, offline.
 *
 * Registered from the app shell on every page, public and admin. It keeps a
 * copy of every page, the data those pages load, the photos they show and the
 * app's own code, so the installed app opens with no connection and shows what
 * it last saw.
 *
 * Admin edits made with no connection are kept in an outbox (IndexedDB) and
 * sent, in order, once the server can be reached again (v0.10.5). Anything the
 * outbox creates gets a temporary negative id; when its real id comes back, every
 * later write that used the temporary one is rewritten before it is sent.
 *
 * The decisions are plain functions near the top (`routeFor`, `isCacheablePage`,
 * `isCacheableData`, `isStale`, `isQueueable`, `remapIds`…) so
 * `npm run check:offline` can test them under Node without a browser. Keep them
 * free of worker globals.
 *
 * See docs/superpowers/specs/2026-10-05-offline-site-design.md and
 * docs/superpowers/specs/2026-10-10-offline-edits-design.md.
 */

const PAGES = 'site-pages-v1';
const STATIC = 'site-static-v1';
const DATA = 'site-data-v1';
const PHOTOS = 'site-photos-v1';
/** Travel documents: exactly the list the Files tab sends (v0.10.1). */
const FILES = 'honeymoon-files-v1';
/**
 * Pictures from other sites — a hotel's photo from its booking page, the map's
 * tiles — kept as they are seen, so a place and the map you looked at still
 * have their pictures offline. Only what was on screen (or on a page the save
 * pass opened): never a bulk download, which OpenStreetMap's tile policy forbids.
 */
const REMOTE = 'site-remote-images-v1';
const KEEP = [PAGES, STATIC, DATA, PHOTOS, FILES, REMOTE];

/** How long a request with no saved copy may hang before it gives up. */
const NETWORK_TIMEOUT_MS = 6000;
/**
 * How long a request that *has* a saved copy waits for the network first.
 *
 * Until v0.10.18 every request waited the full six seconds above — the page,
 * then each of its data requests — so opening the app on a dead signal (the
 * kind that hangs rather than failing outright) took the better part of a
 * minute. Now the copy answers after this, and the network carries on in the
 * background to refresh it.
 */
const FALLBACK_AFTER_MS = 2500;
/**
 * Once the network has failed or stalled, how long every request with a saved
 * copy is answered from it at once, without asking the network at all. A probe
 * of `/api/offline/ping` ends it early as soon as the server answers.
 */
const OFFLINE_HOLD_MS = 30000;
/**
 * A copy saved this recently answers without a refresh behind it (v0.10.20): a
 * page that asks for the same data twice in a row costs one request, not two.
 */
const REVALIDATE_AFTER_MS = 15000;
/**
 * How long a client navigation (Next's RSC request) may take before the worker
 * gives up on it. Next then loads the page in full, which the saved copy answers
 * at once — so a tap between pages never hangs on a bad signal.
 */
const RSC_TIMEOUT_MS = 3000;
/** Where the worker keeps `freshAfter`, so a worker iOS restarted still knows it. */
const FRESH_AFTER_KEY = '/__sw/fresh-after';
/** Where the worker keeps the installed app's last admin page (`launchTarget`). */
const LAST_PAGE_KEY = '/__sw/last-admin-page';
/** The header a stored data copy carries: when it was saved. */
const SAVED_AT_HEADER = 'X-Saved-At';
/** Photos are saved as they are viewed; past this, the oldest go first. */
const MAX_PHOTOS = 1500;
/** The same for other sites' pictures and map tiles. */
const MAX_REMOTE = 2000;
/**
 * How long a save may hang before the outbox gives up on it for now. A weak
 * signal can hold a request open for minutes; without a limit one stuck send
 * held up every edit behind it. Generous, because a request cut off after the
 * server got it is sent again — harmless for an edit or a delete, a duplicate
 * for something new.
 */
const SEND_TIMEOUT_MS = 30000;
/** How long the page waits on a save before keeping it for later instead. */
const DIRECT_TIMEOUT_MS = 20000;
/** A saved copy older than this is refreshed by the next warm-up. */
const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

const OFFLINE_WRITE_MESSAGE = "You're offline — this wasn't saved. Try again when you're back online.";

/**
 * Writes that are never kept for later: lookups against other services (they
 * only make sense with a connection), uploads, the few actions whose answer
 * the page needs from the server itself — a share link's token, a restored
 * archive — and the guest's RSVP link request, which sends mail (an online
 * act; it is not an admin write, so it was never queueable, and the entry
 * keeps the decision next to the others). Offline these fail with the
 * message above, as before.
 */
const NOT_QUEUED = [
    '/api/admin/honeymoon/weather',
    '/api/admin/honeymoon/routes',
    '/api/admin/honeymoon/rate',
    '/api/admin/honeymoon/flight',
    '/api/admin/honeymoon/geocode',
    '/api/admin/honeymoon/seed',
    '/api/admin/honeymoon/ics',
    '/api/admin/honeymoon/upload',
    '/api/admin/honeymoon/archives',
    '/api/admin/honeymoon/shares',
    '/api/admin/fetch-meta',
    '/api/admin/registry-items/import',
    '/api/admin/seating/export',
    '/api/admin/settings/test-email',
    '/api/rsvp/magic-link',
    '/api/rsvp/verify-email',
];

/** The site config, which the worker can show with queued edits merged in. */
const SITE_CONFIG = '/api/admin/site-config';

/* ───────────────────────────── the rules ───────────────────────────── */

/**
 * What to do with a request. `req` is a plain description, so this can be
 * tested without a Request object:
 *   { url, method, mode, rsc, accept, nested }
 */
function routeFor(req, origin) {
    const url = new URL(req.url);
    if (url.origin !== origin) {
        const method = (req.method || 'GET').toUpperCase();
        return method === 'GET' && req.destination === 'image' && /^https?:$/.test(url.protocol)
            ? 'remote-image' : 'passthrough';
    }
    const method = (req.method || 'GET').toUpperCase();
    if (method !== 'GET') return req.nested ? 'block-write' : 'write';

    const path = url.pathname;
    if (path === '/sw.js' || path === '/honeymoon-sw.js') return 'network';
    if (path.startsWith('/_next/static/')) return 'static';
    if (req.rsc || url.searchParams.has('_rsc')) return 'rsc';
    if (path.startsWith('/api/auth/') || path.startsWith('/api/offline/')) return 'network';
    if (path.startsWith('/api/photos/')) return 'photo';
    if (path.startsWith('/api/')) return 'data';
    if (req.mode === 'navigate' || (req.accept || '').includes('text/html')) return 'page';
    return 'asset';
}

/** A page may be saved only if it is the page that was asked for. */
function isCacheablePage(requestUrl, res) {
    if (res.status !== 200 || res.redirected) return false;
    if (!(res.contentType || '').includes('text/html')) return false;
    // The login is never saved: offline it would only be a form that cannot work.
    try { if (new URL(requestUrl).pathname.startsWith('/admin/login')) return false; } catch { return false; }
    // A redirect the browser followed silently still shows up as a different
    // final URL: the login page must never be saved under /admin.
    try {
        return new URL(res.url).pathname === new URL(requestUrl).pathname;
    } catch {
        return false;
    }
}

/**
 * Where a page that redirected ended up, if that is worth keeping.
 *
 * `/admin` sends you to the dashboard and `/about` to the home page; saved as a
 * redirect, they still go there offline. A redirect to the login (an expired
 * session) or to another site is never kept.
 */
function redirectTarget(requestUrl, res) {
    if (!res.redirected || res.status !== 200) return null;
    try {
        const from = new URL(requestUrl);
        const to = new URL(res.url);
        if (to.origin !== from.origin || to.pathname === from.pathname) return null;
        if (to.pathname.startsWith('/admin/login')) return null;
        return to.pathname + to.search;
    } catch {
        return null;
    }
}

/**
 * How long to wait on the network before answering from the saved copy.
 *
 * No copy: the full timeout, because there is nothing else to show. A copy and
 * a recent failure (`offlineAt`): no wait at all. A copy and no reason to doubt
 * the network: a short wait, after which the copy answers.
 */
function fallbackWait(hasSaved, offlineAt, now) {
    if (!hasSaved) return NETWORK_TIMEOUT_MS;
    if (typeof offlineAt === 'number' && now - offlineAt < OFFLINE_HOLD_MS) return 0;
    return FALLBACK_AFTER_MS;
}

/**
 * How a read with this saved copy is answered (v0.10.20) — the copy first, like
 * Mail, with the server asked behind it:
 *
 * - `network`: no copy, so the network or nothing.
 * - `network-first`: the copy predates `freshAfter` — something was saved, or a
 *   pull-to-refresh asked for the server, since it was kept — so it cannot be
 *   trusted to show that change. The old wait-then-copy rule.
 * - `copy`: answer from the copy and ask nothing (offline, or kept moments ago).
 * - `copy+refresh`: answer from the copy now, fetch behind it, keep the answer.
 */
function readPlan({ hasSaved, savedAt, freshAfter, offlineAt, now }) {
    if (!hasSaved) return 'network';
    const at = typeof savedAt === 'number' ? savedAt : 0;
    if (typeof freshAfter === 'number' && at < freshAfter) return 'network-first';
    if (typeof offlineAt === 'number' && now - offlineAt < OFFLINE_HOLD_MS) return 'copy';
    if (now - at < REVALIDATE_AFTER_MS) return 'copy';
    return 'copy+refresh';
}

/** How long a client navigation may wait: not at all while offline. */
function rscBudget(offlineAt, now) {
    return typeof offlineAt === 'number' && now - offlineAt < OFFLINE_HOLD_MS ? 0 : RSC_TIMEOUT_MS;
}

function isCacheableData(res) {
    return res.status === 200 && !res.redirected;
}

function isStale(record, buildId, now) {
    if (!record || typeof record.at !== 'number') return true;
    if (record.buildId !== buildId) return true;
    return now - record.at > STALE_AFTER_MS;
}

/**
 * May this write wait in the outbox? Only the admin's own edits, sent as JSON
 * (or with no body, a DELETE) — never an upload, a lookup or a guest's RSVP.
 */
function isQueueable(req, origin) {
    let url;
    try { url = new URL(req.url); } catch { return false; }
    if (url.origin !== origin) return false;
    const method = (req.method || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD') return false;
    if (!url.pathname.startsWith('/api/admin/')) return false;
    if (NOT_QUEUED.some((path) => url.pathname === path || url.pathname.startsWith(`${path}/`))) return false;
    const type = (req.contentType || '').toLowerCase();
    return type === '' || type.includes('application/json');
}

/** Ids for what a queued POST creates: one per row for an array body. */
function tempIdCount(method, body) {
    if ((method || '').toUpperCase() !== 'POST') return 0;
    if (Array.isArray(body)) return body.length;
    return body && typeof body === 'object' ? 1 : 0;
}

/**
 * The stand-in answer for a queued write: shaped like the server's, so the page
 * carries on — a created row comes back with its temporary id, an array of
 * them as `created`, the way the honeymoon routes answer.
 */
function queuedResponseBody(method, body, tempIds) {
    const base = { success: true, queued: true, offline: true };
    if ((method || '').toUpperCase() !== 'POST') return base;
    if (Array.isArray(body)) {
        return { ...base, created: body.map((row, index) => ({ ...(row && typeof row === 'object' ? row : {}), id: tempIds[index] })) };
    }
    if (body && typeof body === 'object') return { ...body, ...base, id: tempIds[0] };
    return base;
}

/**
 * Swap temporary ids for real ones, anywhere in a JSON value.
 *
 * Temporary ids are huge negative integers (see `nextTempId`), so no real
 * number in a body — a price, a coordinate, a sort order — can be mistaken for
 * one. `map` is an object keyed by the temporary id as a string.
 */
function remapIds(value, map) {
    if (typeof value === 'number') {
        return Object.prototype.hasOwnProperty.call(map, String(value)) ? map[String(value)] : value;
    }
    if (Array.isArray(value)) return value.map((item) => remapIds(item, map));
    if (value && typeof value === 'object') {
        const out = {};
        for (const [key, item] of Object.entries(value)) out[key] = remapIds(item, map);
        return out;
    }
    return value;
}

/** The same for a URL's query (`?id=-1…`, `?ids=-1…,-2…`). Returns path + query. */
function remapUrl(path, map, origin) {
    const url = new URL(path, origin || 'http://local');
    for (const [key, raw] of [...url.searchParams.entries()]) {
        const next = raw.split(',').map((part) => {
            const trimmed = part.trim();
            return /^-\d+$/.test(trimmed) && Object.prototype.hasOwnProperty.call(map, trimmed) ? String(map[trimmed]) : part;
        }).join(',');
        if (next !== raw) url.searchParams.set(key, next);
    }
    return url.pathname + url.search;
}

/** The real ids a successful POST answered with, in the order it created them. */
function createdIds(responseBody) {
    if (!responseBody || typeof responseBody !== 'object') return [];
    if (Array.isArray(responseBody.created)) return responseBody.created.map((row) => (row && typeof row.id === 'number' ? row.id : null));
    return typeof responseBody.id === 'number' ? [responseBody.id] : [];
}

/**
 * What a failed send means. `retry` keeps the write and stops for now (no
 * signal, the server restarting, too many requests); `login` keeps it and asks
 * you to sign in; `failed` sets it aside and tells you — the server looked at
 * it and said no, and sending it again would only get the same answer.
 */
function outcomeFor(status, attempts) {
    if (status >= 200 && status < 300) return 'sent';
    if (status === 401) return 'login';
    if (status === 408 || status === 429 || status === 502 || status === 503 || status === 504) return 'retry';
    if (status >= 500) return attempts >= 3 ? 'failed' : 'retry';
    return 'failed';
}

/** The site config with queued edits on top, merged as the route merges them. */
function mergeSiteConfig(config, bodies) {
    let next = { ...(config || {}) };
    for (const body of bodies) {
        if (!body || typeof body !== 'object' || Array.isArray(body)) continue;
        const { pageBgColors, ...rest } = body;
        next = { ...next, ...rest };
        if (pageBgColors && typeof pageBgColors === 'object') {
            next.pageBgColors = { ...(next.pageBgColors || {}), ...pageBgColors };
        }
    }
    return next;
}

/**
 * Where opening the installed app should land, or null to load what was asked.
 *
 * The phone opens the admin app at its `start_url`, `/admin`, every time it
 * starts it — including after iOS quietly ended an app left in the background.
 * That used to draw the dashboard and *then* jump to the page you were on. The
 * worker answers that first request itself with a redirect to the last page,
 * so the dashboard never draws. Only `/admin` exactly — a link to any other
 * page is a choice — and only to a page inside the admin, never the login.
 * The page reports itself only from the installed app, so a browser tab
 * opening /admin is left alone.
 */
function launchTarget(requestUrl, lastPage, origin) {
    let url;
    try { url = new URL(requestUrl); } catch { return null; }
    if (url.origin !== origin || url.search || url.pathname.replace(/\/$/, '') !== '/admin') return null;
    if (typeof lastPage !== 'string' || !lastPage.startsWith('/admin/') || lastPage.startsWith('//') || lastPage.includes('\\')) {
        return null;
    }
    let target;
    try { target = new URL(lastPage, origin); } catch { return null; }
    if (target.origin !== origin || target.pathname.startsWith('/admin/login')) return null;
    return target.pathname + target.search;
}

/* Under Node (check:offline) only the rules above are wanted. */
if (typeof module === 'object' && module.exports) {
    module.exports = {
        routeFor, isCacheablePage, isCacheableData, isStale, redirectTarget, OFFLINE_WRITE_MESSAGE, fallbackWait,
        NETWORK_TIMEOUT_MS, FALLBACK_AFTER_MS, OFFLINE_HOLD_MS, REVALIDATE_AFTER_MS, RSC_TIMEOUT_MS, readPlan, rscBudget,
        isQueueable, tempIdCount, queuedResponseBody, remapIds, remapUrl, createdIds, outcomeFor, mergeSiteConfig,
        launchTarget,
    };
}

/* ───────────────────────────── the worker ───────────────────────────── */

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function' && typeof caches !== 'undefined') {
    self.addEventListener('install', () => { self.skipWaiting(); });

    self.addEventListener('activate', (event) => {
        event.waitUntil((async () => {
            const names = await caches.keys();
            // Drop caches from older versions of this worker, and the old
            // honeymoon-only worker's caches (its documents cache is kept).
            await Promise.all(names
                .filter((name) => (name.startsWith('site-') || name.startsWith('honeymoon-')) && !KEEP.includes(name))
                .map((name) => caches.delete(name)));
            await self.clients.claim();
        })());
    });

    const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), ms);
        promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
    });

    /* ───────────── fast fallback: how a read picks network or copy ───────────── */

    /** When the network last failed or stalled; null while it is answering. */
    let offlineAt = null;
    let probing = false;
    let lastProbe = 0;

    /**
     * Ask the server, out of band, whether it is reachable again — at most every
     * few seconds, and only while the worker believes it is not. Without this a
     * hold could only end by timing out, since a held request never asks.
     */
    function probe() {
        const now = Date.now();
        if (probing || now - lastProbe < 5000) return;
        probing = true;
        lastProbe = now;
        withTimeout(fetch('/api/offline/ping', { cache: 'no-store' }), 4000)
            .then((response) => { if (response.ok) offlineAt = null; })
            .catch(() => undefined)
            .finally(() => { probing = false; });
    }

    function markOffline() {
        if (offlineAt === null) offlineAt = Date.now();
        probe();
    }

    const holding = () => offlineAt !== null && Date.now() - offlineAt < OFFLINE_HOLD_MS;

    /* ───────────── copy first: freshness and the refresh behind it ───────────── */

    /**
     * Copies saved before this may not show a change made since: a write that
     * reached the server, or a pull-to-refresh. Kept in the cache as well as in
     * memory, because iOS stops an idle worker and the next one must still know.
     */
    let freshAfter = null;

    async function getFreshAfter() {
        if (freshAfter === null) {
            try {
                const saved = await (await caches.open(DATA)).match(FRESH_AFTER_KEY);
                freshAfter = saved ? Number(await saved.text()) || 0 : 0;
            } catch {
                freshAfter = 0;
            }
        }
        return freshAfter;
    }

    async function bumpFreshAfter(at = Date.now()) {
        freshAfter = at;
        try { await (await caches.open(DATA)).put(FRESH_AFTER_KEY, new Response(String(at))); } catch { /* memory still has it */ }
    }

    /**
     * The response with the time its request *started*: an answer that was on
     * its way while a save landed is then older than that save, and is not
     * trusted to show it.
     */
    async function stamp(response, at) {
        const headers = new Headers(response.headers);
        headers.set(SAVED_AT_HEADER, String(at));
        return new Response(await response.blob(), { status: response.status, statusText: response.statusText, headers });
    }

    const savedAtOf = (saved) => (saved ? Number(saved.headers.get(SAVED_AT_HEADER)) || 0 : 0);

    /** A saved redirect (/admin → the dashboard), stamped like any other copy. */
    const redirectCopy = (target, at) => new Response(null, {
        status: 302,
        headers: { Location: new URL(target, self.location.origin).href, [SAVED_AT_HEADER]: String(at) },
    });

    /**
     * Ask the server behind a copy that has already answered, keep what it says
     * and, when it differs from what the page was shown, tell that page — it
     * updates in place or offers a refresh (`OfflineManager`).
     */
    async function refreshBehind(go, served, store, clientId, url) {
        const startedAt = Date.now();
        let response;
        try {
            response = await withTimeout(go(), NETWORK_TIMEOUT_MS);
        } catch {
            markOffline();
            return;
        }
        offlineAt = null;
        if (response.status === 401 && clientId) {
            // Signed out on the server while the copy kept the page looking
            // signed in: say so, rather than leave it to the next save to find out.
            const client = await self.clients.get(clientId);
            if (client) client.postMessage({ type: 'site-sw:signed-out' });
            return;
        }
        if (!isCacheableData(response)) return;
        const [next, before] = await Promise.all([
            response.clone().text().catch(() => null),
            served ? served.text().catch(() => null) : Promise.resolve(null),
        ]);
        try { await store(response, startedAt); } catch { return; }
        if (!served || next === before || !clientId) return;
        const client = await self.clients.get(clientId);
        if (client) client.postMessage({ type: 'site-sw:fresh', url });
    }

    /**
     * Network first, but never stuck behind it when there is a copy to show.
     *
     * `store(response)` saves a good answer; it runs whenever the network does
     * answer, even after the copy has already been shown, so the next open is
     * fresher. Resolves to `{ response, fromCopy }`; rejects only when there is
     * no copy and the network failed.
     */
    async function readThrough(request, saved, store, event) {
        const wait = fallbackWait(Boolean(saved), offlineAt, Date.now());
        if (wait === 0) {
            probe();
            return { response: saved, fromCopy: true };
        }
        const network = fetch(request).then(async (response) => {
            offlineAt = null;
            try { await store(response.clone()); } catch { /* a full disk is not the page's problem */ }
            return response;
        });
        if (!saved) {
            try {
                return { response: await withTimeout(network, NETWORK_TIMEOUT_MS), fromCopy: false };
            } catch (error) {
                markOffline();
                throw error;
            }
        }
        const LATE = Symbol('late');
        let timer;
        const outcome = await Promise.race([
            network.then((response) => response, () => null),
            new Promise((resolve) => { timer = setTimeout(() => resolve(LATE), wait); }),
        ]);
        clearTimeout(timer);
        if (outcome && outcome !== LATE) return { response: outcome, fromCopy: false };
        // Late or failed: the copy answers now. A late answer still lands in the
        // cache when it arrives.
        if (outcome === LATE) event.waitUntil(network.catch(() => undefined));
        markOffline();
        return { response: saved, fromCopy: true };
    }

    const offlineWrite = () => new Response(JSON.stringify({ error: OFFLINE_WRITE_MESSAGE, offline: true }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'X-Offline': '1' },
    });

    const describe = (response) => ({
        status: response.status,
        redirected: response.redirected,
        url: response.url,
        contentType: response.headers.get('Content-Type') || '',
    });

    /**
     * Tell the page it is looking at a saved copy.
     *
     * Only ever "offline": a request that succeeded may have been answered by
     * the browser's own short-term cache with no network at all, so success here
     * proves nothing. The page finds out it is back online by asking the server
     * itself (`/api/offline/ping`).
     *
     * The page cannot trust `navigator.onLine`: a page opened offline can still
     * report "online", and a weak or captive signal always does. The worker is
     * the one that knows. A message to a page that is still loading is queued
     * until it listens.
     */
    function tell(event, offline) {
        const id = event.resultingClientId || event.clientId;
        if (!id) return;
        // A page being loaded does not exist as a client until its document
        // does, which is after this response — so wait for it, briefly.
        event.waitUntil((async () => {
            for (let attempt = 0; attempt < 30; attempt += 1) {
                const client = await self.clients.get(id);
                if (client) { client.postMessage({ type: offline ? 'site-sw:offline' : 'site-sw:online' }); return; }
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
        })());
    }

    /* ───────────── the outbox: edits made offline, sent later ───────────── */

    const OUTBOX_DB = 'site-outbox';

    function openOutbox() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(OUTBOX_DB, 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('writes')) db.createObjectStore('writes', { keyPath: 'seq', autoIncrement: true });
                if (!db.objectStoreNames.contains('ids')) db.createObjectStore('ids', { keyPath: 'temp' });
                if (!db.objectStoreNames.contains('failed')) db.createObjectStore('failed', { keyPath: 'seq' });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /** Run `fn(store)` in one transaction and resolve with what it returns. */
    async function inStore(name, mode, fn) {
        const db = await openOutbox();
        try {
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(name, mode);
                let result;
                Promise.resolve(fn(tx.objectStore(name))).then((value) => { result = value; }, reject);
                tx.oncomplete = () => resolve(result);
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error);
            });
        } finally {
            db.close();
        }
    }

    const asPromise = (request) => new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    const allWrites = () => inStore('writes', 'readonly', (store) => asPromise(store.getAll()));
    const allFailed = () => inStore('failed', 'readonly', (store) => asPromise(store.getAll()));

    async function idMap() {
        const rows = await inStore('ids', 'readonly', (store) => asPromise(store.getAll()));
        const map = {};
        for (const row of rows) map[String(row.temp)] = row.real;
        return map;
    }

    /**
     * A fresh temporary id: a negative number of the current time in
     * microseconds, always smaller than the last one handed out. Far below any
     * real id, a price or a coordinate, and safe as a JavaScript integer.
     */
    let lastTemp = 0;
    function nextTempId() {
        let candidate = -(Date.now() * 1000);
        if (candidate >= lastTemp) candidate = lastTemp - 1;
        lastTemp = candidate;
        return candidate;
    }

    let needsLogin = false;

    async function outboxStatus() {
        const [writes, failed] = await Promise.all([allWrites(), allFailed()]);
        return {
            type: 'site-sw:outbox',
            pending: writes.length,
            needsLogin: needsLogin && writes.length > 0,
            failed: failed.map((row) => ({ seq: row.seq, method: row.method, url: row.url, status: row.status, error: row.error, at: row.at })),
        };
    }

    async function broadcast(extra) {
        const status = { ...(await outboxStatus()), ...(extra || {}) };
        for (const client of await self.clients.matchAll({ includeUncontrolled: true })) client.postMessage(status);
        return status;
    }

    /** A one-off key the server uses to recognise a write it has already applied. */
    const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

    async function enqueue(request, text, key) {
        let body = null;
        try { body = text ? JSON.parse(text) : null; } catch { body = null; }
        const tempIds = Array.from({ length: tempIdCount(request.method, body) }, nextTempId);
        const url = new URL(request.url);
        const record = {
            method: request.method,
            url: url.pathname + url.search,
            contentType: request.headers.get('Content-Type') || '',
            body: text || null,
            tempIds,
            at: Date.now(),
            attempts: 0,
            key,
        };
        record.seq = await inStore('writes', 'readwrite', (store) => asPromise(store.add(record)));
        return { record, body };
    }

    /**
     * Send one write as it would have gone, with temporary ids swapped for real
     * ones. Aborted after `ms`, so a hung connection fails like a lost one.
     */
    async function send(record, map, ms) {
        let body = record.body;
        if (body) {
            try { body = JSON.stringify(remapIds(JSON.parse(body), map)); } catch { /* not JSON: as it was */ }
        }
        const headers = record.contentType ? { 'Content-Type': record.contentType } : {};
        // A send cut off after the server applied it is sent again; this key
        // lets the server answer the repeat without applying it twice.
        if (record.key) headers['X-Outbox-Key'] = record.key;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ms);
        try {
            return await fetch(new URL(remapUrl(record.url, map, self.location.origin), self.location.origin).href, {
                method: record.method,
                headers,
                body: body ?? undefined,
                credentials: 'same-origin',
                cache: 'no-store',
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * Take the oldest write for sending, in one transaction: two copies of the
     * worker (an update taking over mid-send) must never both send it. A claim
     * older than a send could last is from a worker that died mid-send, and is
     * taken over. Resolves to the record, null (outbox empty) or 'busy'.
     */
    function claimOldest() {
        return inStore('writes', 'readwrite', (store) => new Promise((resolve, reject) => {
            const cursor = store.openCursor();
            cursor.onerror = () => reject(cursor.error);
            cursor.onsuccess = () => {
                const current = cursor.result;
                if (!current) { resolve(null); return; }
                const record = current.value;
                const now = Date.now();
                if (record.sendingAt && now - record.sendingAt < SEND_TIMEOUT_MS + 10000) { resolve('busy'); return; }
                const claimed = { ...record, sendingAt: now };
                current.update(claimed);
                resolve(claimed);
            };
        }));
    }

    let flushing = null;
    /** Asked to send again while a pass was still running (back online mid-pass). */
    let flushAgain = false;

    /**
     * Send the outbox, oldest first, one at a time — the order they were made
     * in is the order that makes sense (create the place, then the stop at it).
     * Stops at the first sign of no connection and tries again later.
     */
    function flush() {
        if (flushing) { flushAgain = true; return flushing; }
        flushing = (async () => {
            let sent = 0;
            try {
                do {
                    flushAgain = false;
                    for (;;) {
                        const record = await claimOldest();
                        if (record === null) { needsLogin = false; break; }
                        if (record === 'busy') break; // another copy of the worker is sending it
                        const release = () => inStore('writes', 'readwrite', (store) => asPromise(store.put({ ...record, sendingAt: 0 })));
                        const map = await idMap();
                        let response;
                        try {
                            response = await send(record, map, SEND_TIMEOUT_MS);
                        } catch {
                            await release();
                            break; // no connection: keep everything for next time
                        }
                        const outcome = outcomeFor(response.status, (record.attempts || 0) + 1);
                        if (outcome === 'login') { needsLogin = true; await release(); break; }
                        if (outcome === 'retry') {
                            await inStore('writes', 'readwrite', (store) => asPromise(store.put({ ...record, sendingAt: 0, attempts: (record.attempts || 0) + 1 })));
                            break;
                        }
                        needsLogin = false;
                        if (outcome === 'sent') {
                            if (record.tempIds && record.tempIds.length) {
                                const real = createdIds(await response.clone().json().catch(() => null));
                                await inStore('ids', 'readwrite', (store) => {
                                    record.tempIds.forEach((temp, index) => {
                                        if (typeof real[index] === 'number') store.put({ temp, real: real[index] });
                                    });
                                });
                            }
                            sent += 1;
                            await bumpFreshAfter();
                        } else {
                            const answer = await response.clone().json().catch(() => ({}));
                            await inStore('failed', 'readwrite', (store) => asPromise(store.put({
                                ...record, status: response.status, error: (answer && answer.error) || `The server said ${response.status}`,
                            })));
                        }
                        await inStore('writes', 'readwrite', (store) => asPromise(store.delete(record.seq)));
                    }
                } while (flushAgain);
            } finally {
                flushing = null;
            }
            await broadcast({ sent });
            return sent;
        })();
        return flushing;
    }

    /**
     * An admin write. With nothing waiting it goes straight out (ids remapped,
     * in case the page still holds a temporary one); offline, or behind writes
     * still waiting, it joins the outbox and the page gets a stand-in answer.
     */
    async function adminWrite(request, event) {
        const text = await request.clone().text().catch(() => '');
        const pending = (await allWrites()).length;
        // The same key for the attempt now and any resend from the outbox, so a
        // save that landed although its answer was lost is not applied twice.
        const key = newKey();
        if (pending === 0) {
            const map = await idMap();
            try {
                const response = await send({
                    method: request.method,
                    url: new URL(request.url).pathname + new URL(request.url).search,
                    contentType: request.headers.get('Content-Type') || '',
                    body: text || null,
                    key,
                }, map, DIRECT_TIMEOUT_MS);
                if (response.ok) await bumpFreshAfter();
                return response;
            } catch {
                tell(event, true);
            }
        }
        const { record, body } = await enqueue(request, text, key);
        event.waitUntil((async () => {
            await broadcast();
            // Behind other writes but maybe online: send them all now.
            if (pending > 0) await flush();
        })());
        let answer = queuedResponseBody(request.method, body, record.tempIds);
        if (record.url.split('?')[0] === SITE_CONFIG && record.method.toUpperCase() === 'POST') {
            answer = { ...answer, config: await siteConfigWithQueue(null) };
        }
        return new Response(JSON.stringify(answer), {
            status: 202,
            headers: { 'Content-Type': 'application/json', 'X-Offline-Queued': '1' },
        });
    }

    /** The saved site config (or `fresh`), with queued config edits merged in. */
    async function siteConfigWithQueue(fresh) {
        let config = fresh;
        if (!config) {
            const saved = await (await caches.open(DATA)).match(SITE_CONFIG, { ignoreVary: true });
            config = saved ? await saved.json().catch(() => ({})) : {};
        }
        const bodies = (await allWrites())
            .filter((row) => row.url.split('?')[0] === SITE_CONFIG && row.method.toUpperCase() === 'POST')
            .sort((a, b) => a.seq - b.seq)
            .map((row) => { try { return JSON.parse(row.body); } catch { return null; } });
        return bodies.length ? mergeSiteConfig(config, bodies) : config;
    }

    /* ───────────── photos: only the ones the site uses ───────────── */

    /**
     * Photos seen during a save-everything pass. When the pass finishes, any
     * saved photo nobody asked for is dropped — the library of every upload on
     * `/admin/photos` is never saved in the first place, so what remains is
     * exactly what the site's pages show.
     */
    let pass = null;

    async function fromPhotoLibrary(event) {
        if (!event.clientId) return false;
        const client = await self.clients.get(event.clientId);
        return !!client && new URL(client.url).pathname.startsWith('/admin/photos');
    }

    async function prunePhotos() {
        if (!pass || !pass.seen.size) return;
        const cache = await caches.open(PHOTOS);
        for (const key of await cache.keys()) if (!pass.seen.has(key.url)) await cache.delete(key);
    }

    async function trimPhotos(name = PHOTOS, max = MAX_PHOTOS) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        // Keys come back in insertion order, so the front is the oldest.
        for (const key of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(key);
    }

    /**
     * Another site's picture: from the network, kept as it comes (an opaque
     * answer is fine — an <img> can still draw it), and from the copy when
     * there is no connection.
     */
    async function remoteImage(request) {
        const cache = await caches.open(REMOTE);
        try {
            const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
            if (response.type === 'opaque' || response.status === 200) {
                await cache.put(request, response.clone());
                void trimPhotos(REMOTE, MAX_REMOTE);
            }
            return response;
        } catch (error) {
            const saved = await cache.match(request, { ignoreVary: true });
            if (saved) return saved;
            throw error;
        }
    }

    async function lastAdminPage() {
        try {
            const saved = await (await caches.open(DATA)).match(LAST_PAGE_KEY);
            return saved ? await saved.text() : null;
        } catch {
            return null;
        }
    }

    async function page(request, event) {
        // Opening the installed app: straight to the page it was last on.
        const launch = request.mode === 'navigate'
            ? launchTarget(request.url, await lastAdminPage(), self.location.origin)
            : null;
        if (launch) return Response.redirect(new URL(launch, self.location.origin).href, 302);

        const cache = await caches.open(PAGES);
        const url = new URL(request.url);
        const key = url.pathname + url.search;
        let saved = await cache.match(key, { ignoreVary: true })
            || await cache.match(url.pathname, { ignoreVary: true, ignoreSearch: true });
        // The app's front door never saved (it only redirects): open the saved
        // dashboard rather than "not saved yet".
        if (!saved && url.pathname.replace(/\/$/, '') === '/admin' && await cache.match('/admin/dashboard', { ignoreVary: true })) {
            saved = redirectCopy('/admin/dashboard', 0);
        }
        const store = async (response, startedAt = Date.now()) => {
            const target = redirectTarget(request.url, describe(response));
            if (isCacheablePage(request.url, describe(response))) await cache.put(key, await stamp(response, startedAt));
            else if (target) await cache.put(key, redirectCopy(target, startedAt));
        };
        const plan = readPlan({
            hasSaved: Boolean(saved), savedAt: savedAtOf(saved), freshAfter: await getFreshAfter(), offlineAt, now: Date.now(),
        });
        if (plan === 'copy' || plan === 'copy+refresh') {
            // The page as saved, at once; a newer one is kept for next time.
            // A navigation request cannot be re-sent with options, so ask afresh
            // the way the save pass does (redirects followed, then kept as such).
            if (plan === 'copy+refresh') {
                event.waitUntil(refreshBehind(() => fetch(request.url, {
                    credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'text/html' },
                }), null, store, null, request.url));
            }
            else if (holding()) { probe(); tell(event, true); }
            return saved;
        }
        const startedAt = Date.now();
        try {
            const { response, fromCopy } = await readThrough(request, saved, (response) => store(response, startedAt), event);
            if (fromCopy) tell(event, true);
            return response;
        } catch {
            tell(event, true);
            const fallback = await cache.match('/offline', { ignoreVary: true });
            if (fallback) return fallback;
            return new Response('<h1>Offline</h1><p>This page has not been saved for offline use yet.</p>', {
                status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
        }
    }

    /** The site config as JSON, with any queued edits to it merged in. */
    async function withQueuedConfig(response) {
        try {
            const queued = (await allWrites()).some((row) => row.url.split('?')[0] === SITE_CONFIG);
            if (!queued || !response.ok) return response;
            const merged = await siteConfigWithQueue(await response.clone().json());
            return new Response(JSON.stringify(merged), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch {
            return response;
        }
    }

    /** Page data: the copy first, the server behind it (`readPlan`). */
    async function data(request, event) {
        const cache = await caches.open(DATA);
        const isConfig = new URL(request.url).pathname === SITE_CONFIG;
        const saved = await cache.match(request, { ignoreVary: true });
        const store = async (response, startedAt) => {
            if (isCacheableData(response)) await cache.put(request, await stamp(response, startedAt));
        };
        const plan = readPlan({
            hasSaved: Boolean(saved), savedAt: savedAtOf(saved), freshAfter: await getFreshAfter(), offlineAt, now: Date.now(),
        });
        if (plan === 'copy' || plan === 'copy+refresh') {
            if (plan === 'copy+refresh') {
                event.waitUntil(refreshBehind(() => fetch(request, { cache: 'no-store' }), saved.clone(), store, event.clientId || null, request.url));
            } else if (holding()) {
                probe();
                tell(event, true);
            }
            return isConfig ? withQueuedConfig(saved) : saved;
        }
        const startedAt = Date.now();
        try {
            const { response, fromCopy } = await readThrough(request, saved, (response) => store(response, startedAt), event);
            if (fromCopy) tell(event, true);
            return isConfig ? withQueuedConfig(response) : response;
        } catch (error) {
            tell(event, true);
            throw error;
        }
    }

    /**
     * A photo: the copy whenever there is one. Uploads are saved under a
     * timestamped name, so an address never starts showing a different picture.
     */
    async function photo(request, event) {
        const cache = await caches.open(PHOTOS);
        const keep = !(await fromPhotoLibrary(event));
        if (pass && keep) pass.seen.add(request.url);
        const saved = await cache.match(request, { ignoreVary: true });
        if (saved) return saved;
        const store = async (response) => {
            if (!keep || !isCacheableData(response)) return;
            await cache.put(request, response);
            void trimPhotos();
        };
        try {
            const { response } = await readThrough(request, null, store, event);
            return response;
        } catch (error) {
            tell(event, true);
            // The same photo at another size (the lightbox's full size when
            // only the gallery's thumbnail was saved) beats a broken image.
            const other = await cache.match(request, { ignoreVary: true, ignoreSearch: true });
            if (other) return other;
            const doc = await (await caches.open(FILES)).match(request.url, { ignoreVary: true });
            if (doc) return doc;
            throw error;
        }
    }

    /**
     * A client navigation, with a time limit. Past it — or at once while offline
     * — a network error makes Next load the page in full, and the saved copy
     * answers that. A prefetch that fails says nothing about the connection.
     */
    async function rsc(request) {
        const prefetch = request.headers.get('Next-Router-Prefetch') === '1';
        const budget = rscBudget(offlineAt, Date.now());
        if (budget === 0) { probe(); return Response.error(); }
        try {
            const response = await withTimeout(fetch(request), budget);
            offlineAt = null;
            return response;
        } catch {
            if (!prefetch) markOffline();
            return Response.error();
        }
    }

    async function cacheFirst(request) {
        const cache = await caches.open(STATIC);
        const saved = await cache.match(request, { ignoreVary: true });
        if (saved) return saved;
        const response = await fetch(request);
        if (response.status === 200) await cache.put(request, response.clone());
        return response;
    }

    self.addEventListener('fetch', (event) => {
        const { request } = event;
        const describeRequest = (nested) => ({
            url: request.url,
            method: request.method,
            mode: request.mode,
            destination: request.destination,
            rsc: request.headers.get('RSC') === '1',
            accept: request.headers.get('Accept') || '',
            nested,
        });
        const first = routeFor(describeRequest(false), self.location.origin);
        // Other sites (map tiles, booking photos) and the worker itself are
        // left entirely to the browser.
        if (first === 'passthrough' || first === 'network') return;
        if (first === 'remote-image') { event.respondWith(remoteImage(request)); return; }

        if (first === 'write') {
            event.respondWith((async () => {
                // The warm-up pass runs pages in a hidden frame and only reads:
                // anything it would write is refused before it leaves the device.
                const client = event.clientId ? await self.clients.get(event.clientId) : null;
                if (client && client.frameType === 'nested'
                    && routeFor(describeRequest(true), self.location.origin) === 'block-write') {
                    return offlineWrite();
                }
                const queueable = isQueueable({
                    url: request.url,
                    method: request.method,
                    contentType: request.headers.get('Content-Type') || '',
                }, self.location.origin);
                if (queueable) {
                    try { return await adminWrite(request, event); } catch { /* no IndexedDB: as before */ }
                }
                try {
                    const response = await fetch(request);
                    if (response.ok) await bumpFreshAfter();
                    return response;
                } catch {
                    return offlineWrite();
                }
            })());
            return;
        }
        // A failed client navigation makes Next fall back to a full page load —
        // which the saved page then answers. Nothing to save here.
        if (first === 'rsc') { event.respondWith(rsc(request)); return; }

        if (first === 'static') { event.respondWith(cacheFirst(request)); return; }
        if (first === 'page') { event.respondWith(page(request, event)); return; }
        if (first === 'photo') { event.respondWith(photo(request, event)); return; }
        event.respondWith(data(request, event));
    });

    /* ───────────── messages: precache, documents, clear ───────────── */

    async function precache(message, client) {
        const pages = Array.isArray(message.pages) ? message.pages : [];
        const assets = Array.isArray(message.assets) ? message.assets : [];
        const total = pages.length + assets.length;
        let saved = 0;
        const report = () => client && client.postMessage({ type: 'site-sw:precache-progress', saved, total });

        const staticCache = await caches.open(STATIC);
        const dataCache = await caches.open(DATA);
        for (const url of assets) {
            try {
                const isStatic = url.startsWith('/_next/static/');
                const cache = isStatic ? staticCache : dataCache;
                if (isStatic && await cache.match(url)) { saved += 1; continue; }
                const response = await fetch(url, { credentials: 'same-origin' });
                if (isCacheableData(response)) { await cache.put(url, response); saved += 1; }
            } catch { /* offline mid-way: the next warm-up finishes it */ }
            if (saved % 10 === 0) report();
        }

        const assetsSaved = saved;
        const pageCache = await caches.open(PAGES);
        for (const url of pages) {
            try {
                const startedAt = Date.now();
                const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'text/html' } });
                const full = new URL(url, self.location.origin).href;
                const target = redirectTarget(full, describe(response));
                if (isCacheablePage(full, describe(response))) {
                    await pageCache.put(url, await stamp(response, startedAt));
                    saved += 1;
                } else if (target) {
                    await pageCache.put(url, redirectCopy(target, startedAt));
                    saved += 1;
                }
            } catch { /* as above */ }
            report();
        }

        // Code from older builds goes only once this build's code *and every
        // page* are in: a page still saved from the older build needs its code,
        // or it opens blank offline (until v0.10.20 the code went first).
        const wantedStatic = new Set(assets.filter((url) => url.startsWith('/_next/static/'))
            .map((url) => new URL(url, self.location.origin).href));
        if (wantedStatic.size && assetsSaved >= assets.length && saved >= total) {
            for (const key of await staticCache.keys()) if (!wantedStatic.has(key.url)) await staticCache.delete(key);
        }
        if (client) client.postMessage({ type: 'site-sw:precache-done', saved, total });
    }

    /** Bring the documents cache in line with the Files tab's list, then report. */
    async function syncFiles(urls, client) {
        const cache = await caches.open(FILES);
        const wanted = new Set(urls.map((url) => new URL(url, self.location.origin).href));
        for (const request of await cache.keys()) if (!wanted.has(request.url)) await cache.delete(request);
        let saved = 0;
        for (const url of wanted) {
            if (await cache.match(url)) { saved += 1; continue; }
            try {
                const response = await fetch(url, { credentials: 'same-origin' });
                if (response && response.status === 200) { await cache.put(url, response); saved += 1; }
            } catch { /* saved on the next visit with a connection */ }
        }
        if (client) client.postMessage({ type: 'honeymoon-sw:files-done', saved, total: wanted.size });
    }

    /**
     * Bring every saved page and piece of data up to date, in place.
     *
     * The quick half of "the server changed": it re-asks for exactly what is
     * already saved, a few at a time, so the data is current within seconds;
     * the hidden-frame pass that follows picks up anything new (a new photo).
     */
    async function refreshSaved(client) {
        const jobs = [];
        const dataCache = await caches.open(DATA);
        for (const request of await dataCache.keys()) {
            const path = new URL(request.url).pathname;
            if (path === FRESH_AFTER_KEY || path === LAST_PAGE_KEY) continue;
            jobs.push(async () => {
                const startedAt = Date.now();
                const response = await withTimeout(fetch(request.url, { credentials: 'same-origin', cache: 'no-store' }), 20000);
                if (isCacheableData(response)) await dataCache.put(request, await stamp(response, startedAt));
            });
        }
        const pageCache = await caches.open(PAGES);
        for (const request of await pageCache.keys()) {
            jobs.push(async () => {
                const startedAt = Date.now();
                const response = await withTimeout(fetch(request.url, {
                    credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'text/html' },
                }), 20000);
                const target = redirectTarget(request.url, describe(response));
                if (isCacheablePage(request.url, describe(response))) await pageCache.put(request, await stamp(response, startedAt));
                else if (target) await pageCache.put(request, redirectCopy(target, startedAt));
            });
        }
        let done = 0;
        let failed = 0;
        const worker = async () => {
            for (let job = jobs.shift(); job; job = jobs.shift()) {
                try { await job(); } catch { failed += 1; }
                done += 1;
            }
        };
        await Promise.all([worker(), worker(), worker(), worker()]);
        if (client) client.postMessage({ type: 'site-sw:refresh-done', done, failed });
    }

    self.addEventListener('message', (event) => {
        const data = event.data;
        const type = data && typeof data === 'object' ? data.type : null;
        if (type === 'site-sw:flush') {
            event.waitUntil(flush());
            return;
        }
        if (type === 'site-sw:outbox-status') {
            event.waitUntil(outboxStatus().then((status) => event.source && event.source.postMessage(status)));
            return;
        }
        if (type === 'site-sw:dismiss-failed') {
            event.waitUntil(inStore('failed', 'readwrite', (store) => asPromise(store.clear())).then(() => broadcast()));
            return;
        }
        if (type === 'site-sw:fresh-after') {
            // Pull-to-refresh: every copy saved before now asks the server first.
            event.waitUntil(bumpFreshAfter().then(() => event.source && event.source.postMessage({ type: 'site-sw:fresh-after-done' })));
            return;
        }
        if (type === 'site-sw:last-page') {
            if (typeof data.path === 'string' && launchTarget(`${self.location.origin}/admin`, data.path, self.location.origin)) {
                event.waitUntil(caches.open(DATA).then((cache) => cache.put(LAST_PAGE_KEY, new Response(data.path))).catch(() => undefined));
            }
            return;
        }
        if (type === 'site-sw:refresh') {
            event.waitUntil(refreshSaved(event.source));
            return;
        }
        if (type === 'site-sw:pass-start') {
            pass = { seen: new Set() };
            return;
        }
        if (type === 'site-sw:pass-end') {
            event.waitUntil((async () => {
                // Only a pass that saw every page may decide what is unused.
                if (data.complete) await prunePhotos();
                pass = null;
            })());
            return;
        }
        if (data && data.type === 'site-sw:precache') {
            event.waitUntil(precache(data, event.source));
        } else if (data && data.type === 'honeymoon-sw:files' && Array.isArray(data.urls)) {
            event.waitUntil(syncFiles(data.urls, event.source));
        } else if (data === 'site-sw:clear' || data === 'honeymoon-sw:clear' || (data && data.type === 'site-sw:clear')) {
            // The outbox is kept: signing out must never throw away edits that
            // have not reached the server yet. They go once you sign back in.
            event.waitUntil((async () => {
                const names = await caches.keys();
                await Promise.all(names
                    .filter((name) => name.startsWith('site-') || name.startsWith('honeymoon-'))
                    .map((name) => caches.delete(name)));
                if (event.source) event.source.postMessage({ type: 'site-sw:cleared' });
            })());
        }
    });
}
