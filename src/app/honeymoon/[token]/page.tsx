import { notFound } from 'next/navigation';
import SharedTodayView from '@/components/honeymoon/SharedTodayView';
import { getHoneymoonPayload } from '@/lib/honeymoonDb';
import { shareFor, touchShare } from '@/lib/honeymoonShare';
import { planForToday } from '@/lib/honeymoonToday';
import type { HoneymoonPayload } from '@/lib/honeymoon';

/**
 * The trip, for the other half of the couple.
 *
 * No login, no admin API, no writes: the token in the URL is the whole
 * credential, and everything this page needs is resolved on the server and
 * handed down as data. An unknown, revoked or expired token is a 404 — the same
 * answer to all three, because which one it was is not a stranger's business.
 */
export const dynamic = 'force-dynamic';

/**
 * What each scope may show.
 *
 * `today` is deliberately one day: it is the link you send someone who wants to
 * know where you are, not a copy of the planning. Places are trimmed to the ones
 * the visible days actually reference — the library is two hundred rows of
 * shortlisting and none of it belongs in a shared link.
 */
function trim(payload: HoneymoonPayload, scope: string, dayNumber: number | null): HoneymoonPayload {
    const days = scope === 'today' && dayNumber != null
        ? payload.days.filter((day) => day.day_number === dayNumber)
        : payload.days;

    const keep = new Set<number>();
    for (const day of days) {
        if (day.base_place_id != null) keep.add(day.base_place_id);
        for (const stop of day.stops) if (stop.place_id != null) keep.add(stop.place_id);
    }

    return {
        ...payload,
        days,
        places: payload.places.filter((place) => keep.has(place.id)),
        // The guide is trip reading; the shortlists, budget and checklist are
        // planning, and a share link is not a window into them.
        notes: scope === 'all' ? payload.notes : [],
        todos: [],
        bookings: payload.bookings.filter(
            (booking) => (booking.place_id != null && keep.has(booking.place_id))
                || booking.stop_id != null,
        ),
        documents: [],
        comments: [],
        views: [],
        rates: [],
        shares: [],
        archives: [],
    };
}

export default async function SharedHoneymoonPage(
    { params }: { params: Promise<{ token: string }> },
) {
    const { token } = await params;
    const share = await shareFor(token);
    if (!share) notFound();

    const payload = await getHoneymoonPayload();
    await touchShare(share.id);

    // A `today` link is one day wide, so the day is resolved here rather than in
    // the browser: what it must not carry is the other twelve.
    const dayNumber = share.scope === 'today' ? planForToday(payload).dayNumber : null;

    return (
        <SharedTodayView
            payload={trim(payload, share.scope, dayNumber)}
            scope={share.scope}
            label={share.label}
        />
    );
}
