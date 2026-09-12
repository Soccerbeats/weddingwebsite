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
  rsvp_status: string | null;
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
    const fpResult = await client.query(
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
      // rsvp_status per seat. A companion seat (guest_list_id IS NULL) carries no
      // guest_list row of its own, so its answer comes from the matching entry in
      // the party leader's `party_members` — matched on the name the seat was
      // created with. Falling straight back to the leader's own status, as this
      // used to, painted a declined plus-one green and counted them as coming.
      // A member with no recorded answer still inherits the leader's status.
      `SELECT sa.seating_table_id, sa.seat_index, sa.guest_list_id,
              sa.display_name, sa.party_group_id,
              gl.guest_name, gl.plus_one_name, gl.party_size,
              CASE
                WHEN sa.guest_list_id IS NOT NULL THEN gl.rsvp_status
                WHEN member.attending IS FALSE THEN 'declined'
                ELSE party_leader.rsvp_status
              END AS rsvp_status
       FROM seat_assignments sa
       LEFT JOIN guest_list gl ON gl.id = sa.guest_list_id
       LEFT JOIN guest_list party_leader ON party_leader.id = sa.party_group_id AND sa.guest_list_id IS NULL
       LEFT JOIN LATERAL (
         SELECT CASE WHEN jsonb_typeof(m->'attending') = 'boolean'
                     THEN (m->>'attending')::boolean END AS attending
         FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(party_leader.party_members) = 'array'
                THEN party_leader.party_members ELSE '[]'::jsonb END
         ) AS m
         WHERE m->>'name' IS NOT NULL
           AND LOWER(TRIM(m->>'name')) = LOWER(TRIM(sa.display_name))
         LIMIT 1
       ) member ON TRUE
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
        rsvp_status: row.rsvp_status ?? null,
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
        // Declared capacity when the table has one, otherwise the seats in use —
        // the dashboard reads the same rule.
        seat_count: Math.max(Number(table.seat_count) || 0, seats.length),
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
    const fpResult = await client.query(
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
