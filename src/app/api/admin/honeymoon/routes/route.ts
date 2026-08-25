import { NextResponse } from 'next/server';
import { hopOf, roadRoute } from '@/lib/honeymoonFetch';

/**
 * Road times for a batch of coordinate pairs.
 *
 * A batch because a day has several hops and the itinerary wants all of them at
 * once — one request per hop was the shape that made this feature feel slow
 * enough not to build. Each pair is resolved from the cache when it can be, so
 * asking for the same day twice costs nothing.
 *
 * Failures are per pair and never fatal: a pair that could not be routed comes
 * back `null` and the caller falls back to its straight-line estimate.
 */
const MAX_PAIRS = 60;

interface PairInput {
    from?: { lat?: unknown; lng?: unknown };
    to?: { lat?: unknown; lng?: unknown };
    mode?: unknown;
    key?: unknown;
}

function coord(raw: unknown): number | null {
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) && Math.abs(n) <= 180 ? n : null;
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const pairs: PairInput[] = Array.isArray(body?.pairs) ? body.pairs.slice(0, MAX_PAIRS) : [];
        if (!pairs.length) return NextResponse.json({ results: [] });

        const results = await Promise.all(pairs.map(async (pair, index) => {
            const fromLat = coord(pair.from?.lat);
            const fromLng = coord(pair.from?.lng);
            const toLat = coord(pair.to?.lat);
            const toLng = coord(pair.to?.lng);
            const id = typeof pair.key === 'string' ? pair.key : String(index);
            if (fromLat == null || fromLng == null || toLat == null || toLng == null) {
                return { key: id, hop: null };
            }
            const mode = pair.mode === 'foot' || pair.mode === 'bike' ? pair.mode : 'car';
            const route = await roadRoute(
                { lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng }, mode,
            );
            return {
                key: id,
                hop: hopOf(route),
                geometry: route?.geometry ?? null,
            };
        }));

        return NextResponse.json({ results });
    } catch (error) {
        console.error('Error routing:', error);
        return NextResponse.json({ error: 'Could not work out driving times' }, { status: 500 });
    }
}
