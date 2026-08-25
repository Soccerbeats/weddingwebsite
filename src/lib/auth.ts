import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

/**
 * Admin session tokens.
 *
 * The signing key is `JWT_SECRET`, falling back to `ADMIN_PASSWORD` so an
 * existing deployment keeps working without a new variable. There is no
 * hard-coded default: with neither set, `getJwtSecret()` returns null, every
 * verification fails and login refuses to mint a token — a misconfigured
 * instance is locked, not open. (It used to fall back to the literal
 * 'default_secret_password', which meant an unset variable produced a cookie
 * anyone could forge.)
 *
 * Edge-safe: only `jose` and `TextEncoder`, so the middleware can import it.
 */

export const ADMIN_COOKIE = 'admin_token';
export const ADMIN_HINT_COOKIE = 'admin_hint';
/** How long a session lasts from its last refresh. */
export const SESSION_SECONDS = 2 * 60 * 60;
/** A valid token with less than this left is re-issued on the next request. */
export const REFRESH_BELOW_SECONDS = 60 * 60;

export function getJwtSecret(): Uint8Array | null {
    const raw = process.env.JWT_SECRET || process.env.ADMIN_PASSWORD;
    if (!raw) return null;
    return new TextEncoder().encode(raw);
}

export async function signAdminToken(): Promise<string | null> {
    const secret = getJwtSecret();
    if (!secret) return null;
    return new SignJWT({ role: 'admin' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${SESSION_SECONDS}s`)
        .sign(secret);
}

/** The token's payload when it is valid, otherwise null. */
export async function verifyAdminToken(token: string | undefined | null): Promise<JWTPayload | null> {
    if (!token) return null;
    const secret = getJwtSecret();
    if (!secret) return null;
    try {
        const { payload } = await jwtVerify(token, secret);
        return payload;
    } catch {
        return null;
    }
}

/** True when the token is valid but close enough to expiry to be worth renewing. */
export function shouldRefresh(payload: JWTPayload, now = Math.floor(Date.now() / 1000)): boolean {
    return typeof payload.exp === 'number' && payload.exp - now < REFRESH_BELOW_SECONDS;
}

/** Whether the request arrived over HTTPS (directly or via a TLS-terminating proxy). */
export function isSecureRequest(request: { url: string; headers: { get(name: string): string | null } }): boolean {
    const proto = request.headers.get('x-forwarded-proto');
    if (proto) return proto.split(',')[0].trim() === 'https';
    return request.url.startsWith('https://');
}

export function cookieOptions(secure: boolean) {
    return {
        httpOnly: true,
        secure,
        sameSite: 'lax' as const,
        maxAge: SESSION_SECONDS,
        path: '/',
    };
}
