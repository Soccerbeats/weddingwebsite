/**
 * Whether this build runs the offline worker (`public/sw.js`), and the one
 * place that registers it.
 *
 * Off under `next dev`: the worker answers pages from its saved copy first, so
 * on a development server an edit would show up one reload late — or not at
 * all, behind a copy saved by an earlier run. Development gets the network,
 * every time. `NEXT_PUBLIC_OFFLINE_IN_DEV=true` turns it back on, for working
 * on the offline mode itself (`check:offline:ui` runs against a production
 * build and is unaffected).
 */
export const OFFLINE_WORKER_ENABLED =
    process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_OFFLINE_IN_DEV === 'true';

/**
 * Register the site's worker. With the worker off, this removes one a previous
 * run left behind — and its saved copies — and rejects, so a caller that shows
 * "available offline" says it is not.
 */
export function registerSiteWorker(): Promise<ServiceWorkerRegistration> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
        return Promise.reject(new Error('Service workers are not supported here'));
    }
    if (!OFFLINE_WORKER_ENABLED) {
        void retireSiteWorker();
        return Promise.reject(new Error('The offline worker is off on a development server'));
    }
    return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

/** Unregister any worker on this origin and delete what it saved. */
export async function retireSiteWorker(): Promise<void> {
    try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.unregister()));
        if (typeof caches !== 'undefined') {
            const keys = await caches.keys();
            await Promise.all(keys.map((key) => caches.delete(key)));
        }
    } catch {
        // Nothing to retire, or the browser will not say: either way, nothing to do.
    }
}
