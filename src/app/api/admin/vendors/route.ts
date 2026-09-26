import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import type { DietaryEntry } from '@/lib/dietary';

/**
 * Vendors — the photographer, the DJ, the planner.
 *
 * A flat list of people who are at the wedding without being at the wedding.
 * Nothing here touches `guest_list`: a vendor is never invited, never RSVPs and
 * never takes a chair, so the only thing this shares with a guest is the shape
 * of the dietary answer — one `DietaryEntry`, the same one the RSVPs store, so
 * the same editor and the same counting code work on both.
 *
 * Protected by `src/middleware.ts` along with everything under `/api/admin/`,
 * for every method including GET. Contact details are in here.
 */

export const dynamic = 'force-dynamic';

/** The text fields, trimmed, with an empty string stored as NULL. */
function text(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
}

/**
 * The dietary answer, stored only when it says something.
 *
 * An untouched set of pills is `{}` — every flag false, no note — and writing
 * that is storing the absence of an answer as an answer. NULL says "nothing
 * reported", which is what the export's count of unrestricted plates means.
 */
function dietary(value: unknown): string | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const entry = value as DietaryEntry;
    const said = entry.vegetarian || entry.vegan || entry.gluten_free
        || entry.nut_allergy || entry.other
        || (entry.other_text ?? '').trim() !== '';
    return said ? JSON.stringify(entry) : null;
}

export async function GET() {
    try {
        // NULLS LAST so a vendor whose role has not been filled in yet sorts to
        // the end of the list rather than to the top of it.
        const result = await pool.query(
            `SELECT * FROM vendors ORDER BY role ASC NULLS LAST, name ASC`,
        );
        return NextResponse.json(result.rows);
    } catch (error) {
        console.error('Error fetching vendors:', error);
        return NextResponse.json({ error: 'Failed to fetch vendors' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const name = text(body.name);
        if (!name) {
            return NextResponse.json({ error: 'name is required' }, { status: 400 });
        }

        const result = await pool.query(
            `INSERT INTO vendors (name, role, company, email, phone, needs_meal, dietary, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
             RETURNING *`,
            [
                name,
                text(body.role),
                text(body.company),
                text(body.email),
                text(body.phone),
                body.needs_meal !== false,
                dietary(body.dietary),
                text(body.notes),
            ],
        );
        return NextResponse.json(result.rows[0]);
    } catch (error) {
        console.error('Error adding vendor:', error);
        return NextResponse.json({ error: 'Failed to add vendor' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const id = Number(body.id);
        const name = text(body.name);
        if (!Number.isFinite(id)) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }
        if (!name) {
            return NextResponse.json({ error: 'name is required' }, { status: 400 });
        }

        const result = await pool.query(
            `UPDATE vendors
                SET name = $1, role = $2, company = $3, email = $4, phone = $5,
                    needs_meal = $6, dietary = $7::jsonb, notes = $8, updated_at = NOW()
              WHERE id = $9
              RETURNING *`,
            [
                name,
                text(body.role),
                text(body.company),
                text(body.email),
                text(body.phone),
                body.needs_meal !== false,
                dietary(body.dietary),
                text(body.notes),
                id,
            ],
        );
        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'No such vendor' }, { status: 404 });
        }
        return NextResponse.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating vendor:', error);
        return NextResponse.json({ error: 'Failed to update vendor' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const id = Number(new URL(request.url).searchParams.get('id'));
        if (!Number.isFinite(id)) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }
        await pool.query('DELETE FROM vendors WHERE id = $1', [id]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting vendor:', error);
        return NextResponse.json({ error: 'Failed to delete vendor' }, { status: 500 });
    }
}
