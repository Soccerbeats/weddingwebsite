import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { ensureHoneymoonTables } from '@/lib/honeymoonDb';
import { RESOURCES, TRIP_FIELDS, coerce, type ResourceDef } from '@/lib/honeymoonResources';
import { replayable } from '@/lib/outboxReplay';

/**
 * Generic CRUD for the honeymoon tables.
 *
 * Mirrors the finance [resource] route: every table and column is whitelisted
 * here and all values go through parameterised queries, so no caller-supplied
 * string ever reaches the SQL text. The whitelists live in
 * `@/lib/honeymoonResources`, shared with the offline overlay.
 */

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

/** POST: create. Exported below through `replayable`, so a resend from the offline outbox is applied once. */
async function create(request: Request, { params }: Params) {
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

export const POST = replayable(create);
