/**
 * The itinerary as a calendar, in one place.
 *
 * Two routes serve it — a download for the admin and a tokenised feed a phone
 * can subscribe to — and they must produce the same calendar, so the building is
 * here rather than in either of them.
 */
import { buildIcs, tripEvents } from './honeymoon';
import { nominalZone } from './honeymoonSun';
import type { HoneymoonPayload } from './honeymoon';

export interface CalendarOptions {
    /** Minutes before a timed stop to alarm. 0 or undefined turns alarms off. */
    alarmMinutes?: number;
    /** Only these day numbers, when the caller wants a subset. */
    days?: number[];
}

export function buildTripCalendar(
    data: HoneymoonPayload, options: CalendarOptions = {},
): string | null {
    if (!data.trip.start_date) return null;

    const names = new Map(data.places.map((place) => [place.id, place.name]));
    const addresses = new Map(data.places.map((place) => [place.id, place.address ?? undefined]));
    const byId = new Map(data.places.map((place) => [place.id, place]));

    /**
     * The zone a day happens in.
     *
     * Taken from the longitude of that day's base, which is right in the tropics
     * and at worst an hour out where a country has stretched its clock. A leg
     * with its own stored zone overrides this — that is the clock on the ticket.
     */
    const tzFor = (dayNumber: number): string | undefined => {
        const day = data.days.find((row) => row.day_number === dayNumber);
        const base = day?.base_place_id != null ? byId.get(day.base_place_id) : undefined;
        return base?.lng != null ? nominalZone(base.lng) : undefined;
    };

    const days = options.days?.length
        ? data.days.filter((day) => options.days?.includes(day.day_number))
        : data.days;

    const events = tripEvents(
        data.trip,
        days,
        (id) => names.get(id),
        (id) => addresses.get(id),
        {
            place: (id) => {
                const place = byId.get(id);
                if (!place) return undefined;
                return {
                    lat: place.lat,
                    lng: place.lng,
                    // The booking page if there is one, else the first link:
                    // tapping through from a calendar entry is how you find the
                    // confirmation while standing at a desk.
                    url: data.bookings.find((booking) => booking.place_id === id)?.url
                        ?? place.links[0]?.url,
                };
            },
            alarmMinutes: options.alarmMinutes,
            tzFor,
        },
    );

    const stamp = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
    return buildIcs(events, stamp, data.trip.title);
}

/** A filename-safe slug for the trip. */
export function calendarSlug(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'honeymoon';
}
