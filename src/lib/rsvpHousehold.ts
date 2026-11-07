import pool from '@/lib/db';
import { foldName, foldNameSql } from '@/lib/names';
import { getSiteConfig } from '@/lib/config';
import { isPastWeddingDay } from '@/lib/weddingDate';

/**
 * Finding a household by a typed name, and building what the form hydrates
 * from — shared by the paths that hand out full household details directly
 * (`guest-verification` in 'simple' mode or a fresh 'verify'-mode household,
 * and the new `verify-email` route), so they cannot drift from each other on
 * what counts as a match.
 *
 * The magic-link routes and the write gate in `src/app/api/rsvp/route.ts` do
 * not use this — they predate it, their own copies are already deployed and
 * tested, and the matching rule (primary, plus-one or any named party member;
 * invited only; exact primary wins, then lowest id) is simple enough that
 * duplicating it there was a reasonable tradeoff against touching that code
 * again. If the rule ever needs to change, change it in all of them.
 */
export interface MatchedHousehold {
    id: number;
    guest_name: string;
    email: string;
    phone: string;
    party_size: number;
    party_members: Array<{ name?: string | null }>;
    plus_one_name: string | null;
    primary_attending: boolean | null;
}

export async function matchHouseholdByName(name: string): Promise<MatchedHousehold | null> {
    // Case, spacing and accents ignored: "Noren" finds "Norén".
    const normalized = foldName(name);
    const result = await pool.query(
        `SELECT id, guest_name, email, phone, party_size, party_members, plus_one_name, primary_attending
           FROM guest_list
          WHERE invited = true
            AND (
              ${foldNameSql('guest_name')} = $1
              OR ${foldNameSql('plus_one_name')} = $1
              OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(party_members) = 'array' THEN party_members ELSE '[]'::jsonb END
                ) AS m
                WHERE ${foldNameSql("m->>'name'")} = $1
              )
            )
          ORDER BY (${foldNameSql('guest_name')} = $1) DESC, id ASC
          LIMIT 1`,
        [normalized]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return { ...row, party_members: Array.isArray(row.party_members) ? row.party_members : [] };
}

/** Which seat `typedName` matched, in the stored spelling — a plus-one's typed
 * name should not be what greets them back. */
export function matchedSeat(guest: MatchedHousehold, typedName: string): { name: string; isPrimary: boolean } {
    const normalized = foldName(typedName);
    const isPrimary = foldName(guest.guest_name) === normalized;
    const matchedMember = guest.party_members.find((m) => foldName(m?.name) === normalized);
    const matchedPlusOne = foldName(guest.plus_one_name) === normalized ? guest.plus_one_name : null;
    return { name: isPrimary ? guest.guest_name : (matchedMember?.name || matchedPlusOne || typedName), isPrimary };
}

export interface ExistingRsvp {
    id: number;
    /** null: the couple noted dietary needs, but the household has not answered. */
    attending: boolean | null;
    guestCount: number;
    email: string;
    phone: string;
    dietaryRestrictions: unknown;
    message: string | null;
}

/** The RSVP is always filed under the primary guest's stored name, so a
 * plus-one's own name would never find it — look it up by the household's. */
export async function existingRsvpFor(primaryGuestName: string): Promise<ExistingRsvp | null> {
    const result = await pool.query(
        'SELECT * FROM rsvps WHERE LOWER(guest_name) = LOWER($1) ORDER BY created_at DESC LIMIT 1',
        [primaryGuestName.trim()]
    );
    if (result.rows.length === 0) return null;
    const rsvp = result.rows[0];
    return {
        id: rsvp.id,
        attending: rsvp.attending,
        guestCount: rsvp.number_of_guests,
        email: rsvp.email,
        phone: rsvp.phone,
        dietaryRestrictions: rsvp.dietary_restrictions,
        message: rsvp.message,
    };
}

/** The payload the form hydrates from — same shape whichever door it came through. */
export function buildVerifiedPayload(
    guest: MatchedHousehold,
    matched: { name: string; isPrimary: boolean },
    existingRsvp: ExistingRsvp | null,
    // false strips the household's stored email and phone — for a lookup that
    // proved nothing but a name ('verify' mode, nothing on file yet). Handing
    // them out there disclosed them to anyone who knew the name, and the form
    // prefilled that email, so the guest's RSVP was then filed under an
    // address the earlier visitor already had: the very answer the update
    // check asks for.
    withContact = true,
) {
    return {
        verified: true,
        // Once the wedding day itself arrives, the form this hydrates still
        // opens — the lookup is unaffected — but it opens read-only: the
        // write gate in `src/app/api/rsvp/route.ts` refuses every write past
        // this point regardless of mode, and this flag is what tells the
        // form not to let a guest start filling one in only to have it fail.
        locked: isPastWeddingDay(getSiteConfig().weddingDate),
        guest: {
            name: guest.guest_name,
            party_size: guest.party_size,
            email: withContact ? guest.email : null,
            phone: withContact ? guest.phone : null,
            party_members: guest.party_members,
            primary_attending: guest.primary_attending,
        },
        matched,
        existingRsvp,
    };
}
