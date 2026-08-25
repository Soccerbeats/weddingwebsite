import { NextResponse } from 'next/server';
import { getHoneymoonPayload } from '@/lib/honeymoonDb';
import { buildTripCalendar, calendarSlug } from '@/lib/honeymoonCalendar';

/**
 * The itinerary as a calendar file.
 *
 * Built server-side from the same payload the portal renders, so the file can
 * never disagree with the screen. Downloading it is the whole point — a plan
 * that only exists in an admin panel is no use standing in an airport, and this
 * is the one export that works offline on a phone with no account, no app and
 * no signal.
 */
export async function GET(request: Request) {
    try {
        const data = await getHoneymoonPayload();
        const params = new URL(request.url).searchParams;

        if (!data.trip.start_date) {
            return NextResponse.json(
                { error: 'Set the trip dates first — a calendar file needs real dates.' },
                { status: 400 },
            );
        }

        // `?alarm=30` turns on reminders; `?days=3,4,5` exports a subset.
        const alarmMinutes = Math.max(0, Math.min(240, Number(params.get('alarm')) || 0));
        const days = (params.get('days') ?? '')
            .split(',')
            .map((value) => Math.trunc(Number(value.trim())))
            .filter((value) => Number.isFinite(value) && value > 0);

        const body = buildTripCalendar(data, { alarmMinutes, days });
        if (!body) {
            return NextResponse.json({ error: 'Nothing to export yet.' }, { status: 400 });
        }
        const slug = calendarSlug(data.trip.title);

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
