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
    const { guest_name, email, phone, party_size, notes, invited, party_members, address, upsert } = await request.json();

    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS guest_list_name_unique ON guest_list (LOWER(guest_name))`
    );

    const membersJson = party_members ? JSON.stringify(party_members) : null;

    let result;
    if (upsert) {
      result = await pool.query(
        `INSERT INTO guest_list (guest_name, email, phone, party_size, notes, invited, party_members, address, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (LOWER(guest_name)) DO UPDATE SET
           party_size = EXCLUDED.party_size,
           party_members = COALESCE(EXCLUDED.party_members, guest_list.party_members),
           address = CASE WHEN EXCLUDED.address <> '' THEN EXCLUDED.address ELSE guest_list.address END,
           updated_at = NOW()
         RETURNING *, (xmax = 0) AS inserted`,
        [guest_name, email, phone, party_size, notes, invited ?? true, membersJson, address ?? '']
      );
    } else {
      result = await pool.query(
        `INSERT INTO guest_list (guest_name, email, phone, party_size, notes, invited, party_members, address, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         RETURNING *`,
        [guest_name, email, phone, party_size, notes, invited ?? true, membersJson, address ?? '']
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
    const { id, guest_name, email, phone, party_size, notes, invited, party_members, address, rsvp_status } = await request.json();

    const membersJson = party_members ? JSON.stringify(party_members) : null;

    const result = await pool.query(
      `UPDATE guest_list
       SET guest_name = $1, email = $2, phone = $3, party_size = $4, notes = $5, invited = $6,
           party_members = $7, address = COALESCE($8, address), rsvp_status = $9, updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [guest_name, email, phone, party_size, notes, invited, membersJson, address, rsvp_status || null, id]
    );

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating guest:', error);
    return NextResponse.json({ error: 'Failed to update guest' }, { status: 500 });
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
