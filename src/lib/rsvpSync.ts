import type { PoolClient } from 'pg';
import { cleanNameSql } from '@/lib/names';

/**
 * Keep a household's RSVP in step with the status the guest list shows.
 *
 * The guest list's status is what the couple edits by hand (a phone call, a
 * text); the RSVP row is what the counts, the seating chart and the kitchen
 * read. Until v0.10.39 changing the status touched only the guest list, so a
 * household switched to "Declined" kept its yes everywhere else.
 *
 *   attending              → attending = TRUE
 *   declined               → attending = FALSE, nobody coming
 *   no answer / likely not → attending = NULL: notes on file, no answer
 *
 * It never creates an RSVP: a status alone is not a reply, and there is nothing
 * for the counts to read until someone records who is coming.
 */
export async function syncRsvpsToStatus(client: PoolClient, guestIds: number[]): Promise<void> {
    if (guestIds.length === 0) return;
    await client.query(
        `UPDATE rsvps r
            SET attending = CASE g.rsvp_status WHEN 'attending' THEN TRUE
                                               WHEN 'declined' THEN FALSE
                                               ELSE NULL END,
                number_of_guests = CASE
                    -- Already a yes: the guest's own headcount stands. Turning into
                    -- one: the notes list only the people who have notes, so the
                    -- household counts as invited until they say otherwise.
                    WHEN g.rsvp_status = 'attending' AND r.attending = TRUE
                        THEN GREATEST(1, r.number_of_guests)
                    WHEN g.rsvp_status = 'attending' THEN GREATEST(1, COALESCE(g.party_size, 1))
                    ELSE 0 END,
                updated_at = NOW()
           FROM guest_list g
          WHERE g.id = ANY($1::int[])
            AND ${cleanNameSql('r.guest_name')} = ${cleanNameSql('g.guest_name')}
            AND r.attending IS DISTINCT FROM CASE g.rsvp_status WHEN 'attending' THEN TRUE
                                                                WHEN 'declined' THEN FALSE
                                                                ELSE NULL END`,
        [guestIds],
    );
}

/**
 * Removing a household takes its RSVP and its chairs with it. The RSVP is
 * matched by name and the chairs by party, neither of which a foreign key can
 * cascade — so both used to stay behind: the reply still counted, and the
 * chairs stayed taken by people no longer invited.
 */
export async function deleteHousehold(client: PoolClient, guestId: number): Promise<boolean> {
    const found = await client.query('SELECT guest_name FROM guest_list WHERE id = $1', [guestId]);
    if (found.rows.length === 0) return false;
    await client.query(
        `DELETE FROM rsvps WHERE ${cleanNameSql('guest_name')} = ${cleanNameSql('$1::text')}`,
        [found.rows[0].guest_name],
    );
    await client.query(
        'DELETE FROM seat_assignments WHERE party_group_id = $1 OR guest_list_id = $1',
        [guestId],
    );
    await client.query('DELETE FROM guest_list WHERE id = $1', [guestId]);
    return true;
}
