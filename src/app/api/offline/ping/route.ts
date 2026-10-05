import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * "Is there a connection?" — answered only by the server itself.
 *
 * The offline worker never answers `/api/offline/*` from its saved copy, so a
 * page that gets a reply here is online, whatever `navigator.onLine` claims.
 */
export function GET() {
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
