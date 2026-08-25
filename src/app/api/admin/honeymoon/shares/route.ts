import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { createShare } from '@/lib/honeymoonShare';
import { ensureHoneymoonTables } from '@/lib/honeymoonDb';

/**
 * Share links, on their own route rather than in the generic `[resource]` CRUD.
 *
 * The token is a credential, so it is generated here with `crypto.randomBytes`
 * and never accepted from a caller — a client-chosen token is a client-chosen
 * password. Revoking is an update, not a delete, so a link that leaked stays
 * dead rather than being recreated by chance.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const share = await createShare(
            typeof body.label === 'string' ? body.label : '',
            body.scope,
            typeof body.expires_on === 'string' && body.expires_on ? body.expires_on : null,
        );
        return NextResponse.json(share);
    } catch (error) {
        console.error('Error creating share link:', error);
        return NextResponse.json({ error: 'Failed to create the link' }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        await ensureHoneymoonTables();
        const body = await request.json().catch(() => ({}));
        const id = Math.trunc(Number(body.id));
        if (!Number.isFinite(id) || id <= 0) {
            return NextResponse.json({ error: 'Valid id required' }, { status: 400 });
        }
        const sets: string[] = [];
        const values: unknown[] = [];
        if ('revoked' in body) {
            sets.push(`revoked = $${sets.length + 1}`);
            values.push(body.revoked === true || body.revoked === 'true');
        }
        if ('label' in body) {
            sets.push(`label = $${sets.length + 1}`);
            values.push(String(body.label ?? '').trim());
        }
        if ('expires_on' in body) {
            sets.push(`expires_on = $${sets.length + 1}`);
            values.push(body.expires_on ? String(body.expires_on) : null);
        }
        if (!sets.length) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
        const result = await pool.query(
            `UPDATE honeymoon_shares SET ${sets.join(', ')} WHERE id = $${values.length + 1}
             RETURNING id, token, label, scope, expires_on, revoked`,
            [...values, id],
        );
        if (!result.rowCount) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating share link:', error);
        return NextResponse.json({ error: 'Failed to update the link' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        await ensureHoneymoonTables();
        const id = Math.trunc(Number(new URL(request.url).searchParams.get('id')));
        if (!Number.isFinite(id) || id <= 0) {
            return NextResponse.json({ error: 'Valid id required' }, { status: 400 });
        }
        const result = await pool.query('DELETE FROM honeymoon_shares WHERE id = $1', [id]);
        if (!result.rowCount) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting share link:', error);
        return NextResponse.json({ error: 'Failed to delete the link' }, { status: 500 });
    }
}
