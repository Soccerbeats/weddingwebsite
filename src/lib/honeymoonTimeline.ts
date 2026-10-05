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
import { distanceKm, hasCoords, travelModeMeta } from './honeymoon';
import type { Booking, Day, Place, Stop, TravelLeg, TravelMode } from './honeymoon';

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

/* ────────────────────────────────────────────────────────────────────────────
 * The day as a shape, for the timeline view.
 *
 * `buildTimeline` above answers "does this day work" — when you arrive, whether
 * you are late, how long the drives are. These answer a different question:
 * what does the day *look* like. One turns the stops into a stacked bar of
 * lengths, the other lays them along a clock. Both are pure, both take stops
 * that mostly have no times on them, and neither invents a fact: a length that
 * was not typed is marked `assumed`, so the view can draw it faintly rather
 * than pretending it was planned.
 * ──────────────────────────────────────────────────────────────────────────── */

/** How long a stop is assumed to take when nothing says otherwise. */
export const ASSUMED_STOP_MINUTES = 90;

/** No segment of the bar goes below this — a sliver cannot be grabbed. */
export const MIN_SEGMENT_MINUTES = 15;

/** Dragging lands on a round number; nobody plans 43 minutes at a temple. */
export const SEGMENT_SNAP_MINUTES = 5;

export interface DaySegment {
    stopId: number;
    label: string;
    /** Minutes this stop takes up in the bar. */
    minutes: number;
    /** Its share of the bar, 0–1. */
    share: number;
    /** The length is a stand-in, not something typed. */
    assumed: boolean;
}

/**
 * How long each stop is, when most of them do not say.
 *
 * A stop with no length borrows the average of the ones that have one, and
 * `ASSUMED_STOP_MINUTES` when none do — which is what makes a day of untimed
 * stops come out as equal slices, the honest picture of "no plan yet", rather
 * than a bar that implies an order of magnitude nobody chose.
 */
export function daySegments(
    stops: Stop[], labelOf: (stop: Stop) => string,
): DaySegment[] {
    const typed = stops
        .map((stop) => stop.duration_minutes)
        .filter((minutes): minutes is number => typeof minutes === 'number' && minutes > 0);
    const fallback = typed.length
        ? Math.max(MIN_SEGMENT_MINUTES, Math.round(typed.reduce((a, b) => a + b, 0) / typed.length))
        : ASSUMED_STOP_MINUTES;

    const lengths = stops.map((stop) => ({
        stop,
        minutes: stop.duration_minutes && stop.duration_minutes > 0
            ? stop.duration_minutes
            : fallback,
        assumed: !(stop.duration_minutes && stop.duration_minutes > 0),
    }));
    const total = lengths.reduce((sum, row) => sum + row.minutes, 0);

    return lengths.map(({ stop, minutes, assumed }) => ({
        stopId: stop.id,
        label: labelOf(stop),
        minutes,
        share: total > 0 ? minutes / total : 0,
        assumed,
    }));
}

/**
 * Drag the boundary between two segments.
 *
 * The bar keeps its total length: what one stop gains the next one gives up,
 * the way a splitter behaves. Growing the day is what the lengths themselves
 * are for, and a drag that changed the total would move every other boundary on
 * screen at the same time.
 *
 * Returns only the stops whose length actually changed.
 */
export function resizeSegments(
    segments: DaySegment[], index: number, deltaMinutes: number,
): { stopId: number; minutes: number }[] {
    const left = segments[index];
    const right = segments[index + 1];
    if (!left || !right) return [];

    const snapped = Math.round(deltaMinutes / SEGMENT_SNAP_MINUTES) * SEGMENT_SNAP_MINUTES;
    // How far the boundary can travel before one side would be too small to grab.
    const room = right.minutes - MIN_SEGMENT_MINUTES;
    const give = left.minutes - MIN_SEGMENT_MINUTES;
    const move = Math.max(-give, Math.min(room, snapped));
    if (move === 0) return [];

    return [
        { stopId: left.stopId, minutes: left.minutes + move },
        { stopId: right.stopId, minutes: right.minutes - move },
    ];
}

export interface ClockItem {
    stopId: number;
    label: string;
    /** Minutes past midnight. */
    startMinutes: number;
    endMinutes: number;
    /** As clock times, for the label. */
    start: string;
    end: string;
    /** Where it sits on the axis, 0–100. */
    startPct: number;
    widthPct: number;
    /** Labels alternate so two neighbours never collide. */
    above: boolean;
    /** Neither the time nor the length was typed. */
    assumed: boolean;
}

export interface ClockLegItem {
    legId: number;
    label: string;
    mode: TravelMode;
    startMinutes: number;
    endMinutes: number;
    start: string;
    end: string;
    startPct: number;
    widthPct: number;
    /** Landed this morning off a leg that left yesterday. */
    fromPrevDay: boolean;
    /** Still travelling at midnight. */
    toNextDay: boolean;
}

export interface ClockMarker {
    kind: DayMarker['kind'];
    label: string;
    time: string;
    pct: number;
}

export interface ClockLayout {
    startMinutes: number;
    endMinutes: number;
    items: ClockItem[];
    ticks: { minutes: number; label: string; pct: number }[];
    /** The day's travel, on the same axis as the stops. */
    legs: ClockLegItem[];
    /** Check-out and check-in, as moments on the axis. */
    markers: ClockMarker[];
    /** Legs with no times typed — listed, never drawn at midnight. */
    untimedLegs: DayLeg[];
    /** Stops placed by spreading, because nobody gave them a time. */
    untimedStopIds: number[];
}

/**
 * Lay the day along a clock.
 *
 * Stops that have a time are nailed to it. The rest are spread evenly through
 * the gap they fall in — between the stop before and the stop after, or between
 * midnight and the first fixed thing, or between the last fixed thing and
 * midnight. A day with no times at all is therefore spread evenly across the
 * whole twenty-four hours, which is the same rule rather than a special case.
 *
 * The axis runs from the first thing to the last, not from midnight to
 * midnight: a day that happens between nine and six should use the whole width
 * rather than draw fifteen empty hours either side of itself.
 */
export function clockLayout(
    stops: Stop[], labelOf: (stop: Stop) => string,
    extras: { legs?: DayLeg[]; markers?: DayMarker[] } = {},
): ClockLayout {
    const timedLegs = (extras.legs ?? []).filter(
        (leg): leg is DayLeg & { startMinutes: number; endMinutes: number } =>
            leg.startMinutes != null && leg.endMinutes != null,
    );
    const untimedLegs = (extras.legs ?? []).filter((leg) => leg.startMinutes == null || leg.endMinutes == null);
    const markers = extras.markers ?? [];
    const empty: ClockLayout = {
        startMinutes: 0, endMinutes: 1440, items: [], ticks: [], legs: [], markers: [], untimedLegs, untimedStopIds: [],
    };
    if (!stops.length && !timedLegs.length) return empty;

    const anchors = stops.map((stop) => minutesOf(stop.start_time));
    const lengths = daySegments(stops, labelOf);

    /* Spread each run of untimed stops through the gap it lives in. */
    const starts: number[] = new Array(stops.length).fill(0);
    let cursor = 0;
    while (cursor < stops.length) {
        const at = anchors[cursor];
        if (at != null) { starts[cursor] = at; cursor += 1; continue; }
        let run = cursor;
        while (run < stops.length && anchors[run] == null) run += 1;
        const previous = cursor > 0 ? starts[cursor - 1] + lengths[cursor - 1].minutes : 0;
        const next = run < stops.length ? anchors[run] as number : 1440;
        const span = Math.max(0, next - previous);
        const count = run - cursor;
        for (let i = 0; i < count; i += 1) {
            starts[cursor + i] = previous + (span * (i + 1)) / (count + 1);
        }
        cursor = run;
    }

    const items = stops.map((stop, index) => ({
        stop,
        start: Math.round(starts[index]),
        end: Math.round(starts[index] + lengths[index].minutes),
        assumed: anchors[index] == null && lengths[index].assumed,
    }));

    // The axis takes in everything that happens: stops, travel and the
    // check-in/out moments, so a 9am drive is not cut off a day that starts at 10.
    const edges = [
        ...items.flatMap((row) => [row.start, row.end]),
        ...timedLegs.flatMap((leg) => [leg.startMinutes, leg.endMinutes]),
        ...markers.map((marker) => marker.minutes),
    ];
    const first = Math.min(...edges);
    const last = Math.max(...edges);
    // A single instant is not a scale; give it an hour to sit in.
    const startMinutes = last > first ? first : Math.max(0, first - 30);
    const endMinutes = last > first ? last : Math.min(1440, last + 30);
    const span = Math.max(1, endMinutes - startMinutes);
    const pctOf = (minutes: number) => ((minutes - startMinutes) / span) * 100;

    const step = span <= 360 ? 60 : span <= 720 ? 120 : 180;
    const ticks: ClockLayout['ticks'] = [];
    for (let t = Math.ceil(startMinutes / step) * step; t < endMinutes; t += step) {
        ticks.push({ minutes: t, label: clockOf(t), pct: pctOf(t) });
    }

    return {
        startMinutes,
        endMinutes,
        ticks,
        items: items.map((row, index) => ({
            stopId: row.stop.id,
            label: labelOf(row.stop),
            startMinutes: row.start,
            endMinutes: row.end,
            start: clockOf(row.start),
            end: clockOf(row.end),
            startPct: pctOf(row.start),
            widthPct: ((row.end - row.start) / span) * 100,
            above: index % 2 === 0,
            assumed: row.assumed,
        })),
        legs: timedLegs.map((leg) => ({
            legId: leg.legId,
            label: leg.label,
            mode: leg.mode,
            startMinutes: leg.startMinutes,
            endMinutes: leg.endMinutes,
            start: clockOf(leg.startMinutes),
            end: clockOf(leg.endMinutes),
            startPct: pctOf(leg.startMinutes),
            widthPct: ((leg.endMinutes - leg.startMinutes) / span) * 100,
            fromPrevDay: leg.fromPrevDay,
            toNextDay: leg.toNextDay,
        })),
        markers: markers.map((marker) => ({
            kind: marker.kind, label: marker.label, time: clockOf(marker.minutes), pct: pctOf(marker.minutes),
        })),
        untimedLegs,
        untimedStopIds: stops.filter((stop) => minutesOf(stop.start_time) == null).map((stop) => stop.id),
    };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Travel and the hotel, on the day's timeline.
 *
 * The timeline view's job is "everything on this day, when we need to be there
 * and when it ends" — and the flight is the most fixed thing on a travel day.
 * These turn a day's legs and stay bookings into things the clock and the
 * stacked bar can draw beside the stops.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface DayLeg {
    legId: number;
    label: string;
    mode: TravelMode;
    /** Minutes past midnight on *this* day; null when no time was typed. */
    startMinutes: number | null;
    endMinutes: number | null;
    fromPrevDay: boolean;
    toNextDay: boolean;
}

function legLabel(leg: Pick<TravelLeg, 'mode' | 'from_text' | 'to_text'>): string {
    const ends = [leg.from_text, leg.to_text].filter(Boolean).join(' → ');
    return `${travelModeMeta(leg.mode).icon} ${ends || travelModeMeta(leg.mode).label}`;
}

/**
 * The legs that touch a day: the ones leaving it, and the ones landing on it
 * from an earlier day.
 *
 * A leg still in the air at midnight runs to the end of its departure day and
 * resumes from the start of its arrival day. A same-day leg whose arrival reads
 * earlier than its departure crossed midnight without saying so; it runs to the
 * end of the day rather than drawing a bar of negative width.
 */
export function dayLegs(day: Day, arrivals: { leg: TravelLeg; fromDay: Day }[]): DayLeg[] {
    const leaving = [...day.travel].sort((a, b) => a.sort_order - b.sort_order).map((leg): DayLeg => {
        const start = minutesOf(leg.depart_time);
        const arrive = minutesOf(leg.arrive_time);
        const overnight = leg.arrive_day_offset > 0
            || (start != null && arrive != null && arrive < start);
        return {
            legId: leg.id,
            label: legLabel(leg),
            mode: leg.mode,
            startMinutes: start,
            endMinutes: start == null ? null : overnight ? 1440 : arrive,
            fromPrevDay: false,
            toNextDay: overnight,
        };
    });
    const landing = arrivals.map(({ leg }): DayLeg => {
        const arrive = minutesOf(leg.arrive_time);
        return {
            legId: leg.id,
            label: legLabel(leg),
            mode: leg.mode,
            startMinutes: arrive == null ? null : 0,
            endMinutes: arrive,
            fromPrevDay: true,
            toNextDay: false,
        };
    });
    return [...landing, ...leaving];
}

export interface DayMarker {
    kind: 'check-out' | 'check-in';
    label: string;
    minutes: number;
}

/**
 * Check-out and check-in on a date, from the stay bookings.
 *
 * Only where a time was recorded: "out by 11" is the thing worth a line on the
 * clock, and inventing an 11 for a booking that never said would put a deadline
 * on the day that nobody set.
 */
export function dayMarkers(
    dateIso: string | null, bookings: Booking[], placeName: (id: number | null) => string,
): DayMarker[] {
    if (!dateIso) return [];
    const marks: DayMarker[] = [];
    for (const booking of bookings) {
        if (booking.kind !== 'stay') continue;
        const name = placeName(booking.place_id);
        const out = booking.check_out === dateIso ? minutesOf(booking.check_out_time) : null;
        if (out != null) marks.push({ kind: 'check-out', label: `Check out${name ? ` · ${name}` : ''}`, minutes: out });
        const into = booking.check_in === dateIso ? minutesOf(booking.check_in_time) : null;
        if (into != null) marks.push({ kind: 'check-in', label: `Check in${name ? ` · ${name}` : ''}`, minutes: into });
    }
    return marks.sort((a, b) => a.minutes - b.minutes);
}

export interface SequenceSlice {
    kind: 'stop' | 'leg';
    /** The stop's id or the leg's id. */
    id: number;
    label: string;
    minutes: number;
    share: number;
    assumed: boolean;
    /** Clock times, when the day says them. */
    start: string | null;
    end: string | null;
    mode?: TravelMode;
}

/** How long a leg is assumed to take when its times are missing. */
export const ASSUMED_LEG_MINUTES = 60;

/**
 * The day as one stacked bar: stops *and* travel, in the order they happen.
 *
 * Stops keep the lengths `daySegments` gives them; a leg takes its real length
 * when both times are known. Each slice is ordered by when it starts — a stop's
 * typed time, or a leg's departure — and a slice with no time keeps its place
 * relative to its neighbours. A leg that landed this morning goes first.
 */
export function daySequence(stops: Stop[], legs: DayLeg[], labelOf: (stop: Stop) => string): SequenceSlice[] {
    const segments = daySegments(stops, labelOf);
    const clock = clockLayout(stops, labelOf);
    const timedStops = new Set(stops.filter((s) => minutesOf(s.start_time) != null).map((s) => s.id));

    const rows: (SequenceSlice & { at: number; order: number })[] = [];
    segments.forEach((segment, index) => {
        const item = clock.items[index];
        const timed = timedStops.has(segment.stopId);
        rows.push({
            kind: 'stop', id: segment.stopId, label: segment.label, minutes: segment.minutes, share: 0,
            assumed: segment.assumed,
            start: timed ? item.start : null,
            end: timed ? item.end : null,
            // Untimed stops sort by where the clock spread them, which keeps
            // them between the timed neighbours they were listed between.
            at: item.startMinutes,
            order: index,
        });
    });
    legs.forEach((leg, index) => {
        const known = leg.startMinutes != null && leg.endMinutes != null;
        rows.push({
            kind: 'leg', id: leg.legId, label: leg.label, mode: leg.mode,
            minutes: known ? Math.max(1, (leg.endMinutes as number) - (leg.startMinutes as number)) : ASSUMED_LEG_MINUTES,
            share: 0,
            assumed: !known,
            start: leg.startMinutes != null ? clockOf(leg.startMinutes) : null,
            end: leg.endMinutes != null ? (leg.toNextDay ? null : clockOf(leg.endMinutes)) : null,
            at: leg.fromPrevDay ? -1 : leg.startMinutes ?? -0.5,
            order: index,
        });
    });
    rows.sort((a, b) => a.at - b.at || (a.kind === b.kind ? a.order - b.order : a.kind === 'leg' ? -1 : 1));
    const total = rows.reduce((sum, row) => sum + row.minutes, 0);
    return rows.map(({ at: _at, order: _order, ...row }) => ({ ...row, share: total > 0 ? row.minutes / total : 0 }));
}
