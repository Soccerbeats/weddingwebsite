import { NextResponse } from 'next/server';
import { flightLookup } from '@/lib/honeymoonFetch';

/**
 * Fill in a leg from a flight number.
 *
 * The one outbound service in the portal that needs a key. With none set this
 * answers `configured: false` and the Travel tab says "add FLIGHT_API_KEY to
 * turn this on" — a missing key is a configuration fact, not an error.
 */
export async function GET(request: Request) {
    const params = new URL(request.url).searchParams;
    const number = (params.get('no') ?? '').trim();
    const date = (params.get('date') ?? '').trim();
    if (!number) return NextResponse.json({ error: 'A flight number is required' }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ error: 'A date (YYYY-MM-DD) is required' }, { status: 400 });
    }
    try {
        return NextResponse.json(await flightLookup(number, date));
    } catch (error) {
        console.error('Error looking up flight:', error);
        return NextResponse.json({ error: 'Could not look that flight up' }, { status: 500 });
    }
}
