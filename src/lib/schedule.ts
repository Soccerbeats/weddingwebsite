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
 * Sort by the clock, leaving anything unparseable exactly where it was.
 *
 * A run-of-show is filled in as things are decided, not in order, so the button
 * that tidies it has to be predictable: rows it understands are ordered by time
 * among themselves, rows it does not keep their index, and equal times keep
 * their existing order. Nobody's hand-placed row jumps to the bottom because the
 * time said "after the toasts".
 */
export function sortByTime(events: ScheduleEvent[]): ScheduleEvent[] {
    const timed: { event: ScheduleEvent; at: number; index: number }[] = [];
    const fixed = new Map<number, ScheduleEvent>();

    events.forEach((event, index) => {
        const at = parseEventTime(event.time);
        if (at === null) fixed.set(index, event);
        else timed.push({ event, at, index });
    });

    timed.sort((a, b) => a.at - b.at || a.index - b.index);

    const out: ScheduleEvent[] = [];
    let next = 0;
    for (let i = 0; i < events.length; i += 1) {
        const held = fixed.get(i);
        out.push(held ?? timed[next++].event);
    }
    return out;
}

/** Move one row, or return the list untouched when it cannot go that way. */
export function moveEvent(events: ScheduleEvent[], from: number, to: number): ScheduleEvent[] {
    if (from === to || from < 0 || to < 0 || from >= events.length || to >= events.length) return events;
    const next = [...events];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    return next;
}

/** A blank row, with every field the editor writes. */
export function blankEvent(): ScheduleEvent {
    return { time: '', title: '', description: '', location: '', public: true };
}
