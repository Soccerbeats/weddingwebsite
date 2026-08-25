/**
 * A small fixed-window rate limiter, per key, in process memory.
 *
 * Enough for a single-instance site: it stops a script hammering the login or
 * RSVP endpoints without needing Redis. Edge-safe (no Node APIs), so the
 * middleware can use it. Counts reset when the process restarts, which is fine
 * for the purpose.
 */
interface Bucket { count: number; resetAt: number }

const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    // Opportunistic cleanup so the map cannot grow without bound.
    if (buckets.size > 5000) {
        for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    }
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return { ok: true, retryAfterSeconds: 0 };
    }
    bucket.count += 1;
    if (bucket.count > limit) {
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
    }
    return { ok: true, retryAfterSeconds: 0 };
}

/** The caller's address, as seen through a reverse proxy. */
export function clientIp(headers: { get(name: string): string | null }): string {
    const forwarded = headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    return headers.get('x-real-ip') || headers.get('cf-connecting-ip') || 'unknown';
}
