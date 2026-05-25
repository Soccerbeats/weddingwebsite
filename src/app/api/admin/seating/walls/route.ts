import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const client = await pool.connect();
  try {
    const fp = await client.query('SELECT id FROM floor_plans ORDER BY id ASC LIMIT 1');
    if (fp.rows.length === 0) return NextResponse.json({ walls: [] });

    const result = await client.query(
      'SELECT * FROM floor_plan_walls WHERE floor_plan_id = $1 ORDER BY id ASC',
      [fp.rows[0].id]
    );
    return NextResponse.json({ walls: result.rows });
  } finally {
    client.release();
  }
}

export async function POST(request: Request) {
  const client = await pool.connect();
  try {
    const { x1, y1, x2, y2 } = await request.json();

    let fp = await client.query('SELECT id FROM floor_plans ORDER BY id ASC LIMIT 1');
    if (fp.rows.length === 0) {
      fp = await client.query(`INSERT INTO floor_plans (name) VALUES ('Main Floor Plan') RETURNING *`);
    }
    const floorPlanId = fp.rows[0].id;

    const result = await client.query(
      'INSERT INTO floor_plan_walls (floor_plan_id, x1, y1, x2, y2) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [floorPlanId, x1, y1, x2, y2]
    );
    return NextResponse.json({ success: true, wall: result.rows[0] });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to save wall' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(request: Request) {
  const client = await pool.connect();
  try {
    const { id } = await request.json();
    await client.query('DELETE FROM floor_plan_walls WHERE id = $1', [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to delete wall' }, { status: 500 });
  } finally {
    client.release();
  }
}
