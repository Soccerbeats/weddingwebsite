import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { ensureFinanceTables } from '@/lib/financeDb';

/**
 * Generic CRUD for the finance tables.
 *
 * Every table and column is whitelisted below and all values go through
 * parameterised queries — no caller-supplied string ever reaches the SQL text.
 * One endpoint keeps eight near-identical route files from existing.
 */

type FieldKind = 'text' | 'number' | 'int' | 'bool' | 'date' | 'ref' | 'enum';

interface Field {
    kind: FieldKind;
    /** allowed values for 'enum' */
    values?: string[];
}

interface ResourceDef {
    table: string;
    fields: Record<string, Field>;
    /** required on create */
    required: string[];
}

const RESOURCES: Record<string, ResourceDef> = {
    categories: {
        table: 'finance_categories',
        fields: { name: { kind: 'text' }, sort_order: { kind: 'int' }, archived: { kind: 'bool' } },
        required: ['name'],
    },
    items: {
        table: 'finance_items',
        fields: {
            category_id: { kind: 'ref' },
            name: { kind: 'text' },
            unit_cost: { kind: 'number' },
            quantity: { kind: 'number' },
            qty_source: { kind: 'enum', values: ['manual', 'adults', 'minors', 'total'] },
            use_subitems: { kind: 'bool' },
            is_paid: { kind: 'bool' },
            notes: { kind: 'text' },
            sort_order: { kind: 'int' },
            archived: { kind: 'bool' },
        },
        required: ['category_id', 'name'],
    },
    subitems: {
        table: 'finance_subitems',
        fields: {
            item_id: { kind: 'ref' },
            name: { kind: 'text' },
            unit_cost: { kind: 'number' },
            quantity: { kind: 'number' },
            sort_order: { kind: 'int' },
        },
        required: ['item_id', 'name'],
    },
    payers: {
        table: 'finance_payers',
        fields: { name: { kind: 'text' }, share_pct: { kind: 'number' }, sort_order: { kind: 'int' } },
        required: ['name'],
    },
    purchases: {
        table: 'finance_purchases',
        fields: {
            payer_id: { kind: 'ref' },
            item_id: { kind: 'ref' },
            category_id: { kind: 'ref' },
            description: { kind: 'text' },
            amount: { kind: 'number' },
            purchased_on: { kind: 'date' },
            notes: { kind: 'text' },
            receipt_path: { kind: 'text' },
            archived: { kind: 'bool' },
        },
        required: ['description'],
    },
    contributors: {
        table: 'finance_contributors',
        fields: {
            name: { kind: 'text' },
            pledged: { kind: 'number' },
            notes: { kind: 'text' },
            sort_order: { kind: 'int' },
            thank_you_sent: { kind: 'bool' },
            archived: { kind: 'bool' },
        },
        required: ['name'],
    },
    schedule: {
        table: 'finance_schedule',
        fields: {
            item_id: { kind: 'ref' },
            category_id: { kind: 'ref' },
            label: { kind: 'text' },
            kind: { kind: 'enum', values: ['installment', 'deposit', 'balance'] },
            amount: { kind: 'number' },
            due_on: { kind: 'date' },
            settled: { kind: 'bool' },
            sort_order: { kind: 'int' },
        },
        required: ['label'],
    },
    receipts: {
        table: 'finance_receipts',
        fields: {
            contributor_id: { kind: 'ref' },
            item_id: { kind: 'ref' },
            category_id: { kind: 'ref' },
            amount: { kind: 'number' },
            received_on: { kind: 'date' },
            note: { kind: 'text' },
        },
        required: ['contributor_id'],
    },
};

/**
 * A payment targets one budget line OR one whole section, never both — double
 * counting would silently inflate a section's paid total. Whichever the caller
 * just set wins, and the other is cleared in the same statement.
 */
function applyTargetExclusivity(def: ResourceDef, columns: string[], values: unknown[]) {
    if (!('item_id' in def.fields) || !('category_id' in def.fields)) return;

    const setItem = columns.includes('item_id') && values[columns.indexOf('item_id')] != null;
    const setCategory = columns.includes('category_id') && values[columns.indexOf('category_id')] != null;
    if (!setItem && !setCategory) return;

    // If the request set both, the section link is dropped — a line is the more
    // specific target and is what the UI sends for a line selection.
    const clear = setItem ? 'category_id' : 'item_id';
    const at = columns.indexOf(clear);
    if (at >= 0) values[at] = null;
    else { columns.push(clear); values.push(null); }
}

/** Record when a thank-you was marked sent, and clear it when unmarked. */
function stampThankYou(
    def: ResourceDef, body: Record<string, unknown>, columns: string[], values: unknown[],
) {
    if (def.table !== 'finance_contributors' || !('thank_you_sent' in body)) return;
    const sent = columns.includes('thank_you_sent') && values[columns.indexOf('thank_you_sent')] === true;
    columns.push('thank_you_sent_at');
    values.push(sent ? new Date().toISOString() : null);
}

/**
 * Parse a money-ish value. Strips currency formatting so "$1,234.56" survives a
 * paste or a direct API call — plain Number() yields NaN there, and silently
 * writing 0 over a real amount is the worst possible failure for a ledger.
 */
function parseAmount(raw: unknown): number | null {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    if (raw == null) return null;
    const cleaned = String(raw).replace(/[$,\s]/g, '');
    if (cleaned === '') return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
}

/** Thrown by coerce(); turned into a 400 by the handlers. */
class BadValue extends Error {}

function coerce(field: Field, raw: unknown, key = 'value'): unknown {
    switch (field.kind) {
        case 'text':
            return raw == null ? null : String(raw);
        case 'number': {
            // A blank means zero; anything that is not a number is refused.
            // Writing 0 over a real amount because "abc" arrived is the worst
            // failure a ledger can have, so it is a 400, not a default.
            if (raw == null || raw === '') return 0;
            const n = parseAmount(raw);
            if (n == null) throw new BadValue(`${key} must be a number`);
            return n;
        }
        case 'int': {
            if (raw == null || raw === '') return 0;
            const n = parseAmount(raw);
            if (n == null) throw new BadValue(`${key} must be a whole number`);
            return Math.trunc(n);
        }
        case 'bool':
            return raw === true || raw === 'true' || raw === 1 || raw === '1';
        case 'date':
            return raw === '' || raw == null ? null : String(raw);
        case 'ref': {
            const n = parseAmount(raw);
            return n != null && n > 0 ? Math.trunc(n) : null;
        }
        case 'enum':
            if (field.values?.includes(String(raw))) return String(raw);
            throw new BadValue(`${key} must be one of ${field.values?.join(', ')}`);
    }
}

/** Pick out only whitelisted keys the caller actually sent. */
function collect(def: ResourceDef, body: Record<string, unknown>) {
    const columns: string[] = [];
    const values: unknown[] = [];
    for (const [key, field] of Object.entries(def.fields)) {
        if (key in body) {
            columns.push(key);
            values.push(coerce(field, body[key], key));
        }
    }
    return { columns, values };
}

function resolve(resource: string): ResourceDef | null {
    return Object.prototype.hasOwnProperty.call(RESOURCES, resource) ? RESOURCES[resource] : null;
}

const SETTINGS_FIELDS: Record<string, Field> = {
    adult_count: { kind: 'int' },
    minor_count: { kind: 'int' },
    plan_horizon_months: { kind: 'ref' }, // nullable positive int, or null to auto-derive
    paycheck_interval_days: { kind: 'int' },
};

type Params = { params: Promise<{ resource: string }> };

export async function POST(request: Request, { params }: Params) {
    const { resource } = await params;
    try {
        await ensureFinanceTables();
        const body = await request.json();

        // Settings is a singleton: POST updates row 1 rather than inserting.
        if (resource === 'settings') {
            const columns: string[] = [];
            const values: unknown[] = [];
            for (const [key, field] of Object.entries(SETTINGS_FIELDS)) {
                if (key in body) { columns.push(key); values.push(coerce(field, body[key], key)); }
            }
            if (!columns.length) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
            const sets = columns.map((c, i) => `${c} = $${i + 1}`).join(', ');
            const result = await pool.query(
                `UPDATE finance_settings SET ${sets} WHERE id = 1 RETURNING *`, values,
            );
            return NextResponse.json(result.rows[0]);
        }

        const def = resolve(resource);
        if (!def) return NextResponse.json({ error: 'Unknown resource' }, { status: 404 });

        for (const key of def.required) {
            const value = body[key];
            const missing = value == null || value === ''
                || (def.fields[key]?.kind === 'ref' && coerce(def.fields[key], value, key) == null);
            if (missing) {
                return NextResponse.json({ error: `${key} is required` }, { status: 400 });
            }
        }

        const { columns, values } = collect(def, body);
        if (!columns.length) return NextResponse.json({ error: 'No fields provided' }, { status: 400 });
        applyTargetExclusivity(def, columns, values);

        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const result = await pool.query(
            `INSERT INTO ${def.table} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`,
            values,
        );
        return NextResponse.json(result.rows[0]);
    } catch (error) {
        if (error instanceof BadValue) return NextResponse.json({ error: error.message }, { status: 400 });
        console.error(`Error creating ${resource}:`, error);
        return NextResponse.json({ error: `Failed to create ${resource}` }, { status: 500 });
    }
}

export async function PATCH(request: Request, { params }: Params) {
    const { resource } = await params;
    try {
        await ensureFinanceTables();
        const def = resolve(resource);
        if (!def) return NextResponse.json({ error: 'Unknown resource' }, { status: 404 });

        const body = await request.json();

        // A bare array of {id, sort_order} reorders in one transaction.
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

        // Bulk edit: { ids: [...], ...fields } updates them all in one statement.
        if (Array.isArray(body.ids)) {
            const ids = body.ids
                .map((raw: unknown) => Math.trunc(Number(raw)))
                .filter((n: number) => Number.isFinite(n) && n > 0);
            if (!ids.length) return NextResponse.json({ error: 'No valid ids' }, { status: 400 });
            const { columns, values } = collect(def, body);
            applyTargetExclusivity(def, columns, values);
            stampThankYou(def, body, columns, values);
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
        applyTargetExclusivity(def, columns, values);
        stampThankYou(def, body, columns, values);

        const sets = columns.map((c, i) => `${c} = $${i + 1}`).join(', ');
        const result = await pool.query(
            `UPDATE ${def.table} SET ${sets} WHERE id = $${columns.length + 1} RETURNING *`,
            [...values, id],
        );
        if (!result.rowCount) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json(result.rows[0]);
    } catch (error) {
        if (error instanceof BadValue) return NextResponse.json({ error: error.message }, { status: 400 });
        console.error(`Error updating ${resource}:`, error);
        return NextResponse.json({ error: `Failed to update ${resource}` }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: Params) {
    const { resource } = await params;
    try {
        await ensureFinanceTables();
        const def = resolve(resource);
        if (!def) return NextResponse.json({ error: 'Unknown resource' }, { status: 404 });

        const id = Math.trunc(Number(new URL(request.url).searchParams.get('id')));
        if (!Number.isFinite(id) || id <= 0) {
            return NextResponse.json({ error: 'Valid id required' }, { status: 400 });
        }

        const result = await pool.query(`DELETE FROM ${def.table} WHERE id = $1`, [id]);
        if (!result.rowCount) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof BadValue) return NextResponse.json({ error: error.message }, { status: 400 });
        console.error(`Error deleting ${resource}:`, error);
        return NextResponse.json({ error: `Failed to delete ${resource}` }, { status: 500 });
    }
}
