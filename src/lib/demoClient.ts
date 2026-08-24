/**
 * Is this the demo instance? — asked from the browser.
 *
 * Server code calls `isDemoMode()` directly. The browser cannot: the flag also
 * depends on `DATABASE_URL`, which is deliberately not shipped to the client, so
 * the answer has to come from the server that holds it. A `NEXT_PUBLIC_` mirror
 * would be a second source of truth able to disagree with the real one, which
 * for a flag whose whole job is "is it safe to drop writes" is not a trade worth
 * making.
 *
 * Asked once per page load and cached as a promise, so a hundred callers share
 * one request and none of them race.
 */
let pending: Promise<boolean> | null = null;

export function isDemoClient(): Promise<boolean> {
    if (!pending) {
        pending = fetch('/api/demo-status')
            .then((r) => (r.ok ? r.json() : null))
            .then((body) => body?.demo === true)
            // A failed check answers "not the demo", which only costs a
            // pointless refetch. Answering "demo" on a network hiccup would
            // start suppressing refreshes on a real instance, and the user
            // would be looking at data that is no longer what is stored.
            .catch(() => false);
    }
    return pending;
}
