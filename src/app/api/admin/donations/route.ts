import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { replayable } from '@/lib/outboxReplay';

// Columns returned by every endpoint so the client always gets the same shape.
const RETURNING = `id, guest_id, guest_name, amount::float8 AS amount, gift,
                   fund_item_id, fund_item_title, event, created_at,
                   thank_you_sent, thank_you_sent_at, method,
                   COALESCE(co_donors, '[]'::jsonb) AS co_donors`;

// Runs once per server process, not per request: each ALTER takes a lock on the
// whole table. database/init.sql carries the same schema for fresh installs.
let ensured: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  ensured ??= migrate().catch((error) => { ensured = null; throw error; });
  return ensured;
}

async function migrate() {
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
  // How the money came: 'digital' (Venmo, Zelle, a registry fund), or a card
  // holding 'cash' or a 'check'. Null for a gift with no money, and for rows
  // logged before this column existed.
  await pool.query(`ALTER TABLE donations ADD COLUMN IF NOT EXISTS method TEXT`);
}

const METHODS = new Set(['digital', 'cash', 'check']);
function cleanMethod(raw: unknown): string | null {
  return typeof raw === 'string' && METHODS.has(raw) ? raw : null;
}
/** undefined = leave the flag alone; a boolean = set it. */
function cleanThanked(raw: unknown): boolean | null {
  return typeof raw === 'boolean' ? raw : null;
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

/** POST: create. Exported below through `replayable`, so a resend from the offline outbox is applied once. */
async function create(request: Request) {
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
    const thanked = cleanThanked(body.thank_you_sent) ?? false;
    const result = await pool.query(
      `INSERT INTO donations (guest_id, guest_name, amount, gift, fund_item_id, fund_item_title, event, co_donors,
                              method, thank_you_sent, thank_you_sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CASE WHEN $10 THEN NOW() ELSE NULL END)
       RETURNING ${RETURNING}`,
      [guest_id ?? null, guest_name, amount, gift, fund_item_id ?? null, fund_item_title ?? null, event ?? null,
       JSON.stringify(Array.isArray(co_donors) ? co_donors : []), cleanMethod(body.method), thanked]
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
           fund_item_title = $6, event = $7, co_donors = $8, method = $10,
           thank_you_sent = COALESCE($11, thank_you_sent),
           thank_you_sent_at = CASE
             WHEN $11 IS NULL THEN thank_you_sent_at
             WHEN $11 THEN COALESCE(thank_you_sent_at, NOW())
             ELSE NULL END
       WHERE id = $9
       RETURNING ${RETURNING}`,
      [guest_id ?? null, guest_name, amount, gift, fund_item_id ?? null, fund_item_title ?? null, event ?? null,
       JSON.stringify(Array.isArray(co_donors) ? co_donors : []), id, cleanMethod(body.method),
       cleanThanked(body.thank_you_sent)]
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

/**
 * Bulk edit the selected rows. Only the keys present in the body change:
 *   thank_you_sent — boolean
 *   method         — 'digital' | 'cash' | 'check' | null
 *   event          — string | null
 *   fund_item_id / fund_item_title — string | null
 * How it came and the fund describe money, so they only land on rows that
 * have an amount; a present-only row in the selection keeps neither.
 */
export async function PATCH(request: Request) {
  try {
    await ensureTable();
    const body = await request.json();
    const cleanIds = (Array.isArray(body.ids) ? body.ids : [])
      .map(Number).filter((n: number) => Number.isInteger(n));
    if (cleanIds.length === 0) {
      return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 });
    }
    const sets: string[] = [];
    const params: unknown[] = [cleanIds];
    const param = (v: unknown) => { params.push(v); return `$${params.length}`; };
    if (typeof body.thank_you_sent === 'boolean') {
      const p = param(body.thank_you_sent);
      sets.push(`thank_you_sent = ${p}::boolean`,
        `thank_you_sent_at = CASE WHEN ${p}::boolean THEN COALESCE(thank_you_sent_at, NOW()) ELSE NULL END`);
    }
    if ('method' in body) {
      sets.push(`method = CASE WHEN COALESCE(amount, 0) > 0 THEN ${param(cleanMethod(body.method))}::text ELSE method END`);
    }
    if ('event' in body) {
      const ev = typeof body.event === 'string' && body.event.trim() ? body.event.trim() : null;
      sets.push(`event = ${param(ev)}::text`);
    }
    if ('fund_item_id' in body) {
      const fid = typeof body.fund_item_id === 'string' && body.fund_item_id ? body.fund_item_id : null;
      const title = fid && typeof body.fund_item_title === 'string' ? body.fund_item_title : null;
      sets.push(`fund_item_id = CASE WHEN COALESCE(amount, 0) > 0 THEN ${param(fid)}::text ELSE fund_item_id END`,
        `fund_item_title = CASE WHEN COALESCE(amount, 0) > 0 THEN ${param(title)}::text ELSE fund_item_title END`);
    }
    if (sets.length === 0) {
      return NextResponse.json({ error: 'nothing to change' }, { status: 400 });
    }
    const result = await pool.query(
      `UPDATE donations SET ${sets.join(', ')}
       WHERE id = ANY($1::int[])
       RETURNING ${RETURNING}`,
      params
    );
    return NextResponse.json({ success: true, updated: result.rowCount, rows: result.rows });
  } catch (error) {
    console.error('Error bulk-editing donations:', error);
    return NextResponse.json({ error: 'Failed to update donations' }, { status: 500 });
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

export const POST = replayable(create);
