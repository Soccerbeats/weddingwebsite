import { NextResponse } from 'next/server';
import pool from '@/lib/db';

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS donations (
      id SERIAL PRIMARY KEY,
      guest_id INTEGER,
      guest_name TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      fund_item_id TEXT,
      fund_item_title TEXT,
      event TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE donations ADD COLUMN IF NOT EXISTS co_donors JSONB DEFAULT '[]'::jsonb`);
}

export async function GET() {
  try {
    await ensureTable();
    const result = await pool.query(
      `SELECT id, guest_id, guest_name, amount::float8 AS amount,
              fund_item_id, fund_item_title, event, created_at,
              COALESCE(co_donors, '[]'::jsonb) AS co_donors
       FROM donations ORDER BY created_at DESC, id DESC`
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching donations:', error);
    return NextResponse.json({ error: 'Failed to fetch donations' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureTable();
    const { guest_id, guest_name, amount, fund_item_id, fund_item_title, event, co_donors } = await request.json();
    if (!guest_name || amount == null || isNaN(Number(amount))) {
      return NextResponse.json({ error: 'guest_name and a numeric amount are required' }, { status: 400 });
    }
    const result = await pool.query(
      `INSERT INTO donations (guest_id, guest_name, amount, fund_item_id, fund_item_title, event, co_donors)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, guest_id, guest_name, amount::float8 AS amount, fund_item_id, fund_item_title, event, created_at,
                 COALESCE(co_donors, '[]'::jsonb) AS co_donors`,
      [guest_id ?? null, guest_name, Number(amount), fund_item_id ?? null, fund_item_title ?? null, event ?? null,
       JSON.stringify(Array.isArray(co_donors) ? co_donors : [])]
    );
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding donation:', error);
    return NextResponse.json({ error: 'Failed to add donation' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await ensureTable();
    const { id, guest_id, guest_name, amount, fund_item_id, fund_item_title, event, co_donors } = await request.json();
    if (!id || !guest_name || amount == null || isNaN(Number(amount))) {
      return NextResponse.json({ error: 'id, guest_name and a numeric amount are required' }, { status: 400 });
    }
    const result = await pool.query(
      `UPDATE donations
       SET guest_id = $1, guest_name = $2, amount = $3, fund_item_id = $4,
           fund_item_title = $5, event = $6, co_donors = $7
       WHERE id = $8
       RETURNING id, guest_id, guest_name, amount::float8 AS amount, fund_item_id, fund_item_title, event, created_at,
                 COALESCE(co_donors, '[]'::jsonb) AS co_donors`,
      [guest_id ?? null, guest_name, Number(amount), fund_item_id ?? null, fund_item_title ?? null, event ?? null,
       JSON.stringify(Array.isArray(co_donors) ? co_donors : []), id]
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Donation not found' }, { status: 404 });
    }
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating donation:', error);
    return NextResponse.json({ error: 'Failed to update donation' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureTable();
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    await pool.query('DELETE FROM donations WHERE id = $1', [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting donation:', error);
    return NextResponse.json({ error: 'Failed to delete donation' }, { status: 500 });
  }
}
