/**
 * Demo mode.
 *
 * The public demo instance lets anyone walk in and touch everything — no login,
 * every admin page open — because nothing they do is allowed to persist. That is
 * a very useful mode and a catastrophic one to enable by accident: writes that
 * quietly go nowhere are the worst failure this system can have, because nothing
 * reports an error and the loss only shows up later.
 *
 * So the flag is deliberately hard to turn on by mistake:
 *
 *   1. It is **off unless explicitly set**. A missing or misspelled variable
 *      leaves a normal, fully writable instance. Every default fails towards
 *      "this is production".
 *   2. It also requires the database to *look* like the demo's. `DEMO_MODE=true`
 *      pointed at a database whose name is not the demo's is treated as a
 *      misconfiguration and ignored — the case where someone pastes the demo's
 *      environment onto the real stack.
 *   3. When it refuses for that reason it says so loudly at boot, because a
 *      silently-ignored DEMO_MODE would be just as confusing in the other
 *      direction.
 *
 * Set it only in `docker/docker-compose.demo.yml`.
 */

/** The database name the demo instance uses. See the demo compose file. */
const DEMO_DB_NAME = 'demo';

let warned = false;

/**
 * True only on the demo instance.
 *
 * Cheap enough to call per request — it reads two environment variables and does
 * no I/O.
 */
export function isDemoMode(): boolean {
    if (process.env.DEMO_MODE !== 'true') return false;

    const url = process.env.DATABASE_URL ?? '';
    // The database name is the last path segment, minus any query string.
    const dbName = url.split('?')[0].split('/').pop() ?? '';
    if (dbName !== DEMO_DB_NAME) {
        if (!warned) {
            warned = true;
            console.error(
                `DEMO_MODE=true was ignored: the database is "${dbName || '(none)'}", not `
                + `"${DEMO_DB_NAME}". Demo mode only ever runs against the demo database — if `
                + 'this is the demo instance, check DATABASE_URL; if it is not, remove '
                + 'DEMO_MODE.',
            );
        }
        return false;
    }
    return true;
}

/**
 * What the browser is told, so the UI can say which instance it is.
 *
 * A demo that does not announce itself is a trap: someone shows it to a friend,
 * the friend edits the guest list, and nobody finds out for a week that it was
 * never the real one — or, worse, assumes the real one behaves this way too.
 */
export interface DemoStatus {
    demo: boolean;
    /** Shown in the banner. Kept here so the wording lives in one place. */
    notice: string;
}

export function demoStatus(): DemoStatus {
    return {
        demo: isDemoMode(),
        notice: 'Demo instance — everything here is fictional, and nothing you change is saved.',
    };
}
