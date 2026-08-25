/**
 * Travel as journeys, not as legs filed onto days.
 *
 * A ticket is one booking with one reference covering several legs: SAN → SEA →
 * SIN → DPS is *one* flight to enter. Modelling it as three legs each assigned
 * to a day put the burden the wrong way round — the person typing had to work
 * out which trip day each hop landed on, which is exactly the arithmetic a
 * computer should do from the dates on the confirmation.
 *
 * So: legs carry the real dates, and *this* module works out which day each one
 * belongs to, how long the whole thing takes, how long the layovers are, and
 * what is wrong with it. `day_id` and `arrive_day_offset` are still what the
 * itinerary, the calendar and the print sheet read — they are now derived rather
 * than chosen.
 */
import { daysBetween, legIsOvernight, travelModeMeta } from './honeymoon';
import type { Day, HoneymoonPayload, Journey, TravelLeg, TravelMode, Trip } from './honeymoon';
import { addDaysIso, instantOf, legRealMinutes, zoneOffsetMinutes } from './honeymoonTimeline';

/** A journey with its legs, in the order they are flown. */
export interface JourneyGroup {
    /** Null for a leg that belongs to no journey — its own journey of one. */
    journey: Journey | null;
    /** A stable key for React and for grouping: the id, or `leg-<id>`. */
    key: string;
    legs: TravelLeg[];
    /** The day each leg is currently drawn on, by leg id. */
    dayOf: Map<number, Day>;
    /** Where it starts and ends, from the first and last leg. */
    from: string | null;
    to: string | null;
    /** Every stop on the way, for the "SAN → SEA → SIN → DPS" summary. */
    route: string[];
    /** First departure date and last arrival date, when the legs say. */
    departDate: string | null;
    arriveDate: string | null;
    /** Door to door, in minutes — only when every leg has zones and dates. */
    totalMinutes: number | null;
    /** In the air (or on the road), excluding layovers. */
    movingMinutes: number | null;
    layovers: Layover[];
    problems: JourneyProblem[];
    /** The mode to show for the journey as a whole: its longest leg's. */
    mode: TravelMode;
}

export interface Layover {
    /** The leg you arrive on, and the one you leave on. */
    afterLegId: number;
    beforeLegId: number;
    /** Where you are waiting. */
    at: string | null;
    minutes: number | null;
    /** True when the airport you land at is not the one you leave from. */
    changesAirport: boolean;
    /** Under an hour and a quarter, which is not enough with bags. */
    tight: boolean;
    /** The connection leaves before you land. */
    impossible: boolean;
}

export interface JourneyProblem {
    kind: 'no-day' | 'no-dates' | 'tight-layover' | 'impossible-layover' | 'airport-change'
        | 'gap' | 'no-times';
    message: string;
    legId?: number;
}

/** Under this many minutes between landing and taking off again is tight. */
export const TIGHT_LAYOVER_MINUTES = 75;

/**
 * The date a leg leaves on.
 *
 * `depart_date` when it has been given, otherwise the date of the day it is
 * filed under — which is how every leg entered before journeys existed still
 * works out to the right answer.
 */
export function legDepartDate(
    leg: TravelLeg, dayNumber: number | null, startDate: string | null,
): string | null {
    if (leg.depart_date) return leg.depart_date;
    if (dayNumber == null || !startDate) return null;
    return addDaysIso(startDate, dayNumber - 1);
}

/** The date a leg lands, from its own field or from the day offset. */
export function legArriveDate(
    leg: TravelLeg, departDate: string | null,
): string | null {
    if (leg.arrive_date) return leg.arrive_date;
    if (!departDate) return null;
    return addDaysIso(departDate, Math.max(0, leg.arrive_day_offset));
}

/**
 * Which day a date belongs to, and what to do when none does.
 *
 * A date inside the trip that has no day row is a real situation — the trip's
 * range has not been dragged out that far yet — and it is worth saying rather
 * than silently filing the leg on the nearest day.
 */
export function dayForDate(days: Day[], startDate: string | null, date: string | null): {
    day: Day | null; dayNumber: number | null; beyond: boolean;
} {
    if (!date || !startDate) return { day: null, dayNumber: null, beyond: false };
    const offset = daysBetween(startDate, date);
    if (offset == null) return { day: null, dayNumber: null, beyond: false };
    const dayNumber = offset + 1;
    const day = days.find((row) => row.day_number === dayNumber) ?? null;
    return { day, dayNumber, beyond: day == null };
}

/**
 * The fields a leg needs so the rest of the app draws it in the right place.
 *
 * Everything that renders the trip reads `day_id` and `arrive_day_offset`; this
 * is the one function that turns the dates a person types into those. Returns
 * null when the dates cannot place it, so a caller can say so instead of
 * writing a guess.
 */
export function placementFor(
    legDates: { depart_date: string | null; arrive_date: string | null },
    days: Day[],
    trip: Pick<Trip, 'start_date'>,
): { day_id: number; arrive_day_offset: number } | null {
    const { day } = dayForDate(days, trip.start_date, legDates.depart_date);
    if (!day) return null;
    const span = legDates.arrive_date && legDates.depart_date
        ? Math.max(0, daysBetween(legDates.depart_date, legDates.arrive_date) ?? 0)
        : 0;
    return { day_id: day.id, arrive_day_offset: span };
}

/** Minutes between two instants at their own ends of the world. */
function minutesBetween(
    fromDate: string | null, fromTime: string | null, fromZone: string | null,
    toDate: string | null, toTime: string | null, toZone: string | null,
): number | null {
    if (!fromDate || !fromTime || !toDate || !toTime) return null;
    // With no zones, treat both ends as the same clock: still useful for a car
    // hop, and honest for anything that does not cross a zone.
    const from = instantOf(fromDate, fromTime, fromZone ?? 'UTC');
    const to = instantOf(toDate, toTime, toZone ?? 'UTC');
    if (!from || !to) return null;
    return Math.round((to.getTime() - from.getTime()) / 60_000);
}

/**
 * Group the trip's legs into journeys and work everything out.
 *
 * Sorted by when they leave, because that is the order you will travel them and
 * the order a list of tickets should read in.
 */
export function journeysOf(
    payload: Pick<HoneymoonPayload, 'trip' | 'days' | 'journeys'>,
): JourneyGroup[] {
    const { trip, days } = payload;
    const byId = new Map<number, Journey>(payload.journeys.map((row) => [row.id, row]));
    const dayOfLeg = new Map<number, Day>();
    const buckets = new Map<string, { journey: Journey | null; legs: TravelLeg[] }>();

    for (const day of days) {
        for (const leg of day.travel) {
            dayOfLeg.set(leg.id, day);
            const key = leg.journey_id != null ? `journey-${leg.journey_id}` : `leg-${leg.id}`;
            const bucket = buckets.get(key);
            if (bucket) bucket.legs.push(leg);
            else {
                buckets.set(key, {
                    journey: leg.journey_id != null ? byId.get(leg.journey_id) ?? null : null,
                    legs: [leg],
                });
            }
        }
    }

    // A journey with no legs yet still has to appear — it is what you have just
    // created and are about to add legs to.
    for (const journey of payload.journeys) {
        const key = `journey-${journey.id}`;
        if (!buckets.has(key)) buckets.set(key, { journey, legs: [] });
    }

    const groups: JourneyGroup[] = [...buckets.entries()].map(([key, bucket]) => {
        const withDates = bucket.legs.map((leg) => {
            const day = dayOfLeg.get(leg.id) ?? null;
            const departDate = legDepartDate(leg, day?.day_number ?? null, trip.start_date);
            return { leg, day, departDate, arriveDate: legArriveDate(leg, departDate) };
        }).sort((a, b) => {
            const left = `${a.departDate ?? '9999'} ${a.leg.depart_time ?? '99:99'}`;
            const right = `${b.departDate ?? '9999'} ${b.leg.depart_time ?? '99:99'}`;
            return left.localeCompare(right) || a.leg.sort_order - b.leg.sort_order;
        });

        const legs = withDates.map((entry) => entry.leg);
        const first = withDates[0];
        const last = withDates[withDates.length - 1];

        const route: string[] = [];
        for (const entry of withDates) {
            const from = (entry.leg.from_text ?? '').trim();
            const to = (entry.leg.to_text ?? '').trim();
            if (from && route[route.length - 1] !== from) route.push(from);
            if (to) route.push(to);
        }

        /* Layovers: between each landing and the next take-off. */
        const layovers: Layover[] = [];
        for (let i = 1; i < withDates.length; i += 1) {
            const before = withDates[i - 1];
            const after = withDates[i];
            const minutes = minutesBetween(
                before.arriveDate, before.leg.arrive_time, before.leg.arrive_tz,
                after.departDate, after.leg.depart_time, after.leg.depart_tz,
            );
            const landed = (before.leg.to_text ?? '').trim().toLowerCase();
            const leaves = (after.leg.from_text ?? '').trim().toLowerCase();
            layovers.push({
                afterLegId: before.leg.id,
                beforeLegId: after.leg.id,
                at: after.leg.from_text ?? before.leg.to_text ?? null,
                minutes,
                changesAirport: !!landed && !!leaves && landed !== leaves,
                tight: minutes != null && minutes > 0 && minutes < TIGHT_LAYOVER_MINUTES,
                impossible: minutes != null && minutes <= 0,
            });
        }

        /* Time in motion, and door to door. */
        const movingParts = withDates.map((entry) => legRealMinutes(
            {
                depart_time: entry.leg.depart_time,
                arrive_time: entry.leg.arrive_time,
                arrive_day_offset: entry.arriveDate && entry.departDate
                    ? Math.max(0, daysBetween(entry.departDate, entry.arriveDate) ?? 0)
                    : entry.leg.arrive_day_offset,
                depart_tz: entry.leg.depart_tz ?? 'UTC',
                arrive_tz: entry.leg.arrive_tz ?? 'UTC',
            },
            entry.departDate,
        ));
        const movingMinutes = movingParts.every((value) => value != null)
            ? movingParts.reduce((sum, value) => sum + (value ?? 0), 0)
            : null;

        const totalMinutes = first && last
            ? minutesBetween(
                first.departDate, first.leg.depart_time, first.leg.depart_tz,
                last.arriveDate, last.leg.arrive_time, last.leg.arrive_tz,
            )
            : null;

        /* What is wrong with it. */
        const problems: JourneyProblem[] = [];
        for (const entry of withDates) {
            if (!entry.departDate) {
                problems.push({
                    kind: 'no-dates',
                    legId: entry.leg.id,
                    message: `${legLabel(entry.leg)} has no departure date, so it cannot be placed `
                        + 'on a day.',
                });
                continue;
            }
            const { day, dayNumber, beyond } = dayForDate(days, trip.start_date, entry.departDate);
            if (beyond) {
                problems.push({
                    kind: 'no-day',
                    legId: entry.leg.id,
                    message: `${legLabel(entry.leg)} leaves on ${entry.departDate}, which is `
                        + `${dayNumber != null && dayNumber < 1 ? 'before the trip starts' : `day ${dayNumber} — a day the trip does not have yet`}.`,
                });
            } else if (day && entry.leg.day_id !== day.id) {
                problems.push({
                    kind: 'no-day',
                    legId: entry.leg.id,
                    message: `${legLabel(entry.leg)} is filed on day `
                        + `${dayOfLeg.get(entry.leg.id)?.day_number ?? '?'} but its date says day `
                        + `${day.day_number}.`,
                });
            }
            if (!entry.leg.depart_time || !entry.leg.arrive_time) {
                problems.push({
                    kind: 'no-times',
                    legId: entry.leg.id,
                    message: `${legLabel(entry.leg)} is missing a ${entry.leg.depart_time ? 'landing' : 'take-off'} time.`,
                });
            }
        }
        for (const layover of layovers) {
            if (layover.impossible) {
                problems.push({
                    kind: 'impossible-layover',
                    legId: layover.beforeLegId,
                    message: `The connection at ${layover.at ?? 'the stopover'} leaves before you `
                        + 'land.',
                });
            } else if (layover.tight) {
                problems.push({
                    kind: 'tight-layover',
                    legId: layover.beforeLegId,
                    message: `${layover.minutes} minutes at ${layover.at ?? 'the stopover'} — tight `
                        + 'with bags.',
                });
            }
            if (layover.changesAirport) {
                problems.push({
                    kind: 'airport-change',
                    legId: layover.beforeLegId,
                    message: `You land at ${legsLandAt(withDates, layover.afterLegId)} and leave `
                        + `from ${layover.at ?? 'somewhere else'} — that is a transfer, not a `
                        + 'connection.',
                });
            }
        }

        /** The journey's mode: whatever it spends the most legs doing. */
        const modeCounts = new Map<TravelMode, number>();
        for (const leg of legs) modeCounts.set(leg.mode, (modeCounts.get(leg.mode) ?? 0) + 1);
        const mode = bucket.journey?.kind
            ?? [...modeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
            ?? 'flight';

        return {
            journey: bucket.journey,
            key,
            legs,
            dayOf: new Map(legs.map((leg) => [leg.id, dayOfLeg.get(leg.id)!]).filter(
                (entry): entry is [number, Day] => entry[1] != null,
            )),
            from: first?.leg.from_text ?? null,
            to: last?.leg.to_text ?? null,
            route,
            departDate: first?.departDate ?? null,
            arriveDate: last?.arriveDate ?? null,
            totalMinutes,
            movingMinutes,
            layovers,
            problems,
            mode,
        };
    });

    return groups.sort((a, b) => {
        const left = `${a.departDate ?? '9999'} ${a.legs[0]?.depart_time ?? '99:99'}`;
        const right = `${b.departDate ?? '9999'} ${b.legs[0]?.depart_time ?? '99:99'}`;
        return left.localeCompare(right);
    });
}

function legLabel(leg: TravelLeg): string {
    const route = [leg.from_text, leg.to_text].filter(Boolean).join(' → ');
    return leg.flight_no || route || travelModeMeta(leg.mode).label;
}

function legsLandAt(
    entries: { leg: TravelLeg }[], legId: number,
): string {
    return entries.find((entry) => entry.leg.id === legId)?.leg.to_text ?? 'the first airport';
}

/** A journey's name: what you called it, or where it goes. */
export function journeyTitle(group: JourneyGroup): string {
    const given = group.journey?.title?.trim();
    if (given) return given;
    if (group.route.length >= 2) return group.route.join(' → ');
    return `${travelModeMeta(group.mode).label}${group.to ? ` to ${group.to}` : ''}`;
}

/** "2 h 40 m", or null. Shared by the duration and the layover chips. */
export function formatMinutes(minutes: number | null): string | null {
    if (minutes == null) return null;
    const total = Math.max(0, Math.round(minutes));
    if (total < 60) return `${total} m`;
    const hours = Math.floor(total / 60);
    const rest = total % 60;
    return rest ? `${hours} h ${rest} m` : `${hours} h`;
}

/**
 * How many days a journey spans, for the itinerary's own summary.
 *
 * Uses the dates rather than the offsets: the offsets are derived from these,
 * and a leg entered before journeys existed has only the offset.
 */
export function journeyDays(group: JourneyGroup): number {
    if (!group.departDate || !group.arriveDate) {
        return group.legs.some((leg) => legIsOvernight(leg)) ? 2 : 1;
    }
    return Math.max(1, (daysBetween(group.departDate, group.arriveDate) ?? 0) + 1);
}

/**
 * A time in one zone, read in another.
 *
 * The Travel tab shows a landing time in the *arrival* zone, which is what the
 * airport screens say — but "and that is 04:00 at home" is the thing people
 * actually want to know when booking a red-eye.
 */
export function sameInstantIn(
    date: string, time: string, fromZone: string, toZone: string,
): string | null {
    const instant = instantOf(date, time, fromZone);
    if (!instant) return null;
    const offset = zoneOffsetMinutes(toZone, instant);
    const shifted = new Date(instant.getTime() + offset * 60_000);
    return shifted.toISOString().slice(11, 16);
}
