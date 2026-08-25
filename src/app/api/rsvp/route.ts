import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import nodemailer from 'nodemailer';
import { getSiteConfig } from '@/lib/config';

/**
 * Escape a value before it goes into an HTML email body.
 *
 * The confirmation email interpolated the guest's own typed name straight into
 * markup. The form sends that email to whatever address was entered, so anyone
 * could have used the RSVP form to deliver a wedding-branded email carrying
 * markup of their choosing to a third party. The name is the only free-text
 * field that reaches the HTML version — the notification to the couple is plain
 * text — but the fix belongs at the boundary, not in a note about which fields
 * happen to be safe today.
 */
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

interface RsvpInput {
    guestName: string;
    email: string;
    phone: string;
    attending: boolean;
    guestCount: number;
    dietaryJson: string | null;
    message: string | null;
    resolvedMembers: { name: string | null }[] | null;
}

/**
 * Validate the body. Everything the form sends is checked for shape here so a
 * hand-built request cannot write a negative headcount, a non-boolean
 * attendance or a JSON-invalid string into the JSONB column.
 */
function parseInput(body: unknown): RsvpInput | string {
    if (!body || typeof body !== 'object') return 'Invalid request body';
    const b = body as Record<string, unknown>;
    const guestName = typeof b.guestName === 'string' ? b.guestName.trim() : '';
    const email = typeof b.email === 'string' ? b.email.trim() : '';
    const phone = typeof b.phone === 'string' ? b.phone.trim() : '';
    if (!guestName || !email || !phone || typeof b.attending !== 'boolean') {
        return 'Missing required fields';
    }
    if (guestName.length > 255 || email.length > 255 || phone.length > 50) return 'A field is too long';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'That email address does not look right';

    const rawCount = Number(b.guestCount);
    const guestCount = Number.isInteger(rawCount) && rawCount >= 0 ? rawCount : (b.attending ? 1 : 0);

    const dietaryJson = Array.isArray(b.dietaryRestrictions)
        ? JSON.stringify(b.dietaryRestrictions.slice(0, 50))
        : null;

    const message = typeof b.message === 'string' ? b.message.slice(0, 5000) : null;

    const resolvedMembers = Array.isArray(b.resolvedMembers) && b.resolvedMembers.length
        ? b.resolvedMembers.slice(0, 50).map((m) => ({
            name: m && typeof m === 'object' && typeof (m as { name?: unknown }).name === 'string'
                ? ((m as { name: string }).name).slice(0, 255)
                : null,
        }))
        : null;

    return { guestName, email, phone, attending: b.attending, guestCount, dietaryJson, message, resolvedMembers };
}

/**
 * Save an RSVP for a guest on the list.
 *
 * Both POST and PUT land here and behave the same: the household is identified
 * by the primary guest's name (the one `guest-verification` handed the form),
 * never by a client-supplied id — the old PUT trusted `body.id`, which let
 * anyone overwrite any RSVP by guessing a number. There is one RSVP row per
 * household: a second submission updates the first rather than adding a
 * duplicate that the dashboard would then count twice.
 *
 * A name that is not on the guest list is refused. It used to be inserted into
 * `guest_list` as an invited guest, which meant the public form could grow the
 * guest list without anyone noticing.
 */
async function saveRsvp(input: RsvpInput): Promise<{ id: number; isUpdate: boolean }> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const guestRow = await client.query(
            `SELECT id, guest_name, party_size FROM guest_list
              WHERE LOWER(TRIM(guest_name)) = LOWER(TRIM($1)) AND invited = true
              ORDER BY id ASC LIMIT 1`,
            [input.guestName],
        );
        if (guestRow.rows.length === 0) {
            throw Object.assign(new Error('not-on-list'), { status: 404 });
        }
        const guest = guestRow.rows[0];
        const maxParty = Number(guest.party_size) || 1;
        if (input.attending && input.guestCount > maxParty) {
            throw Object.assign(new Error(`Party size exceeds maximum of ${maxParty}`), { status: 400 });
        }
        const count = input.attending ? Math.max(1, input.guestCount) : 0;

        const existing = await client.query(
            'SELECT id FROM rsvps WHERE LOWER(TRIM(guest_name)) = LOWER(TRIM($1)) ORDER BY created_at DESC LIMIT 1',
            [guest.guest_name],
        );

        let id: number;
        const isUpdate = existing.rows.length > 0;
        if (isUpdate) {
            id = existing.rows[0].id;
            await client.query(
                `UPDATE rsvps
                    SET email = $1, phone = $2, attending = $3, number_of_guests = $4,
                        dietary_restrictions = $5, message = $6, updated_at = NOW()
                  WHERE id = $7`,
                [input.email, input.phone, input.attending, count, input.dietaryJson, input.message, id],
            );
        } else {
            const inserted = await client.query(
                `INSERT INTO rsvps (guest_name, email, phone, attending, number_of_guests, dietary_restrictions, message)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
                [guest.guest_name, input.email, input.phone, input.attending, count, input.dietaryJson, input.message],
            );
            id = inserted.rows[0].id;
        }

        await client.query(
            `UPDATE guest_list
                SET email = $1, phone = $2, rsvp_status = $3,
                    party_members = COALESCE($4::jsonb, party_members),
                    updated_at = NOW()
              WHERE id = $5`,
            [input.email, input.phone, input.attending ? 'attending' : 'declined',
             input.resolvedMembers ? JSON.stringify(input.resolvedMembers) : null,
             guest.id],
        );

        await client.query('COMMIT');
        return { id, isUpdate };
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    } finally {
        client.release();
    }
}

async function sendEmails(input: RsvpInput) {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return;
    const config = getSiteConfig();
    const couple = config.brideName && config.groomName
        ? `${config.brideName} & ${config.groomName}`
        : 'The Couple';
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    try {
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port,
            // Implicit TLS on 465; STARTTLS is negotiated on 587/25.
            secure: port === 465,
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });

        const status = input.attending ? 'Attending' : 'Not Attending';
        await transporter.sendMail({
            from: `"${couple.replace(/"/g, '')}" <${process.env.SMTP_USER}>`,
            to: input.email,
            subject: 'We received your RSVP!',
            text: `Hi ${input.guestName},\n\nThank you so much for RSVPing to our wedding. We have confirmed your response: ${status}.\n\nWe can't wait to celebrate with you!\n\nBest,\n${couple}`,
            html: `<h1>RSVP Confirmation</h1><p>Hi ${escapeHtml(input.guestName)},</p><p>Thank you so much for RSVPing to our wedding. We have confirmed your response: <strong>${status}</strong>.</p><p>Best,<br>${escapeHtml(couple)}</p>`,
        });

        if (process.env.NOTIFICATION_EMAIL) {
            await transporter.sendMail({
                from: `"Wedding Bot" <${process.env.SMTP_USER}>`,
                to: process.env.NOTIFICATION_EMAIL,
                subject: `New RSVP from ${input.guestName}`,
                text: `Name: ${input.guestName}\nAttending: ${input.attending ? 'Yes' : 'No'}\nGuests: ${input.attending ? input.guestCount : 0}\nEmail: ${input.email}\nPhone: ${input.phone}\nMessage: ${input.message ?? ''}`,
            });
        }
    } catch (emailError) {
        console.error('Failed to send email:', emailError);
    }
}

async function handle(request: Request) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const input = parseInput(body);
    if (typeof input === 'string') return NextResponse.json({ error: input }, { status: 400 });

    try {
        const { id, isUpdate } = await saveRsvp(input);
        await sendEmails(input);
        return NextResponse.json({ success: true, id, updated: isUpdate });
    } catch (error) {
        const status = (error as { status?: number }).status;
        if (status === 404) {
            return NextResponse.json(
                { error: 'We could not find that name on the guest list. Please go back and check the spelling.' },
                { status: 404 },
            );
        }
        if (status === 400) {
            return NextResponse.json({ error: (error as Error).message }, { status: 400 });
        }
        console.error('RSVP API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    return handle(request);
}

/** Same as POST: the household is found by name, so an update needs no id. */
export async function PUT(request: Request) {
    return handle(request);
}
