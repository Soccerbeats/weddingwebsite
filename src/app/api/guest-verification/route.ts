import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { guest_name } = await request.json();

    if (typeof guest_name !== 'string' || !guest_name.trim()) {
      return NextResponse.json(
        { verified: false, message: 'Guest name is required' },
        { status: 400 }
      );
    }

    const typedName = guest_name.trim();
    const normalized = typedName.toLowerCase();

    // Anyone in the party can look the RSVP up by their own name — the primary guest,
    // a plus-one, or any named party member. A plus-one shouldn't have to know whose
    // name the invitation was filed under.
    // Ordering: an exact primary-guest match wins over being listed inside someone
    // else's party, then lowest id, so the result is deterministic either way.
    const guestResult = await pool.query(
      `SELECT * FROM guest_list
        WHERE invited = true
          AND (
            LOWER(TRIM(guest_name)) = $1
            OR LOWER(TRIM(COALESCE(plus_one_name, ''))) = $1
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(party_members) = 'array' THEN party_members ELSE '[]'::jsonb END
              ) AS m
              WHERE LOWER(TRIM(COALESCE(m->>'name', ''))) = $1
            )
          )
        ORDER BY (LOWER(TRIM(guest_name)) = $1) DESC, id ASC
        LIMIT 1`,
      [normalized]
    );

    if (guestResult.rows.length > 0) {
      const guest = guestResult.rows[0];

      // Who actually logged in, using the stored spelling rather than what they typed.
      const isPrimary = (guest.guest_name || '').trim().toLowerCase() === normalized;
      const members = Array.isArray(guest.party_members) ? guest.party_members : [];
      const matchedMember = members.find(
        (m: { name?: string | null }) => (m?.name || '').trim().toLowerCase() === normalized
      );
      const matchedPlusOne = (guest.plus_one_name || '').trim().toLowerCase() === normalized
        ? guest.plus_one_name
        : null;
      const matchedName = isPrimary
        ? guest.guest_name
        : (matchedMember?.name || matchedPlusOne || typedName);

      // The RSVP is always filed under the primary guest, so look it up by that name
      // (not the name that was typed) or a plus-one would never find the existing RSVP.
      const rsvpResult = await pool.query(
        'SELECT * FROM rsvps WHERE LOWER(guest_name) = LOWER($1) ORDER BY created_at DESC LIMIT 1',
        [(guest.guest_name || '').trim()]
      );

      let existingRsvp = null;
      if (rsvpResult.rows.length > 0) {
        const rsvp = rsvpResult.rows[0];
        existingRsvp = {
          id: rsvp.id,
          attending: rsvp.attending,
          guestCount: rsvp.number_of_guests,
          email: rsvp.email,
          phone: rsvp.phone,
          dietaryRestrictions: rsvp.dietary_restrictions,
          message: rsvp.message,
        };
      }

      return NextResponse.json({
        verified: true,
        guest: {
          name: guest.guest_name,
          party_size: guest.party_size,
          email: guest.email,
          phone: guest.phone,
          party_members: guest.party_members || [],
        },
        // Lets the form greet whoever actually signed in, so a plus-one isn't
        // confused by seeing the primary guest's name.
        matched: { name: matchedName, isPrimary },
        existingRsvp,
      });
    }

    return NextResponse.json({
      verified: false,
      message: 'We could not find your name on our guest list. Please check the spelling or contact us if you believe this is an error.',
    });
  } catch (error) {
    console.error('Error verifying guest:', error);
    return NextResponse.json(
      { verified: false, message: 'Error verifying guest' },
      { status: 500 }
    );
  }
}
