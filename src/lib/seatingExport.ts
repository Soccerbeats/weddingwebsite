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
    ALL_DIET_CODES, DIET_CODES, DIET_LABELS, MEAL_CODES, dietCodes, dietNote,
    type DietCode, type DietaryEntry,
} from './dietary';

// The sheet and the spreadsheet both name and count these, so they are part of
// this module's surface even though the answers themselves belong to `dietary`.
export { ALL_DIET_CODES, DIET_CODES, DIET_LABELS, MEAL_CODES, dietCodes, dietNote };
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
    /** Where the table sits on the canvas — React Flow's top-left of the node. */
    x: number;
    y: number;
    people: ExportPerson[];
}

/** A corner of the room outline, in the canvas's coordinates. */
export interface PlanPoint {
    x: number;
    y: number;
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
    /** The room outline drawn on the canvas, or null when none was drawn. */
    room: PlanPoint[] | null;
}

export interface ExportOptions {
    /** By table, A–Z, both sections, or no list at all (the drawing alone). */
    sections: 'table' | 'list' | 'both' | 'none';
    /** The floor plan as a drawing: not at all, the whole room, or a page per table. */
    plan: 'none' | 'room' | 'tables';
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
    plan: 'none',
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

export type Tally = Record<DietCode, number> & {
    /** People — chairs, in a table's tally. Not the same as plates. */
    total: number;
    /** People carrying no answer at all: the standard plate. */
    none: number;
    /** Meals the kitchen is asked for: everyone except the ones not eating. */
    plates: number;
};

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
    const t = {
        VEG: 0, VGN: 0, GF: 0, NUT: 0, OTH: 0, KID: 0, NOM: 0,
        none: 0, total: people.length, plates: 0,
    } as Tally;
    for (const person of people) {
        if (person.diet.length === 0) { t.none += 1; continue; }
        for (const code of person.diet) t[code] += 1;
    }
    // A chair is not a plate. Someone not eating still sits down, still appears
    // on the roster and still counts toward "seated" — they are simply not a
    // meal, and a caterer handed the headcount would cook one too many.
    // A kids' meal *is* a plate, just a different one.
    t.plates = t.total - t.NOM;
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
    for (const code of ALL_DIET_CODES) {
        if (t[code] > 0) parts.push(`${t[code]} ${DIET_LABELS[code].toLowerCase()}`);
    }
    parts.push(`${t.none} ${NO_RESTRICTION_LABEL.toLowerCase()}`);
    return parts;
}

/**
 * A4 at 96dpi, inside the 12mm margins `@page` sets.
 *
 * 210mm × 297mm is 794 × 1123 CSS pixels; the margins take 45px off each edge.
 * These are the *content* numbers — what a sheet actually gets — and the print
 * preview lays out at exactly this width so that what is on screen is the page.
 * (It used to lay out at 794, the paper including its margins, which is why a
 * preview that looked like one page could print as two.)
 */
export const A4_CONTENT_WIDTH = 703;
export const A4_CONTENT_HEIGHT = 1032;

/**
 * How far a sheet has to shrink to fit in `pages` pages.
 *
 * 1 when it already fits — scaling up a short sheet would be a different and
 * unasked-for feature. Never below `floor`: past that the numbers stop being
 * readable across a kitchen, and a sheet nobody can read has not fitted on one
 * page in any sense that matters. A caller that hits the floor is expected to
 * say so rather than pretend.
 */
export function fitScale(
    contentHeight: number,
    pages = 1,
    floor = 0.6,
    pageHeight = A4_CONTENT_HEIGHT,
): number {
    const available = pageHeight * pages;
    if (!(contentHeight > 0) || contentHeight <= available) return 1;
    return Math.max(floor, available / contentHeight);
}

/** How many pages a sheet of this height takes at this scale. */
export function pageCount(
    contentHeight: number,
    scale = 1,
    pageHeight = A4_CONTENT_HEIGHT,
): number {
    if (!(contentHeight > 0)) return 1;
    return Math.max(1, Math.ceil((contentHeight * scale) / pageHeight));
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
        ...ALL_DIET_CODES.filter(code => t[code] > 0).map(code => ({ code, count: t[code] })),
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
 *
 * Plates, not chairs: a guest marked *not eating* is seated and is not a meal.
 */
export function grandTotal(seated: ExportPerson[], vendors: ExportVendor[]): number {
    return tally(seated).plates + vendorMeals(vendors).length;
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
        ...ALL_DIET_CODES.map(code => DIET_LABELS[code]),
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
        // Not eating is the one guest row that is not a meal.
        ...(opts.vendors ? ['', person.diet.includes('NOM') ? 'no' : 'yes'] : []),
        person.rsvp_status ?? 'no answer',
        ...ALL_DIET_CODES.map(code => (person.diet.includes(code) ? 'yes' : '')),
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
        ...ALL_DIET_CODES.map(code => (vendor.diet.includes(code) ? 'yes' : '')),
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

/* ── The floor plan as a drawing ─────────────────────────────────────────── */

/*
 * The printed drawing is the canvas again, at the canvas's own coordinates: a
 * table is where it was dropped, the size `TableNode` draws it, with its chairs
 * where `TableNode` puts them. These numbers are TableNode's — change one and
 * change the other, or the paper stops looking like the screen.
 */
const ROUND_SIZE = 160;
const ROUND_ORBIT_PAD = 52;
const ROUND_SEAT_RADIUS = ROUND_SIZE / 2 + 28;
const RECT_WIDTH = 200;
const RECT_HEIGHT = 100;
const HEAD_HEIGHT = 80;
/** Room for a name chip, which the canvas draws centred on its point. */
const CHIP_HALF_WIDTH = 60;
const CHIP_HEIGHT = 22;
/** How many chips fit across a rectangular table's width, for the rows below it. */
const CHIP_SLOT = 100;

export interface PlanBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export interface TableGeometry {
    shape: 'round' | 'rect';
    /** The table itself. */
    body: { x: number; y: number; width: number; height: number };
    /** Round tables: each chair's centre, in seat order. */
    seats: PlanPoint[];
    /** Rectangular tables: where the wrapped row of name chips starts. */
    chipsTop: number | null;
    /** Everything the table draws, chairs and names included. */
    box: PlanBox;
}

/** Where a table and its chairs land, in canvas coordinates. */
export function tableGeometry(table: Pick<ExportTable, 'table_type' | 'x' | 'y'> & { people: unknown[] }): TableGeometry {
    const n = table.people.length;
    if (table.table_type === 'round') {
        const body = { x: table.x + ROUND_ORBIT_PAD, y: table.y + ROUND_ORBIT_PAD, width: ROUND_SIZE, height: ROUND_SIZE };
        const cx = body.x + ROUND_SIZE / 2;
        const cy = body.y + ROUND_SIZE / 2;
        const seats = Array.from({ length: n }, (_, i) => {
            const angle = (2 * Math.PI * i) / n - Math.PI / 2;
            return { x: cx + ROUND_SEAT_RADIUS * Math.cos(angle), y: cy + ROUND_SEAT_RADIUS * Math.sin(angle) };
        });
        const reach = ROUND_SEAT_RADIUS + CHIP_HEIGHT / 2;
        return {
            shape: 'round',
            body,
            seats,
            chipsTop: null,
            box: {
                minX: cx - ROUND_SEAT_RADIUS - CHIP_HALF_WIDTH,
                maxX: cx + ROUND_SEAT_RADIUS + CHIP_HALF_WIDTH,
                minY: cy - reach,
                maxY: cy + reach,
            },
        };
    }
    const isHead = table.table_type === 'head';
    const width = isHead ? Math.max(240, n * 48) : RECT_WIDTH;
    const height = isHead ? HEAD_HEIGHT : RECT_HEIGHT;
    const body = { x: table.x, y: table.y, width, height };
    const perRow = Math.max(1, Math.floor(width / CHIP_SLOT));
    const rows = Math.ceil(n / perRow);
    const chipsTop = n > 0 ? table.y + height + 8 : null;
    return {
        shape: 'rect',
        body,
        seats: [],
        chipsTop,
        box: {
            // A row of chips can be a little wider than the table it sits under.
            minX: table.x - CHIP_HALF_WIDTH / 2,
            maxX: table.x + width + CHIP_HALF_WIDTH / 2,
            minY: table.y,
            maxY: table.y + height + (rows > 0 ? 8 + rows * (CHIP_HEIGHT + 4) : 0),
        },
    };
}

/** The box around the room outline and every table on it, with a margin. */
export function planBounds(
    tables: (Pick<ExportTable, 'table_type' | 'x' | 'y'> & { people: unknown[] })[],
    room: PlanPoint[] | null,
    margin = 24,
): PlanBox | null {
    const boxes: PlanBox[] = tables.map(t => tableGeometry(t).box);
    if (room && room.length > 0) {
        boxes.push({
            minX: Math.min(...room.map(p => p.x)),
            maxX: Math.max(...room.map(p => p.x)),
            minY: Math.min(...room.map(p => p.y)),
            maxY: Math.max(...room.map(p => p.y)),
        });
    }
    if (boxes.length === 0) return null;
    return {
        minX: Math.min(...boxes.map(b => b.minX)) - margin,
        minY: Math.min(...boxes.map(b => b.minY)) - margin,
        maxX: Math.max(...boxes.map(b => b.maxX)) + margin,
        maxY: Math.max(...boxes.map(b => b.maxY)) + margin,
    };
}

/**
 * How much to scale a drawing so it fits a box on the page.
 *
 * Shrinks as far as it must and grows only up to `max` — a single table blown
 * up to fill a page is easier to read, but past about double the names are
 * shouting.
 */
export function drawingScale(bounds: PlanBox, width: number, height: number, max = 1): number {
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    if (w <= 0 || h <= 0) return 1;
    return Math.min(max, width / w, height / h);
}

/**
 * Whether the whole room prints on its side.
 *
 * A reception room is usually wider than it is deep, and on a portrait page a
 * wide drawing is a thin strip of tiny names. Landscape when it is wider.
 */
export function planIsLandscape(bounds: PlanBox): boolean {
    return bounds.maxX - bounds.minX > bounds.maxY - bounds.minY;
}

/*
 * The drawing areas, in CSS pixels at 96dpi. Conservative on purpose: they have
 * to fit inside the sheet's own padding on A4 *and* on US Letter, whichever the
 * printer dialog is set to, since a drawing that is 10px too tall prints its
 * last row of tables on a second page by itself.
 */
export const PLAN_PORTRAIT = { width: 630, height: 820 };
export const PLAN_LANDSCAPE = { width: 880, height: 560 };
/** One table's page: the drawing on top, its roster below. */
export const PLAN_TABLE = { width: 630, height: 430 };
