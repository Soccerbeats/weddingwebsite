import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

interface SeatAssignment {
  seat_index: number;
  guest_list_id: number | null;
  display_name: string;
  party_group_id: number | null;
  guest_name: string | null;
  plus_one_name: string | null;
  party_size: number | null;
}

interface SeatingTable {
  id: number;
  name: string;
  table_type: string;
  seat_count: number;
  x: number;
  y: number;
  rotation: number;
  seats: SeatAssignment[];
}

export async function GET() {
  const client = await pool.connect();
  try {
    // Get or create floor plan
    let fpResult = await client.query(
      'SELECT * FROM floor_plans ORDER BY id ASC LIMIT 1'
    );

    let floorPlan = fpResult.rows[0];
    if (!floorPlan) {
      const created = await client.query(
        `INSERT INTO floor_plans (name) VALUES ('Main Floor Plan') RETURNING *`
      );
      floorPlan = created.rows[0];
    }

    // Get all tables for this floor plan
    const tablesResult = await client.query(
      `SELECT * FROM seating_tables WHERE floor_plan_id = $1 ORDER BY id ASC`,
      [floorPlan.id]
    );

    // Get all seat assignments with guest info for this floor plan's tables
    const assignmentsResult = await client.query(
      `SELECT sa.seating_table_id, sa.seat_index, sa.guest_list_id,
              sa.display_name, sa.party_group_id,
              gl.guest_name, gl.plus_one_name, gl.party_size
       FROM seat_assignments sa
       LEFT JOIN guest_list gl ON gl.id = sa.guest_list_id
       WHERE sa.seating_table_id IN (
         SELECT id FROM seating_tables WHERE floor_plan_id = $1
       )
       ORDER BY sa.seating_table_id, sa.seat_index ASC`,
      [floorPlan.id]
    );

    // Index assignments by table id
    const assignmentsByTable: Record<number, SeatAssignment[]> = {};
    for (const row of assignmentsResult.rows) {
      if (!assignmentsByTable[row.seating_table_id]) {
        assignmentsByTable[row.seating_table_id] = [];
      }
      assignmentsByTable[row.seating_table_id].push({
        seat_index: row.seat_index,
        guest_list_id: row.guest_list_id,
        display_name: row.display_name,
        party_group_id: row.party_group_id,
        guest_name: row.guest_name,
        plus_one_name: row.plus_one_name,
        party_size: row.party_size,
      });
    }

    // Build tables — seats only from actual assignments (no empty slots)
    const tables: SeatingTable[] = tablesResult.rows.map((table) => {
      const seats: SeatAssignment[] = (assignmentsByTable[table.id] || [])
        .sort((a, b) => a.seat_index - b.seat_index);

      return {
        id: table.id,
        name: table.name,
        table_type: table.table_type,
        seat_count: seats.length,
        x: table.x,
        y: table.y,
        rotation: table.rotation,
        seats,
      };
    });

    return NextResponse.json({ floorPlan, tables });
  } catch (error) {
    console.error('Error fetching floor plan:', error);
    return NextResponse.json(
      { error: 'Failed to fetch floor plan' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function POST(request: Request) {
  const client = await pool.connect();
  try {
    const { name, room_width, room_height } = await request.json();

    // Get existing floor plan or create one
    let fpResult = await client.query(
      'SELECT id FROM floor_plans ORDER BY id ASC LIMIT 1'
    );

    let floorPlan;
    if (fpResult.rows.length === 0) {
      const created = await client.query(
        `INSERT INTO floor_plans (name, room_width, room_height, updated_at)
         VALUES ($1, $2, $3, NOW()) RETURNING *`,
        [name ?? 'Main Floor Plan', room_width ?? null, room_height ?? null]
      );
      floorPlan = created.rows[0];
    } else {
      const updated = await client.query(
        `UPDATE floor_plans
         SET name = COALESCE($1, name),
             room_width = $2,
             room_height = $3,
             updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [name ?? null, room_width ?? null, room_height ?? null, fpResult.rows[0].id]
      );
      floorPlan = updated.rows[0];
    }

    return NextResponse.json({ success: true, floorPlan });
  } catch (error) {
    console.error('Error upserting floor plan:', error);
    return NextResponse.json(
      { error: 'Failed to upsert floor plan' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
