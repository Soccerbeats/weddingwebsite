/**
 * The schedule's pure logic — which events a guest may see, and what order they
 * run in.
 *
 * Separate from `config.ts` because that module reads the filesystem, and the
 * admin editor is a client component: importing the type from there would drag
 * `fs` into the browser bundle. Nothing here touches the network, the DOM or the
 * disk. Covered by `npm run check:schedule`.
 */

export interface ScheduleEvent {
    time: string;
    title: string;
    description: string;
    location: string;
    /**
     * Shown on the public schedule page.
     *
     * Optional, and absent means **public** — every event written before this
     * field existed was on the public page, and reading a missing flag as
     * "private" would blank a live schedule the moment this shipped.
     */
    public?: boolean;
    /**
     * The day it happens, as `YYYY-MM-DD`.
     *
     * Optional, and absent means **the wedding day** — every event written
     * before weekends existed belongs to it, and so does a new row until it is
     * moved. A welcome dinner the night before or a brunch the morning after is
     * a row with a date.
     */
    date?: string;
}

/** Whether a guest may see this event. */
export function isPublicEvent(event: Pick<ScheduleEvent, 'public'>): boolean {
    return event.public !== false;
}

/** The events a guest may see, in the order the admin put them. */
export function publicScheduleEvents(events: ScheduleEvent[] | undefined): ScheduleEvent[] {
    return (events ?? []).filter(isPublicEvent);
}

/**
 * Minutes past midnight for a time as a person types it, or null.
 *
 * Deliberately forgiving about the shapes that turn up in a run-of-show —
 * `4:00 PM`, `4pm`, `16:00`, `1230`, `830am`, `9.30am`, `noon` — and
 * deliberately unwilling to guess: anything it does not recognise answers null
 * and keeps its place rather than being sorted somewhere arbitrary.
 *
 * Anchored at both ends on purpose. Matching a prefix is how `1230` used to read
 * as twelve o'clock: the hour matched, the minutes were left on the floor, and
 * nothing said so.
 */
export function parseEventTime(time: string): number | null {
    const text = (time ?? '').trim().toLowerCase();
    if (!text) return null;
    if (/^(noon|midday)$/.test(text)) return 12 * 60;
    if (/^midnight$/.test(text)) return 0;

    const match = text.match(/^(\d{1,4})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/);
    if (!match) return null;

    const digits = match[1];
    let hour: number;
    let minute: number;

    if (match[2] !== undefined) {
        // A separator says which half is which, so the hour cannot be four digits.
        if (digits.length > 2) return null;
        hour = Number(digits);
        minute = Number(match[2]);
    } else if (digits.length <= 2) {
        // `8`, `16` — an hour on its own.
        hour = Number(digits);
        minute = 0;
    } else {
        // `830`, `1230`, `0800` — the last two digits are always the minutes.
        hour = Number(digits.slice(0, -2));
        minute = Number(digits.slice(-2));
    }
    if (minute > 59) return null;

    const meridiem = (match[3] ?? '').replace(/\./g, '');
    if (meridiem === 'am' || meridiem === 'pm') {
        if (hour < 1 || hour > 12) return null;
        if (hour === 12) hour = 0;
        if (meridiem === 'pm') hour += 12;
    } else if (hour > 23) {
        return null;
    }
    return hour * 60 + minute;
}

/**
 * Minutes past midnight, written the way the schedule shows them.
 *
 * One canonical shape for every row, so a day typed as `8am`, `16:00` and
 * `9.30 a.m.` does not read as three different notations on the public
 * timeline.
 */
export function formatEventTime(minutes: number): string {
    const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
    const hour24 = Math.floor(wrapped / 60);
    const minute = wrapped % 60;
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    return `${hour12}:${String(minute).padStart(2, '0')} ${hour24 < 12 ? 'AM' : 'PM'}`;
}

/**
 * Tidy a time as it was typed into the one the schedule keeps.
 *
 * `8am` becomes `8:00 AM`. Anything the parser does not recognise is handed
 * back trimmed and otherwise untouched — "after the toasts" is a real answer
 * for a row, and rewriting it would be worse than leaving it alone.
 */
export function normalizeEventTime(time: string): string {
    const at = parseEventTime(time);
    return at === null ? (time ?? '').trim() : formatEventTime(at);
}

/**
 * The day in clock order.
 *
 * The order *is* the times — there is no separate hand-ordering to preserve, so
 * moving something means changing when it happens. Rows whose time cannot be
 * read (blank, "TBD", "after the toasts") collect at the end in the order they
 * were already in, which is also where a freshly added blank row belongs: at
 * the bottom, until it is given a time and takes its place.
 */
export function sortByTime(events: ScheduleEvent[]): ScheduleEvent[] {
    const timed: { event: ScheduleEvent; at: number; index: number }[] = [];
    const untimed: { event: ScheduleEvent; index: number }[] = [];

    events.forEach((event, index) => {
        const at = parseEventTime(event.time);
        if (at === null) untimed.push({ event, index });
        else timed.push({ event, at, index });
    });

    // Ties keep the order they were in, so re-sorting a sorted day changes
    // nothing and two things at 4:00 PM do not swap on every keystroke.
    timed.sort((a, b) => a.at - b.at || a.index - b.index);
    return [...timed.map(t => t.event), ...untimed.map(u => u.event)];
}

/* ---------------------------------------------------------------------------
   Days
   --------------------------------------------------------------------------- */

/** A real calendar date as `YYYY-MM-DD`, or null. `2026-02-30` is not one. */
export function cleanIsoDate(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(Date.UTC(y, mo - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
        ? raw.trim()
        : null;
}

/**
 * Which day an event belongs to: its own date, or `weddingIso` when it has none
 * (or one that is not a date). `''` when neither is known — the wedding day,
 * date unset.
 */
export function eventDay(event: Pick<ScheduleEvent, 'date'>, weddingIso: string | null): string {
    return cleanIsoDate(event.date) ?? weddingIso ?? '';
}

/**
 * The whole schedule in order: by day, then by the clock within each day.
 *
 * `''` (the wedding day when its date is not known) sorts first: with no date to
 * place it by, the day the site is about leads. Within a day it is `sortByTime`,
 * so a schedule of one day sorts exactly as it always did.
 */
export function sortSchedule(events: ScheduleEvent[], weddingIso: string | null): ScheduleEvent[] {
    const byDay = new Map<string, ScheduleEvent[]>();
    for (const event of events) {
        const day = eventDay(event, weddingIso);
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day)!.push(event);
    }
    return [...byDay.keys()].sort().flatMap(day => sortByTime(byDay.get(day)!));
}

export interface ScheduleDay {
    /** `YYYY-MM-DD`, or `''` for the wedding day when its date is not known. */
    date: string;
    /** This is the wedding day itself. */
    wedding: boolean;
    events: ScheduleEvent[];
}

/**
 * The schedule as days, in order, each in clock order. One day — the case for
 * nearly every wedding — comes back as one group, and the page draws it with no
 * day headings at all, exactly as before.
 */
export function scheduleDays(events: ScheduleEvent[], weddingIso: string | null): ScheduleDay[] {
    const days: ScheduleDay[] = [];
    for (const event of sortSchedule(events, weddingIso)) {
        const date = eventDay(event, weddingIso);
        const last = days[days.length - 1];
        if (last && last.date === date) last.events.push(event);
        else days.push({ date, wedding: date === (weddingIso ?? ''), events: [event] });
    }
    return days;
}

/**
 * The date as the event should store it: nothing for the wedding day, so moving
 * the wedding moves every row that was simply "on the day" with it.
 */
export function storedDate(date: string, weddingIso: string | null): string | undefined {
    const clean = cleanIsoDate(date);
    return clean && clean !== weddingIso ? clean : undefined;
}

/**
 * A blank row, with every field the editor writes.
 *
 * Private until ticked. Most of what goes into a run-of-show — call times,
 * setup, breakdown — is not for guests, and the safe default for a page that
 * publishes is the one where forgetting to think about it shows nobody
 * anything. Note this is an explicit `false`, not an absent flag: absent still
 * means public, which is what keeps events written before the tick existed on
 * the page.
 */
export function blankEvent(): ScheduleEvent {
    return { time: '', title: '', description: '', location: '', public: false };
}

/* ---------------------------------------------------------------------------
   Export
   --------------------------------------------------------------------------- */

/**
 * The spreadsheet's columns.
 *
 * `Public` is one of them rather than the export being split in two: the file
 * is the whole run of the day, and a coordinator who only wants the guest-facing
 * rows filters the column. Leaving it out would produce a file nobody could tell
 * apart from a guest-facing one.
 */
export const SCHEDULE_HEADERS = ['Date', 'Time', 'Event', 'Location', 'Description', 'Public'] as const;

/**
 * The schedule as rows, in the order it is shown. A row with no date of its own
 * is exported with the wedding's, so the file reads the same on its own.
 */
export function scheduleRows(events: ScheduleEvent[], weddingIso: string | null = null): string[][] {
    return events.map(event => [
        eventDay(event, weddingIso),
        event.time ?? '',
        event.title ?? '',
        event.location ?? '',
        event.description ?? '',
        isPublicEvent(event) ? 'Yes' : 'No',
    ]);
}
