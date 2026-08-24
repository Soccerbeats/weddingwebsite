import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import { isDemoMode } from '@/lib/demo';

const SECRET_KEY = process.env.ADMIN_PASSWORD || 'default_secret_password';
const JWT_SECRET = new TextEncoder().encode(SECRET_KEY);

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

export async function middleware(request: NextRequest) {
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
    if (
        isDemoMode()
        && WRITE_METHODS.has(request.method)
        && request.nextUrl.pathname.startsWith('/api/')
    ) {
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

    /*
     * The admin API requires the admin cookie.
     *
     * It did not, until now: the matcher covered `/admin/*` but the API routes
     * under `/api/admin/*` checked nothing themselves, so anyone who could reach
     * the site could rewrite the guest list, delete photographs or edit any page
     * with a bare `curl` — no login involved. Verified against a running
     * instance before fixing: a cookie-less PATCH returned 200 and the row
     * changed.
     *
     * Done here rather than in each of the thirty-odd handlers for the same
     * reason as the demo write-block above: one place covers every route,
     * including the ones added next month.
     *
     * The three exceptions below are why this was awkward to begin with. Those
     * endpoints live under `/api/admin/` by an accident of naming but serve the
     * *public* site — the nav and the RSVP form read the site config, the
     * registry page reads the registry, the our-story page reads the timeline —
     * so requiring a cookie for them would take the public pages down. They are
     * reads of content that is already on public pages. Everything else under
     * `/api/admin/` — the guest list, the RSVPs, the finances, the honeymoon,
     * the seating — needs the cookie for *every* method, GET included: those are
     * names, addresses and dietary requirements, and reading them was as open as
     * writing them.
     */
    if (request.nextUrl.pathname.startsWith('/api/admin')) {
        const publicRead = request.method === 'GET'
            && PUBLIC_ADMIN_READS.has(request.nextUrl.pathname);
        // The demo instance opens the whole admin panel deliberately, and its
        // writes were already answered above without ever reaching a handler.
        if (!publicRead && !isDemoMode()) {
            const token = request.cookies.get('admin_token')?.value;
            let authorised = false;
            if (token) {
                try { await jwtVerify(token, JWT_SECRET); authorised = true; } catch { /* expired or forged */ }
            }
            if (!authorised) {
                // JSON, not a redirect: the caller is fetch(), not a browser
                // following links, and a 307 to a login page would arrive as an
                // unparseable HTML body.
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
        }
    }

    // Only protect /admin routes
    if (request.nextUrl.pathname.startsWith('/admin')) {
        /*
         * The demo instance has no door.
         *
         * There is nothing to protect — the data is invented and nothing anyone
         * does to it is kept — and a login page in front of a demo just stops
         * people looking. So the whole admin panel is open, and the login page
         * itself sends you inside rather than asking for a password nobody has
         * been given.
         *
         * This is safe only *because* the instance cannot be changed; see
         * `src/lib/demo.ts` for how hard the flag is to turn on by accident, and
         * why every default fails towards "this is production".
         */
        if (isDemoMode()) {
            if (request.nextUrl.pathname === '/admin/login') {
                return NextResponse.redirect(new URL('/admin', request.url));
            }
            return NextResponse.next();
        }

        // Allow access to login page
        if (request.nextUrl.pathname === '/admin/login') {
            return NextResponse.next();
        }

        const token = request.cookies.get('admin_token')?.value;

        if (!token) {
            return NextResponse.redirect(new URL('/admin/login', request.url));
        }

        try {
            await jwtVerify(token, JWT_SECRET);
            return NextResponse.next();
        } catch (error) {
            // Token invalid or expired
            return NextResponse.redirect(new URL('/admin/login', request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    // `/api/*` joins the matcher for the demo write block above. On a normal
    // instance those requests fall straight through to `NextResponse.next()`.
    matcher: ['/admin/:path*', '/api/:path*'],
};
