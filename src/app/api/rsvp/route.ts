import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import nodemailer from 'nodemailer';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { guestName, email, phone, attending, guestCount, dietaryRestrictions, message } = body;

        // Validate required fields
        if (!guestName || !email || attending === undefined) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // 1. Save to Database
        const client = await pool.connect();
        try {
            await client.query(
                `INSERT INTO rsvps (guest_name, email, phone, attending, number_of_guests, dietary_restrictions, message)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [guestName, email, phone, attending, attending ? guestCount : 0, dietaryRestrictions, message]
            );
        } finally {
            client.release();
        }

        // 2. Send Email (if configured)
        if (process.env.SMTP_HOST && process.env.SMTP_USER) {
            try {
                const transporter = nodemailer.createTransport({
                    host: process.env.SMTP_HOST,
                    port: parseInt(process.env.SMTP_PORT || '587'),
                    secure: false, // true for 465, false for other ports
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASS,
                    },
                });

                // Email to Guest
                await transporter.sendMail({
                    from: `"Sarah & James" <${process.env.SMTP_USER}>`,
                    to: email,
                    subject: "We received your RSVP!",
                    text: `Hi ${guestName},\n\nThank you so much for RSVPing to our wedding. We have confirmed your response: ${attending ? 'Attending' : 'Not Attending'}.\n\nWe can't wait to celebrate with you!\n\nBest,\nSarah & James`,
                    html: `<h1>RSVP Confirmation</h1><p>Hi ${guestName},</p><p>Thank you so much for RSVPing to our wedding. We have confirmed your response: <strong>${attending ? 'Attending' : 'Not Attending'}</strong>.</p><p>Best,<br>Sarah & James</p>`,
                });

                // Email to Couple (Notification)
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
                // Continue even if email fails, as DB save was successful
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('RSVP API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
