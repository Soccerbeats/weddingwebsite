/**
 * The seating chart as a document — who is on the page, in what order, and what
 * the line of numbers under each table says.
 *
 * Pure: no DOM, no network, no database. The preview in the export dialog and
 * the sheet that actually prints render from these same functions, so what you
 * approve on screen is what comes out of the printer — and the spreadsheet is
 * the same people again, one per row. Covered by `npm run check:seating`.
 */

import {
    DIET_CODES, DIET_LABELS, dietCodes, dietNote, type DietCode, type DietaryEntry,
} from './dietary';

// The sheet and the spreadsheet both name and count these, so they are part of
// this module's surface even though the answers themselves belong to `dietary`.
export { DIET_CODES, DIET_LABELS, dietCodes, dietNote };
export type { DietCode, DietaryEntry };

/** A person as they appear on the sheet. */
export interface ExportPerson {
    name: string;
    /** The chair, 1-based for print. Null for someone not seated. */
    seat: number | null;
    table_name: string | null;
    /** The invitation they came in on — a whole party shares one. */
    household: string;
    side: string | null;
    rsvp_status: string | null;
    diet: DietCode[];
    note: string;
}

export interface ExportTable {
    id: number;
    name: string;
    table_type: string;
    seat_count: number;
    people: ExportPerson[];
}

/** Everything the sheet draws, as the export endpoint returns it. */
export interface SeatingExportData {
    title: string;
    date: string | null;
    venue: string | null;
    tables: ExportTable[];
    /** Attending households holding no chairs, flattened to people. */
    unseated: ExportPerson[];
}

export interface ExportOptions {
    /** By table, A–Z, or both sections in one document. */
    sections: 'table' | 'list' | 'both';
    /** Every name, the counts alone, or both. */
    detail: 'names' | 'counts' | 'both';
    /** Whole-wedding totals on page one. */
    kitchen: boolean;
    household: boolean;
    side: boolean;
    /** Say how many chairs at a table are still free. */
    empty: boolean;
    unseated: boolean;
    /** Start each table on a fresh page. */
    pageBreak: boolean;
    format: 'print' | 'csv';
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
    sections: 'table',
    detail: 'both',
    kitchen: true,
    household: false,
    side: false,
    empty: true,
    unseated: true,
    pageBreak: false,
    format: 'print',
};

export type Tally = Record<DietCode, number> & { total: number; none: number };

/**
 * Count a group of people by restriction.
 *
 * Restrictions are not exclusive — someone vegan *and* gluten free is counted in
 * both — so the codes do not sum to the headcount. `none` is the people who
 * reported nothing, and total + the codes is what the kitchen actually asks for.
 */
export function tally(people: ExportPerson[]): Tally {
    const t = { VEG: 0, VGN: 0, GF: 0, NUT: 0, OTH: 0, none: 0, total: people.length } as Tally;
    for (const person of people) {
        if (person.diet.length === 0) { t.none += 1; continue; }
        for (const code of person.diet) t[code] += 1;
    }
    return t;
}

/**
 * The tally as the phrases that go under a table heading, e.g.
 * `["10 seated of 10", "3 vegetarian", "1 nut allergy", "6 no restrictions"]`.
 *
 * A restriction nobody has is left out rather than printed as a zero — a line of
 * zeroes is the thing a caterer skims past.
 */
export function tallyParts(t: Tally, seatCount: number | null = null): string[] {
    const parts = [seatCount && seatCount > 0 ? `${t.total} seated of ${seatCount}` : `${t.total} seated`];
    for (const code of DIET_CODES) {
        if (t[code] > 0) parts.push(`${t[code]} ${DIET_LABELS[code].toLowerCase()}`);
    }
    parts.push(`${t.none} no restrictions`);
    return parts;
}

/** Chairs at a table with nobody in them. Never negative — a table can be over. */
export function freeSeats(table: ExportTable): number {
    return Math.max(0, (Number(table.seat_count) || 0) - table.people.length);
}

/** Everyone seated, in table order then seat order. */
export function seatedPeople(data: SeatingExportData): ExportPerson[] {
    return data.tables.flatMap(t => t.people);
}

/** The surname a name sorts under, with a suffix dropped: "Nick Lucas Jr." → Lucas. */
const SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v', 'md', 'phd']);
export function surname(fullName: string): string {
    const parts = fullName.replace(/\([^)]*\)/g, '').trim().split(/\s+/).filter(Boolean);
    while (parts.length > 1 && SUFFIXES.has(parts[parts.length - 1].toLowerCase())) parts.pop();
    return parts.length > 1 ? parts[parts.length - 1] : (parts[0] ?? '');
}

/**
 * The A–Z section: everyone on the chart by surname, then by full name.
 *
 * Unseated people are in the list when they are asked for, because the page's
 * job is answering "where is this person sitting" — and "nowhere yet" is an
 * answer a seating host needs at the door.
 */
export function alphabetical(data: SeatingExportData, includeUnseated: boolean): ExportPerson[] {
    const people = [...seatedPeople(data), ...(includeUnseated ? data.unseated : [])];
    return people.sort((a, b) => (
        surname(a.name).localeCompare(surname(b.name)) || a.name.localeCompare(b.name)
    ));
}

/** The spreadsheet's columns, for the options in force. */
export function csvHeaders(opts: ExportOptions): string[] {
    return [
        'Table',
        'Seat',
        'Name',
        ...(opts.household ? ['Household'] : []),
        ...(opts.side ? ['Side'] : []),
        'RSVP',
        ...DIET_CODES.map(code => DIET_LABELS[code]),
        'Note',
    ];
}

/**
 * One row per person — never one per party.
 *
 * A caterer counting plates counts rows, and a party of four on one row is four
 * plates that have to be read out of a number in another column. The restriction
 * columns are `yes`/blank rather than a joined string so a pivot table can total
 * them without anyone parsing anything.
 */
export function csvRows(data: SeatingExportData, opts: ExportOptions): unknown[][] {
    const rows = (people: ExportPerson[]) => people.map(person => [
        person.table_name ?? 'Not seated',
        person.seat ?? '',
        person.name,
        ...(opts.household ? [person.household] : []),
        ...(opts.side ? [person.side ?? ''] : []),
        person.rsvp_status ?? 'no answer',
        ...DIET_CODES.map(code => (person.diet.includes(code) ? 'yes' : '')),
        person.note,
    ]);
    return [
        ...rows(seatedPeople(data)),
        ...(opts.unseated ? rows(data.unseated) : []),
    ];
}

/** `seating-chart-2026-09-19.csv`, so a folder of exports sorts by date. */
export function exportFilename(ext: string, now: Date = new Date()): string {
    const stamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
    ].join('-');
    return `seating-chart-${stamp}.${ext}`;
}
