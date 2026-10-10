import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { replayable } from '@/lib/outboxReplay';

export const dynamic = 'force-dynamic';

/** POST: create. Exported below through `replayable`, so a resend from the offline outbox is applied once. */
async function create(request: Request) {
  const client = await pool.connect();
  try {
    const {
      floor_plan_id,
      name,
      table_type = 'round',
      seat_count = 8,
      x = 100,
      y = 100,
      rotation = 0,
    } = await request.json();

    if (!floor_plan_id || !name) {
      return NextResponse.json(
        { error: 'floor_plan_id and name are required' },
        { status: 400 }
      );
    }

    const result = await client.query(
      `INSERT INTO seating_tables (floor_plan_id, name, table_type, seat_count, x, y, rotation)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [floor_plan_id, name, table_type, seat_count, x, y, rotation]
    );

    return NextResponse.json({ success: true, table: result.rows[0] });
  } catch (error) {
    console.error('Error creating table:', error);
    return NextResponse.json(
      { error: 'Failed to create table' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export const POST = replayable(create);
