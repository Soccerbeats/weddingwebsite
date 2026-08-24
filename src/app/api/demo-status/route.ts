import { NextResponse } from 'next/server';
import { demoStatus } from '@/lib/demo';

/**
 * Whether this instance is the demo, for the browser.
 *
 * A public route with no secrets in it: the answer is a boolean and a sentence,
 * and the banner it drives has to appear on public pages as well as the admin.
 * Not cached — the flag is fixed for the life of the container, but a stale
 * "no" served to the demo would remove the one thing telling visitors where
 * they are.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json(demoStatus());
}
