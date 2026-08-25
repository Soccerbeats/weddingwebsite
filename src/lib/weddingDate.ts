/**
 * Parse the free-text wedding date and time from settings into an instant.
 *
 * The settings page stores whatever was typed — "June 15, 2024", "2026-09-12",
 * "15 June 2026" — and the countdown used to hand that straight to
 * `new Date()`. V8 is lenient, Safari and Firefox are not, so the same string
 * counted down on a laptop and showed zeros on an iPhone. This tries the
 * native parser first and then picks the date apart by hand.
 *
 * Returns null when nothing usable can be found, so callers can say "date not
 * set" rather than counting down to 1970.
 */

const MONTHS: Record<string, number> = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
    may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
    september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

export interface DateParts { year: number; month: number; day: number }
export interface TimeParts { hours: number; minutes: number }

export function parseDateParts(raw: string | undefined | null): DateParts | null {
    const text = (raw ?? '').trim();
    if (!text) return null;

    // ISO: 2026-09-12
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return { year: +iso[1], month: +iso[2] - 1, day: +iso[3] };

    // US numeric: 9/12/2026 or 09-12-2026
    const us = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (us) return { year: +us[3], month: +us[1] - 1, day: +us[2] };

    // Month name anywhere: "June 15, 2024", "15 June 2026", "Sat, Sep 12 2026"
    const lower = text.toLowerCase();
    const monthMatch = lower.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\b/);
    const yearMatch = lower.match(/\b(\d{4})\b/);
    if (monthMatch && yearMatch) {
        const month = MONTHS[monthMatch[1]];
        // The day is the 1–2 digit number that is not the year.
        const rest = lower.replace(yearMatch[0], ' ');
        const dayMatch = rest.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
        const day = dayMatch ? +dayMatch[1] : 1;
        if (day >= 1 && day <= 31) return { year: +yearMatch[1], month, day };
    }

    // Last resort: whatever the engine makes of it.
    const native = new Date(text);
    if (!Number.isNaN(native.getTime())) {
        return { year: native.getFullYear(), month: native.getMonth(), day: native.getDate() };
    }
    return null;
}

export function parseTimeParts(raw: string | undefined | null): TimeParts | null {
    const text = (raw ?? '').trim().toLowerCase();
    if (!text) return null;
    const m = text.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/);
    if (!m) return null;
    let hours = +m[1];
    const minutes = m[2] ? +m[2] : 0;
    const meridiem = m[3]?.replace(/\./g, '');
    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
    if (hours > 23 || minutes > 59) return null;
    return { hours, minutes };
}

/** The wedding as a local-time Date, or null when the date cannot be read. */
export function weddingDateTime(date: string | undefined | null, time?: string | undefined | null): Date | null {
    const d = parseDateParts(date);
    if (!d) return null;
    const t = parseTimeParts(time) ?? { hours: 0, minutes: 0 };
    const result = new Date(d.year, d.month, d.day, t.hours, t.minutes, 0, 0);
    return Number.isNaN(result.getTime()) ? null : result;
}
