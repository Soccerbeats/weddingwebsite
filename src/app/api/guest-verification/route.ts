import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { guest_name } = await request.json();

    if (!guest_name) {
      return NextResponse.json(
        { verified: false, message: 'Guest name is required' },
        { status: 400 }
      );
    }

    // Check if guest exists in the guest list
    const guestResult = await pool.query(
      'SELECT * FROM guest_list WHERE LOWER(guest_name) = LOWER($1) AND invited = true',
      [guest_name.trim()]
    );

    if (guestResult.rows.length > 0) {
      const guest = guestResult.rows[0];

      // Check if guest has already RSVP'd
      const rsvpResult = await pool.query(
        'SELECT * FROM rsvps WHERE LOWER(guest_name) = LOWER($1) ORDER BY created_at DESC LIMIT 1',
        [guest_name.trim()]
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
          plus_one_name: guest.plus_one_name,
        },
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
