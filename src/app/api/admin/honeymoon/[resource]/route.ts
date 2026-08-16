import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { ensureHoneymoonTables } from '@/lib/honeymoonDb';
import { CATEGORY_KEYS } from '@/lib/honeymoon';

/**
 * Generic CRUD for the honeymoon tables.
 *
 * Mirrors the finance [resource] route: every table and column is whitelisted
 * here and all values go through parameterised queries, so no caller-supplied
 * string ever reaches the SQL text.
 */

type FieldKind = 'text' | 'number' | 'int' | 'bool' | 'date' | 'ref' | 'enum' | 'json' | 'coord' | 'time';

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
}

interface ResourceDef {
    table: string;
    fields: Record<string, Field>;
    required: string[];
}

const RESOURCES: Record<string, ResourceDef> = {
    regions: {
        table: 'honeymoon_regions',
        fields: {
            name: { kind: 'text' },
            country: { kind: 'text' },
            description: { kind: 'text' },
            center_lat: { kind: 'coord' },
            center_lng: { kind: 'coord' },
            sort_order: { kind: 'int' },
        },
        required: ['name'],
    },
    places: {
        table: 'honeymoon_places',
        fields: {
            region_id: { kind: 'ref' },
            name: { kind: 'text' },
            category: { kind: 'enum', values: CATEGORY_KEYS, fallback: 'misc' },
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
            needs_review: { kind: 'bool' },
            sort_order: { kind: 'int' },
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
            confirmation_ref: { kind: 'text' },
            notes: { kind: 'text' },
        },
        required: ['day_id'],
    },
    notes: {
        table: 'honeymoon_notes',
        fields: {
            title: { kind: 'text' },
            body: { kind: 'text' },
            category: { kind: 'text' },
            source: { kind: 'text' },
            sort_order: { kind: 'int' },
        },
        required: ['title'],
    },
};

const TRIP_FIELDS: Record<string, Field> = {
    title: { kind: 'text' },
    start_date: { kind: 'date' },
    home_currency: { kind: 'text' },
    notes: { kind: 'text' },
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
            return raw == null || raw === '' ? null : String(raw);
        case 'number':
            return parseNumber(raw) ?? 0;
        case 'int': {
            const n = parseNumber(raw);
            return n == null ? 0 : Math.trunc(n);
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

        // Adding a day with no number appends to the end, so the UI can just
        // POST {} and get "the next day".
        if (def.table === 'honeymoon_days' && body.day_number == null) {
            const next = await pool.query(
                'SELECT COALESCE(MAX(day_number), 0) + 1 AS n FROM honeymoon_days',
            );
            body.day_number = next.rows[0].n;
        }

        // A new stop lands at the bottom of its day unless told otherwise.
        if (def.table === 'honeymoon_stops' && body.sort_order == null && body.day_id != null) {
            const next = await pool.query(
                'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM honeymoon_stops WHERE day_id = $1',
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

        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const result = await pool.query(
            `INSERT INTO ${def.table} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`,
            values,
        );
        return NextResponse.json(result.rows[0]);
    } catch (error) {
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

        // A bare array of {id} reorders in one transaction — index becomes sort_order.
        if (Array.isArray(body)) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                for (const [index, row] of body.entries()) {
                    const id = Math.trunc(Number((row as { id: unknown }).id));
                    if (!Number.isFinite(id) || id <= 0) continue;
                    await client.query(
                        `UPDATE ${def.table} SET sort_order = $1 WHERE id = $2`, [index, id],
                    );
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

        // Bulk edit: { ids: [...], ...fields } — used by the places table's
        // multi-select to restatus or clear review flags in one go.
        if (Array.isArray(body.ids)) {
            const ids = body.ids
                .map((raw: unknown) => Math.trunc(Number(raw)))
                .filter((n: number) => Number.isFinite(n) && n > 0);
            if (!ids.length) return NextResponse.json({ error: 'No valid ids' }, { status: 400 });
            const { columns, values } = collect(def, body);
            if (!columns.length) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
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
            const result = await pool.query(
                `DELETE FROM ${def.table} WHERE id = ANY($1)`, [ids],
            );
            return NextResponse.json({ success: true, deleted: result.rowCount });
        }

        const id = Math.trunc(Number(params.get('id')));
        if (!Number.isFinite(id) || id <= 0) {
            return NextResponse.json({ error: 'Valid id required' }, { status: 400 });
        }

        const result = await pool.query(`DELETE FROM ${def.table} WHERE id = $1`, [id]);
        if (!result.rowCount) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error(`Error deleting ${resource}:`, error);
        return NextResponse.json({ error: `Failed to delete ${resource}` }, { status: 500 });
    }
}
