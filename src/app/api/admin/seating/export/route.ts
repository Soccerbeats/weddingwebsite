import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getSiteConfig } from '@/lib/config';
import { partyAttendees } from '@/lib/seating';
import { cleanName, cleanNameSql } from '@/lib/names';
import { dietCodes, dietNote, type DietaryEntry, type ExportPerson, type ExportTable, type SeatingExportData } from '@/lib/seatingExport';

export const dynamic = 'force-dynamic';

/**
 * The seating chart as a document: every chair, who is in it, and what they
 * cannot eat.
 *
 * A separate read from the floor plan the editor loads, deliberately — the
 * editor does not need anybody's dietary answers, and the export does not need
 * table coordinates. It is also the only place the two halves of the data meet:
 * a chair lives in `seat_assignments` and a restriction lives in an RSVP, joined
 * on nothing sturdier than the name the seat was created with.
 */

/** A dietary answer matched to a seat, or null when that person never answered. */
function personFrom(
    name: string,
    seat: number | null,
    tableName: string | null,
    household: string,
    side: string | null,
    rsvpStatus: string | null,
    entry: DietaryEntry | null,
): ExportPerson {
    return {
        name,
        seat,
        table_name: tableName,
        household,
        side,
        rsvp_status: rsvpStatus,
        diet: dietCodes(entry),
        note: dietNote(entry),
    };
}

/** The entry in an RSVP's dietary array that belongs to one person, by name. */
function entryFor(entries: unknown, name: string): DietaryEntry | null {
    if (!Array.isArray(entries)) return null;
    // Notes off both sides: the name on an answer and the name on the guest list
    // are both hand-entered, and either can carry "(Lauren's Boyfriend)".
    const wanted = cleanName(name).toLowerCase();
    const found = (entries as DietaryEntry[]).find(
        e => cleanName(e?.name).toLowerCase() === wanted,
    );
    return found ?? null;
}

export async function GET() {
    const client = await pool.connect();
    try {
        const fpResult = await client.query('SELECT * FROM floor_plans ORDER BY id ASC LIMIT 1');
        const floorPlan = fpResult.rows[0];

        const config = getSiteConfig();
        const header = {
            title: [config.brideName, config.groomName].filter(Boolean).join(' & ') || 'Seating chart',
            date: config.weddingDate || null,
            venue: config.weddingVenue || config.weddingLocation || null,
        };

        if (!floorPlan) {
            return NextResponse.json({ ...header, tables: [], unseated: [] } satisfies SeatingExportData);
        }

        const tablesResult = await client.query(
            `SELECT id, name, table_type, seat_count FROM seating_tables
              WHERE floor_plan_id = $1 ORDER BY id ASC`,
            [floorPlan.id],
        );

        // One row per occupied chair. The rsvp_status CASE is the floor plan
        // route's, so a declined companion reads the same on the sheet as it
        // does on the canvas; the dietary LATERAL matches the seat's own name
        // against the household's most recent RSVP, which is how the rest of the
        // app ties a companion to their answer.
        const seatsResult = await client.query(
            `SELECT sa.seating_table_id, sa.seat_index, sa.display_name,
                    COALESCE(household.guest_name, sa.display_name) AS household,
                    household.side AS side,
                    CASE
                      WHEN sa.guest_list_id IS NOT NULL THEN gl.rsvp_status
                      WHEN member.attending IS FALSE THEN 'declined'
                      ELSE party_leader.rsvp_status
                    END AS rsvp_status,
                    diet.entry AS diet
               FROM seat_assignments sa
               LEFT JOIN guest_list gl ON gl.id = sa.guest_list_id
               LEFT JOIN guest_list party_leader
                      ON party_leader.id = sa.party_group_id AND sa.guest_list_id IS NULL
               LEFT JOIN guest_list household
                      ON household.id = COALESCE(sa.party_group_id, sa.guest_list_id)
               LEFT JOIN LATERAL (
                 SELECT CASE WHEN jsonb_typeof(m->'attending') = 'boolean'
                             THEN (m->>'attending')::boolean END AS attending
                   FROM jsonb_array_elements(
                     CASE WHEN jsonb_typeof(party_leader.party_members) = 'array'
                          THEN party_leader.party_members ELSE '[]'::jsonb END
                   ) AS m
                  WHERE m->>'name' IS NOT NULL
                    AND ${cleanNameSql("m->>'name'")} = ${cleanNameSql('sa.display_name')}
                  LIMIT 1
               ) member ON TRUE
               LEFT JOIN LATERAL (
                 SELECT d AS entry
                   FROM (
                     SELECT dietary_restrictions
                       FROM rsvps
                      WHERE LOWER(TRIM(guest_name)) = LOWER(TRIM(household.guest_name))
                      ORDER BY created_at DESC
                      LIMIT 1
                   ) r
                   CROSS JOIN LATERAL jsonb_array_elements(
                     CASE WHEN jsonb_typeof(r.dietary_restrictions) = 'array'
                          THEN r.dietary_restrictions ELSE '[]'::jsonb END
                   ) AS d
                  WHERE ${cleanNameSql("d->>'name'")} = ${cleanNameSql('sa.display_name')}
                  LIMIT 1
               ) diet ON TRUE
              WHERE sa.seating_table_id IN (
                     SELECT id FROM seating_tables WHERE floor_plan_id = $1)
              ORDER BY sa.seating_table_id, sa.seat_index ASC`,
            [floorPlan.id],
        );

        const byTable = new Map<number, ExportPerson[]>();
        for (const row of seatsResult.rows) {
            const list = byTable.get(row.seating_table_id) ?? [];
            // The printed seat number is the chair's position at the table, not
            // its stored index: indices are only ever unique, so a table people
            // have been moved around holds 0, 1, 4, 7 and would print as such.
            list.push(personFrom(
                row.display_name,
                list.length + 1,
                null,
                row.household,
                row.side ?? null,
                row.rsvp_status ?? null,
                row.diet ?? null,
            ));
            byTable.set(row.seating_table_id, list);
        }

        const tables: ExportTable[] = tablesResult.rows.map(table => {
            const people = (byTable.get(table.id) ?? []).map(p => ({ ...p, table_name: table.name }));
            return {
                id: table.id,
                name: table.name,
                table_type: table.table_type,
                // Same rule as the floor plan: a declared capacity, widened to
                // the chairs actually in use.
                seat_count: Math.max(Number(table.seat_count) || 0, people.length),
                people,
            };
        });

        // Households that are coming and hold no chair anywhere on this plan.
        // Expanded to people through the same `partyAttendees` the chart seats
        // with, so the count here and the count the chart would add agree.
        const unseatedResult = await client.query(
            `SELECT g.id, g.guest_name, g.plus_one_name, g.party_size, g.party_members,
                    g.side, g.rsvp_status, r.dietary_restrictions
               FROM guest_list g
               LEFT JOIN LATERAL (
                 SELECT dietary_restrictions FROM rsvps
                  WHERE LOWER(TRIM(guest_name)) = LOWER(TRIM(g.guest_name))
                  ORDER BY created_at DESC LIMIT 1
               ) r ON TRUE
              WHERE g.invited = true
                AND g.rsvp_status = 'attending'
                AND NOT EXISTS (
                  SELECT 1 FROM seat_assignments sa
                   WHERE (sa.party_group_id = g.id OR sa.guest_list_id = g.id)
                     AND sa.seating_table_id IN (
                       SELECT id FROM seating_tables WHERE floor_plan_id = $1)
                )
              ORDER BY g.guest_name ASC`,
            [floorPlan.id],
        );

        const unseated: ExportPerson[] = unseatedResult.rows.flatMap(row => (
            partyAttendees({
                id: row.id,
                guest_name: row.guest_name,
                plus_one_name: row.plus_one_name,
                party_size: Number(row.party_size) || 1,
                side: row.side,
                rsvp_status: row.rsvp_status,
                invited: true,
                party_members: Array.isArray(row.party_members) ? row.party_members : [],
            }).map(person => personFrom(
                person.name,
                null,
                null,
                row.guest_name,
                row.side ?? null,
                row.rsvp_status ?? null,
                entryFor(row.dietary_restrictions, person.name),
            ))
        ));

        return NextResponse.json({ ...header, tables, unseated } satisfies SeatingExportData);
    } catch (error) {
        console.error('Error building seating export:', error);
        return NextResponse.json({ error: 'Failed to build seating export' }, { status: 500 });
    } finally {
        client.release();
    }
}
