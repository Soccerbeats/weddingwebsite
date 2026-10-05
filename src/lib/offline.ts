/**
 * What the site saves for offline use.
 *
 * Every page in `src/app` is in one of these three lists — `check:offline`
 * fails if a page is added without deciding which. A page in a list is opened
 * once by the warm-up pass so it, its data and its photos are saved; an
 * excluded page is one that cannot or must not be saved.
 */

/** The wedding website. Saved for anyone using the installed app. */
export const PUBLIC_PAGES = [
    '/',
    '/about',
    '/our-story',
    '/wedding-party',
    '/schedule',
    '/photos',
    '/rsvp',
    '/registry',
    '/work-in-progress',
    // What a never-saved page falls back to — saved first, always.
    '/offline',
] as const;

/** The admin panel. Saved only for a request with a valid admin session. */
export const ADMIN_PAGES = [
    '/admin',
    '/admin/dashboard',
    '/admin/rsvps',
    '/admin/finances',
    '/admin/seating',
    '/admin/honeymoon',
    '/admin/honeymoon/today',
    '/admin/honeymoon/itinerary',
    '/admin/honeymoon/map',
    '/admin/honeymoon/places',
    '/admin/honeymoon/stays',
    '/admin/honeymoon/excursions',
    '/admin/honeymoon/travel',
    '/admin/honeymoon/checklist',
    '/admin/honeymoon/files',
    '/admin/honeymoon/guide',
    '/admin/honeymoon/settings',
    '/admin/home',
    '/admin/nav-cards',
    '/admin/about',
    '/admin/faqs',
    '/admin/timeline',
    '/admin/wedding-party',
    '/admin/schedule',
    '/admin/photos',
    '/admin/registry',
    '/admin/settings',
    '/admin/color',
    '/admin/wip-control',
    '/admin/changelog',
] as const;

/**
 * Pages that are never saved: the login (saving it would be pointless and
 * confusing offline) and the read-only share link, whose URL carries a token
 * and is opened by someone else's phone.
 */
export const EXCLUDED_PAGES = [
    '/admin/login',
    '/honeymoon/[token]',
] as const;

/** A saved copy older than this is refreshed by the next warm-up. Mirrors `public/sw.js`. */
export const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

export interface WarmRecord {
    at: number;
    buildId: string;
}

/** Same rule as the worker's `isStale`; `check:offline` holds the two together. */
export function isWarmStale(record: WarmRecord | null, buildId: string, now: number): boolean {
    if (!record || typeof record.at !== 'number') return true;
    if (record.buildId !== buildId) return true;
    return now - record.at > STALE_AFTER_MS;
}
