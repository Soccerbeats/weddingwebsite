import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import nodemailer from 'nodemailer';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { guestName, email, phone, attending, guestCount, dietaryRestrictions, message } = body;

        if (!guestName || !email || attending === undefined) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const client = await pool.connect();
        try {
            // Server-side party size validation
            const guestRow = await client.query(
                'SELECT party_size FROM guest_list WHERE LOWER(guest_name) = LOWER($1)',
                [guestName]
            );
            if (guestRow.rows.length > 0) {
                const maxParty = guestRow.rows[0].party_size;
                if (attending && guestCount > maxParty) {
                    return NextResponse.json({ error: `Party size exceeds maximum of ${maxParty}` }, { status: 400 });
                }
            }

            const dietaryJson = Array.isArray(dietaryRestrictions)
                ? JSON.stringify(dietaryRestrictions)
                : dietaryRestrictions || null;

            await client.query(
                `INSERT INTO rsvps (guest_name, email, phone, attending, number_of_guests, dietary_restrictions, message)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [guestName, email, phone, attending, attending ? guestCount : 0, dietaryJson, message]
            );

            const existingGuest = await client.query(
                'SELECT id FROM guest_list WHERE LOWER(guest_name) = LOWER($1)',
                [guestName]
            );

            if (existingGuest.rows.length > 0) {
                await client.query(
                    `UPDATE guest_list
                     SET email = $1, phone = $2, rsvp_status = $3, updated_at = NOW()
                     WHERE LOWER(guest_name) = LOWER($4)`,
                    [email, phone, attending ? 'attending' : 'declined', guestName]
                );
            } else {
                await client.query(
                    `INSERT INTO guest_list (guest_name, email, phone, rsvp_status, updated_at)
                     VALUES ($1, $2, $3, $4, NOW())`,
                    [guestName, email, phone, attending ? 'attending' : 'declined']
                );
            }
        } finally {
            client.release();
        }

        if (process.env.SMTP_HOST && process.env.SMTP_USER) {
            try {
                const transporter = nodemailer.createTransport({
                    host: process.env.SMTP_HOST,
                    port: parseInt(process.env.SMTP_PORT || '587'),
                    secure: false,
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASS,
                    },
                });

                await transporter.sendMail({
                    from: `"Sarah & James" <${process.env.SMTP_USER}>`,
                    to: email,
                    subject: "We received your RSVP!",
                    text: `Hi ${guestName},\n\nThank you so much for RSVPing to our wedding. We have confirmed your response: ${attending ? 'Attending' : 'Not Attending'}.\n\nWe can't wait to celebrate with you!\n\nBest,\nSarah & James`,
                    html: `<h1>RSVP Confirmation</h1><p>Hi ${guestName},</p><p>Thank you so much for RSVPing to our wedding. We have confirmed your response: <strong>${attending ? 'Attending' : 'Not Attending'}</strong>.</p><p>Best,<br>Sarah & James</p>`,
                });

                if (process.env.NOTIFICATION_EMAIL) {
                    await transporter.sendMail({
                        from: `"Wedding Bot" <${process.env.SMTP_USER}>`,
                        to: process.env.NOTIFICATION_EMAIL,
                        subject: `New RSVP from ${guestName}`,
                        text: `Name: ${guestName}\nAttending: ${attending ? 'Yes' : 'No'}\nGuests: ${guestCount}\nMessage: ${message}`,
                    });
                }
            } catch (emailError) {
                console.error('Failed to send email:', emailError);
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('RSVP API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { id, guestName, email, phone, attending, guestCount, dietaryRestrictions, message } = body;

        if (!id || !guestName || !email || attending === undefined) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const client = await pool.connect();
        try {
            // Server-side party size validation
            const guestRow = await client.query(
                'SELECT party_size FROM guest_list WHERE LOWER(guest_name) = LOWER($1)',
                [guestName]
            );
            if (guestRow.rows.length > 0) {
                const maxParty = guestRow.rows[0].party_size;
                if (attending && guestCount > maxParty) {
                    return NextResponse.json({ error: `Party size exceeds maximum of ${maxParty}` }, { status: 400 });
                }
            }

            const dietaryJson = Array.isArray(dietaryRestrictions)
                ? JSON.stringify(dietaryRestrictions)
                : dietaryRestrictions || null;

            await client.query(
                `UPDATE rsvps
                 SET email = $1, phone = $2, attending = $3, number_of_guests = $4,
                     dietary_restrictions = $5, message = $6, updated_at = NOW()
                 WHERE id = $7`,
                [email, phone, attending, attending ? guestCount : 0, dietaryJson, message, id]
            );

            await client.query(
                `UPDATE guest_list
                 SET email = $1, phone = $2, rsvp_status = $3, updated_at = NOW()
                 WHERE LOWER(guest_name) = LOWER($4)`,
                [email, phone, attending ? 'attending' : 'declined', guestName]
            );
        } finally {
            client.release();
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('RSVP Update API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
