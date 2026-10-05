import fs from 'fs';
import path from 'path';
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
 * What the offline warm-up should save.
 *
 * Public, because the wedding site's own installed app needs it too — but the
 * admin pages are listed only for a request carrying a valid admin session (or
 * on the open demo). Listing them to anyone would not leak their contents (the
 * pages themselves still require the session) but it would make a guest's
 * phone try to save forty pages it can only get redirected away from.
 */
export async function GET(request: NextRequest) {
    const admin = isDemoMode() || !!(await verifyAdminToken(request.cookies.get(ADMIN_COOKIE)?.value));
    return NextResponse.json({
        buildId: buildId(),
        admin,
        pages: [...PUBLIC_PAGES, ...(admin ? ADMIN_PAGES : [])],
        assets: [...ASSETS, ...staticFiles()],
    }, { headers: { 'Cache-Control': 'no-store' } });
}
