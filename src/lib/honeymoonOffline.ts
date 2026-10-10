/**
 * Edits made with no connection, shown as if they had already landed.
 *
 * Offline, the worker (`public/sw.js`) keeps every admin write in its outbox
 * and answers it with a stand-in (`{ queued: true }`, a temporary negative id
 * for anything it creates). The honeymoon portal then shows the saved payload
 * with the outbox applied on top, by this module, the way the server will apply
 * it when the outbox is sent: the same whitelists and coercion
 * (`honeymoonResources.ts`), the same defaults for a new day's number or a new
 * stop's position, the same cascades on delete, and the same derived fields
 * afterwards — a leg filed onto the day its date falls on, a night's base from
 * its stay booking.
 *
 * Pure: no worker, no IndexedDB, no fetch — `check:offline` runs it under Node.
 */
import { basesFromBookings } from './honeymoon';
import type { Day, HoneymoonPayload, Stop, TravelLeg } from './honeymoon';
import { refileLegsByDate } from './honeymoonJourneys';
import { RESOURCES, TRIP_FIELDS, parseNumber, type Field } from './honeymoonResources';

/** One write in the worker's outbox, as the page reads it back. */
export interface QueuedWrite {
    seq: number;
    method: string;
    /** Path and query, e.g. `/api/admin/honeymoon/stops?id=12`. */
    url: string;
    /** The JSON body as sent, or null (a DELETE). */
    body: string | null;
    /** The ids the worker handed back for what this write creates, in order. */
    tempIds: number[];
    at: number;
}

const PREFIX = '/api/admin/honeymoon/';

type Row = Record<string, unknown> & { id: number };
type Tables = Record<string, Row[]>;

/** The table keys of the payload, flattened: stops and legs come out of their days. */
const TABLES = [
    'categories', 'regions', 'places', 'days', 'stops', 'travel', 'notes', 'todos',
    'bookings', 'documents', 'comments', 'views', 'rates', 'journeys',
] as const;

/**
 * A value as the payload would hold it after the server stored it.
 *
 * The server's `coerce` turns values into what goes into SQL (money as a fixed
 * string, JSON as text); this is the same decision turned into what comes back
 * out of `getHoneymoonPayload` — and a reference keeps a negative id, because
 * that is a row the outbox has not created yet.
 */
export function payloadValue(field: Field, raw: unknown): unknown {
    switch (field.kind) {
        case 'text':
            if (raw == null || raw === '') return field.blankAsEmpty ? '' : null;
            return String(raw);
        case 'number':
            return parseNumber(raw) ?? 0;
        case 'int': {
            const n = parseNumber(raw);
            return n == null ? 0 : Math.trunc(n);
        }
        case 'nint': {
            const n = parseNumber(raw);
            return n == null ? null : Math.trunc(n);
        }
        case 'bool':
            return raw === true || raw === 'true' || raw === 1 || raw === '1';
        case 'date':
            return raw === '' || raw == null ? null : String(raw).slice(0, 10);
        case 'coord':
            return parseNumber(raw);
        case 'ref': {
            const n = parseNumber(raw);
            return n != null && n !== 0 ? Math.trunc(n) : null;
        }
        case 'time': {
            if (raw == null || raw === '') return null;
            const value = String(raw).trim();
            return /^\d{1,2}:\d{2}$/.test(value) ? value.padStart(5, '0') : null;
        }
        case 'json':
            return Array.isArray(raw) ? raw : [];
        case 'jsonobj':
            return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        case 'money':
            return parseNumber(raw);
        case 'enum':
            if (field.values?.includes(String(raw))) return String(raw);
            return field.fallback ?? field.values?.[0] ?? null;
    }
}

function assign(resource: string, row: Row, body: Record<string, unknown>) {
    const fields = RESOURCES[resource].fields;
    for (const [key, field] of Object.entries(fields)) {
        if (key in body) row[key] = payloadValue(field, body[key]);
    }
    // A place always has a category (the route's `defaultCategory`).
    if (resource === 'places' && (row.category == null || row.category === '')) row.category = 'misc';
}

/** A brand-new row: every column at its empty value, then the body on top. */
function newRow(resource: string, id: number, body: Record<string, unknown>, at: number): Row {
    const row: Row = { id };
    for (const [key, field] of Object.entries(RESOURCES[resource].fields)) row[key] = payloadValue(field, undefined);
    if (resource === 'regions') row.boundary = null;
    if (resource === 'places') { row.status = 'idea'; row.source = 'manual'; row.cost_per = 'total'; }
    if (resource === 'stops') row.outcome = null;
    if (resource === 'days') { row.stops = []; row.travel = []; }
    if (['bookings', 'documents', 'comments', 'journeys'].includes(resource)) {
        row.created_at = new Date(at).toISOString();
    }
    if (resource === 'rates') row.fetched_at = new Date(at).toISOString();
    assign(resource, row, body);
    if (resource === 'places' && body.source == null) row.source = 'manual';
    return row;
}

function nextAfter(rows: Row[], key: string, where: (row: Row) => boolean, empty: number) {
    let max = empty;
    for (const row of rows) if (where(row)) max = Math.max(max, Number(row[key]) || 0);
    return max + 1;
}

function create(tables: Tables, resource: string, body: Record<string, unknown>, id: number, at: number) {
    const rows = tables[resource];
    const values = { ...body };
    if (resource === 'days' && values.day_number == null) {
        values.day_number = nextAfter(rows, 'day_number', () => true, 0);
    }
    if ((resource === 'stops' || resource === 'travel') && values.sort_order == null && values.day_id != null) {
        const dayId = Math.trunc(Number(values.day_id));
        values.sort_order = nextAfter(rows, 'sort_order', (row) => row.day_id === dayId, -1);
    }
    // The server answers a missing required field with a 400, so it never lands.
    for (const key of RESOURCES[resource].required) {
        if (values[key] == null || values[key] === '') return;
    }
    rows.push(newRow(resource, id, values, at));
}

function patch(tables: Tables, resource: string, id: number, body: Record<string, unknown>) {
    const row = tables[resource].find((r) => r.id === id);
    if (row) assign(resource, row, body);
}

function ids(raw: unknown[]): number[] {
    return raw.map((value) => Math.trunc(Number(value))).filter((n) => Number.isFinite(n) && n !== 0);
}

const nullify = (rows: Row[], key: string, gone: Set<number>) => {
    for (const row of rows) if (gone.has(row[key] as number)) row[key] = null;
};

/** Delete rows and follow the schema's ON DELETE rules (`database/init.sql`). */
function remove(tables: Tables, resource: string, doomed: number[]) {
    let gone = new Set(doomed);
    if (resource === 'categories') {
        const keys = new Set<string>();
        gone = new Set();
        for (const row of tables.categories) {
            if (doomed.includes(row.id) && row.key !== 'misc') { gone.add(row.id); keys.add(String(row.key)); }
        }
        for (const place of tables.places) if (keys.has(String(place.category))) place.category = 'misc';
    }
    tables[resource] = tables[resource].filter((row) => !gone.has(row.id));
    const drop = (table: string, key: string) => {
        const removed = tables[table].filter((row) => gone.has(row[key] as number)).map((row) => row.id);
        if (removed.length) remove(tables, table, removed);
    };
    switch (resource) {
        case 'regions':
            nullify(tables.places, 'region_id', gone);
            nullify(tables.notes, 'region_id', gone);
            break;
        case 'places':
            nullify(tables.stops, 'place_id', gone);
            nullify(tables.days, 'base_place_id', gone);
            nullify(tables.documents, 'place_id', gone);
            nullify(tables.todos, 'place_id', gone);
            nullify(tables.notes, 'place_id', gone);
            drop('bookings', 'place_id');
            drop('comments', 'place_id');
            break;
        case 'days':
            nullify(tables.todos, 'day_id', gone);
            drop('stops', 'day_id');
            drop('travel', 'day_id');
            break;
        case 'stops':
            drop('bookings', 'stop_id');
            break;
        case 'travel':
            nullify(tables.documents, 'travel_id', gone);
            drop('bookings', 'travel_id');
            break;
        case 'journeys':
            nullify(tables.travel, 'journey_id', gone);
            drop('bookings', 'journey_id');
            break;
    }
}

function parse(body: string | null): unknown {
    if (body == null || body === '') return null;
    try { return JSON.parse(body); } catch { return null; }
}

function applyOne(tables: Tables, trip: Record<string, unknown>, write: QueuedWrite) {
    const url = new URL(write.url, 'http://local');
    if (!url.pathname.startsWith(PREFIX)) return;
    const resource = url.pathname.slice(PREFIX.length);
    const method = write.method.toUpperCase();
    const body = parse(write.body);

    if (resource === 'trip') {
        if ((method === 'POST' || method === 'PATCH') && body && typeof body === 'object') {
            for (const [key, field] of Object.entries(TRIP_FIELDS)) {
                if (key in (body as object)) trip[key] = payloadValue(field, (body as Record<string, unknown>)[key]);
            }
        }
        return;
    }
    if (!Object.prototype.hasOwnProperty.call(RESOURCES, resource)) return;

    if (method === 'POST') {
        if (Array.isArray(body)) {
            body.forEach((row, index) => {
                if (row && typeof row === 'object' && write.tempIds[index] != null) {
                    create(tables, resource, row as Record<string, unknown>, write.tempIds[index], write.at);
                }
            });
        } else if (body && typeof body === 'object' && write.tempIds[0] != null) {
            create(tables, resource, body as Record<string, unknown>, write.tempIds[0], write.at);
        }
        return;
    }

    if (method === 'PATCH') {
        if (Array.isArray(body)) {
            // A reorder: array position becomes the order.
            const order = ids(body.map((row) => (row as { id?: unknown })?.id));
            order.forEach((id, index) => {
                const row = tables[resource].find((r) => r.id === id);
                if (!row) return;
                if (resource === 'days') row.day_number = index + 1;
                else row.sort_order = index;
            });
            return;
        }
        if (!body || typeof body !== 'object') return;
        const fields = body as Record<string, unknown>;
        if (Array.isArray(fields.rank)) {
            ids(fields.rank).forEach((id, index) => {
                const row = tables[resource].find((r) => r.id === id);
                if (row) row.rank = index + 1;
            });
            return;
        }
        if (Array.isArray(fields.rows)) {
            for (const row of fields.rows as Record<string, unknown>[]) {
                const id = Math.trunc(Number(row?.id));
                if (Number.isFinite(id) && id !== 0) patch(tables, resource, id, row);
            }
            return;
        }
        if (Array.isArray(fields.ids)) {
            for (const id of ids(fields.ids)) patch(tables, resource, id, fields);
            return;
        }
        const id = Math.trunc(Number(fields.id));
        if (Number.isFinite(id) && id !== 0) patch(tables, resource, id, fields);
        return;
    }

    if (method === 'DELETE') {
        const many = url.searchParams.get('ids');
        const doomed = many ? ids(many.split(',')) : ids([url.searchParams.get('id')]);
        if (doomed.length) remove(tables, resource, doomed);
    }
}

/** Order a list by a number, keeping the order rows already had for ties. */
function byNumber<T extends Record<string, unknown>>(rows: T[], key: string): T[] {
    return rows
        .map((row, index) => ({ row, index }))
        .sort((a, b) => ((Number(a.row[key]) || 0) - (Number(b.row[key]) || 0)) || (a.index - b.index))
        .map(({ row }) => row);
}

/**
 * The saved payload with every queued honeymoon write applied, in the order
 * they were made. Writes for anything else in the outbox are ignored; with no
 * honeymoon writes the payload comes back as it was.
 */
export function applyQueuedWrites(payload: HoneymoonPayload, writes: QueuedWrite[]): HoneymoonPayload {
    const mine = writes
        .filter((write) => new URL(write.url, 'http://local').pathname.startsWith(PREFIX))
        .sort((a, b) => a.seq - b.seq);
    if (!mine.length) return payload;

    // Copies throughout, so the saved payload is never edited in place.
    const clone = <T>(rows: T[]): Row[] => rows.map((row) => ({ ...(row as Row) }));
    const tables: Tables = {};
    for (const key of TABLES) {
        if (key === 'days' || key === 'stops' || key === 'travel') continue;
        tables[key] = clone((payload[key] ?? []) as unknown[]);
    }
    tables.days = payload.days.map(({ stops, travel, ...day }) => { void stops; void travel; return { ...day } as Row; });
    tables.stops = clone(payload.days.flatMap((day) => day.stops));
    tables.travel = clone(payload.days.flatMap((day) => day.travel));
    const trip = { ...payload.trip } as Record<string, unknown>;

    for (const write of mine) applyOne(tables, trip, write);

    const nextTrip = trip as unknown as HoneymoonPayload['trip'];
    const dayRows = byNumber(tables.days, 'day_number')
        .map((day) => ({ ...day, stops: [], travel: [] }) as unknown as Day);
    const legs = refileLegsByDate(tables.travel as unknown as TravelLeg[], dayRows, nextTrip);
    const days: Day[] = dayRows.map((day) => ({
        ...day,
        stops: byNumber(tables.stops.filter((stop) => stop.day_id === day.id), 'sort_order') as unknown as Stop[],
        travel: byNumber(legs.filter((leg) => leg.day_id === day.id) as unknown as Row[], 'sort_order') as unknown as TravelLeg[],
    }));
    const bookings = tables.bookings as unknown as HoneymoonPayload['bookings'];

    return {
        ...payload,
        trip: nextTrip,
        categories: byNumber(tables.categories, 'sort_order') as unknown as HoneymoonPayload['categories'],
        regions: byNumber(tables.regions, 'sort_order') as unknown as HoneymoonPayload['regions'],
        places: byNumber(tables.places, 'sort_order') as unknown as HoneymoonPayload['places'],
        days: basesFromBookings(days, bookings, nextTrip.start_date),
        notes: byNumber(tables.notes, 'sort_order') as unknown as HoneymoonPayload['notes'],
        todos: byNumber(tables.todos, 'sort_order') as unknown as HoneymoonPayload['todos'],
        journeys: byNumber(tables.journeys, 'sort_order') as unknown as HoneymoonPayload['journeys'],
        bookings,
        documents: tables.documents as unknown as HoneymoonPayload['documents'],
        comments: tables.comments as unknown as HoneymoonPayload['comments'],
        views: byNumber(tables.views, 'sort_order') as unknown as HoneymoonPayload['views'],
        rates: tables.rates as unknown as HoneymoonPayload['rates'],
    };
}
