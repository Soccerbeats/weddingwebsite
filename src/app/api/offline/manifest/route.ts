import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE, verifyAdminToken } from '@/lib/auth';
import { isDemoMode } from '@/lib/demo';
import { ADMIN_PAGES, PUBLIC_PAGES } from '@/lib/offline';

export const dynamic = 'force-dynamic';

/** The icons and manifests both installed apps ask for. */
const ASSETS = [
    '/manifest.webmanifest',
    '/manifest.webmanifest?app=admin',
    '/favicon.ico',
    '/api/app-icon?size=180',
    '/api/app-icon?size=192',
    '/api/app-icon?size=512',
    '/api/app-icon?size=180&variant=admin',
    '/api/app-icon?size=192&variant=admin',
    '/api/app-icon?size=512&variant=admin',
];

/** Every file of this build's code, so nothing a page lazy-loads is missing offline. */
function staticFiles(): string[] {
    if (process.env.NODE_ENV !== 'production') return [];
    const root = path.join(process.cwd(), '.next', 'static');
    const out: string[] = [];
    const walk = (dir: string) => {
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (!entry.name.endsWith('.map')) {
                out.push(`/_next/static/${path.relative(root, full).split(path.sep).join('/')}`);
            }
        }
    };
    walk(root);
    return out;
}

function buildId(): string {
    try {
        return fs.readFileSync(path.join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim();
    } catch {
        return 'dev';
    }
}

/**
 * Tables whose writes are the server's own housekeeping, not content: caches of
 * driving routes and forecasts refill themselves whenever the portal is open,
 * and the budget writes its daily snapshot every time the finance page is read.
 * Counting them would make every phone re-download the site for nothing.
 */
const NOT_CONTENT = ['honeymoon_routes', 'honeymoon_weather', 'finance_snapshots'];

/**
 * A fingerprint of everything the site shows, so a phone can tell in one small
 * request whether anything changed since it last saved.
 *
 * The database half is Postgres's own running count of rows inserted, updated
 * and deleted per table — it moves on every write, costs nothing to read, and
 * needs no column added to forty tables. (A restart resets it, which only costs
 * one unneeded refresh.) The file half is the content config's files and their
 * modification times.
 */
async function dataVersion(): Promise<string> {
    const parts: string[] = [];
    try {
        const result = await pool.query(
            `SELECT relname, n_tup_ins + n_tup_upd + n_tup_del AS n
             FROM pg_stat_user_tables WHERE NOT (relname = ANY($1)) ORDER BY relname`,
            [NOT_CONTENT],
        );
        for (const row of result.rows) parts.push(`${row.relname}:${row.n}`);
    } catch {
        parts.push('db:unavailable');
    }
    const dir = path.join(process.cwd(), 'public', 'config');
    try {
        for (const name of fs.readdirSync(dir).sort()) {
            const stat = fs.statSync(path.join(dir, name));
            if (stat.isFile()) parts.push(`${name}:${stat.size}:${Math.trunc(stat.mtimeMs)}`);
        }
    } catch {
        parts.push('config:unavailable');
    }
    return crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
}

/**
 * What the offline warm-up should save.
 *
 * Public, because the wedding site's own installed app needs it too — but the
 * admin pages are listed only for a request carrying a valid admin session (or
 * on the open demo). Listing them to anyone would not leak their contents (the
 * pages themselves still require the session) but it would make a guest's
 * phone try to save forty pages it can only get redirected away from.
 *
 * `data` is the fingerprint above: the installed app asks for this on every
 * open and refreshes its saved copy when it differs from the one it saved.
 */
export async function GET(request: NextRequest) {
    const admin = isDemoMode() || !!(await verifyAdminToken(request.cookies.get(ADMIN_COOKIE)?.value));
    return NextResponse.json({
        buildId: buildId(),
        data: await dataVersion(),
        admin,
        pages: [...PUBLIC_PAGES, ...(admin ? ADMIN_PAGES : [])],
        assets: [...ASSETS, ...staticFiles()],
    }, { headers: { 'Cache-Control': 'no-store' } });
}
