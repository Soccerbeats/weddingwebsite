/*
 * Offline snapshot for the honeymoon portal.
 *
 * Registered only by the Today tab (and by a shared link), never by the
 * guest-facing site: a worker that caches pages nobody asked it to is how stale
 * sites happen. What it holds is deliberately narrow — the portal's own pages,
 * its data payload, and Next's immutable static chunks — so the itinerary opens
 * on a boat, in a taxi, or in the hour before a flight when roaming has not woken
 * up yet.
 *
 * Strategy per kind of request:
 *   navigations to the portal   network first, fall back to the last good copy
 *   the data payload           network first, fall back — and always keep a copy
 *   /_next/static/*            cache first (content-hashed, so it cannot go stale)
 *   everything else            not our business; straight to the network
 *
 * The cached payload is the admin's own trip on the admin's own device. That is
 * the point of the feature, but it does mean signing out does not erase it —
 * `honeymoon-sw:clear` (posted by the portal) drops everything on request.
 */

const VERSION = 'v1';
const SHELL = `honeymoon-shell-${VERSION}`;
const DATA = `honeymoon-data-${VERSION}`;
const STATIC = `honeymoon-static-${VERSION}`;
const KEEP = [SHELL, DATA, STATIC];

/** The portal's own pages, and nothing else. */
function isPortalPage(url) {
    return url.pathname === '/admin/honeymoon'
        || url.pathname.startsWith('/admin/honeymoon/')
        || url.pathname.startsWith('/honeymoon/');
}

function isPayload(url) {
    return url.pathname === '/api/admin/honeymoon'
        || url.pathname.startsWith('/api/honeymoon/shared/');
}

function isImmutableAsset(url) {
    return url.pathname.startsWith('/_next/static/');
}

self.addEventListener('install', () => {
    // Nothing to precache: every URL worth holding is one the user has actually
    // visited, and guessing at build output paths from a static file would rot.
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names
            .filter((name) => name.startsWith('honeymoon-') && !KEEP.includes(name))
            .map((name) => caches.delete(name)));
        await self.clients.claim();
    })());
});

self.addEventListener('message', (event) => {
    if (event.data === 'honeymoon-sw:clear') {
        event.waitUntil((async () => {
            const names = await caches.keys();
            await Promise.all(names
                .filter((name) => name.startsWith('honeymoon-'))
                .map((name) => caches.delete(name)));
        })());
    }
});

async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    try {
        const response = await fetch(request);
        // Only a real 200 is worth keeping: an error page cached as the answer
        // is worse than no answer, and an opaque cross-origin response cannot be
        // read back usefully anyway.
        if (response && response.status === 200 && response.type === 'basic') {
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        const cached = await cache.match(request, { ignoreSearch: false });
        if (cached) return cached;
        throw error;
    }
}

async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response && response.status === 200 && response.type === 'basic') {
        cache.put(request, response.clone());
    }
    return response;
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    // Writes are never cached and never replayed: a POST served from a cache
    // would be a booking made twice.
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (isPayload(url)) {
        event.respondWith(networkFirst(request, DATA));
        return;
    }
    if (isImmutableAsset(url)) {
        event.respondWith(cacheFirst(request, STATIC));
        return;
    }
    if (request.mode === 'navigate' && isPortalPage(url)) {
        event.respondWith(networkFirst(request, SHELL));
    }
});
