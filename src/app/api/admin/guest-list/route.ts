import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    const result = await pool.query('SELECT * FROM guest_list ORDER BY guest_name');
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching guest list:', error);
    return NextResponse.json({ error: 'Failed to fetch guest list' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { guest_name, email, phone, party_size, notes, invited, party_members, address, flag, relationship, plus_one_name, upsert } = await request.json();

    if (typeof guest_name !== 'string' || !guest_name.trim()) {
      return NextResponse.json({ error: 'guest_name is required' }, { status: 400 });
    }

    // Schema lives in database/init.sql (including the unique index the
    // upsert relies on); nothing is created per request any more.
    const membersJson = party_members ? JSON.stringify(party_members) : null;
    const plusOne = typeof plus_one_name === 'string' && plus_one_name.trim() ? plus_one_name.trim() : null;

    let result;
    if (upsert) {
      result = await pool.query(
        `INSERT INTO guest_list (guest_name, email, phone, party_size, notes, invited, party_members, address, flag, relationship, plus_one_name, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         ON CONFLICT (LOWER(guest_name)) DO UPDATE SET
           party_size = EXCLUDED.party_size,
           party_members = COALESCE(EXCLUDED.party_members, guest_list.party_members),
           address = CASE WHEN EXCLUDED.address <> '' THEN EXCLUDED.address ELSE guest_list.address END,
           plus_one_name = COALESCE(EXCLUDED.plus_one_name, guest_list.plus_one_name),
           updated_at = NOW()
         RETURNING *, (xmax = 0) AS inserted`,
        [guest_name.trim(), email, phone, party_size, notes, invited ?? true, membersJson, address ?? '', flag ?? null, relationship ?? null, plusOne]
      );
    } else {
      result = await pool.query(
        `INSERT INTO guest_list (guest_name, email, phone, party_size, notes, invited, party_members, address, flag, relationship, plus_one_name, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         RETURNING *`,
        [guest_name.trim(), email, phone, party_size, notes, invited ?? true, membersJson, address ?? '', flag ?? null, relationship ?? null, plusOne]
      );
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding guest:', error);
    return NextResponse.json({ error: 'Failed to add guest' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { id, guest_name, email, phone, party_size, notes, invited, party_members, address, rsvp_status, flag, relationship, side } = await request.json();

    const membersJson = party_members ? JSON.stringify(party_members) : null;

    const result = await pool.query(
      // A party of one cannot have a plus-one. The edit form has no plus-one
      // field (that name arrives by CSV import), so without this a guest shrunk
      // to a party of one kept a plus-one the guest list no longer showed — and
      // the seating chart, which reads it, went on offering them a chair.
      `UPDATE guest_list
       SET guest_name = $1, email = $2, phone = $3, party_size = $4, notes = $5, invited = $6,
           party_members = $7, address = COALESCE($8, address), rsvp_status = $9, flag = $10,
           relationship = $11, side = $12,
           plus_one_name = CASE WHEN COALESCE($4, 1) < 2 THEN NULL ELSE plus_one_name END,
           updated_at = NOW()
       WHERE id = $13
       RETURNING *`,
      [guest_name, email, phone, party_size, notes, invited, membersJson, address, rsvp_status || null, flag ?? null, relationship ?? null, side ?? null, id]
    );

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating guest:', error);
    return NextResponse.json({ error: 'Failed to update guest' }, { status: 500 });
  }
}

// PATCH - two shapes:
//   { id, address }                  single-guest address update (CSV address reconcile tool)
//   { ids: [...], ...fields }        bulk field update from the guest list's Bulk Edit
//
// The bulk form only touches the fields it was given, so "leave unchanged" is the
// default for everything and one selection can't quietly reset unrelated columns.
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, ids, address, flag, side, invited, rsvp_status, notes, noteMode } = body;

    // Single-address update — the original behaviour, kept intact.
    if (ids === undefined) {
      if (!id) {
        return NextResponse.json({ error: 'Missing id' }, { status: 400 });
      }

      const result = await pool.query(
        `UPDATE guest_list SET address = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [address ?? '', id]
      );

      if (result.rowCount === 0) {
        return NextResponse.json({ error: 'Guest not found' }, { status: 404 });
      }

      return NextResponse.json(result.rows[0]);
    }

    const targets = (Array.isArray(ids) ? ids : []).filter(n => Number.isInteger(n));
    if (targets.length === 0) {
      return NextResponse.json({ error: 'No guest ids given' }, { status: 400 });
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };

    // '' means "clear the column" — the caller omits the key entirely to leave it alone.
    if (flag !== undefined) sets.push(`flag = ${push(flag || null)}`);
    if (side !== undefined) sets.push(`side = ${push(side || null)}`);
    if (invited !== undefined) sets.push(`invited = ${push(!!invited)}`);
    if (rsvp_status !== undefined) sets.push(`rsvp_status = ${push(rsvp_status || null)}`);

    if (noteMode === 'replace') {
      sets.push(`notes = ${push(notes ?? '')}`);
    } else if (noteMode === 'clear') {
      sets.push(`notes = ''`);
    } else if (noteMode === 'append' && (notes || '').trim()) {
      // Append on its own line, but don't leave a leading blank line on guests
      // who had no note yet.
      const p = push((notes as string).trim());
      sets.push(`notes = CASE WHEN COALESCE(NULLIF(TRIM(notes), ''), '') = '' THEN ${p} ELSE notes || E'\\n' || ${p} END`);
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const result = await pool.query(
      `UPDATE guest_list SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = ANY(${push(targets)})
       RETURNING id`,
      params
    );

    return NextResponse.json({ success: true, updated: result.rowCount });
  } catch (error) {
    console.error('Error updating guests:', error);
    return NextResponse.json({ error: 'Failed to update guests' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();
    await pool.query('DELETE FROM guest_list WHERE id = $1', [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting guest:', error);
    return NextResponse.json({ error: 'Failed to delete guest' }, { status: 500 });
  }
}
