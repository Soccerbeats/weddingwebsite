import { NextResponse } from 'next/server';
import { getHoneymoonPayload } from '@/lib/honeymoonDb';
import { buildIcs, tripEvents } from '@/lib/honeymoon';

/**
 * The itinerary as a calendar file.
 *
 * Built server-side from the same payload the portal renders, so the file can
 * never disagree with the screen. Downloading it is the whole point — a plan
 * that only exists in an admin panel is no use standing in an airport, and this
 * is the one export that works offline on a phone with no account, no app and
 * no signal.
 */
export async function GET() {
    try {
        const data = await getHoneymoonPayload();

        if (!data.trip.start_date) {
            return NextResponse.json(
                { error: 'Set the trip dates first — a calendar file needs real dates.' },
                { status: 400 },
            );
        }

        const names = new Map(data.places.map((p) => [p.id, p.name]));
        const events = tripEvents(data.trip, data.days, (id) => names.get(id));
        // Second precision, UTC, no punctuation — the DTSTAMP format.
        const stamp = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
        const body = buildIcs(events, stamp, data.trip.title);

        const slug = data.trip.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
            || 'honeymoon';

        return new NextResponse(body, {
            headers: {
                'Content-Type': 'text/calendar; charset=utf-8',
                'Content-Disposition': `attachment; filename="${slug}.ics"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('Error building the honeymoon calendar:', error);
        return NextResponse.json({ error: 'Failed to build the calendar file' }, { status: 500 });
    }
}
