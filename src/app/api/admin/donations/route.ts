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
}

export async function GET() {
  try {
    await ensureTable();
    const result = await pool.query(
      `SELECT id, guest_id, guest_name, amount::float8 AS amount,
              fund_item_id, fund_item_title, event, created_at
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
    const { guest_id, guest_name, amount, fund_item_id, fund_item_title, event } = await request.json();
    if (!guest_name || amount == null || isNaN(Number(amount))) {
      return NextResponse.json({ error: 'guest_name and a numeric amount are required' }, { status: 400 });
    }
    const result = await pool.query(
      `INSERT INTO donations (guest_id, guest_name, amount, fund_item_id, fund_item_title, event)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, guest_id, guest_name, amount::float8 AS amount, fund_item_id, fund_item_title, event, created_at`,
      [guest_id ?? null, guest_name, Number(amount), fund_item_id ?? null, fund_item_title ?? null, event ?? null]
    );
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding donation:', error);
    return NextResponse.json({ error: 'Failed to add donation' }, { status: 500 });
  }
}
