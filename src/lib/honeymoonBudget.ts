/**
 * What the trip costs, and what still needs doing.
 *
 * The dashboard's old "rough cost" card apologised for itself — "a sense of
 * scale, not a budget" — because the only price on a place was free text. With
 * numeric costs, nights per stay and money on travel legs and bookings, the
 * total is arithmetic; and once it is arithmetic, the questions that were
 * unanswerable become cheap: what is not booked yet, what is about to become
 * non-refundable, and how much of the plan is actually finished.
 *
 * Pure, so `npm run check:honeymoon` covers all of it.
 */
import { daysBetween } from './honeymoon';
import type {
    Booking, CurrencyRate, Day, HoneymoonPayload, Place, TravelLeg, Trip,
} from './honeymoon';

/* ------------------------------------------------------------------ */
/* Currency                                                            */
/* ------------------------------------------------------------------ */

/**
 * Convert between currencies using the stored rates.
 *
 * Rates are held one per ordered pair (`USDIDR`), and the reverse is used when
 * only one direction is stored — one rate is one fact, and storing both
 * directions is two places for it to be wrong. Returns null when nothing can
 * bridge the two, which the UI shows as the original currency rather than a
 * number it made up.
 */
export function convert(
    amount: number, from: string | null | undefined, to: string, rates: CurrencyRate[],
): number | null {
    const source = (from ?? to).toUpperCase();
    const target = to.toUpperCase();
    if (!Number.isFinite(amount)) return null;
    if (source === target) return amount;

    const direct = rates.find((rate) => rate.pair === `${source}${target}`);
    if (direct && direct.rate > 0) return amount * direct.rate;

    const inverse = rates.find((rate) => rate.pair === `${target}${source}`);
    if (inverse && inverse.rate > 0) return amount / inverse.rate;

    // One hop through the home currency is not attempted: two uncertain rates
    // multiplied is a number with no error bar, and "we don't know" is better.
    return null;
}

/** `1 USD = 15,800 IDR`, for the rate list. */
export function describeRate(rate: CurrencyRate): string {
    const from = rate.pair.slice(0, 3);
    const to = rate.pair.slice(3, 6);
    const shown = rate.rate >= 100
        ? Math.round(rate.rate).toLocaleString('en-US')
        : rate.rate.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    return `1 ${from} = ${shown} ${to}`;
}

/* ------------------------------------------------------------------ */
/* The trip total                                                      */
/* ------------------------------------------------------------------ */

export interface CostLine {
    label: string;
    /** In the trip's home currency. */
    amount: number;
    /** How the number was arrived at — "3 nights × 420" — for the tooltip. */
    detail: string;
    kind: 'stay' | 'excursion' | 'stop' | 'travel' | 'booking';
    /** True when a currency could not be converted and was counted as-is. */
    assumed: boolean;
}

export interface Budget {
    lines: CostLine[];
    /** Everything, in the home currency. */
    total: number;
    stays: number;
    excursions: number;
    travel: number;
    other: number;
    /** What has actually been paid, from the bookings. */
    paid: number;
    /** Total minus paid: what is still to find. */
    outstanding: number;
    budget: number | null;
    /** Positive means under budget. Null when no budget is set. */
    remaining: number | null;
    /** Costs whose currency could not be converted, so the total is approximate. */
    unconverted: number;
    /** Places priced only in free text, which no total can include. */
    unpriced: number;
}

/** How many nights a place is the base for, across the whole trip. */
export function nightsAtBase(days: Day[], placeId: number): number {
    return days.filter((day) => day.base_place_id === placeId).length;
}

/**
 * The trip's cost, line by line.
 *
 * A stay priced per night is multiplied by the nights it is actually the base
 * for — which is the number the itinerary already knows and nobody wants to
 * recompute by hand every time a day moves. A per-person price is doubled,
 * because a honeymoon is two people; `travellers` is a parameter rather than a
 * constant so that is a stated assumption instead of a hidden one.
 */
export function buildBudget(
    payload: Pick<HoneymoonPayload, 'trip' | 'places' | 'days' | 'bookings' | 'rates'>,
    travellers = 2,
): Budget {
    const home = (payload.trip.home_currency || 'USD').toUpperCase();
    const lines: CostLine[] = [];
    let unconverted = 0;
    let unpriced = 0;

    const money = (amount: number | null, currency: string | null): {
        value: number; assumed: boolean;
    } | null => {
        if (amount == null || !Number.isFinite(amount)) return null;
        const converted = convert(amount, currency, home, payload.rates);
        if (converted == null) {
            unconverted += 1;
            // Counted at face value and flagged: dropping it would understate
            // the trip, and inventing a rate would misstate it.
            return { value: amount, assumed: true };
        }
        return { value: converted, assumed: false };
    };

    for (const place of payload.places) {
        if (place.archived) continue;
        if (place.cost == null) {
            if (place.price_note?.trim()) unpriced += 1;
            continue;
        }
        const nights = nightsAtBase(payload.days, place.id);
        const multiplier = place.cost_per === 'night'
            ? Math.max(nights, 0)
            : place.cost_per === 'person' ? travellers : 1;
        if (multiplier === 0) continue;
        const amount = money(place.cost * multiplier, place.cost_currency);
        if (!amount) continue;
        lines.push({
            label: place.name,
            amount: amount.value,
            detail: place.cost_per === 'night'
                ? `${nights} night${nights === 1 ? '' : 's'} × ${place.cost}`
                : place.cost_per === 'person'
                    ? `${travellers} × ${place.cost}`
                    : `${place.cost}`,
            kind: place.is_excursion ? 'excursion' : nights > 0 ? 'stay' : 'stop',
            assumed: amount.assumed,
        });
    }

    for (const day of payload.days) {
        for (const leg of day.travel) {
            const amount = money(leg.cost, leg.cost_currency);
            if (!amount) continue;
            lines.push({
                label: [leg.from_text, leg.to_text].filter(Boolean).join(' → ') || 'Travel',
                amount: amount.value,
                detail: `Day ${day.day_number}`,
                kind: 'travel',
                assumed: amount.assumed,
            });
        }
    }

    /*
     * Bookings only add what the place did not already say.
     *
     * A stay with a cost *and* a booking with a cost is one expense recorded
     * twice; the booking is the more specific number, so it replaces the
     * place's line rather than joining it.
     */
    for (const booking of payload.bookings) {
        const amount = money(booking.cost, booking.cost_currency);
        if (!amount) continue;
        const place = booking.place_id != null
            ? payload.places.find((row) => row.id === booking.place_id) ?? null
            : null;
        if (place) {
            const at = lines.findIndex((line) => line.label === place.name);
            if (at >= 0) {
                lines[at] = {
                    ...lines[at],
                    amount: amount.value,
                    detail: `booked${booking.confirmation ? ` · ${booking.confirmation}` : ''}`,
                    assumed: amount.assumed,
                };
                continue;
            }
        }
        lines.push({
            label: place?.name ?? booking.provider ?? 'Booking',
            amount: amount.value,
            detail: booking.confirmation ?? 'booked',
            kind: 'booking',
            assumed: amount.assumed,
        });
    }

    const sum = (kinds: CostLine['kind'][]) => lines
        .filter((line) => kinds.includes(line.kind))
        .reduce((total, line) => total + line.amount, 0);

    const total = lines.reduce((running, line) => running + line.amount, 0);
    const paid = payload.bookings.reduce((running, booking) => {
        const amount = booking.cost_paid ?? (booking.paid ? booking.cost : null);
        const converted = amount != null
            ? convert(amount, booking.cost_currency, home, payload.rates) ?? amount
            : 0;
        return running + converted;
    }, 0);

    const budget = payload.trip.budget;
    return {
        lines: lines.sort((a, b) => b.amount - a.amount),
        total,
        stays: sum(['stay']),
        excursions: sum(['excursion']),
        travel: sum(['travel']),
        other: sum(['stop', 'booking']),
        paid,
        outstanding: Math.max(0, total - paid),
        budget,
        remaining: budget != null ? budget - total : null,
        unconverted,
        unpriced,
    };
}

/* ------------------------------------------------------------------ */
/* What still needs doing                                              */
/* ------------------------------------------------------------------ */

export interface Deadline {
    label: string;
    /** `YYYY-MM-DD`. */
    date: string;
    daysAway: number;
    kind: 'cancel' | 'deposit';
    booking: Booking;
}

/**
 * Dates after which money stops being refundable, soonest first.
 *
 * The most expensive mistake in trip planning is a cancellation window that
 * closed while you were still deciding. Past dates are dropped — a deadline you
 * have already passed is a fact, not a task.
 */
export function deadlinesOf(bookings: Booking[], today: string, placeName: (id: number | null) => string): Deadline[] {
    const out: Deadline[] = [];
    for (const booking of bookings) {
        const name = placeName(booking.place_id) || booking.provider || 'A booking';
        if (booking.cancel_by) {
            const away = daysBetween(today, booking.cancel_by);
            if (away != null && away >= 0) {
                out.push({
                    label: `${name} — free cancellation ends`,
                    date: booking.cancel_by,
                    daysAway: away,
                    kind: 'cancel',
                    booking,
                });
            }
        }
        if (booking.deposit_due_on && !booking.paid) {
            const away = daysBetween(today, booking.deposit_due_on);
            if (away != null && away >= 0) {
                out.push({
                    label: `${name} — deposit due`,
                    date: booking.deposit_due_on,
                    daysAway: away,
                    kind: 'deposit',
                    booking,
                });
            }
        }
    }
    return out.sort((a, b) => a.daysAway - b.daysAway);
}

export interface UnbookedDay {
    dayNumber: number;
    date: string | null;
    /** The base, when there is one that simply is not booked. */
    base: Place | null;
    reason: 'no-base' | 'not-booked';
    daysUntil: number | null;
}

/**
 * Days you are sleeping somewhere that is not booked.
 *
 * Deliberately only the days *inside* the horizon: a trip six months out has
 * nothing booked and saying so twenty times is noise. `withinDays` is the window
 * where it stops being a plan and starts being a problem.
 */
export function unbookedDays(
    payload: Pick<HoneymoonPayload, 'trip' | 'places' | 'days' | 'bookings'>,
    today: string,
    withinDays = 60,
): UnbookedDay[] {
    const start = payload.trip.start_date;
    const untilTrip = daysBetween(today, start);
    if (untilTrip == null || untilTrip > withinDays) return [];

    const byId = new Map(payload.places.map((place) => [place.id, place]));
    const bookedPlaceIds = new Set(
        payload.bookings
            .filter((booking) => booking.place_id != null)
            .map((booking) => booking.place_id as number),
    );

    const out: UnbookedDay[] = [];
    for (const day of payload.days) {
        const base = day.base_place_id != null ? byId.get(day.base_place_id) ?? null : null;
        const date = start
            ? new Date(Date.parse(`${start}T00:00:00Z`) + (day.day_number - 1) * 86_400_000)
                .toISOString().slice(0, 10)
            : null;
        const daysUntil = date ? daysBetween(today, date) : null;
        // A day already behind you is not a problem to solve.
        if (daysUntil != null && daysUntil < 0) continue;
        if (!base) {
            out.push({ dayNumber: day.day_number, date, base: null, reason: 'no-base', daysUntil });
            continue;
        }
        const booked = base.status === 'booked' || bookedPlaceIds.has(base.id);
        if (!booked) {
            out.push({
                dayNumber: day.day_number, date, base, reason: 'not-booked', daysUntil,
            });
        }
    }
    return out;
}

export interface Completeness {
    /** 0–100. */
    score: number;
    days: number;
    withBase: number;
    withStops: number;
    withTravelWhenBaseChanges: number;
    /** Days where the base changed but no leg explains how you got there. */
    missingTravel: number[];
    booked: number;
}

/**
 * How finished the plan is, as a number.
 *
 * Four things, equally weighted: every day has somewhere to sleep, every day has
 * at least two things to do, every change of base has a travel leg that explains
 * it, and every base is booked. Deliberately crude — it is a progress bar for
 * the last twenty per cent, not a grade.
 */
export function completenessOf(
    payload: Pick<HoneymoonPayload, 'places' | 'days' | 'bookings'>,
): Completeness {
    const days = payload.days.length;
    if (!days) {
        return {
            score: 0, days: 0, withBase: 0, withStops: 0, withTravelWhenBaseChanges: 0,
            missingTravel: [], booked: 0,
        };
    }
    const byId = new Map(payload.places.map((place) => [place.id, place]));
    const bookedPlaceIds = new Set(
        payload.bookings.filter((b) => b.place_id != null).map((b) => b.place_id as number),
    );

    const ordered = [...payload.days].sort((a, b) => a.day_number - b.day_number);
    let withBase = 0;
    let withStops = 0;
    let booked = 0;
    let changes = 0;
    let explained = 0;
    const missingTravel: number[] = [];

    ordered.forEach((day, index) => {
        if (day.base_place_id != null) {
            withBase += 1;
            const base = byId.get(day.base_place_id);
            if (base && (base.status === 'booked' || bookedPlaceIds.has(base.id))) booked += 1;
        }
        if (day.stops.length >= 2) withStops += 1;
        if (index > 0) {
            const previous = ordered[index - 1];
            if (previous.base_place_id !== day.base_place_id
                && previous.base_place_id != null && day.base_place_id != null) {
                changes += 1;
                // The leg may be recorded on either day: you fly out on the
                // Monday or you arrive on the Tuesday, and both are how people
                // enter it.
                if (previous.travel.length || day.travel.length) explained += 1;
                else missingTravel.push(day.day_number);
            }
        }
    });

    const parts = [
        withBase / days,
        withStops / days,
        changes ? explained / changes : 1,
        withBase ? booked / withBase : 0,
    ];
    const score = Math.round((parts.reduce((sum, part) => sum + part, 0) / parts.length) * 100);

    return {
        score,
        days,
        withBase,
        withStops,
        withTravelWhenBaseChanges: explained,
        missingTravel,
        booked,
    };
}

/** The booking attached to a place, leg or stop — at most one of each. */
export function bookingFor(bookings: Booking[], target: {
    place?: Place | null; leg?: TravelLeg | null; stopId?: number | null;
}): Booking | null {
    if (target.stopId != null) {
        const found = bookings.find((booking) => booking.stop_id === target.stopId);
        if (found) return found;
    }
    if (target.leg) {
        const found = bookings.find((booking) => booking.travel_id === target.leg?.id);
        if (found) return found;
    }
    if (target.place) {
        const found = bookings.find((booking) => booking.place_id === target.place?.id);
        if (found) return found;
    }
    return null;
}

/** A trip-wide cost per person, for the "each" line people actually compare. */
export function perPerson(total: number, travellers = 2): number {
    return travellers > 0 ? total / travellers : total;
}

/** Money as text, without a currency library. */
export function formatMoney(amount: number, currency: string): string {
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency,
            maximumFractionDigits: amount >= 1000 || Number.isInteger(amount) ? 0 : 2,
        }).format(amount);
    } catch {
        // An unknown code is the user's own three letters; show them.
        return `${currency} ${Math.round(amount).toLocaleString('en-US')}`;
    }
}

/** The trip's own dates, as a "planning / on it / done" phase hint. */
export function phaseHint(trip: Pick<Trip, 'phase' | 'start_date'>, today: string): string | null {
    if (trip.phase !== 'planning' || !trip.start_date) return null;
    const away = daysBetween(today, trip.start_date);
    if (away == null || away > 3 || away < 0) return null;
    return away === 0
        ? 'You leave today — switch the trip to Travelling to put Today first.'
        : `You leave in ${away} day${away === 1 ? '' : 's'} — switch the trip to Travelling.`;
}
