import { NextResponse } from 'next/server';
import { getHoneymoonPayload } from '@/lib/honeymoonDb';
import { buildTripCalendar } from '@/lib/honeymoonCalendar';
import { shareFor, touchShare } from '@/lib/honeymoonShare';

/**
 * A calendar feed a phone can subscribe to.
 *
 * The downloaded `.ics` goes stale the day after you export it, which for a
 * document you are still editing is most of its life. A subscription is the same
 * calendar at a URL: iOS, Android and Google Calendar all poll it, so moving a
 * stop in the portal moves it on the phone.
 *
 * Authenticated by the same share token as the read-only link, because it is the
 * same kind of thing — a URL you hand to a device, revocable, expiring. It lives
 * outside `/api/admin` deliberately: a calendar client cannot log in.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const params = new URL(request.url).searchParams;
    const token = params.get('token') ?? '';
    const share = await shareFor(token);
    // 404, not 401: an unknown, revoked and expired token are the same answer,
    // and a calendar client is not going to be shown a login page.
    if (!share) return new NextResponse('Not found', { status: 404 });

    try {
        const data = await getHoneymoonPayload();
        const body = buildTripCalendar(data, {
            alarmMinutes: Math.max(0, Math.min(240, Number(params.get('alarm')) || 30)),
        });
        if (!body) return new NextResponse('No dates set', { status: 404 });
        await touchShare(share.id);

        return new NextResponse(body, {
            headers: {
                'Content-Type': 'text/calendar; charset=utf-8',
                // Subscribed clients poll on their own schedule; a short cache
                // keeps a chatty one from re-reading the whole trip every minute
                // without making an edit take an hour to show up.
                'Cache-Control': 'public, max-age=300',
            },
        });
    } catch (error) {
        console.error('Error building the honeymoon feed:', error);
        return new NextResponse('Could not build the calendar', { status: 500 });
    }
}
