import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

interface SeatPayload {
  seating_table_id: number;
  seat_index: number;
  guest_list_id: number | null;
  display_name: string;
  party_group_id: number | null;
}

// POST: assign one or more seats (whole party at once)
export async function POST(request: Request) {
  const client = await pool.connect();
  try {
    const body = await request.json();
    const seats: SeatPayload[] = Array.isArray(body) ? body : [body];

    for (const seat of seats) {
      await client.query(
        `INSERT INTO seat_assignments (seating_table_id, seat_index, guest_list_id, display_name, party_group_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (seating_table_id, seat_index)
         DO UPDATE SET
           guest_list_id = EXCLUDED.guest_list_id,
           display_name = EXCLUDED.display_name,
           party_group_id = EXCLUDED.party_group_id`,
        [seat.seating_table_id, seat.seat_index, seat.guest_list_id ?? null, seat.display_name, seat.party_group_id ?? null]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error assigning seats:', error);
    return NextResponse.json({ error: 'Failed to assign seats' }, { status: 500 });
  } finally {
    client.release();
  }
}

// DELETE: unassign by seat, or remove entire party from a table
export async function DELETE(request: Request) {
  const client = await pool.connect();
  try {
    const body = await request.json();

    if (body.party_group_id !== undefined && body.seating_table_id !== undefined) {
      await client.query(
        'DELETE FROM seat_assignments WHERE seating_table_id = $1 AND party_group_id = $2',
        [body.seating_table_id, body.party_group_id]
      );
    } else if (body.seating_table_id !== undefined && body.seat_index !== undefined) {
      await client.query(
        'DELETE FROM seat_assignments WHERE seating_table_id = $1 AND seat_index = $2',
        [body.seating_table_id, body.seat_index]
      );
    } else {
      return NextResponse.json({ error: 'Invalid delete payload' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error unassigning seat:', error);
    return NextResponse.json({ error: 'Failed to unassign seat' }, { status: 500 });
  } finally {
    client.release();
  }
}
