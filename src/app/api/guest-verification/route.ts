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
    const result = await pool.query(
      'SELECT * FROM guest_list WHERE LOWER(guest_name) = LOWER($1) AND invited = true',
      [guest_name.trim()]
    );

    if (result.rows.length > 0) {
      const guest = result.rows[0];
      return NextResponse.json({
        verified: true,
        guest: {
          name: guest.guest_name,
          party_size: guest.party_size,
          email: guest.email,
          phone: guest.phone,
        },
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
