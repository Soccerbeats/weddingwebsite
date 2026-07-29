import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// Columns returned by every endpoint so the client always gets the same shape.
const RETURNING = `id, guest_id, guest_name, amount::float8 AS amount, gift,
                   fund_item_id, fund_item_title, event, created_at,
                   thank_you_sent, thank_you_sent_at,
                   COALESCE(co_donors, '[]'::jsonb) AS co_donors`;

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
  // A donation can be money, a physical gift, or both — so amount is no longer required.
  await pool.query(`ALTER TABLE donations ADD COLUMN IF NOT EXISTS gift TEXT`);
  await pool.query(`ALTER TABLE donations ADD COLUMN IF NOT EXISTS thank_you_sent BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE donations ADD COLUMN IF NOT EXISTS thank_you_sent_at TIMESTAMP`);
  await pool.query(`ALTER TABLE donations ALTER COLUMN amount SET DEFAULT 0`);
  await pool.query(`ALTER TABLE donations ALTER COLUMN amount DROP NOT NULL`);
}

// A donation must carry something: a dollar amount, a gift, or both.
function normalize(body: { amount?: unknown; gift?: unknown }) {
  const rawAmount = body.amount;
  const amount = rawAmount == null || rawAmount === '' ? 0 : Number(rawAmount);
  const gift = typeof body.gift === 'string' ? body.gift.trim() : '';
  const valid = !isNaN(amount) && amount >= 0 && (amount > 0 || gift.length > 0);
  return { amount, gift: gift || null, valid };
}

export async function GET() {
  try {
    await ensureTable();
    const result = await pool.query(
      `SELECT ${RETURNING} FROM donations ORDER BY created_at DESC, id DESC`
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
    const body = await request.json();
    const { guest_id, guest_name, fund_item_id, fund_item_title, event, co_donors } = body;
    const { amount, gift, valid } = normalize(body);
    if (!guest_name || !valid) {
      return NextResponse.json(
        { error: 'guest_name and either a numeric amount or a gift are required' },
        { status: 400 }
      );
    }
    const result = await pool.query(
      `INSERT INTO donations (guest_id, guest_name, amount, gift, fund_item_id, fund_item_title, event, co_donors)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${RETURNING}`,
      [guest_id ?? null, guest_name, amount, gift, fund_item_id ?? null, fund_item_title ?? null, event ?? null,
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
    const body = await request.json();
    const { id, guest_id, guest_name, fund_item_id, fund_item_title, event, co_donors } = body;
    const { amount, gift, valid } = normalize(body);
    if (!id || !guest_name || !valid) {
      return NextResponse.json(
        { error: 'id, guest_name and either a numeric amount or a gift are required' },
        { status: 400 }
      );
    }
    const result = await pool.query(
      `UPDATE donations
       SET guest_id = $1, guest_name = $2, amount = $3, gift = $4, fund_item_id = $5,
           fund_item_title = $6, event = $7, co_donors = $8
       WHERE id = $9
       RETURNING ${RETURNING}`,
      [guest_id ?? null, guest_name, amount, gift, fund_item_id ?? null, fund_item_title ?? null, event ?? null,
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

// Bulk-set the thank-you flag on the selected rows.
export async function PATCH(request: Request) {
  try {
    await ensureTable();
    const { ids, thank_you_sent } = await request.json();
    const cleanIds = (Array.isArray(ids) ? ids : []).map(Number).filter(n => Number.isInteger(n));
    if (cleanIds.length === 0) {
      return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 });
    }
    const sent = thank_you_sent !== false;
    const result = await pool.query(
      `UPDATE donations
       SET thank_you_sent = $1,
           thank_you_sent_at = CASE WHEN $1 THEN COALESCE(thank_you_sent_at, NOW()) ELSE NULL END
       WHERE id = ANY($2::int[])
       RETURNING ${RETURNING}`,
      [sent, cleanIds]
    );
    return NextResponse.json({ success: true, updated: result.rowCount, rows: result.rows });
  } catch (error) {
    console.error('Error updating thank-you status:', error);
    return NextResponse.json({ error: 'Failed to update thank-you status' }, { status: 500 });
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
