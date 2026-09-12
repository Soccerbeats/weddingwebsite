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

interface SeatRef {
  seating_table_id: number;
  seat_index: number;
}

// POST: assign one or more seats (whole party at once), in one transaction so a
// party is never half-seated. Three shapes:
//
//   [{...}] | {...}                              insert or overwrite these seats
//   { seating_table_id, replace: true, seats }   swap a table's whole seat list —
//     the reorder used to be a DELETE followed by a POST, and a failed second
//     request emptied the table
//   { deletes: [{seating_table_id, seat_index}], seats: [...] }
//     a move: the deletes and the inserts land together, so a bulk move of
//     twenty people across four tables cannot half-happen and leave someone
//     sitting in two chairs or none. Deletes run first, which is what frees the
//     indices the inserts may be about to claim.
export async function POST(request: Request) {
  const client = await pool.connect();
  try {
    const body = await request.json();
    const isObject = body && !Array.isArray(body) && typeof body === 'object';
    const replaceTable: number | null = isObject && body.replace === true
      ? Number(body.seating_table_id)
      : null;
    const deletes: SeatRef[] = isObject && Array.isArray(body.deletes) ? body.deletes : [];
    const seats: SeatPayload[] = replaceTable != null || deletes.length > 0 || (isObject && Array.isArray(body.seats))
      ? (Array.isArray(body.seats) ? body.seats : [])
      : (Array.isArray(body) ? body : [body]);

    for (const seat of [...seats, ...deletes]) {
      if (!Number.isInteger(seat.seating_table_id) || !Number.isInteger(seat.seat_index) || seat.seat_index < 0) {
        return NextResponse.json({ error: 'seating_table_id and seat_index must be integers' }, { status: 400 });
      }
    }

    await client.query('BEGIN');
    if (replaceTable != null) {
      await client.query('DELETE FROM seat_assignments WHERE seating_table_id = $1', [replaceTable]);
    }
    for (const ref of deletes) {
      await client.query(
        'DELETE FROM seat_assignments WHERE seating_table_id = $1 AND seat_index = $2',
        [ref.seating_table_id, ref.seat_index],
      );
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
