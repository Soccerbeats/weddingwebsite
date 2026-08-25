import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { ensureHoneymoonTables } from '@/lib/honeymoonDb';

/**
 * Generic CRUD for the honeymoon tables.
 *
 * Mirrors the finance [resource] route: every table and column is whitelisted
 * here and all values go through parameterised queries, so no caller-supplied
 * string ever reaches the SQL text.
 */

type FieldKind = 'text' | 'number' | 'int' | 'nint' | 'bool' | 'date' | 'ref' | 'enum'
    | 'json' | 'jsonobj' | 'coord' | 'time' | 'money';

interface Field {
    kind: FieldKind;
    values?: string[];
    /**
     * Value an unrecognised enum falls back to. Without this an unknown
     * category would land on whatever happens to be first in the list —
     * "Stay" — and a mis-typed place would then be offered as a day's
     * accommodation. Falling back to the neutral option is safer.
     */
    fallback?: string;
    /**
     * Keep an empty string as '' instead of turning it into NULL.
     *
     * Text normally nulls out when cleared, which is right for an optional note.
     * It is wrong for a NOT NULL column whose empty value is meaningful — the
     * country filter's "all countries" is exactly that, and nulling it made
     * clearing the filter fail against the constraint.
     */
    blankAsEmpty?: boolean;
}

interface ResourceDef {
    table: string;
    fields: Record<string, Field>;
    required: string[];
}

const RESOURCES: Record<string, ResourceDef> = {
    categories: {
        table: 'honeymoon_categories',
        fields: {
            key: { kind: 'text' },
            label: { kind: 'text' },
            color: { kind: 'text' },
            icon: { kind: 'text' },
            sort_order: { kind: 'int' },
        },
        required: ['key', 'label'],
    },
    regions: {
        table: 'honeymoon_regions',
        fields: {
            name: { kind: 'text' },
            // NOT NULL DEFAULT '' in the schema, so a blank has to arrive as an
            // empty string: without this the column takes a null and the insert
            // fails its constraint. A region whose country you do not know yet is
            // an ordinary thing to create — it is what "＋ Custom…" does whenever
            // the trip has no focus country — and it was returning a 500.
            country: { kind: 'text', blankAsEmpty: true },
            description: { kind: 'text' },
            center_lat: { kind: 'coord' },
            center_lng: { kind: 'coord' },
            sort_order: { kind: 'int' },
            boundary: { kind: 'json' },
        },
        required: ['name'],
    },
    places: {
        table: 'honeymoon_places',
        fields: {
            region_id: { kind: 'ref' },
            name: { kind: 'text' },
            // Free text, like source: a category you type in the editor has to
            // survive. An enum would silently coerce it to 'misc'. Blank is
            // normalised to 'misc' below rather than becoming NULL.
            category: { kind: 'text' },
            lat: { kind: 'coord' },
            lng: { kind: 'coord' },
            address: { kind: 'text' },
            description: { kind: 'text' },
            status: { kind: 'enum', values: ['idea', 'shortlisted', 'booked'] },
            price_note: { kind: 'text' },
            links: { kind: 'json' },
            photos: { kind: 'json' },
            // Free text, not an enum: a new batch of suggestions from a new
            // person should be labellable without a code change.
            source: { kind: 'text' },
            // Text rather than enum: an enum coerces an unknown value to a
            // fallback, and clearing a rating back to "unrated" has to survive
            // as NULL rather than snapping to 'yes'.
            rating: { kind: 'text' },
            rank: { kind: 'nint' },
            image_url: { kind: 'text' },
            is_excursion: { kind: 'bool' },
            archived: { kind: 'bool' },
            // Empty means "inherit from the region", so it must not become NULL.
            country: { kind: 'text', blankAsEmpty: true },
            needs_review: { kind: 'bool' },
            sort_order: { kind: 'int' },
            cost: { kind: 'money' },
            cost_currency: { kind: 'text' },
            cost_per: { kind: 'enum', values: ['night', 'person', 'total'], fallback: 'total' },
            opening_hours: { kind: 'text' },
            best_time: { kind: 'text' },
            ratings: { kind: 'jsonobj' },
            star_rating: { kind: 'money' },
            price_range: { kind: 'text' },
            amenities: { kind: 'json' },
        },
        required: ['name'],
    },
    days: {
        table: 'honeymoon_days',
        fields: {
            day_number: { kind: 'int' },
            title: { kind: 'text' },
            base_place_id: { kind: 'ref' },
            notes: { kind: 'text' },
        },
        required: ['day_number'],
    },
    stops: {
        table: 'honeymoon_stops',
        fields: {
            day_id: { kind: 'ref' },
            place_id: { kind: 'ref' },
            custom_label: { kind: 'text' },
            start_time: { kind: 'time' },
            notes: { kind: 'text' },
            sort_order: { kind: 'int' },
            duration_minutes: { kind: 'nint' },
            outcome: { kind: 'text' },
            favourite: { kind: 'bool' },
            journal: { kind: 'text' },
            photos: { kind: 'json' },
        },
        required: ['day_id'],
    },
    travel: {
        table: 'honeymoon_travel',
        fields: {
            day_id: { kind: 'ref' },
            mode: { kind: 'enum', values: ['flight', 'boat', 'car', 'train', 'walk'] },
            from_text: { kind: 'text' },
            to_text: { kind: 'text' },
            depart_time: { kind: 'time' },
            arrive_time: { kind: 'time' },
            arrive_day_offset: { kind: 'int' },
            confirmation_ref: { kind: 'text' },
            notes: { kind: 'text' },
            from_lat: { kind: 'coord' },
            from_lng: { kind: 'coord' },
            to_lat: { kind: 'coord' },
            to_lng: { kind: 'coord' },
            sort_order: { kind: 'int' },
            cost: { kind: 'money' },
            cost_currency: { kind: 'text' },
            booked_by: { kind: 'text' },
            depart_tz: { kind: 'text' },
            arrive_tz: { kind: 'text' },
            flight_no: { kind: 'text' },
            from_terminal: { kind: 'text' },
            to_terminal: { kind: 'text' },
            aircraft: { kind: 'text' },
            journey_id: { kind: 'ref' },
            depart_date: { kind: 'date' },
            arrive_date: { kind: 'date' },
        },
        required: ['day_id'],
    },
    /** The ticket a set of legs belongs to. */
    journeys: {
        table: 'honeymoon_journeys',
        fields: {
            // NOT NULL DEFAULT '': an untitled journey is an ordinary thing, and
            // the UI shows its route instead.
            title: { kind: 'text', blankAsEmpty: true },
            kind: {
                kind: 'enum',
                values: ['flight', 'boat', 'car', 'train', 'walk'],
                fallback: 'flight',
            },
            notes: { kind: 'text' },
            sort_order: { kind: 'int' },
        },
        required: [],
    },
    todos: {
        table: 'honeymoon_todos',
        fields: {
            text: { kind: 'text' },
            done: { kind: 'bool' },
            result: { kind: 'text' },
            category: { kind: 'text' },
            due_on: { kind: 'date' },
            sort_order: { kind: 'int' },
            kind: { kind: 'enum', values: ['task', 'packing'], fallback: 'task' },
            person: { kind: 'text' },
            place_id: { kind: 'ref' },
            day_id: { kind: 'ref' },
        },
        required: ['text'],
    },
    notes: {
        table: 'honeymoon_notes',
        fields: {
            title: { kind: 'text' },
            // Also NOT NULL DEFAULT '': emptying a guide note's text is a normal
            // edit on the Guide tab, and it was failing the same way.
            body: { kind: 'text', blankAsEmpty: true },
            category: { kind: 'text' },
            source: { kind: 'text' },
            sort_order: { kind: 'int' },
            region_id: { kind: 'ref' },
            place_id: { kind: 'ref' },
        },
        required: ['title'],
    },
    /*
     * The paperwork behind a booking.
     *
     * `kind` is an enum falling back to 'other' rather than to 'stay': a
     * mis-typed kind must not put a flight in the accommodation total.
     */
    bookings: {
        table: 'honeymoon_bookings',
        fields: {
            place_id: { kind: 'ref' },
            travel_id: { kind: 'ref' },
            stop_id: { kind: 'ref' },
            journey_id: { kind: 'ref' },
            kind: {
                kind: 'enum',
                values: ['stay', 'excursion', 'travel', 'table', 'other'],
                fallback: 'other',
            },
            provider: { kind: 'text' },
            confirmation: { kind: 'text' },
            url: { kind: 'text' },
            contact: { kind: 'text' },
            check_in: { kind: 'date' },
            check_out: { kind: 'date' },
            check_in_time: { kind: 'time' },
            check_out_time: { kind: 'time' },
            cost: { kind: 'money' },
            cost_currency: { kind: 'text' },
            cost_paid: { kind: 'money' },
            deposit_due_on: { kind: 'date' },
            cancel_by: { kind: 'date' },
            party_size: { kind: 'nint' },
            dress_code: { kind: 'text' },
            paid: { kind: 'bool' },
            documents: { kind: 'json' },
            notes: { kind: 'text' },
        },
        required: [],
    },
    documents: {
        table: 'honeymoon_documents',
        fields: {
            name: { kind: 'text' },
            kind: {
                kind: 'enum',
                values: ['passport', 'visa', 'insurance', 'ticket', 'vaccination',
                    'reservation', 'other'],
                fallback: 'other',
            },
            path: { kind: 'text' },
            place_id: { kind: 'ref' },
            travel_id: { kind: 'ref' },
            person: { kind: 'text' },
            expires_on: { kind: 'date' },
            notes: { kind: 'text' },
        },
        required: ['name', 'path'],
    },
    comments: {
        table: 'honeymoon_comments',
        fields: {
            place_id: { kind: 'ref' },
            // NOT NULL DEFAULT '' both: an unsigned comment and an empty one are
            // ordinary, and nulling either fails the constraint.
            author: { kind: 'text', blankAsEmpty: true },
            body: { kind: 'text', blankAsEmpty: true },
        },
        required: ['place_id'],
    },
    views: {
        table: 'honeymoon_views',
        fields: {
            name: { kind: 'text' },
            tab: { kind: 'text' },
            filters: { kind: 'jsonobj' },
            sort_order: { kind: 'int' },
        },
        required: ['name'],
    },
    rates: {
        table: 'honeymoon_rates',
        fields: {
            pair: { kind: 'text' },
            rate: { kind: 'number' },
            manual: { kind: 'bool' },
        },
        required: ['pair'],
    },
};

const TRIP_FIELDS: Record<string, Field> = {
    title: { kind: 'text' },
    focus_country: { kind: 'text', blankAsEmpty: true },
    start_date: { kind: 'date' },
    end_date: { kind: 'date' },
    home_currency: { kind: 'text' },
    notes: { kind: 'text' },
    budget: { kind: 'money' },
    partner_names: { kind: 'text', blankAsEmpty: true },
    info: { kind: 'jsonobj' },
    time_format: { kind: 'enum', values: ['24h', '12h'], fallback: '24h' },
    distance_unit: { kind: 'enum', values: ['km', 'mi'], fallback: 'km' },
    phase: { kind: 'enum', values: ['planning', 'travelling', 'after'], fallback: 'planning' },
};

function parseNumber(raw: unknown): number | null {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    if (raw == null) return null;
    const cleaned = String(raw).trim();
    if (cleaned === '') return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
}

function coerce(field: Field, raw: unknown): unknown {
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
        // Nullable int: 'int' falls back to 0, which is a real position and not
        // the same thing as "no position". A cleared rank has to be NULL.
        case 'nint': {
            const n = parseNumber(raw);
            return n == null ? null : Math.trunc(n);
        }
        case 'bool':
            return raw === true || raw === 'true' || raw === 1 || raw === '1';
        case 'date':
            return raw === '' || raw == null ? null : String(raw);
        // A cleared coordinate must persist as NULL, not 0 — 0,0 is a real point
        // in the Atlantic and would drag the map's fitBounds across the world.
        case 'coord':
            return parseNumber(raw);
        case 'ref': {
            const n = parseNumber(raw);
            return n != null && n > 0 ? Math.trunc(n) : null;
        }
        // Stored as TEXT "HH:MM"; anything that isn't that shape becomes null so
        // a malformed time can never masquerade as a real one.
        case 'time': {
            if (raw == null || raw === '') return null;
            const value = String(raw).trim();
            return /^\d{1,2}:\d{2}$/.test(value) ? value.padStart(5, '0') : null;
        }
        case 'json':
            return JSON.stringify(Array.isArray(raw) ? raw : []);
        // An object rather than an array: per-person ratings, a view's filters,
        // the trip's info sections. Anything that isn't a plain object becomes
        // {} rather than reaching a JSONB column as a string or a list.
        case 'jsonobj':
            return JSON.stringify(
                raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {},
            );
        // NUMERIC, nullable: a cleared cost is "I don't know yet", which is not
        // zero. Sent as a string so pg hands it to NUMERIC without a float
        // rounding it on the way.
        case 'money': {
            const n = parseNumber(raw);
            return n == null ? null : n.toFixed(2);
        }
        case 'enum':
            if (field.values?.includes(String(raw))) return String(raw);
            return field.fallback ?? field.values?.[0] ?? null;
    }
}

function collect(def: ResourceDef, body: Record<string, unknown>) {
    const columns: string[] = [];
    const values: unknown[] = [];
    for (const [key, field] of Object.entries(def.fields)) {
        if (key in body) {
            columns.push(key);
            values.push(coerce(field, body[key]));
        }
    }
    return { columns, values };
}

/**
 * A place must always have a category. Text coercion turns '' into NULL, which
 * would break the map's colour lookup and every category filter.
 */
function defaultCategory(def: ResourceDef, columns: string[], values: unknown[]) {
    if (def.table !== 'honeymoon_places') return;
    const at = columns.indexOf('category');
    if (at >= 0 && (values[at] == null || values[at] === '')) values[at] = 'misc';
}

function resolve(resource: string): ResourceDef | null {
    return Object.prototype.hasOwnProperty.call(RESOURCES, resource) ? RESOURCES[resource] : null;
}

type Params = { params: Promise<{ resource: string }> };

export async function POST(request: Request, { params }: Params) {
    const { resource } = await params;
    try {
        await ensureHoneymoonTables();
        const body = await request.json();

        // Trip is a singleton: POST updates row 1 rather than inserting.
        if (resource === 'trip') {
            const columns: string[] = [];
            const values: unknown[] = [];
            for (const [key, field] of Object.entries(TRIP_FIELDS)) {
                if (key in body) { columns.push(key); values.push(coerce(field, body[key])); }
            }
            if (!columns.length) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
            const sets = columns.map((c, i) => `${c} = $${i + 1}`).join(', ');
            const result = await pool.query(
                `UPDATE honeymoon_trip SET ${sets} WHERE id = 1 RETURNING *`, values,
            );
            return NextResponse.json(result.rows[0]);
        }

        const def = resolve(resource);
        if (!def) return NextResponse.json({ error: 'Unknown resource' }, { status: 404 });

        /*
         * An array inserts many rows in one transaction.
         *
         * Undo needs this: restoring a bulk delete of a hundred places one POST
         * at a time is a hundred round trips and a hundred refetches, which is
         * slow enough that you'd watch the list rebuild row by row. All or
         * nothing, so a half-restored selection can't happen.
         */
        if (Array.isArray(body)) {
            const rows = body as Record<string, unknown>[];
            if (!rows.length) return NextResponse.json({ success: true, created: [] });
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const created: unknown[] = [];
                for (const row of rows) {
                    const { columns, values } = collect(def, row);
                    if (!columns.length) continue;
                    defaultCategory(def, columns, values);
                    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
                    const result = await client.query(
                        `INSERT INTO ${def.table} (${columns.join(', ')})
                         VALUES (${placeholders}) RETURNING *`,
                        values,
                    );
                    created.push(result.rows[0]);
                }
                await client.query('COMMIT');
                return NextResponse.json({ success: true, created });
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        }

        // Adding a day with no number appends to the end, so the UI can just
        // POST {} and get "the next day".
        if (def.table === 'honeymoon_days' && body.day_number == null) {
            const next = await pool.query(
                'SELECT COALESCE(MAX(day_number), 0) + 1 AS n FROM honeymoon_days',
            );
            body.day_number = next.rows[0].n;
        }

        // A new stop or leg lands at the bottom of its day unless told otherwise.
        if ((def.table === 'honeymoon_stops' || def.table === 'honeymoon_travel')
            && body.sort_order == null && body.day_id != null) {
            const next = await pool.query(
                `SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM ${def.table} WHERE day_id = $1`,
                [Math.trunc(Number(body.day_id))],
            );
            body.sort_order = next.rows[0].n;
        }

        for (const key of def.required) {
            const value = body[key];
            if (value == null || value === '') {
                return NextResponse.json({ error: `${key} is required` }, { status: 400 });
            }
        }

        const { columns, values } = collect(def, body);
        if (!columns.length) return NextResponse.json({ error: 'No fields provided' }, { status: 400 });
        defaultCategory(def, columns, values);

        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const result = await pool.query(
            `INSERT INTO ${def.table} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`,
            values,
        );
        return NextResponse.json(result.rows[0]);
    } catch (error) {
        // unique_violation: a day number or category key that already exists
        // is the caller's to resolve, not a server fault.
        if ((error as { code?: string })?.code === '23505') {
            return NextResponse.json({ error: `That ${resource === 'days' ? 'day number' : 'value'} already exists` }, { status: 409 });
        }
        console.error(`Error creating ${resource}:`, error);
        return NextResponse.json({ error: `Failed to create ${resource}` }, { status: 500 });
    }
}

export async function PATCH(request: Request, { params }: Params) {
    const { resource } = await params;
    try {
        await ensureHoneymoonTables();

        const body = await request.json();

        if (resource === 'trip') {
            const columns: string[] = [];
            const values: unknown[] = [];
            for (const [key, field] of Object.entries(TRIP_FIELDS)) {
                if (key in body) { columns.push(key); values.push(coerce(field, body[key])); }
            }
            if (!columns.length) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
            const sets = columns.map((c, i) => `${c} = $${i + 1}`).join(', ');
            const result = await pool.query(
                `UPDATE honeymoon_trip SET ${sets} WHERE id = 1 RETURNING *`, values,
            );
            return NextResponse.json(result.rows[0]);
        }

        const def = resolve(resource);
        if (!def) return NextResponse.json({ error: 'Unknown resource' }, { status: 404 });

        /*
         * `{ rank: [id, id, …] }` writes the shortlist's ranking in one
         * transaction: first id becomes rank 1, and every place not in the list
         * is left exactly as it was.
         *
         * A separate shape from the reorder below because it is a separate
         * column with separate meaning — `sort_order` orders the whole place
         * library, and ranking six hotels must not touch it. Ids are coerced to
         * integers before they reach the query.
         */
        if (!Array.isArray(body) && Array.isArray((body as { rank?: unknown }).rank)) {
            const ids = ((body as { rank: unknown[] }).rank)
                .map((id) => Math.trunc(Number(id)))
                .filter((id) => Number.isFinite(id) && id > 0);
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                for (const [index, id] of ids.entries()) {
                    await client.query(
                        `UPDATE ${def.table} SET rank = $1 WHERE id = $2`, [index + 1, id],
                    );
                }
                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
            return NextResponse.json({ success: true, ranked: ids.length });
        }

        // A bare array of {id} reorders in one transaction — index becomes sort_order.
        if (Array.isArray(body)) {
            const ids = body
                .map((row) => Math.trunc(Number((row as { id: unknown }).id)))
                .filter((id) => Number.isFinite(id) && id > 0);

            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                if (def.table === 'honeymoon_days') {
                    // Days have no sort_order: their order *is* day_number, so
                    // moving one renumbers the trip — drag day 3 above day 1 and
                    // it becomes day 1, dates and all. Stops hang off day_id, so
                    // they travel with their day.
                    //
                    // day_number is UNIQUE, so assigning final numbers directly
                    // would collide the moment two days swap. Parking every row
                    // on -id first is collision-free (ids are unique and
                    // positive) and leaves nothing to clash with.
                    await client.query(
                        'UPDATE honeymoon_days SET day_number = -id WHERE id = ANY($1)', [ids],
                    );
                    for (const [index, id] of ids.entries()) {
                        await client.query(
                            'UPDATE honeymoon_days SET day_number = $1 WHERE id = $2',
                            [index + 1, id],
                        );
                    }
                } else {
                    for (const [index, id] of ids.entries()) {
                        await client.query(
                            `UPDATE ${def.table} SET sort_order = $1 WHERE id = $2`, [index, id],
                        );
                    }
                }

                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
            return NextResponse.json({ success: true });
        }

        /*
         * `{ rows: [{ id, …fields }, …] }` — many rows, each with its own values,
         * in one transaction.
         *
         * The bulk edit below writes *the same* fields to every id, which is the
         * wrong shape for half of what the UI does: applying a range of days,
         * filling in coordinates for twenty stays, setting a different time on
         * each stop of a day. Those were a POST or PATCH per row — fourteen or
         * twenty round trips, each followed by a whole-payload refetch. This is
         * one of each.
         *
         * All or nothing: a half-applied range is worse than a failed one.
         */
        if (!Array.isArray(body) && Array.isArray((body as { rows?: unknown }).rows)) {
            const rows = (body as { rows: Record<string, unknown>[] }).rows;
            const client = await pool.connect();
            let updated = 0;
            try {
                await client.query('BEGIN');
                for (const row of rows) {
                    const rowId = Math.trunc(Number(row.id));
                    if (!Number.isFinite(rowId) || rowId <= 0) continue;
                    const { columns, values } = collect(def, row);
                    if (!columns.length) continue;
                    defaultCategory(def, columns, values);
                    const sets = columns.map((c, i) => `${c} = $${i + 1}`).join(', ');
                    const result = await client.query(
                        `UPDATE ${def.table} SET ${sets} WHERE id = $${columns.length + 1}`,
                        [...values, rowId],
                    );
                    updated += result.rowCount ?? 0;
                }
                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
            return NextResponse.json({ success: true, updated });
        }

        // Bulk edit: { ids: [...], ...fields } — used by the places table's
        // multi-select to restatus or clear review flags in one go.
        if (Array.isArray(body.ids)) {
            const ids = body.ids
                .map((raw: unknown) => Math.trunc(Number(raw)))
                .filter((n: number) => Number.isFinite(n) && n > 0);
            if (!ids.length) return NextResponse.json({ error: 'No valid ids' }, { status: 400 });
            const { columns, values } = collect(def, body);
            if (!columns.length) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
            defaultCategory(def, columns, values);
            const sets = columns.map((c, i) => `${c} = $${i + 1}`).join(', ');
            const result = await pool.query(
                `UPDATE ${def.table} SET ${sets} WHERE id = ANY($${columns.length + 1})`,
                [...values, ids],
            );
            return NextResponse.json({ success: true, updated: result.rowCount });
        }

        const id = Math.trunc(Number(body.id));
        if (!Number.isFinite(id) || id <= 0) {
            return NextResponse.json({ error: 'Valid id required' }, { status: 400 });
        }

        const { columns, values } = collect(def, body);
        if (!columns.length) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
        defaultCategory(def, columns, values);

        const sets = columns.map((c, i) => `${c} = $${i + 1}`).join(', ');
        const result = await pool.query(
            `UPDATE ${def.table} SET ${sets} WHERE id = $${columns.length + 1} RETURNING *`,
            [...values, id],
        );
        if (!result.rowCount) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json(result.rows[0]);
    } catch (error) {
        console.error(`Error updating ${resource}:`, error);
        return NextResponse.json({ error: `Failed to update ${resource}` }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: Params) {
    const { resource } = await params;
    try {
        await ensureHoneymoonTables();
        const def = resolve(resource);
        if (!def) return NextResponse.json({ error: 'Unknown resource' }, { status: 404 });

        const params = new URL(request.url).searchParams;

        // ?ids=1,2,3 deletes a selection in one statement — one round trip and
        // one refetch instead of N of each, which matters when the places table
        // is a few hundred rows and you have ticked forty of them.
        const idsParam = params.get('ids');
        if (idsParam) {
            const ids = idsParam.split(',')
                .map((raw) => Math.trunc(Number(raw.trim())))
                .filter((n) => Number.isFinite(n) && n > 0);
            if (!ids.length) return NextResponse.json({ error: 'No valid ids' }, { status: 400 });
            if (def.table === 'honeymoon_categories') {
                // Same rule as the single delete below: the fallback stays, and
                // places filed under a deleted category move to it.
                const rows = await pool.query(
                    'SELECT id, key FROM honeymoon_categories WHERE id = ANY($1)', [ids],
                );
                const keep = rows.rows.filter((r) => r.key !== 'misc');
                if (keep.length) {
                    await pool.query(
                        "UPDATE honeymoon_places SET category = 'misc' WHERE category = ANY($1)",
                        [keep.map((r) => r.key)],
                    );
                }
                const result = await pool.query(
                    'DELETE FROM honeymoon_categories WHERE id = ANY($1)', [keep.map((r) => r.id)],
                );
                return NextResponse.json({ success: true, deleted: result.rowCount });
            }
            const result = await pool.query(
                `DELETE FROM ${def.table} WHERE id = ANY($1)`, [ids],
            );
            return NextResponse.json({ success: true, deleted: result.rowCount });
        }

        const id = Math.trunc(Number(params.get('id')));
        if (!Number.isFinite(id) || id <= 0) {
            return NextResponse.json({ error: 'Valid id required' }, { status: 400 });
        }

        // Places keep a category by key, not by id, so deleting a category would
        // leave them pointing at nothing. Move them to Other first — the same
        // "never destroy the user's rows" rule the itinerary follows.
        if (def.table === 'honeymoon_categories') {
            const row = await pool.query('SELECT key FROM honeymoon_categories WHERE id = $1', [id]);
            const key = row.rows[0]?.key;
            if (key === 'misc') {
                return NextResponse.json(
                    { error: 'Other is the fallback category and cannot be deleted' },
                    { status: 400 },
                );
            }
            if (key) {
                await pool.query(
                    "UPDATE honeymoon_places SET category = 'misc' WHERE category = $1", [key],
                );
            }
        }

        const result = await pool.query(`DELETE FROM ${def.table} WHERE id = $1`, [id]);
        if (!result.rowCount) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error(`Error deleting ${resource}:`, error);
        return NextResponse.json({ error: `Failed to delete ${resource}` }, { status: 500 });
    }
}
