/**
 * A day as a sequence, not a list.
 *
 * The itinerary knows what is on a day and roughly where; this works out whether
 * the day is *possible*. Given each stop's start time, how long you mean to be
 * there and how long it takes to get to the next one, it computes when you
 * actually arrive everywhere — and flags the two failures worth knowing about
 * before you are standing in the road: a stop you cannot reach in time, and two
 * stops that overlap.
 *
 * Travel times come from the route cache when they have been looked up, and from
 * a straight-line estimate when they have not. The estimate is labelled as one
 * everywhere it surfaces: the whole reason for the OSRM lookup is that a
 * straight line lies about Bali's roads.
 */
import { distanceKm, hasCoords } from './honeymoon';
import type { Place, Stop } from './honeymoon';

/** How long a hop takes, and how much that number can be trusted. */
export interface Hop {
    /** Seconds of travel. */
    seconds: number;
    /** Metres of road, or of straight line for an estimate. */
    meters: number;
    source: 'road' | 'estimate';
}

/**
 * Average speed for the straight-line estimate, in km/h.
 *
 * 32 km/h sounds absurd until you have driven Bali: it is the number that makes
 * an estimate land nearest a real OSRM answer across the seed's own places.
 * Deliberately pessimistic — a plan that is early is a plan that works.
 */
export const ESTIMATE_KMH = 32;

/** A day's driving past this many minutes is worth a warning. */
export const LONG_DRIVE_MINUTES = 180;

/** Straight-line fallback for a hop, when nothing has looked the road up. */
export function estimateHop(from: Place, to: Place): Hop | null {
    if (!hasCoords(from) || !hasCoords(to)) return null;
    const km = distanceKm(
        { lat: from.lat, lng: from.lng },
        { lat: to.lat, lng: to.lng },
    );
    return {
        seconds: Math.round((km / ESTIMATE_KMH) * 3600),
        meters: Math.round(km * 1000),
        source: 'estimate',
    };
}

export interface TimelineRow {
    stop: Stop;
    place: Place | null;
    label: string;
    /** The time you asked for, as stored. */
    planned: string | null;
    /** When you can actually be there, given the stop before and the drive. */
    arrive: string | null;
    /** When you leave, given the duration. */
    leave: string | null;
    /** The hop from the previous stop, when both are pinned. */
    hopIn: Hop | null;
    /** You cannot make this one: the drive puts you there after the time set. */
    late: boolean;
    /** By how many minutes. */
    lateBy: number;
    /** The previous stop was still going when this one was due to start. */
    overlaps: boolean;
    /** Within walking distance of the day's base — no car needed. */
    walkable: boolean;
}

export interface Timeline {
    rows: TimelineRow[];
    /** Total travel between the day's stops. */
    driveMinutes: number;
    /** True when any hop had to be estimated rather than looked up. */
    estimated: boolean;
    /** Problems worth a badge on the day card. */
    lateCount: number;
    overlapCount: number;
    longDrive: boolean;
}

/** Anything within 800 m is a walk, not a drive. */
export const WALKABLE_METRES = 800;

function minutesOf(time: string | null | undefined): number | null {
    if (!time) return null;
    const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
    if (!match) return null;
    const hours = Number(match[1]);
    const mins = Number(match[2]);
    if (hours > 23 || mins > 59) return null;
    return hours * 60 + mins;
}

function clockOf(minutes: number): string {
    const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/**
 * Lay a day out.
 *
 * `hopFor` is asked for a road time per consecutive pair and may return null,
 * in which case the straight-line estimate stands in. Stops with no time at all
 * are carried along in order without inventing one: an untimed stop is a plan to
 * be somewhere, not a plan to be there at 11:40.
 */
export function buildTimeline(
    stops: Stop[],
    placeById: Map<number, Place>,
    base: Place | null,
    hopFor?: (from: Place, to: Place) => Hop | null,
): Timeline {
    const rows: TimelineRow[] = [];
    let cursor: number | null = null;
    let previousEnd: number | null = null;
    let driveSeconds = 0;
    let estimated = false;

    stops.forEach((stop, index) => {
        const place = stop.place_id != null ? placeById.get(stop.place_id) ?? null : null;
        const previousPlace = index > 0
            ? (stops[index - 1].place_id != null
                ? placeById.get(stops[index - 1].place_id as number) ?? null
                : null)
            : null;

        let hopIn: Hop | null = null;
        if (previousPlace && place && hasCoords(previousPlace) && hasCoords(place)) {
            hopIn = hopFor?.(previousPlace, place) ?? estimateHop(previousPlace, place);
            if (hopIn) {
                driveSeconds += hopIn.seconds;
                if (hopIn.source === 'estimate') estimated = true;
            }
        }

        const planned = minutesOf(stop.start_time);
        const earliest = cursor != null && hopIn ? cursor + Math.round(hopIn.seconds / 60)
            : cursor;
        const arriveMinutes = planned != null && earliest != null
            ? Math.max(planned, earliest)
            : planned ?? earliest;

        const late = planned != null && earliest != null && earliest > planned;
        const overlaps = planned != null && previousEnd != null && previousEnd > planned;

        const leaveMinutes = arriveMinutes != null && stop.duration_minutes
            ? arriveMinutes + stop.duration_minutes
            : arriveMinutes;

        rows.push({
            stop,
            place,
            label: place?.name ?? stop.custom_label ?? 'Something',
            planned: stop.start_time,
            arrive: arriveMinutes != null ? clockOf(arriveMinutes) : null,
            leave: leaveMinutes != null && stop.duration_minutes ? clockOf(leaveMinutes) : null,
            hopIn,
            late,
            lateBy: late && planned != null && earliest != null ? earliest - planned : 0,
            overlaps,
            walkable: !!(base && place && isWalkable(base, place)),
        });

        cursor = leaveMinutes ?? arriveMinutes ?? cursor;
        previousEnd = leaveMinutes ?? null;
    });

    const driveMinutes = Math.round(driveSeconds / 60);
    return {
        rows,
        driveMinutes,
        estimated,
        lateCount: rows.filter((row) => row.late).length,
        overlapCount: rows.filter((row) => row.overlaps).length,
        longDrive: driveMinutes > LONG_DRIVE_MINUTES,
    };
}

/** Close enough to the base to walk. */
export function isWalkable(base: Place, place: Place): boolean {
    if (!hasCoords(base) || !hasCoords(place)) return false;
    const km = distanceKm({ lat: base.lat, lng: base.lng }, { lat: place.lat, lng: place.lng });
    return km * 1000 <= WALKABLE_METRES;
}

/** "1 h 40 m" from seconds — the shape a drive is quoted in. */
export function formatDuration(seconds: number): string {
    const total = Math.max(0, Math.round(seconds / 60));
    if (total < 60) return `${total} min`;
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    return minutes ? `${hours} h ${minutes} m` : `${hours} h`;
}

/* ------------------------------------------------------------------ */
/* Time zones                                                          */
/* ------------------------------------------------------------------ */

/**
 * A zone's offset from UTC at an instant, in minutes.
 *
 * Formatted through `Intl` and read back, because that is the only way to ask
 * the runtime's own zone database — which knows about daylight saving, and about
 * the year Samoa skipped a day.
 */
export function zoneOffsetMinutes(timeZone: string, at: Date): number {
    try {
        const parts = new Intl.DateTimeFormat('en-GB', {
            timeZone,
            hour12: false,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        }).formatToParts(at);
        const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
        // `24` for midnight is a real quirk of some runtimes' hourCycle.
        const hour = get('hour') % 24;
        const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
        return Math.round((asUtc - at.getTime()) / 60_000);
    } catch {
        return 0;
    }
}

/** The instant at which a wall-clock time happens in a zone. */
export function instantOf(dateIso: string, time: string, timeZone: string): Date | null {
    const minutes = minutesOf(time);
    if (minutes == null || !/^\d{4}-\d{2}-\d{2}/.test(dateIso)) return null;
    const naive = Date.parse(`${dateIso.slice(0, 10)}T${clockOf(minutes)}:00Z`);
    if (Number.isNaN(naive)) return null;
    // Two passes: the offset depends on the instant, and the instant depends on
    // the offset. The second pass settles it except in the hour a zone jumps.
    const first = zoneOffsetMinutes(timeZone, new Date(naive));
    const candidate = naive - first * 60_000;
    const second = zoneOffsetMinutes(timeZone, new Date(candidate));
    return new Date(naive - second * 60_000);
}

/**
 * How long a leg really takes.
 *
 * Departure and arrival are stored as the local clock at each end, which is what
 * the ticket says and what the airport screens show. Without zones, a leg home
 * reads as taking minus four hours; with them the answer is arithmetic. Returns
 * null when either zone is missing — a guess here would be worse than a blank.
 */
export function legRealMinutes(leg: {
    depart_time: string | null; arrive_time: string | null; arrive_day_offset: number;
    depart_tz: string | null; arrive_tz: string | null;
}, departDateIso: string | null): number | null {
    if (!leg.depart_time || !leg.arrive_time || !departDateIso) return null;
    if (!leg.depart_tz || !leg.arrive_tz) return null;
    const departs = instantOf(departDateIso, leg.depart_time, leg.depart_tz);
    if (!departs) return null;
    const arriveDate = addDaysIso(departDateIso, Math.max(0, leg.arrive_day_offset));
    const arrives = instantOf(arriveDate, leg.arrive_time, leg.arrive_tz);
    if (!arrives) return null;
    return Math.round((arrives.getTime() - departs.getTime()) / 60_000);
}

/** `YYYY-MM-DD` a number of days on, in UTC so it cannot drift. */
export function addDaysIso(dateIso: string, days: number): string {
    const [year, month, day] = dateIso.slice(0, 10).split('-').map(Number);
    const shifted = new Date(Date.UTC(year, (month || 1) - 1, day || 1) + days * 86_400_000);
    return shifted.toISOString().slice(0, 10);
}
