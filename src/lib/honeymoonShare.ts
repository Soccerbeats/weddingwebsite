/**
 * Read-only links for the honeymoon portal.
 *
 * The portal is single-admin by design, and the trip is for two. A share link
 * is the smallest thing that fixes that without inventing a second account
 * system: a random token in a URL, revocable, optionally expiring, that renders
 * the Today view and the itinerary and nothing else. It cannot write, it cannot
 * reach `/api/admin/*`, and it is never guessable — the token is the credential,
 * so it is 192 bits of randomness rather than a slug.
 */
import { randomBytes } from 'crypto';
import pool from './db';
import { ensureHoneymoonTables } from './honeymoonDb';
import { todayIso } from './honeymoon';
import type { ShareScope } from './honeymoon';

export interface ShareRecord {
    id: number;
    token: string;
    label: string;
    scope: ShareScope;
    expires_on: string | null;
    revoked: boolean;
}

/** 32 URL-safe characters. Long enough that guessing is not a strategy. */
export function newShareToken(): string {
    return randomBytes(24).toString('base64url');
}

function scopeOf(raw: unknown): ShareScope {
    return raw === 'itinerary' || raw === 'all' ? raw : 'today';
}

export async function createShare(
    label: string, scope: unknown, expiresOn: string | null,
): Promise<ShareRecord> {
    await ensureHoneymoonTables();
    const token = newShareToken();
    const result = await pool.query(
        `INSERT INTO honeymoon_shares (token, label, scope, expires_on)
         VALUES ($1, $2, $3, $4) RETURNING id, token, label, scope, expires_on, revoked`,
        [token, label.trim(), scopeOf(scope), expiresOn || null],
    );
    return result.rows[0];
}

/**
 * The share behind a token, or null.
 *
 * Null covers every reason equally — unknown, revoked, expired — because the
 * page's answer to all three is the same 404, and telling a stranger which of
 * them it was is telling them something.
 */
export async function shareFor(token: string): Promise<ShareRecord | null> {
    if (!token || token.length > 64) return null;
    await ensureHoneymoonTables();
    const result = await pool.query(
        `SELECT id, token, label, scope, expires_on, revoked
         FROM honeymoon_shares WHERE token = $1`,
        [token],
    );
    const row = result.rows[0];
    if (!row || row.revoked) return null;
    const expires = row.expires_on
        ? String(row.expires_on instanceof Date
            ? row.expires_on.toISOString().slice(0, 10)
            : row.expires_on).slice(0, 10)
        : null;
    if (expires && expires < todayIso()) return null;
    return { ...row, expires_on: expires, scope: scopeOf(row.scope) };
}

/** Note that someone opened it — the only thing a share link writes. */
export async function touchShare(id: number): Promise<void> {
    try {
        await pool.query('UPDATE honeymoon_shares SET last_seen_at = NOW() WHERE id = $1', [id]);
    } catch {
        // A failed timestamp must never stop the page rendering: it is a
        // courtesy for the admin, not part of the answer.
    }
}
