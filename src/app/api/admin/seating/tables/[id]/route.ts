import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = await pool.connect();
  try {
    const { id } = await params;
    const tableId = parseInt(id, 10);
    if (isNaN(tableId)) {
      return NextResponse.json({ error: 'Invalid table id' }, { status: 400 });
    }

    const body = await request.json();
    const allowedFields = ['name', 'table_type', 'seat_count', 'x', 'y', 'rotation'] as const;

    const updates: string[] = [];
    const values: (string | number)[] = [];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = $${values.length + 1}`);
        values.push(body[field] as string | number);
      }
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    values.push(tableId);
    await client.query(
      `UPDATE seating_tables SET ${updates.join(', ')} WHERE id = $${values.length}`,
      values
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating table:', error);
    return NextResponse.json(
      { error: 'Failed to update table' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = await pool.connect();
  try {
    const { id } = await params;
    const tableId = parseInt(id, 10);
    if (isNaN(tableId)) {
      return NextResponse.json({ error: 'Invalid table id' }, { status: 400 });
    }

    // Cascade to seat_assignments is handled by FK constraint
    await client.query('DELETE FROM seating_tables WHERE id = $1', [tableId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting table:', error);
    return NextResponse.json(
      { error: 'Failed to delete table' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
