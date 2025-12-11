import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    const result = await pool.query(
      'SELECT * FROM guest_list ORDER BY guest_name'
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching guest list:', error);
    return NextResponse.json(
      { error: 'Failed to fetch guest list' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { guest_name, email, phone, party_size, notes, invited, plus_one_name } = await request.json();

    const result = await pool.query(
      `INSERT INTO guest_list (guest_name, email, phone, party_size, notes, invited, plus_one_name, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [guest_name, email, phone, party_size, notes, invited ?? true, plus_one_name]
    );

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding guest:', error);
    return NextResponse.json(
      { error: 'Failed to add guest' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { id, guest_name, email, phone, party_size, notes, invited, plus_one_name } = await request.json();

    const result = await pool.query(
      `UPDATE guest_list
       SET guest_name = $1, email = $2, phone = $3, party_size = $4, notes = $5, invited = $6, plus_one_name = $7, updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [guest_name, email, phone, party_size, notes, invited, plus_one_name, id]
    );

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating guest:', error);
    return NextResponse.json(
      { error: 'Failed to update guest' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();

    await pool.query('DELETE FROM guest_list WHERE id = $1', [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting guest:', error);
    return NextResponse.json(
      { error: 'Failed to delete guest' },
      { status: 500 }
    );
  }
}
