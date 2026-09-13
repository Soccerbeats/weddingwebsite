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
 * `4:00 PM`, `4pm`, `16:00`, `9.30am`, `noon` — and deliberately unwilling to
 * guess: anything it does not recognise answers null and keeps its place rather
 * than being sorted somewhere arbitrary.
 */
export function parseEventTime(time: string): number | null {
    const text = (time ?? '').trim().toLowerCase();
    if (!text) return null;
    if (/^noon$|^midday$/.test(text)) return 12 * 60;
    if (/^midnight$/.test(text)) return 0;

    const match = text.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/);
    if (!match) return null;

    let hour = Number(match[1]);
    const minute = match[2] === undefined ? 0 : Number(match[2]);
    const meridiem = (match[3] ?? '').replace(/\./g, '');
    if (minute > 59) return null;

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

/** A blank row, with every field the editor writes. */
export function blankEvent(): ScheduleEvent {
    return { time: '', title: '', description: '', location: '', public: true };
}
