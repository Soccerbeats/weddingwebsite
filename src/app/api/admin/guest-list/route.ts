import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { cleanNameSql } from '@/lib/names';
import { renamesBetween } from '@/lib/seating';

export async function GET() {
  try {
    // `rsvp_guests` is what the household actually answered for; `party_size` is
    // what they were invited for. The seating chart needs both — reading the
    // invitation as the headcount is what let the chart and the RSVP totals
    // disagree. A lateral keeps it one row per guest however many RSVP rows a
    // name has collected.
    const result = await pool.query(`
      SELECT g.*, r.number_of_guests AS rsvp_guests
        FROM guest_list g
        LEFT JOIN LATERAL (
          SELECT number_of_guests
            FROM rsvps
           WHERE LOWER(TRIM(guest_name)) = LOWER(TRIM(g.guest_name))
             AND attending = true
           ORDER BY updated_at DESC NULLS LAST, id DESC
           LIMIT 1
        ) r ON TRUE
       ORDER BY g.guest_name
    `);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching guest list:', error);
    return NextResponse.json({ error: 'Failed to fetch guest list' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { guest_name, email, phone, party_size, notes, invited, party_members, address, flag, relationship, plus_one_name, upsert, kind, rsvp_status } = await request.json();

    if (typeof guest_name !== 'string' || !guest_name.trim()) {
      return NextResponse.json({ error: 'guest_name is required' }, { status: 400 });
    }

    // Schema lives in database/init.sql (including the unique index the
    // upsert relies on); nothing is created per request any more.
    const membersJson = party_members ? JSON.stringify(party_members) : null;
    const plusOne = typeof plus_one_name === 'string' && plus_one_name.trim() ? plus_one_name.trim() : null;
    // Only the couple row is ever created as anything but a guest, and only by
    // the "Add the couple" button. An unrecognised value would quietly drop a
    // row out of the statistics, so anything else lands as a plain guest.
    const rowKind = kind === 'couple' ? 'couple' : 'guest';

    let result;
    if (upsert) {
      result = await pool.query(
        `INSERT INTO guest_list (guest_name, email, phone, party_size, notes, invited, party_members, address, flag, relationship, plus_one_name, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         ON CONFLICT (LOWER(guest_name)) DO UPDATE SET
           party_size = EXCLUDED.party_size,
           party_members = COALESCE(EXCLUDED.party_members, guest_list.party_members),
           address = CASE WHEN EXCLUDED.address <> '' THEN EXCLUDED.address ELSE guest_list.address END,
           plus_one_name = COALESCE(EXCLUDED.plus_one_name, guest_list.plus_one_name),
           updated_at = NOW()
         RETURNING *, (xmax = 0) AS inserted`,
        [guest_name.trim(), email, phone, party_size, notes, invited ?? true, membersJson, address ?? '', flag ?? null, relationship ?? null, plusOne]
      );
    } else {
      result = await pool.query(
        `INSERT INTO guest_list (guest_name, email, phone, party_size, notes, invited, party_members, address, flag, relationship, plus_one_name, kind, rsvp_status, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
         RETURNING *`,
        [guest_name.trim(), email, phone, party_size, notes, invited ?? true, membersJson, address ?? '', flag ?? null, relationship ?? null, plusOne, rowKind, rsvp_status || null]
      );
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding guest:', error);
    return NextResponse.json({ error: 'Failed to add guest' }, { status: 500 });
  }
}

/**
 * Carry a rename to the two other places a person's name is written down.
 *
 * The guest list decides names, but a seat copies the one it was created with
 * and an RSVP files a dietary answer under the name that answered — so renaming
 * someone used to leave the chart calling them by the old name for good, and, if
 * the new name reached the chart some other way, silently disconnected their
 * restrictions from them. Both copies move with the edit now.
 *
 * Scoped to this household, so renaming one Jessica never touches another.
 */
async function carryRenames(
  client: import('pg').PoolClient,
  guestId: number,
  oldHouseholdName: string,
  renames: { from: string; to: string }[],
) {
  for (const { from, to } of renames) {
    await client.query(
      `UPDATE seat_assignments
          SET display_name = $1
        WHERE (party_group_id = $2 OR guest_list_id = $2)
          AND ${cleanNameSql('display_name')} = ${cleanNameSql('$3::text')}`,
      [to, guestId, from],
    );

    // The answer keeps its place in the array; only the name on it changes.
    await client.query(
      `UPDATE rsvps r
          SET dietary_restrictions = (
                SELECT jsonb_agg(
                         CASE WHEN ${cleanNameSql("d->>'name'")} = ${cleanNameSql('$1::text')}
                              THEN jsonb_set(d, '{name}', to_jsonb($2::text))
                              ELSE d END
                         ORDER BY ord)
                  FROM jsonb_array_elements(r.dietary_restrictions) WITH ORDINALITY AS t(d, ord)
              ),
              updated_at = NOW()
        WHERE ${cleanNameSql('r.guest_name')} = ${cleanNameSql('$3::text')}
          AND jsonb_typeof(r.dietary_restrictions) = 'array'
          AND jsonb_array_length(r.dietary_restrictions) > 0`,
      [from, to, oldHouseholdName],
    );
  }

  // Renaming the household itself also moves its RSVP, which is matched to it by
  // name and nothing else — without this the form they submitted is orphaned.
  const household = renames.find(r => r.from.toLowerCase() === oldHouseholdName.trim().toLowerCase());
  if (household) {
    await client.query(
      `UPDATE rsvps SET guest_name = $1, updated_at = NOW()
        WHERE ${cleanNameSql('guest_name')} = ${cleanNameSql('$2::text')}`,
      [household.to, oldHouseholdName],
    );
  }
}

export async function PUT(request: Request) {
  const client = await pool.connect();
  try {
    const { id, guest_name, email, phone, party_size, notes, invited, party_members, address, rsvp_status, flag, relationship, side } = await request.json();

    const membersJson = party_members ? JSON.stringify(party_members) : null;

    await client.query('BEGIN');

    // Read the names as they stand, before the update overwrites them — the only
    // moment the edit's renames can be worked out.
    const beforeRes = await client.query(
      'SELECT guest_name, plus_one_name, party_members FROM guest_list WHERE id = $1',
      [id],
    );
    const before = beforeRes.rows[0];

    const result = await client.query(
      // A party of one cannot have a plus-one. The edit form has no plus-one
      // field (that name arrives by CSV import), so without this a guest shrunk
      // to a party of one kept a plus-one the guest list no longer showed — and
      // the seating chart, which reads it, went on offering them a chair.
      `UPDATE guest_list
       SET guest_name = $1, email = $2, phone = $3, party_size = $4, notes = $5, invited = $6,
           party_members = $7, address = COALESCE($8, address), rsvp_status = $9, flag = $10,
           relationship = $11, side = $12,
           plus_one_name = CASE WHEN COALESCE($4, 1) < 2 THEN NULL ELSE plus_one_name END,
           updated_at = NOW()
       WHERE id = $13
       RETURNING *`,
      [guest_name, email, phone, party_size, notes, invited, membersJson, address, rsvp_status || null, flag ?? null, relationship ?? null, side ?? null, id]
    );

    if (before) {
      const renames = renamesBetween(
        {
          guest_name: before.guest_name,
          plus_one_name: before.plus_one_name,
          party_members: Array.isArray(before.party_members) ? before.party_members : [],
        },
        {
          guest_name,
          // The edit form has no plus-one field, so it cannot rename one.
          plus_one_name: before.plus_one_name,
          party_members: Array.isArray(party_members) ? party_members : [],
        },
      );
      if (renames.length > 0) await carryRenames(client, id, before.guest_name, renames);
    }

    await client.query('COMMIT');
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error updating guest:', error);
    return NextResponse.json({ error: 'Failed to update guest' }, { status: 500 });
  } finally {
    client.release();
  }
}

// PATCH - two shapes:
//   { id, address }                  single-guest address update (CSV address reconcile tool)
//   { ids: [...], ...fields }        bulk field update from the guest list's Bulk Edit
//
// The bulk form only touches the fields it was given, so "leave unchanged" is the
// default for everything and one selection can't quietly reset unrelated columns.
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, ids, address, flag, side, invited, rsvp_status, notes, noteMode } = body;

    // Single-address update — the original behaviour, kept intact.
    if (ids === undefined) {
      if (!id) {
        return NextResponse.json({ error: 'Missing id' }, { status: 400 });
      }

      const result = await pool.query(
        `UPDATE guest_list SET address = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [address ?? '', id]
      );

      if (result.rowCount === 0) {
        return NextResponse.json({ error: 'Guest not found' }, { status: 404 });
      }

      return NextResponse.json(result.rows[0]);
    }

    const targets = (Array.isArray(ids) ? ids : []).filter(n => Number.isInteger(n));
    if (targets.length === 0) {
      return NextResponse.json({ error: 'No guest ids given' }, { status: 400 });
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };

    // '' means "clear the column" — the caller omits the key entirely to leave it alone.
    if (flag !== undefined) sets.push(`flag = ${push(flag || null)}`);
    if (side !== undefined) sets.push(`side = ${push(side || null)}`);
    if (invited !== undefined) sets.push(`invited = ${push(!!invited)}`);
    if (rsvp_status !== undefined) sets.push(`rsvp_status = ${push(rsvp_status || null)}`);

    if (noteMode === 'replace') {
      sets.push(`notes = ${push(notes ?? '')}`);
    } else if (noteMode === 'clear') {
      sets.push(`notes = ''`);
    } else if (noteMode === 'append' && (notes || '').trim()) {
      // Append on its own line, but don't leave a leading blank line on guests
      // who had no note yet.
      const p = push((notes as string).trim());
      sets.push(`notes = CASE WHEN COALESCE(NULLIF(TRIM(notes), ''), '') = '' THEN ${p} ELSE notes || E'\\n' || ${p} END`);
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const result = await pool.query(
      `UPDATE guest_list SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = ANY(${push(targets)})
       RETURNING id`,
      params
    );

    return NextResponse.json({ success: true, updated: result.rowCount });
  } catch (error) {
    console.error('Error updating guests:', error);
    return NextResponse.json({ error: 'Failed to update guests' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();
    await pool.query('DELETE FROM guest_list WHERE id = $1', [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting guest:', error);
    return NextResponse.json({ error: 'Failed to delete guest' }, { status: 500 });
  }
}
