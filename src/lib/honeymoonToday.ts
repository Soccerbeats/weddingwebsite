/**
 * Trip mode: what today looks like.
 *
 * The portal is built for planning — shortlists, a map, a library of two hundred
 * places. On the trip itself none of that is the question. The question is
 * "where are we sleeping, what's first, and how do I get there", asked at
 * breakfast with one thumb.
 *
 * This module is the arithmetic behind that view, kept out of the component so
 * it can be checked (`npm run check:honeymoon`) and reused by both the admin tab
 * and the read-only link a partner opens.
 */
import {
    addDays, dateForDay, daysBetween, formatTime, isoOf, legArrivalDay, todayIso,
} from './honeymoon';
import type {
    Booking, Day, HoneymoonPayload, Place, Stop, TravelLeg, Trip, TripInfo,
} from './honeymoon';

/** Where the trip is relative to today. */
export type TripStanding = 'before' | 'during' | 'after' | 'undated';

export interface DayStop {
    stop: Stop;
    place: Place | null;
    /** What to call it: the place's name, or the stop's own label. */
    label: string;
    /** Clock time as stored, and the same time formatted for reading. */
    time: string | null;
    /** Where it is, when it is anywhere. */
    lat: number | null;
    lng: number | null;
    address: string | null;
    /** The end of the planned window, when a duration says so. */
    until: string | null;
    booking: Booking | null;
}

export interface TodayPlan {
    standing: TripStanding;
    /** The day being shown — today's, or the nearest one worth showing. */
    day: Day | null;
    dayNumber: number | null;
    /** `YYYY-MM-DD` for the day shown. */
    date: string | null;
    /** How many days the trip has, when its dates say. */
    totalDays: number | null;
    /** Nights you are spending at `base`, and which night of them this is. */
    base: Place | null;
    baseNight: number | null;
    baseNights: number | null;
    stops: DayStop[];
    /** Legs leaving today, in departure order. */
    departures: TravelLeg[];
    /** Legs that land today, having left on an earlier day. */
    arrivals: { leg: TravelLeg; fromDayNumber: number }[];
    /** Days until departure, when the trip has not started. */
    daysUntil: number | null;
}

/** Minutes past midnight for `HH:MM`, or null. */
export function minutesOf(time: string | null | undefined): number | null {
    if (!time) return null;
    const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
}

/** `HH:MM` for minutes past midnight, wrapping past midnight rather than lying. */
export function timeOf(minutes: number): string {
    const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
    const hours = Math.floor(wrapped / 60);
    return `${String(hours).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/**
 * Which day of the trip a date is, 1-based. Null when the trip has no start
 * date, or the date falls outside it.
 */
export function dayNumberFor(
    trip: Pick<Trip, 'start_date'>, date: string, dayCount: number,
): number | null {
    const offset = daysBetween(trip.start_date, date);
    if (offset == null) return null;
    const dayNumber = offset + 1;
    return dayNumber >= 1 && dayNumber <= Math.max(dayCount, 0) ? dayNumber : null;
}

/**
 * Where the trip stands today.
 *
 * `during` runs to the last *day row*, not to `end_date`: the rows are what has
 * somewhere to be, and a trip whose dates run a day longer than its plan should
 * still show you the last planned day rather than nothing.
 */
export function standingOf(
    trip: Pick<Trip, 'start_date' | 'end_date'>, dayCount: number, today = todayIso(),
): TripStanding {
    if (!trip.start_date) return 'undated';
    const offset = daysBetween(trip.start_date, today);
    if (offset == null) return 'undated';
    if (offset < 0) return 'before';
    const last = Math.max(dayCount, trip.end_date
        ? (daysBetween(trip.start_date, trip.end_date) ?? 0) + 1
        : 0);
    return offset + 1 <= last ? 'during' : 'after';
}

/**
 * How many consecutive days share a base, and which of them a day is.
 *
 * A base is set per day; a stay is a stretch. "Night 2 of 4 at Amankila" is the
 * thing you actually want to know when the front desk asks.
 */
export function baseRun(days: Day[], dayNumber: number): { night: number; nights: number } | null {
    const ordered = [...days].sort((a, b) => a.day_number - b.day_number);
    const index = ordered.findIndex((d) => d.day_number === dayNumber);
    if (index < 0) return null;
    const baseId = ordered[index].base_place_id;
    if (baseId == null) return null;
    let first = index;
    while (first > 0 && ordered[first - 1].base_place_id === baseId) first -= 1;
    let last = index;
    while (last < ordered.length - 1 && ordered[last + 1].base_place_id === baseId) last += 1;
    return { night: index - first + 1, nights: last - first + 1 };
}

/**
 * The plan for one day, resolved.
 *
 * Everything here is already in the payload — this only joins it up: stops to
 * their places, the day to its base, legs to the day they land on, bookings to
 * whatever they are for.
 */
export function planForDay(
    payload: HoneymoonPayload, dayNumber: number | null, today = todayIso(),
): TodayPlan {
    const { trip, days, places } = payload;
    const standing = standingOf(trip, days.length, today);
    const placeById = new Map<number, Place>(places.map((place) => [place.id, place]));

    const totalDays = trip.start_date && trip.end_date
        ? (daysBetween(trip.start_date, trip.end_date) ?? 0) + 1
        : (days.length || null);

    const day = dayNumber == null
        ? null
        : days.find((d) => d.day_number === dayNumber) ?? null;

    const bookingFor = (stop: Stop): Booking | null => payload.bookings.find(
        (booking) => booking.stop_id === stop.id
            || (stop.place_id != null && booking.place_id === stop.place_id),
    ) ?? null;

    const stops: DayStop[] = (day?.stops ?? []).map((stop) => {
        const place = stop.place_id != null ? placeById.get(stop.place_id) ?? null : null;
        const start = minutesOf(stop.start_time);
        return {
            stop,
            place,
            label: place?.name ?? stop.custom_label ?? 'Something',
            time: stop.start_time,
            lat: place?.lat ?? null,
            lng: place?.lng ?? null,
            address: place?.address ?? null,
            until: start != null && stop.duration_minutes
                ? timeOf(start + stop.duration_minutes)
                : null,
            booking: bookingFor(stop),
        };
    });

    const departures = [...(day?.travel ?? [])].sort((a, b) => {
        const left = minutesOf(a.depart_time);
        const right = minutesOf(b.depart_time);
        if (left == null && right == null) return a.sort_order - b.sort_order;
        if (left == null) return 1;
        if (right == null) return -1;
        return left - right;
    });

    const arrivals = dayNumber == null ? [] : days.flatMap((other) => other.travel
        .filter((leg) => leg.arrive_day_offset > 0
            && legArrivalDay(leg, other.day_number) === dayNumber)
        .map((leg) => ({ leg, fromDayNumber: other.day_number })));

    const run = day ? baseRun(days, day.day_number) : null;

    return {
        standing,
        day,
        dayNumber: day?.day_number ?? null,
        date: day ? dateIso(trip.start_date, day.day_number) : null,
        totalDays,
        base: day?.base_place_id != null ? placeById.get(day.base_place_id) ?? null : null,
        baseNight: run?.night ?? null,
        baseNights: run?.nights ?? null,
        stops,
        departures,
        arrivals,
        daysUntil: standing === 'before' ? daysBetween(today, trip.start_date) : null,
    };
}

/** `YYYY-MM-DD` for a day number, or null when the trip has no start date. */
export function dateIso(startDate: string | null, dayNumber: number): string | null {
    const date = dateForDay(startDate, dayNumber);
    return date ? isoOf(date) : null;
}

/**
 * Today's plan, or the nearest day worth showing.
 *
 * Before the trip that is day 1 — the thing you are about to do. After it, the
 * last day, which is the trip you just had. Undated trips have no "today" at
 * all, so they get day 1 as well and the caller can say so.
 */
export function planForToday(payload: HoneymoonPayload, today = todayIso()): TodayPlan {
    const { trip, days } = payload;
    const dayCount = days.length;
    const standing = standingOf(trip, dayCount, today);
    if (!dayCount) return planForDay(payload, null, today);
    const ordered = [...days].sort((a, b) => a.day_number - b.day_number);

    if (standing === 'during') {
        const dayNumber = dayNumberFor(trip, today, Math.max(dayCount, 1));
        if (dayNumber != null && ordered.some((d) => d.day_number === dayNumber)) {
            return planForDay(payload, dayNumber, today);
        }
        // The dates cover today but no row does — show the last planned day
        // rather than an empty screen.
        return planForDay(payload, ordered[ordered.length - 1].day_number, today);
    }
    if (standing === 'after') {
        return planForDay(payload, ordered[ordered.length - 1].day_number, today);
    }
    return planForDay(payload, ordered[0].day_number, today);
}

/**
 * A maps link for a stop.
 *
 * Coordinates when they exist, because a name is ambiguous and a warung called
 * "Ibu Oka" is three different places. Falls back to the name and address, which
 * is what you would have typed anyway. `dir/?api=1` is the documented
 * cross-platform form: it opens the native app on both phones and the web map on
 * a desktop, and asking for a route beats dropping a pin you then have to tap.
 */
export function navUrl(target: {
    lat?: number | null; lng?: number | null; name?: string | null; address?: string | null;
}): string {
    const { lat, lng } = target;
    if (lat != null && lng != null) {
        return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    }
    const query = [target.name, target.address].filter(Boolean).join(', ');
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
}

/**
 * Emergency numbers, by country.
 *
 * Static because they are facts that change on the scale of decades, and because
 * the one time you need this is the one time there is no signal to look it up.
 * 112 works across the EU and on GSM networks nearly everywhere; the local
 * number is still the one that answers fastest.
 */
export const EMERGENCY_NUMBERS: Record<string, { all?: string; police?: string;
    ambulance?: string; fire?: string }> = {
    Indonesia: { all: '112', police: '110', ambulance: '119', fire: '113' },
    Singapore: { police: '999', ambulance: '995', fire: '995' },
    Malaysia: { all: '999' },
    Thailand: { all: '191', ambulance: '1669' },
    Vietnam: { police: '113', ambulance: '115', fire: '114' },
    Japan: { police: '110', ambulance: '119', fire: '119' },
    Australia: { all: '000' },
    'New Zealand': { all: '111' },
    'United States': { all: '911' },
    Canada: { all: '911' },
    'United Kingdom': { all: '999' },
    Ireland: { all: '112' },
    France: { all: '112' },
    Italy: { all: '112' },
    Spain: { all: '112' },
    Portugal: { all: '112' },
    Greece: { all: '112' },
    Germany: { all: '112' },
    Netherlands: { all: '112' },
    Mexico: { all: '911' },
    'Costa Rica': { all: '911' },
    Fiji: { police: '917', ambulance: '911' },
    Maldives: { police: '119', ambulance: '102' },
    'United Arab Emirates': { police: '999', ambulance: '998' },
};

/** The numbers for a country, or the GSM fallback with a note that it is one. */
export function emergencyFor(country: string | null | undefined): {
    country: string; numbers: { label: string; number: string }[]; guessed: boolean;
} {
    const clean = (country ?? '').trim();
    const entry = clean ? EMERGENCY_NUMBERS[clean] : undefined;
    if (!entry) {
        return {
            country: clean || 'Wherever you are',
            numbers: [{ label: 'Emergency (GSM)', number: '112' }],
            guessed: true,
        };
    }
    const numbers: { label: string; number: string }[] = [];
    if (entry.all) numbers.push({ label: 'Emergency', number: entry.all });
    if (entry.police) numbers.push({ label: 'Police', number: entry.police });
    if (entry.ambulance) numbers.push({ label: 'Ambulance', number: entry.ambulance });
    if (entry.fire) numbers.push({ label: 'Fire', number: entry.fire });
    return { country: clean, numbers, guessed: false };
}

/** The sections of `trip.info`, in the order they are worth reading. */
export const INFO_SECTIONS: { key: keyof TripInfo & string; label: string; hint: string }[] = [
    { key: 'emergency', label: 'Emergency contacts', hint: 'Who to call, and their number' },
    { key: 'insurance', label: 'Insurance', hint: 'Policy number and the 24h hotline' },
    { key: 'embassy', label: 'Embassy', hint: 'Address and phone in each country' },
    { key: 'medical', label: 'Medical', hint: 'Allergies, prescriptions, blood type' },
    { key: 'contacts', label: 'On the ground', hint: "The driver's WhatsApp, the hotel desk" },
    { key: 'money', label: 'Money', hint: 'Cards packed, bank numbers, ATM notes' },
];

/**
 * The next thing today, given the clock.
 *
 * Returns the first stop that has not started yet, so the view can lead with it.
 * Untimed stops are not "next" — nothing about them is known to be later.
 */
export function nextStop(stops: DayStop[], nowMinutes: number): DayStop | null {
    let best: { stop: DayStop; at: number } | null = null;
    for (const stop of stops) {
        const at = minutesOf(stop.time);
        if (at == null || at < nowMinutes) continue;
        if (!best || at < best.at) best = { stop, at };
    }
    return best?.stop ?? null;
}

/** The day after and before, for the two arrows on the Today view. */
export function neighbourDays(days: Day[], dayNumber: number | null): {
    previous: number | null; next: number | null;
} {
    if (dayNumber == null) return { previous: null, next: null };
    const numbers = days.map((d) => d.day_number).sort((a, b) => a - b);
    const index = numbers.indexOf(dayNumber);
    if (index < 0) return { previous: null, next: null };
    return {
        previous: index > 0 ? numbers[index - 1] : null,
        next: index < numbers.length - 1 ? numbers[index + 1] : null,
    };
}

/** `formatTime`, but a window when there is one: "09:30 – 11:00". */
export function stopWindow(stop: DayStop, format: '12h' | '24h'): string | null {
    if (!stop.time) return null;
    const start = format === '12h' ? formatTime(stop.time) : stop.time;
    if (!stop.until) return start;
    const end = format === '12h' ? formatTime(stop.until) : stop.until;
    return `${start} – ${end}`;
}

/** Tomorrow's date, for "you move tomorrow" notes. */
export function tomorrowOf(date: string | null): string | null {
    return date ? addDays(date, 1) : null;
}
