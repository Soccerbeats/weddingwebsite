/**
 * The things that are wrong with the plan.
 *
 * Every signal here was already visible somewhere in the payload and collected
 * nowhere: a place scheduled twice on one day, two stops at the same time, a
 * day whose base nobody set, a stay whose booked dates do not match the days it
 * is the base for, a checklist item due after you have left. The point of a
 * conflicts panel is that you do not have to go looking.
 *
 * Pure, so the whole thing is covered by `npm run check:honeymoon`.
 */
import { addDays, daysBetween, distanceKm, hasCoords, todayIso } from './honeymoon';
import type { Booking, Day, HoneymoonPayload, Place, TodoItem } from './honeymoon';

export type ConflictKind =
    | 'duplicate-stop'
    | 'same-time'
    | 'no-base'
    | 'two-stays'
    | 'far-from-base'
    | 'base-change-no-travel'
    | 'booking-dates'
    | 'todo-after-departure'
    | 'todo-overdue';

export interface Conflict {
    kind: ConflictKind;
    /** One sentence, in the words you would use out loud. */
    message: string;
    /** Which day it is about, when it is about a day. */
    dayNumber: number | null;
    severity: 'warn' | 'info';
}

/** Anything further than this from the day's base is worth a second look. */
export const FAR_FROM_BASE_KM = 60;

/**
 * Everything wrong with the itinerary, in one list.
 *
 * Ordered so the expensive mistakes come first: a night with nowhere to sleep
 * beats a stop that is a long way from the hotel.
 */
export function conflictsOf(
    payload: Pick<HoneymoonPayload, 'trip' | 'places' | 'days' | 'bookings' | 'todos'>,
    today = todayIso(),
): Conflict[] {
    const out: Conflict[] = [];
    const byId = new Map<number, Place>(payload.places.map((place) => [place.id, place]));
    const ordered = [...payload.days].sort((a, b) => a.day_number - b.day_number);
    const start = payload.trip.start_date;

    for (const day of ordered) {
        const base = day.base_place_id != null ? byId.get(day.base_place_id) ?? null : null;

        if (!base) {
            out.push({
                kind: 'no-base',
                dayNumber: day.day_number,
                message: `Day ${day.day_number} has nowhere to sleep.`,
                severity: 'warn',
            });
        }

        // The same place twice in one day: usually a duplicate, occasionally a
        // deliberate "and back again", so it is a warning and not an error.
        const seen = new Map<number, number>();
        for (const stop of day.stops) {
            if (stop.place_id == null) continue;
            seen.set(stop.place_id, (seen.get(stop.place_id) ?? 0) + 1);
        }
        for (const [placeId, count] of seen) {
            if (count < 2) continue;
            out.push({
                kind: 'duplicate-stop',
                dayNumber: day.day_number,
                message: `${byId.get(placeId)?.name ?? 'A place'} is on day ${day.day_number} `
                    + `${count} times.`,
                severity: 'info',
            });
        }

        const times = new Map<string, number>();
        for (const stop of day.stops) {
            if (!stop.start_time) continue;
            times.set(stop.start_time, (times.get(stop.start_time) ?? 0) + 1);
        }
        for (const [time, count] of times) {
            if (count < 2) continue;
            out.push({
                kind: 'same-time',
                dayNumber: day.day_number,
                message: `Two things are set for ${time} on day ${day.day_number}.`,
                severity: 'warn',
            });
        }

        if (base && hasCoords(base)) {
            for (const stop of day.stops) {
                const place = stop.place_id != null ? byId.get(stop.place_id) : null;
                if (!place || !hasCoords(place)) continue;
                const km = distanceKm(
                    { lat: base.lat, lng: base.lng }, { lat: place.lat, lng: place.lng },
                );
                if (km > FAR_FROM_BASE_KM) {
                    out.push({
                        kind: 'far-from-base',
                        dayNumber: day.day_number,
                        message: `${place.name} is ${Math.round(km)} km from ${base.name} `
                            + `on day ${day.day_number}.`,
                        severity: 'info',
                    });
                }
            }
        }
    }

    /*
     * Two stays booked over one night.
     *
     * A day has one base, so this cannot be read off the days — it comes from
     * the bookings' own date ranges overlapping.
     */
    const stayBookings = payload.bookings.filter(
        (booking) => booking.kind === 'stay' && booking.check_in && booking.check_out,
    );
    for (let i = 0; i < stayBookings.length; i += 1) {
        for (let j = i + 1; j < stayBookings.length; j += 1) {
            const a = stayBookings[i];
            const b = stayBookings[j];
            if (a.place_id != null && a.place_id === b.place_id) continue;
            const overlaps = (a.check_in as string) < (b.check_out as string)
                && (b.check_in as string) < (a.check_out as string);
            if (!overlaps) continue;
            out.push({
                kind: 'two-stays',
                dayNumber: null,
                message: `${nameOf(byId, a)} and ${nameOf(byId, b)} are both booked over the same `
                    + 'nights.',
                severity: 'warn',
            });
        }
    }

    /* A base that changes with no leg to explain it, and booked dates that disagree. */
    ordered.forEach((day, index) => {
        if (index === 0) return;
        const previous = ordered[index - 1];
        if (previous.base_place_id == null || day.base_place_id == null) return;
        if (previous.base_place_id === day.base_place_id) return;
        if (previous.travel.length || day.travel.length) return;
        out.push({
            kind: 'base-change-no-travel',
            dayNumber: day.day_number,
            message: `You move from ${byId.get(previous.base_place_id)?.name ?? 'one stay'} to `
                + `${byId.get(day.base_place_id)?.name ?? 'another'} on day ${day.day_number} `
                + 'with no travel leg.',
            severity: 'warn',
        });
    });

    for (const booking of stayBookings) {
        if (booking.place_id == null || !start) continue;
        const nights = ordered.filter((day) => day.base_place_id === booking.place_id);
        if (!nights.length) continue;
        const firstNight = addDays(start, nights[0].day_number - 1);
        const lastNight = addDays(start, nights[nights.length - 1].day_number - 1);
        // Check-out is the morning after the last night, which is the off-by-one
        // that makes a booking look wrong when it is right.
        const expectedOut = addDays(lastNight, 1);
        if (booking.check_in !== firstNight || booking.check_out !== expectedOut) {
            out.push({
                kind: 'booking-dates',
                dayNumber: nights[0].day_number,
                message: `${nameOf(byId, booking)} is booked ${booking.check_in} → `
                    + `${booking.check_out}, but it is the base for ${firstNight} → ${expectedOut}.`,
                severity: 'warn',
            });
        }
    }

    for (const todo of payload.todos) {
        if (todo.done || !todo.due_on) continue;
        if (start && todo.due_on > start) {
            out.push({
                kind: 'todo-after-departure',
                dayNumber: null,
                message: `"${todo.text}" is due after you leave.`,
                severity: 'warn',
            });
        } else if (todo.due_on < today) {
            out.push({
                kind: 'todo-overdue',
                dayNumber: null,
                message: `"${todo.text}" was due ${todo.due_on}.`,
                severity: 'warn',
            });
        }
    }

    const order: ConflictKind[] = [
        'no-base', 'two-stays', 'base-change-no-travel', 'booking-dates', 'same-time',
        'todo-overdue', 'todo-after-departure', 'duplicate-stop', 'far-from-base',
    ];
    return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)
        || (a.dayNumber ?? 0) - (b.dayNumber ?? 0));
}

function nameOf(byId: Map<number, Place>, booking: Booking): string {
    return (booking.place_id != null ? byId.get(booking.place_id)?.name : null)
        ?? booking.provider
        ?? 'A booking';
}

/* ------------------------------------------------------------------ */
/* Stays as stretches                                                  */
/* ------------------------------------------------------------------ */

export interface StayStretch {
    place: Place | null;
    firstDay: number;
    lastDay: number;
    nights: number;
    booking: Booking | null;
    /** True when the booking's dates do not match the stretch. */
    mismatch: boolean;
}

/**
 * The trip as a list of stays, not a list of days.
 *
 * The base is stored per day because that is how it is edited; a stay is a
 * stretch of days, which is how it is booked. "Day 3–6 at Amankila, 3 nights"
 * is the sentence a confirmation email is checked against.
 */
export function stayStretches(
    payload: Pick<HoneymoonPayload, 'trip' | 'places' | 'days' | 'bookings'>,
): StayStretch[] {
    const byId = new Map<number, Place>(payload.places.map((place) => [place.id, place]));
    const ordered = [...payload.days].sort((a, b) => a.day_number - b.day_number);
    const out: StayStretch[] = [];
    const start = payload.trip.start_date;

    for (const day of ordered) {
        const last = out[out.length - 1];
        if (last && last.place?.id === day.base_place_id) {
            last.lastDay = day.day_number;
            last.nights = last.lastDay - last.firstDay + 1;
            continue;
        }
        if (day.base_place_id == null) continue;
        const place = byId.get(day.base_place_id) ?? null;
        const booking = payload.bookings.find(
            (row) => row.kind === 'stay' && row.place_id === day.base_place_id,
        ) ?? null;
        out.push({
            place,
            firstDay: day.day_number,
            lastDay: day.day_number,
            nights: 1,
            booking,
            mismatch: false,
        });
    }

    if (start) {
        for (const stretch of out) {
            if (!stretch.booking?.check_in || !stretch.booking.check_out) continue;
            const expectedIn = addDays(start, stretch.firstDay - 1);
            const expectedOut = addDays(addDays(start, stretch.lastDay - 1), 1);
            stretch.mismatch = stretch.booking.check_in !== expectedIn
                || stretch.booking.check_out !== expectedOut;
        }
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* Checklist dates                                                     */
/* ------------------------------------------------------------------ */

export type DueBucket = 'overdue' | 'today' | 'week' | 'later' | 'none';

export interface DatedTodo {
    todo: TodoItem;
    bucket: DueBucket;
    /** Negative when it is late. */
    daysAway: number | null;
}

/**
 * A checklist with its dates doing something.
 *
 * `due_on` has been stored and shown nowhere, which makes it decoration. These
 * are the four buckets that matter — late, today, this week, later — and they
 * are what the dashboard strip and the checklist's sort read.
 */
export function bucketTodos(todos: TodoItem[], today = todayIso()): DatedTodo[] {
    return todos.map((todo) => {
        if (!todo.due_on) return { todo, bucket: 'none' as DueBucket, daysAway: null };
        const away = daysBetween(today, todo.due_on);
        if (away == null) return { todo, bucket: 'none' as DueBucket, daysAway: null };
        const bucket: DueBucket = away < 0 ? 'overdue'
            : away === 0 ? 'today'
                : away <= 7 ? 'week' : 'later';
        return { todo, bucket, daysAway: away };
    });
}

/** What still needs doing in the next week, soonest first — for the dashboard. */
export function dueSoon(todos: TodoItem[], today = todayIso()): DatedTodo[] {
    return bucketTodos(todos, today)
        .filter((entry) => !entry.todo.done
            && (entry.bucket === 'overdue' || entry.bucket === 'today' || entry.bucket === 'week'))
        .sort((a, b) => (a.daysAway ?? 0) - (b.daysAway ?? 0));
}

/**
 * A packing list from the trip's own shape.
 *
 * Not a fixed list: what you need follows from what you have planned. Beach days
 * want sunscreen, temples want covered shoulders, a hike wants real shoes, and
 * a flight over five hours wants the thing you forgot last time. Suggestions
 * only — each one is added as an ordinary checklist row you can edit or delete.
 */
export function packingSuggestions(
    payload: Pick<HoneymoonPayload, 'places' | 'days'>,
): { text: string; why: string }[] {
    const byId = new Map<number, Place>(payload.places.map((place) => [place.id, place]));
    const categories = new Set<string>();
    let hasFlight = false;
    let longFlight = false;

    for (const day of payload.days) {
        for (const stop of day.stops) {
            const place = stop.place_id != null ? byId.get(stop.place_id) : null;
            if (place) categories.add(place.category);
        }
        const base = day.base_place_id != null ? byId.get(day.base_place_id) : null;
        if (base) categories.add(base.category);
        for (const leg of day.travel) {
            if (leg.mode !== 'flight') continue;
            hasFlight = true;
            if (leg.arrive_day_offset > 0) longFlight = true;
        }
    }

    const out: { text: string; why: string }[] = [];
    const add = (text: string, why: string) => out.push({ text, why });

    if (categories.has('beach')) {
        add('Reef-safe sunscreen', 'you have beach days');
        add('Two swimsuits each', 'you have beach days');
    }
    if (categories.has('temple')) {
        add('Sarong and covered shoulders', 'temples need covered knees and shoulders');
    }
    if (categories.has('nature') || categories.has('waterfall')) {
        add('Shoes that can get wet', 'waterfalls and trails');
    }
    if (categories.has('spa')) add('Flip-flops', 'spa days');
    if (categories.has('restaurant') || categories.has('food')) {
        add('One smart outfit each', 'dinner reservations');
    }
    if (hasFlight) {
        add('Passports and a photo of them on your phone', 'you are flying');
        add('Universal adapter', 'you are flying');
    }
    if (longFlight) add('Eye mask and earplugs', 'an overnight flight');
    add('Insurance details, printed', 'the one thing that is useless on a dead phone');
    add('Motion sickness tablets', 'boats and mountain roads');
    return out;
}
