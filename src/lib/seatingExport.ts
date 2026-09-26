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

/**
 * A vendor on the sheet.
 *
 * Never seated — a vendor has no chair, no household and no RSVP — so this is
 * not an `ExportPerson` with empty fields. What it shares is `diet`, which is
 * the whole reason they are on a kitchen document at all.
 */
export interface ExportVendor {
    id: number;
    name: string;
    role: string | null;
    company: string | null;
    /** Whether their contract includes a plate. Only these are counted. */
    needs_meal: boolean;
    diet: DietCode[];
    note: string;
}

/** Everything the sheet draws, as the export endpoint returns it. */
export interface SeatingExportData {
    title: string;
    date: string | null;
    venue: string | null;
    tables: ExportTable[];
    /** Attending households holding no chairs, flattened to people. */
    unseated: ExportPerson[];
    vendors: ExportVendor[];
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
    /** The vendor block, and the vendor half of the plate count. */
    vendors: boolean;
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
    vendors: false,
    pageBreak: false,
    format: 'print',
};

export type Tally = Record<DietCode, number> & { total: number; none: number };

/**
 * What a plate with no restriction on it actually is.
 *
 * The RSVP form has never asked for an entrée, so the export cannot say "7
 * chicken, 3 fish" — but it can say this much, because a guest who reported
 * nothing gets the standard plate and the standard plate is the chicken. The
 * sheet, the counts line and the kitchen tile all name the bucket from here, so
 * they cannot drift apart. (When the entrée question lands — SEAT-1 in the
 * parking lot — this is the constant that stops being a constant.)
 */
export const NO_RESTRICTION_LABEL = 'Chicken';

/**
 * Count a group of people by restriction.
 *
 * Restrictions are not exclusive — someone vegan *and* gluten free is counted in
 * both — so the codes do not sum to the headcount. `none` is the people who
 * reported nothing, and total + the codes is what the kitchen actually asks for.
 *
 * Takes anything carrying a `diet`, because vendors are counted the same way
 * and are deliberately not `ExportPerson`s.
 */
export function tally(people: { diet: DietCode[] }[]): Tally {
    const t = { VEG: 0, VGN: 0, GF: 0, NUT: 0, OTH: 0, none: 0, total: people.length } as Tally;
    for (const person of people) {
        if (person.diet.length === 0) { t.none += 1; continue; }
        for (const code of person.diet) t[code] += 1;
    }
    return t;
}

/**
 * The tally as the phrases that go under a table heading, e.g.
 * `["10 seated of 10", "3 vegetarian", "1 nut allergy", "6 chicken"]`.
 *
 * `lead` names what the first number counts. Vendors hold no chairs, so their
 * block says "5 plates" — calling it "5 seated" on a block headed *not seated*
 * is the sheet contradicting itself in two lines.
 *
 * A restriction nobody has is left out rather than printed as a zero — a line of
 * zeroes is the thing a caterer skims past.
 */
export function tallyParts(t: Tally, seatCount: number | null = null, lead = 'seated'): string[] {
    const parts = [seatCount && seatCount > 0 ? `${t.total} ${lead} of ${seatCount}` : `${t.total} ${lead}`];
    for (const code of DIET_CODES) {
        if (t[code] > 0) parts.push(`${t[code]} ${DIET_LABELS[code].toLowerCase()}`);
    }
    parts.push(`${t.none} ${NO_RESTRICTION_LABEL.toLowerCase()}`);
    return parts;
}

/** One entry of the short tally. A null code is the no-restriction bucket. */
export interface TallyChip {
    code: DietCode | null;
    count: number;
}

/**
 * The same tally, as short as it goes: codes instead of words, and no headcount.
 *
 * For the two-column counts sheet, where a column is half a page wide and the
 * heading is already carrying "9/10" — so spelling "9 seated of 10" out again
 * underneath it costs a line and says nothing.
 *
 * Returned as data rather than as strings so the sheet can draw each code as the
 * *same* bordered, coloured chip the legend defines. Formatting it here would
 * mean the counts line spelled `VGN` in grey text while the legend above it
 * showed a green box, and a reader would have no reason to believe those were
 * the same thing.
 */
export function tallyChips(t: Tally): TallyChip[] {
    return [
        ...DIET_CODES.filter(code => t[code] > 0).map(code => ({ code, count: t[code] })),
        { code: null, count: t.none },
    ];
}

/** Chairs at a table with nobody in them. Never negative — a table can be over. */
export function freeSeats(table: ExportTable): number {
    return Math.max(0, (Number(table.seat_count) || 0) - table.people.length);
}

/** Everyone seated, in table order then seat order. */
export function seatedPeople(data: SeatingExportData): ExportPerson[] {
    return data.tables.flatMap(t => t.people);
}

/**
 * The vendors who are actually being fed.
 *
 * A vendor whose contract does not include a meal is still on the sheet — the
 * planner wants to know who is in the building — but they are not a plate, and
 * the number handed to a caterer has to be plates.
 */
export function vendorMeals(vendors: ExportVendor[]): ExportVendor[] {
    return vendors.filter(v => v.needs_meal);
}

/**
 * Vendors in the order they read on paper: by role, then by name.
 *
 * Grouped by role rather than by company, because the question a planner asks
 * the sheet is "is the photographer eating", not "who did we book from Lumen".
 * A vendor with no role sorts to the end rather than to the top, where an empty
 * string would otherwise put them.
 */
export function sortedVendors(vendors: ExportVendor[]): ExportVendor[] {
    return [...vendors].sort((a, b) => {
        const roleA = (a.role ?? '').trim();
        const roleB = (b.role ?? '').trim();
        if (!roleA !== !roleB) return roleA ? -1 : 1;
        return roleA.localeCompare(roleB) || a.name.localeCompare(b.name);
    });
}

/**
 * Every plate the kitchen is asked for: seated guests plus fed vendors.
 *
 * The two are counted apart everywhere else on the sheet — vendor meals are
 * usually a different line on a different contract — so this is the one number
 * that adds them up, and it exists so that nobody has to.
 */
export function grandTotal(seated: ExportPerson[], vendors: ExportVendor[]): number {
    return seated.length + vendorMeals(vendors).length;
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

/**
 * The spreadsheet's columns, for the options in force.
 *
 * Vendors bring two columns with them rather than borrowing the guest ones: a
 * vendor's role is not a household, and "is this one eating" is a question no
 * guest column asks. `Meal` is `yes` for every guest, so totalling that one
 * column counts every plate the file lists — the printed sheet's grand total
 * plus anyone not seated yet, because the sheet counts chairs and the
 * spreadsheet counts people.
 */
export function csvHeaders(opts: ExportOptions): string[] {
    return [
        'Table',
        'Seat',
        'Name',
        ...(opts.household ? ['Household'] : []),
        ...(opts.side ? ['Side'] : []),
        ...(opts.vendors ? ['Role', 'Meal'] : []),
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
        ...(opts.vendors ? ['', 'yes'] : []),
        person.rsvp_status ?? 'no answer',
        ...DIET_CODES.map(code => (person.diet.includes(code) ? 'yes' : '')),
        person.note,
    ]);
    const vendorRows = (vendors: ExportVendor[]) => vendors.map(vendor => [
        'Vendor',
        '',
        vendor.name,
        ...(opts.household ? [vendor.company ?? ''] : []),
        ...(opts.side ? [''] : []),
        vendor.role ?? '',
        vendor.needs_meal ? 'yes' : 'no',
        'vendor',
        ...DIET_CODES.map(code => (vendor.diet.includes(code) ? 'yes' : '')),
        vendor.note,
    ]);
    return [
        ...rows(seatedPeople(data)),
        ...(opts.unseated ? rows(data.unseated) : []),
        ...(opts.vendors ? vendorRows(sortedVendors(data.vendors)) : []),
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
