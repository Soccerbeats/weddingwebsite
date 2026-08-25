import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isDemoMode } from '@/lib/demo';
import {
    ADMIN_COOKIE, cookieOptions, isSecureRequest, shouldRefresh, signAdminToken, verifyAdminToken,
} from '@/lib/auth';
import { clientIp, rateLimit } from '@/lib/rateLimit';

/** The methods that change something. GET/HEAD/OPTIONS are always let through. */
const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * The only endpoints under `/api/admin/` that answer without the admin cookie,
 * and only to GET.
 *
 * Each one backs a page a guest is meant to see: the site config (the nav, the
 * RSVP form, the registry page), the registry items, and the timeline on
 * our-story. Nothing here is private — it is the same content the public pages
 * render. Adding to this list makes something world-readable, so add only what
 * a public page cannot render without.
 */
const PUBLIC_ADMIN_READS = new Set([
    '/api/admin/site-config',
    '/api/admin/registry-items',
    '/api/admin/timeline',
]);

/**
 * Public routes that accept writes from anyone, and how hard they may be hit.
 *
 * Per IP, fixed window. Generous for a guest (nobody RSVPs twenty times in ten
 * minutes) and tight enough that a script cannot enumerate names through the
 * verification endpoint or flood the RSVP table.
 */
const PUBLIC_WRITE_LIMITS: Record<string, { limit: number; windowMs: number }> = {
    '/api/auth/login': { limit: 10, windowMs: 15 * 60_000 },
    '/api/rsvp': { limit: 20, windowMs: 10 * 60_000 },
    '/api/guest-verification': { limit: 30, windowMs: 10 * 60_000 },
};

/**
 * Public pages the Work-in-Progress controls can hide or veil.
 *
 * Checked here, server-side, so a WIP page never renders for a guest at all —
 * not even for the moment before a client-side redirect fires, and not to
 * anything that doesn't run JavaScript. The list mirrors `publicPages` on the
 * WIP control page.
 */
const GATED_PAGES = new Set(['/our-story', '/wedding-party', '/schedule', '/photos', '/registry', '/rsvp']);

/**
 * The WIP table, fetched from our own API and held for a short while.
 *
 * The middleware runs on the edge runtime and cannot open a database
 * connection, so it asks `/api/wip-status`; caching keeps that to one request
 * every few seconds rather than one per page view. A failed fetch answers
 * "nothing gated" — the page shows — because hiding the whole site on a
 * hiccup is the worse failure.
 */
type WipMap = Record<string, { is_wip: boolean; is_hidden: boolean }>;
let wipCache: { at: number; value: WipMap } | null = null;
const WIP_TTL_MS = 15_000;

async function wipStatus(origin: string): Promise<WipMap> {
    const now = Date.now();
    if (wipCache && now - wipCache.at < WIP_TTL_MS) return wipCache.value;
    try {
        const res = await fetch(`${origin}/api/wip-status`, { cache: 'no-store' });
        const value = res.ok ? ((await res.json()) as WipMap) : {};
        wipCache = { at: now, value };
        return value;
    } catch {
        return wipCache?.value ?? {};
    }
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    /*
     * On the demo instance, nothing is allowed to persist — so writes never
     * reach their route at all.
     *
     * Here rather than in the 26 route handlers that write, because this is the
     * one place that covers all of them *and* every route added later: a new
     * feature cannot forget to be immutable. It is also the reason the demo can
     * safely have no login (below) and read-only volumes: the guarantee does not
     * depend on any particular handler being careful.
     *
     * The reply is a plausible success, echoing the fields sent plus an id, so
     * client code that reads the response does not fall over. What it is not is
     * durable: the next GET returns the seeded data, which is exactly the
     * "change anything, refresh, it is all back" behaviour the demo wants.
     */
    if (isDemoMode() && WRITE_METHODS.has(request.method) && pathname.startsWith('/api/')) {
        let echo: Record<string, unknown> = {};
        // Only JSON is echoed. A multipart upload's body is not ours to parse,
        // and reading it here would consume the stream for nothing.
        if ((request.headers.get('content-type') ?? '').includes('application/json')) {
            try {
                const body = await request.json();
                // Spreading an array would produce {"0": …}; a bare array body
                // (the reorder endpoints) gets no echo.
                if (body && typeof body === 'object' && !Array.isArray(body)) echo = body;
            } catch {
                // A malformed body is not worth an error on an instance that
                // was never going to save it.
            }
        }
        return NextResponse.json({
            // A synthetic id, well clear of anything the seed created, so a
            // client that renders what it just made has something to key on.
            id: 900_000_000 + Math.floor(Math.random() * 1_000_000),
            ...echo,
            success: true,
            demo: true,
        });
    }

    // Rate limits on the endpoints the public can write to.
    const limitRule = WRITE_METHODS.has(request.method) ? PUBLIC_WRITE_LIMITS[pathname] : undefined;
    if (limitRule) {
        const verdict = rateLimit(`${pathname}:${clientIp(request.headers)}`, limitRule.limit, limitRule.windowMs);
        if (!verdict.ok) {
            return NextResponse.json(
                { error: 'Too many requests — please wait a moment and try again.' },
                { status: 429, headers: { 'Retry-After': String(verdict.retryAfterSeconds) } },
            );
        }
    }

    // One verification per request, shared by every branch below.
    const token = request.cookies.get(ADMIN_COOKIE)?.value;
    const session = token ? await verifyAdminToken(token) : null;

    /*
     * The admin API requires the admin cookie.
     *
     * Done here rather than in each of the thirty-odd handlers for the same
     * reason as the demo write-block above: one place covers every route,
     * including the ones added next month. Every method, GET included — the
     * guest list, the RSVPs, the finances, the honeymoon and the seating are
     * names, addresses and dietary requirements, and reading them was once as
     * open as writing them.
     *
     * The three exceptions live under `/api/admin/` by an accident of naming but
     * serve the *public* site; see PUBLIC_ADMIN_READS.
     */
    if (pathname.startsWith('/api/admin')) {
        const publicRead = request.method === 'GET' && PUBLIC_ADMIN_READS.has(pathname);
        // The demo instance opens the whole admin panel deliberately, and its
        // writes were already answered above without ever reaching a handler.
        if (!publicRead && !isDemoMode() && !session) {
            // JSON, not a redirect: the caller is fetch(), not a browser
            // following links, and a 307 to a login page would arrive as an
            // unparseable HTML body.
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return withRefreshedSession(request, session, NextResponse.next());
    }

    if (pathname.startsWith('/admin')) {
        /*
         * The demo instance has no door.
         *
         * There is nothing to protect — the data is invented and nothing anyone
         * does to it is kept — and a login page in front of a demo just stops
         * people looking. So the whole admin panel is open, and the login page
         * itself sends you inside rather than asking for a password nobody has
         * been given. Safe only *because* the instance cannot be changed; see
         * `src/lib/demo.ts` for how hard the flag is to turn on by accident.
         */
        if (isDemoMode()) {
            if (pathname === '/admin/login') {
                return NextResponse.redirect(new URL('/admin', request.url));
            }
            return NextResponse.next();
        }

        if (pathname === '/admin/login') return NextResponse.next();

        if (!session) {
            return NextResponse.redirect(new URL('/admin/login', request.url));
        }
        return withRefreshedSession(request, session, NextResponse.next());
    }

    // Work-in-progress gating for the public pages. Admins see everything.
    if (GATED_PAGES.has(pathname) && !session) {
        const entry = (await wipStatus(request.nextUrl.origin))[pathname];
        if (entry?.is_hidden) return NextResponse.redirect(new URL('/', request.url));
        if (entry?.is_wip) return NextResponse.redirect(new URL('/work-in-progress', request.url));
    }

    return NextResponse.next();
}

/**
 * Sliding sessions.
 *
 * A token lasts two hours from its last refresh, and any authenticated request
 * made in its final hour re-issues it. An afternoon spent in the seating chart
 * or the budget no longer ends with every save quietly returning 401 at the
 * two-hour mark; only two hours of genuine inactivity signs you out.
 */
async function withRefreshedSession(
    request: NextRequest,
    session: Awaited<ReturnType<typeof verifyAdminToken>>,
    response: NextResponse,
): Promise<NextResponse> {
    if (!session || !shouldRefresh(session)) return response;
    const fresh = await signAdminToken();
    if (!fresh) return response;
    response.cookies.set(ADMIN_COOKIE, fresh, cookieOptions(isSecureRequest(request)));
    return response;
}

export const config = {
    // `/api/*` joins the matcher for the demo write block and the rate limits;
    // the public pages join it for the WIP gate. On a normal instance anything
    // not handled above falls straight through to `NextResponse.next()`.
    matcher: [
        '/admin/:path*',
        '/api/:path*',
        '/our-story',
        '/wedding-party',
        '/schedule',
        '/photos',
        '/registry',
        '/rsvp',
    ],
};
