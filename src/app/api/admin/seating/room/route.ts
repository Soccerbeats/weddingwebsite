import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const client = await pool.connect();
  try {
    const fp = await client.query('SELECT id FROM floor_plans ORDER BY id ASC LIMIT 1');
    if (fp.rows.length === 0) return NextResponse.json({ room: null });

    const result = await client.query(
      'SELECT * FROM floor_plan_room WHERE floor_plan_id = $1 LIMIT 1',
      [fp.rows[0].id]
    );
    return NextResponse.json({ room: result.rows[0] ?? null });
  } finally {
    client.release();
  }
}

export async function POST(request: Request) {
  const client = await pool.connect();
  try {
    const { vertices } = await request.json();

    let fp = await client.query('SELECT id FROM floor_plans ORDER BY id ASC LIMIT 1');
    if (fp.rows.length === 0) {
      fp = await client.query(`INSERT INTO floor_plans (name) VALUES ('Main Floor Plan') RETURNING *`);
    }
    const floorPlanId = fp.rows[0].id;

    const existing = await client.query(
      'SELECT id FROM floor_plan_room WHERE floor_plan_id = $1',
      [floorPlanId]
    );

    let result;
    if (existing.rows.length > 0) {
      result = await client.query(
        'UPDATE floor_plan_room SET vertices = $1, updated_at = NOW() WHERE floor_plan_id = $2 RETURNING *',
        [JSON.stringify(vertices), floorPlanId]
      );
    } else {
      result = await client.query(
        'INSERT INTO floor_plan_room (floor_plan_id, vertices) VALUES ($1, $2) RETURNING *',
        [floorPlanId, JSON.stringify(vertices)]
      );
    }

    return NextResponse.json({ success: true, room: result.rows[0] });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to save room' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE() {
  const client = await pool.connect();
  try {
    const fp = await client.query('SELECT id FROM floor_plans ORDER BY id ASC LIMIT 1');
    if (fp.rows.length > 0) {
      await client.query('DELETE FROM floor_plan_room WHERE floor_plan_id = $1', [fp.rows[0].id]);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to delete room' }, { status: 500 });
  } finally {
    client.release();
  }
}
