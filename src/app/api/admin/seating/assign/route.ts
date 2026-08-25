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

// POST: assign one or more seats (whole party at once), in one transaction so a
// party is never half-seated. `{ seating_table_id, replace: true, seats: [...] }`
// swaps a table's whole seat list atomically — the reorder used to be a DELETE
// followed by a POST, and a failed second request emptied the table.
export async function POST(request: Request) {
  const client = await pool.connect();
  try {
    const body = await request.json();
    const replaceTable: number | null = body && !Array.isArray(body) && body.replace === true
      ? Number(body.seating_table_id)
      : null;
    const seats: SeatPayload[] = replaceTable != null
      ? (Array.isArray(body.seats) ? body.seats : [])
      : (Array.isArray(body) ? body : [body]);

    for (const seat of seats) {
      if (!Number.isInteger(seat.seating_table_id) || !Number.isInteger(seat.seat_index) || seat.seat_index < 0) {
        return NextResponse.json({ error: 'seating_table_id and seat_index must be integers' }, { status: 400 });
      }
    }

    await client.query('BEGIN');
    if (replaceTable != null) {
      await client.query('DELETE FROM seat_assignments WHERE seating_table_id = $1', [replaceTable]);
    }
    for (const seat of seats) {
      await client.query(
        `INSERT INTO seat_assignments (seating_table_id, seat_index, guest_list_id, display_name, party_group_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (seating_table_id, seat_index)
         DO UPDATE SET
           guest_list_id = EXCLUDED.guest_list_id,
           display_name = EXCLUDED.display_name,
           party_group_id = EXCLUDED.party_group_id`,
        [seat.seating_table_id, seat.seat_index, seat.guest_list_id ?? null, seat.display_name ?? '', seat.party_group_id ?? null]
      );
    }
    await client.query('COMMIT');

    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
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

    if (body.delete_all && body.seating_table_id !== undefined) {
      // Delete all seats at this table (used by reorder: clear then re-insert)
      await client.query(
        'DELETE FROM seat_assignments WHERE seating_table_id = $1',
        [body.seating_table_id]
      );
    } else if (body.party_group_id !== undefined && body.seating_table_id !== undefined) {
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
