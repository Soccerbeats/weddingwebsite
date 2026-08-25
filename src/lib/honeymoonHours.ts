/**
 * Opening hours, as OSM writes them.
 *
 * The geocoder hands back `extratags.opening_hours` — the real OSM syntax, which
 * is a small language: `Mo-Fr 09:00-17:00; Sa 10:00-14:00; Su off`, `24/7`,
 * `Mo-Su 08:00-22:00`, and a long tail of holiday rules, month ranges, sunset
 * offsets and week numbers that this deliberately does not implement.
 *
 * What it does implement is the part that answers "is this open when we planned
 * to be there" for the overwhelming majority of real entries, and — just as
 * important — says *unknown* rather than guessing when the spec uses something
 * it does not understand. A confident wrong answer here means standing outside a
 * locked temple.
 */

export type OpenState = 'open' | 'closed' | 'unknown';

const DAYS = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'] as const;

/** Day index for an OSM day token, or null. */
function dayIndex(token: string): number | null {
    const index = DAYS.indexOf(token.slice(0, 2).toLowerCase() as typeof DAYS[number]);
    return index < 0 ? null : index;
}

interface Span { days: Set<number>; from: number; to: number; closed: boolean }

function minutes(value: string): number | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const hours = Number(match[1]);
    const mins = Number(match[2]);
    if (hours > 24 || mins > 59) return null;
    return hours * 60 + mins;
}

function daysFrom(token: string): Set<number> | null {
    const days = new Set<number>();
    for (const part of token.split(',')) {
        const range = part.trim();
        if (!range) continue;
        const dash = range.split('-');
        if (dash.length === 1) {
            const index = dayIndex(dash[0]);
            if (index == null) return null;
            days.add(index);
        } else if (dash.length === 2) {
            const from = dayIndex(dash[0]);
            const to = dayIndex(dash[1]);
            if (from == null || to == null) return null;
            // Wraps: Sa-Mo is Saturday, Sunday, Monday.
            for (let i = from; ; i = (i + 1) % 7) {
                days.add(i);
                if (i === to) break;
            }
        } else return null;
    }
    return days.size ? days : null;
}

/**
 * Parse a spec into spans, or null when it uses something unsupported.
 *
 * Null is the important return value: it is what stops the UI claiming a place
 * is closed because the spec said `Mo-Fr 09:00-17:00; PH off` and this does not
 * know about public holidays.
 */
export function parseHours(spec: string | null | undefined): Span[] | null {
    const clean = (spec ?? '').trim();
    if (!clean) return null;
    if (/^24\/7$/i.test(clean)) {
        return [{ days: new Set([0, 1, 2, 3, 4, 5, 6]), from: 0, to: 1440, closed: false }];
    }
    // Anything with a month, week, holiday, sunset offset or "open ended" marker
    // is beyond this parser, and pretending otherwise is the failure mode.
    if (/\b(PH|SH|easter|week|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(clean)) {
        return null;
    }
    if (/(sunrise|sunset|dusk|dawn|\+)/i.test(clean)) return null;

    const spans: Span[] = [];
    for (const rule of clean.split(';')) {
        const trimmed = rule.trim();
        if (!trimmed) continue;
        const match = /^([A-Za-z,\-\s]+?)\s+(.+)$/.exec(trimmed);
        if (!match) return null;
        const days = daysFrom(match[1]);
        if (!days) return null;
        const value = match[2].trim().toLowerCase();
        if (value === 'off' || value === 'closed') {
            spans.push({ days, from: 0, to: 1440, closed: true });
            continue;
        }
        for (const window of value.split(',')) {
            const [fromRaw, toRaw] = window.trim().split('-');
            const from = minutes(fromRaw ?? '');
            const to = minutes(toRaw ?? '');
            if (from == null || to == null) return null;
            spans.push({ days, from, to, closed: false });
        }
    }
    return spans.length ? spans : null;
}

/**
 * Is it open at this day and time?
 *
 * `day` is 0 for Sunday, matching `Date#getUTCDay`. A window that ends before it
 * starts runs past midnight (`Fr 20:00-02:00`), so it also opens the small hours
 * of the following day.
 */
export function openAt(spec: string | null | undefined, day: number, minute: number): OpenState {
    const spans = parseHours(spec);
    if (!spans) return 'unknown';
    const previous = (day + 6) % 7;
    let closedToday = false;
    for (const span of spans) {
        if (span.closed && span.days.has(day)) closedToday = true;
    }
    for (const span of spans) {
        if (span.closed) continue;
        if (span.to > span.from) {
            if (span.days.has(day) && minute >= span.from && minute < span.to) return 'open';
        } else {
            // Overnight: tonight's late half, or last night's spill into today.
            if (span.days.has(day) && minute >= span.from) return 'open';
            if (span.days.has(previous) && minute < span.to) return 'open';
        }
    }
    return closedToday || spans.some((span) => !span.closed) ? 'closed' : 'unknown';
}

/** Day-of-week index for a `YYYY-MM-DD`, read in UTC so it never drifts. */
export function dayOfWeek(dateIso: string): number {
    const [year, month, day] = dateIso.slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(year, (month || 1) - 1, day || 1)).getUTCDay();
}

/** A one-line human summary of a spec, or the raw string when it is beyond us. */
export function describeHours(spec: string | null | undefined): string | null {
    const clean = (spec ?? '').trim();
    if (!clean) return null;
    if (/^24\/7$/i.test(clean)) return 'Open all hours';
    return clean.replace(/;\s*/g, ' · ');
}

/** Would this stop find the door locked? Used for the itinerary's warnings. */
export function stopIsOutsideHours(
    spec: string | null | undefined, dateIso: string | null, time: string | null,
): boolean {
    if (!spec || !dateIso || !time) return false;
    const match = /^(\d{1,2}):(\d{2})$/.exec(time);
    if (!match) return false;
    const minute = Number(match[1]) * 60 + Number(match[2]);
    return openAt(spec, dayOfWeek(dateIso), minute) === 'closed';
}
