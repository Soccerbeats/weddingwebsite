/*
 * The whole site, offline.
 *
 * Registered from the app shell on every page, public and admin. It keeps a
 * copy of every page, the data those pages load, the photos they show and the
 * app's own code, so the installed app opens with no connection and shows what
 * it last saw. Writes are not queued: offline, a save fails with one clear
 * message, which is honest about what happened.
 *
 * The decisions are plain functions near the top (`routeFor`, `isCacheablePage`,
 * `isCacheableData`, `isStale`) so `npm run check:offline` can test them under
 * Node without a browser. Keep them free of worker globals.
 *
 * See docs/superpowers/specs/2026-10-05-offline-site-design.md.
 */

const PAGES = 'site-pages-v1';
const STATIC = 'site-static-v1';
const DATA = 'site-data-v1';
const PHOTOS = 'site-photos-v1';
/** Travel documents: exactly the list the Files tab sends (v0.10.1). */
const FILES = 'honeymoon-files-v1';
const KEEP = [PAGES, STATIC, DATA, PHOTOS, FILES];

/** How long a request may hang before the saved copy answers instead. */
const NETWORK_TIMEOUT_MS = 6000;
/** Photos are saved as they are viewed; past this, the oldest go first. */
const MAX_PHOTOS = 600;
/** A saved copy older than this is refreshed by the next warm-up. */
const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

const OFFLINE_WRITE_MESSAGE = "You're offline — this wasn't saved. Try again when you're back online.";

/* ───────────────────────────── the rules ───────────────────────────── */

/**
 * What to do with a request. `req` is a plain description, so this can be
 * tested without a Request object:
 *   { url, method, mode, rsc, accept, nested }
 */
function routeFor(req, origin) {
    const url = new URL(req.url);
    if (url.origin !== origin) return 'passthrough';
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

function isCacheableData(res) {
    return res.status === 200 && !res.redirected;
}

function isStale(record, buildId, now) {
    if (!record || typeof record.at !== 'number') return true;
    if (record.buildId !== buildId) return true;
    return now - record.at > STALE_AFTER_MS;
}

/* Under Node (check:offline) only the rules above are wanted. */
if (typeof module === 'object' && module.exports) {
    module.exports = { routeFor, isCacheablePage, isCacheableData, isStale, redirectTarget, OFFLINE_WRITE_MESSAGE };
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

    async function trimPhotos() {
        const cache = await caches.open(PHOTOS);
        const keys = await cache.keys();
        // Keys come back in insertion order, so the front is the oldest.
        for (const key of keys.slice(0, Math.max(0, keys.length - MAX_PHOTOS))) await cache.delete(key);
    }

    async function page(request, event) {
        const cache = await caches.open(PAGES);
        try {
            const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
            const key = new URL(request.url).pathname + new URL(request.url).search;
            const target = redirectTarget(request.url, describe(response));
            if (isCacheablePage(request.url, describe(response))) await cache.put(key, response.clone());
            else if (target) await cache.put(key, Response.redirect(new URL(target, self.location.origin).href, 302));
            return response;
        } catch {
            tell(event, true);
            const url = new URL(request.url);
            const saved = await cache.match(url.pathname + url.search, { ignoreVary: true })
                || await cache.match(url.pathname, { ignoreVary: true, ignoreSearch: true });
            if (saved) return saved;
            const fallback = await cache.match('/offline', { ignoreVary: true });
            if (fallback) return fallback;
            return new Response('<h1>Offline</h1><p>This page has not been saved for offline use yet.</p>', {
                status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
        }
    }

    async function networkThenCache(request, cacheName, event) {
        const cache = await caches.open(cacheName);
        try {
            const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
            if (isCacheableData(response)) {
                await cache.put(request, response.clone());
                if (cacheName === PHOTOS) void trimPhotos();
            }
            return response;
        } catch (error) {
            tell(event, true);
            const saved = await cache.match(request, { ignoreVary: true });
            if (saved) return saved;
            if (cacheName === PHOTOS) {
                const doc = await (await caches.open(FILES)).match(request.url, { ignoreVary: true });
                if (doc) return doc;
            }
            throw error;
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
            rsc: request.headers.get('RSC') === '1',
            accept: request.headers.get('Accept') || '',
            nested,
        });
        const first = routeFor(describeRequest(false), self.location.origin);
        // Other sites (map tiles, booking photos) and the worker itself are
        // left entirely to the browser.
        if (first === 'passthrough' || first === 'network') return;

        if (first === 'write') {
            event.respondWith((async () => {
                // The warm-up pass runs pages in a hidden frame and only reads:
                // anything it would write is refused before it leaves the device.
                const client = event.clientId ? await self.clients.get(event.clientId) : null;
                if (client && client.frameType === 'nested'
                    && routeFor(describeRequest(true), self.location.origin) === 'block-write') {
                    return offlineWrite();
                }
                try { return await fetch(request); } catch { return offlineWrite(); }
            })());
            return;
        }
        // Offline, a failed client navigation makes Next fall back to a full
        // page load — which the saved page then answers. Nothing to save here.
        if (first === 'rsc') return;

        if (first === 'static') { event.respondWith(cacheFirst(request)); return; }
        if (first === 'page') { event.respondWith(page(request, event)); return; }
        if (first === 'photo') { event.respondWith(networkThenCache(request, PHOTOS, event)); return; }
        event.respondWith(networkThenCache(request, DATA, event));
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

        // Code from older builds goes only once this build's code is in.
        const wantedStatic = new Set(assets.filter((url) => url.startsWith('/_next/static/'))
            .map((url) => new URL(url, self.location.origin).href));
        if (wantedStatic.size && saved >= assets.length) {
            for (const key of await staticCache.keys()) if (!wantedStatic.has(key.url)) await staticCache.delete(key);
        }

        const pageCache = await caches.open(PAGES);
        for (const url of pages) {
            try {
                const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'text/html' } });
                const full = new URL(url, self.location.origin).href;
                const target = redirectTarget(full, describe(response));
                if (isCacheablePage(full, describe(response))) {
                    await pageCache.put(url, response);
                    saved += 1;
                } else if (target) {
                    await pageCache.put(url, Response.redirect(new URL(target, self.location.origin).href, 302));
                    saved += 1;
                }
            } catch { /* as above */ }
            report();
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

    self.addEventListener('message', (event) => {
        const data = event.data;
        if (data && data.type === 'site-sw:precache') {
            event.waitUntil(precache(data, event.source));
        } else if (data && data.type === 'honeymoon-sw:files' && Array.isArray(data.urls)) {
            event.waitUntil(syncFiles(data.urls, event.source));
        } else if (data === 'site-sw:clear' || data === 'honeymoon-sw:clear' || (data && data.type === 'site-sw:clear')) {
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
