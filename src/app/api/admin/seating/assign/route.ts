import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const client = await pool.connect();
  try {
    const { seating_table_id, seat_index, guest_list_id } = await request.json();

    if (seating_table_id === undefined || seat_index === undefined || guest_list_id === undefined) {
      return NextResponse.json(
        { error: 'seating_table_id, seat_index, and guest_list_id are required' },
        { status: 400 }
      );
    }

    await client.query(
      `INSERT INTO seat_assignments (seating_table_id, seat_index, guest_list_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (seating_table_id, seat_index)
       DO UPDATE SET guest_list_id = EXCLUDED.guest_list_id`,
      [seating_table_id, seat_index, guest_list_id]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error assigning guest to seat:', error);
    return NextResponse.json(
      { error: 'Failed to assign guest to seat' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function DELETE(request: Request) {
  const client = await pool.connect();
  try {
    const { seating_table_id, seat_index } = await request.json();

    if (seating_table_id === undefined || seat_index === undefined) {
      return NextResponse.json(
        { error: 'seating_table_id and seat_index are required' },
        { status: 400 }
      );
    }

    await client.query(
      `DELETE FROM seat_assignments WHERE seating_table_id = $1 AND seat_index = $2`,
      [seating_table_id, seat_index]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error unassigning seat:', error);
    return NextResponse.json(
      { error: 'Failed to unassign seat' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
