import { NextResponse } from 'next/server';
import { exchangeRate } from '@/lib/honeymoonFetch';

/**
 * One exchange rate, from cache, from a manual override, or from the wire.
 *
 * A rate you typed wins over a fetched one for good: if you agreed 15,800 rupiah
 * to the dollar, that is the number the budget should use.
 */
export async function GET(request: Request) {
    const params = new URL(request.url).searchParams;
    const base = (params.get('base') ?? '').trim();
    const quote = (params.get('quote') ?? '').trim();
    if (!base || !quote) {
        return NextResponse.json({ error: 'base and quote are required' }, { status: 400 });
    }
    try {
        const rate = await exchangeRate(base, quote);
        if (rate == null) {
            return NextResponse.json({ error: 'No rate available for that pair' }, { status: 404 });
        }
        return NextResponse.json({ base: base.toUpperCase(), quote: quote.toUpperCase(), rate });
    } catch (error) {
        console.error('Error fetching rate:', error);
        return NextResponse.json({ error: 'Could not fetch that rate' }, { status: 500 });
    }
}
