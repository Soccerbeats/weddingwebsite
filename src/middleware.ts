import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import { isDemoMode } from '@/lib/demo';

const SECRET_KEY = process.env.ADMIN_PASSWORD || 'default_secret_password';
const JWT_SECRET = new TextEncoder().encode(SECRET_KEY);

/** The methods that change something. GET/HEAD/OPTIONS are always let through. */
const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

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
