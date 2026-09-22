import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { cleanNameSql } from '@/lib/names';
import { type DietaryEntry } from '@/lib/dietary';

export const dynamic = 'force-dynamic';

// ... existing code ...
export async function GET() {
    try {
        const client = await pool.connect();
        try {
            const result = await client.query(`
                SELECT r.*, gl.plus_one_name
                FROM rsvps r
                LEFT JOIN guest_list gl ON LOWER(gl.guest_name) = LOWER(r.guest_name)
                ORDER BY r.created_at DESC
            `);
            return NextResponse.json({ rsvps: result.rows });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Database Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * Record a household's dietary restrictions from the guest list editor.
 *
 * The answers live on the RSVP, which is the only place anything reads them
 * from, so this writes there — including for a household that never submitted
 * the form, where it creates the row. That has a consequence the editor states
 * before you save it: they then count as having answered, and `attending`
 * has to be *something*, so it is taken from the status the guest list already
 * carries rather than invented. A real submission later updates this same row
 * (`/api/rsvp` matches on the name), so nothing is duplicated.
 */
export async function PUT(request: Request) {
    const client = await pool.connect();
    try {
        const { guest_name, dietary_restrictions } = await request.json();

        if (typeof guest_name !== 'string' || guest_name.trim() === '') {
            return NextResponse.json({ error: 'guest_name is required' }, { status: 400 });
        }
        if (!Array.isArray(dietary_restrictions)) {
            return NextResponse.json({ error: 'dietary_restrictions must be an array' }, { status: 400 });
        }
        const entries = dietary_restrictions as DietaryEntry[];

        const existing = await client.query(
            `SELECT id FROM rsvps
              WHERE ${cleanNameSql('guest_name')} = ${cleanNameSql('$1::text')}
              ORDER BY created_at DESC LIMIT 1`,
            [guest_name],
        );

        if (existing.rows.length > 0) {
            await client.query(
                `UPDATE rsvps SET dietary_restrictions = $1::jsonb, updated_at = NOW() WHERE id = $2`,
                [JSON.stringify(entries), existing.rows[0].id],
            );
            return NextResponse.json({ success: true, created: false });
        }

        const household = await client.query(
            `SELECT email, phone, rsvp_status FROM guest_list
              WHERE ${cleanNameSql('guest_name')} = ${cleanNameSql('$1::text')}
              ORDER BY id ASC LIMIT 1`,
            [guest_name],
        );
        if (household.rows.length === 0) {
            return NextResponse.json({ error: 'No such guest' }, { status: 404 });
        }
        const { email, phone, rsvp_status } = household.rows[0];
        // Every stored entry is a person who is coming — that is what the array
        // means everywhere else — so it is also the headcount.
        const attending = rsvp_status !== 'declined' && rsvp_status !== 'likely_not_coming';

        await client.query(
            `INSERT INTO rsvps (guest_name, email, phone, attending, number_of_guests, dietary_restrictions, message)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, '')`,
            [guest_name.trim(), email ?? '', phone ?? '', attending, attending ? entries.length : 0, JSON.stringify(entries)],
        );
        return NextResponse.json({ success: true, created: true });
    } catch (error) {
        console.error('Database Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    } finally {
        client.release();
    }
}

export async function DELETE(request: Request) {
    try {
        const { id } = await request.json();
        const client = await pool.connect();
        try {
            await client.query('DELETE FROM rsvps WHERE id = $1', [id]);
            return NextResponse.json({ success: true });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Database Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
