import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import {
    ADMIN_COOKIE, ADMIN_HINT_COOKIE, cookieOptions, isSecureRequest, signAdminToken,
} from '@/lib/auth';

/** Compare without leaking where the strings first differ. */
function passwordsMatch(given: string, expected: string): boolean {
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) {
        // No password means no way in — never a default one.
        console.error('ADMIN_PASSWORD is not set; refusing to sign anyone in.');
        return NextResponse.json({ success: false, error: 'Admin login is not configured' }, { status: 500 });
    }

    let password: unknown;
    try {
        ({ password } = await request.json());
    } catch {
        return NextResponse.json({ success: false }, { status: 400 });
    }

    if (typeof password !== 'string' || !passwordsMatch(password, expected)) {
        return NextResponse.json({ success: false }, { status: 401 });
    }

    const token = await signAdminToken();
    if (!token) {
        return NextResponse.json({ success: false, error: 'Admin login is not configured' }, { status: 500 });
    }

    const response = NextResponse.json({ success: true });
    const options = cookieOptions(isSecureRequest(request));
    response.cookies.set(ADMIN_COOKIE, token, options);
    // Non-httpOnly hint cookie so the nav can read admin state synchronously.
    response.cookies.set(ADMIN_HINT_COOKIE, '1', { ...options, httpOnly: false });
    return response;
}
