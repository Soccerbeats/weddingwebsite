import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { foldName, foldNameSql } from '@/lib/names';
import { getSiteConfig } from '@/lib/config';
import { createTransporter, escapeHtml, getCoupleName, getMailFrom, isMailConfigured } from '@/lib/mail';
import { verifyRsvpLink } from '@/lib/rsvpLink';
import { effectiveRsvpMode } from '@/lib/rsvpMode';
import { existingRsvpFor } from '@/lib/rsvpHousehold';
import { isPastWeddingDay } from '@/lib/weddingDate';

interface RsvpInput {
    guestName: string;
    email: string;
    phone: string;
    attending: boolean;
    guestCount: number;
    dietaryJson: string | null;
    message: string | null;
    resolvedMembers: { name: string | null; attending: boolean | null }[] | null;
    /** The named guest's own answer; null from an older client that asked the household instead. */
    primaryAttending: boolean | null;
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
        ? b.resolvedMembers.slice(0, 50).map((m) => {
            const obj = m && typeof m === 'object' ? (m as { name?: unknown; attending?: unknown }) : {};
            return {
                name: typeof obj.name === 'string' ? obj.name.slice(0, 255) : null,
                // Per-person answer. Absent (an older client) stays null rather than
                // becoming a guess — the seating chart treats null as "not answered".
                attending: typeof obj.attending === 'boolean' ? obj.attending : null,
            };
        })
        : null;

    // Answered per person (v0.10.42): the household is coming when anyone is, so
    // the flag can never disagree with the cards it came from.
    const primaryAttending = typeof b.primaryAttending === 'boolean' ? b.primaryAttending : null;
    const attending = primaryAttending === null
        ? b.attending
        : primaryAttending || !!resolvedMembers?.some((m) => m.attending === true);

    return { guestName, email, phone, attending, guestCount, dietaryJson, message, resolvedMembers, primaryAttending };
}

/**
 * Save an RSVP for a guest on the list.
 *
 * Both POST and PUT land here and behave the same: the household is identified
 * by the primary guest's name — `input.guestName`, resolved to its stored
 * spelling via `guest_list` — and never by a client-supplied household id,
 * whatever the gate in `handle()` did above this call. There is one RSVP row
 * per household: a second submission updates the first rather than adding a
 * duplicate that the dashboard would then count twice.
 *
 * A name that is not on the guest list is refused. It used to be inserted into
 * `guest_list` as an invited guest, which meant the public form could grow the
 * guest list without anyone noticing. That refusal is also why an unlisted
 * name passes every mode's gate uncontested: there is nothing to protect.
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
                    primary_attending = $6,
                    updated_at = NOW()
              WHERE id = $5`,
            [input.email, input.phone, input.attending ? 'attending' : 'declined',
             input.resolvedMembers ? JSON.stringify(input.resolvedMembers) : null,
             guest.id,
             // An older client only answered for the household: it meant them too.
             input.primaryAttending ?? input.attending],
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

/**
 * The household a name belongs to, with the match semantics of
 * `guest-verification` and the magic-link route: the primary guest, a
 * plus-one, or any named party member; invited households only; an exact
 * primary match wins over being listed inside someone else's party, then
 * lowest id, so the answer is deterministic either way.
 */
async function matchHousehold(name: string): Promise<{ id: number; guest_name: string } | null> {
    const normalized = foldName(name);
    const result = await pool.query(
        `SELECT id, guest_name FROM guest_list
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
    return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * The household this write belongs to, resolved before anything is written.
 *
 * A POST is found by the name in the body; a PUT by the existing RSVP row it
 * edits — `body.id`, loaded here and matched by its guest_name — so an update
 * cannot be aimed at a household its row does not belong to.
 */
async function householdFor(
    method: 'POST' | 'PUT',
    body: Record<string, unknown>,
    guestName: string,
): Promise<{ id: number; guest_name: string } | null> {
    if (method === 'POST') return matchHousehold(guestName);
    const rawId = body.id;
    const id = typeof rawId === 'number' && Number.isInteger(rawId)
        ? rawId
        : (typeof rawId === 'string' && /^\d+$/.test(rawId.trim()) ? parseInt(rawId.trim(), 10) : null);
    if (id === null) {
        throw Object.assign(new Error('An existing RSVP id is required to make changes.'), { status: 400 });
    }
    const row = await pool.query('SELECT guest_name FROM rsvps WHERE id = $1', [id]);
    if (row.rows.length === 0) {
        throw Object.assign(new Error('not-on-list'), { status: 404 });
    }
    return matchHousehold(row.rows[0].guest_name);
}

async function sendEmails(input: RsvpInput) {
    if (!isMailConfigured()) return;
    const couple = getCoupleName();
    try {
        const transporter = createTransporter();

        const status = input.attending ? 'Attending' : 'Not Attending';
        await transporter.sendMail({
            from: `"${couple.replace(/"/g, '')}" <${getMailFrom()}>`,
            to: input.email,
            subject: 'We received your RSVP!',
            text: `Hi ${input.guestName},\n\nThank you so much for RSVPing to our wedding. We have confirmed your response: ${status}.\n\nWe can't wait to celebrate with you!\n\nBest,\n${couple}`,
            html: `<h1>RSVP Confirmation</h1><p>Hi ${escapeHtml(input.guestName)},</p><p>Thank you so much for RSVPing to our wedding. We have confirmed your response: <strong>${status}</strong>.</p><p>Best,<br>${escapeHtml(couple)}</p>`,
        });

        if (process.env.NOTIFICATION_EMAIL) {
            await transporter.sendMail({
                from: `"Wedding Bot" <${getMailFrom()}>`,
                to: process.env.NOTIFICATION_EMAIL,
                subject: `New RSVP from ${input.guestName}`,
                text: `Name: ${input.guestName}\nAttending: ${input.attending ? 'Yes' : 'No'}\nGuests: ${input.attending ? input.guestCount : 0}\nEmail: ${input.email}\nPhone: ${input.phone}\nMessage: ${input.message ?? ''}`,
            });
        }
    } catch (emailError) {
        console.error('Failed to send email:', emailError);
    }
}

async function handle(request: Request, method: 'POST' | 'PUT') {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const input = parseInput(body);
    if (typeof input === 'string') return NextResponse.json({ error: input }, { status: 400 });
    const record = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

    // Once the wedding day itself arrives, no RSVP write happens at all —
    // first one or an update, whatever the mode. This is checked before the
    // mode gate below and is not part of it: looking an RSVP up still works
    // after this point (every read path still answers; it just marks its
    // answer `locked` so the form it opens into offers no way to submit),
    // only writing stops.
    if (isPastWeddingDay(getSiteConfig().weddingDate)) {
        return NextResponse.json(
            { error: "RSVPs are closed — the wedding day has arrived. Please contact us directly if you need to make a change." },
            { status: 403 },
        );
    }

    try {
        // The write gate — shape depends on the site's RSVP mode
        // (`effectiveRsvpMode()`, never trusted from the client):
        //
        // - 'simple' skips this block entirely: no household resolution, no
        //   check, `saveRsvp` runs straight off `input.guestName` exactly as
        //   it did before either of the other modes existed. An admin's
        //   explicit choice to reopen that gap, not a default.
        // - 'link' and 'verify' both resolve which household this write
        //   targets before anything is saved — a POST by the name in the
        //   body, a PUT by the existing RSVP row it edits (`body.id`) — and
        //   both then confirm `body.guestName` resolves to that *same*
        //   household: without that check a guest's own valid proof (their
        //   own link, or their own on-file email) could carry a different
        //   household's name, and the write below — which saves by
        //   `input.guestName`, not by id — would land on that other
        //   household instead of the one just gated.
        // - 'link' then requires a token minted for that household. 'verify'
        //   only requires anything when that household already has an RSVP
        //   on file (nothing to protect on a first one): the email in this
        //   request must match the email already on file for it.
        //
        // A name that matches no household skips the gate in every mode and
        // falls into `saveRsvp`'s refusal below: a name the admin never
        // listed writes nothing, so it needs no proof. That is deliberately
        // left as-is (the demo instance lives entirely in it).
        const mode = effectiveRsvpMode(getSiteConfig().rsvpMode, isMailConfigured());

        if (mode !== 'simple') {
            const household = await householdFor(method, record, input.guestName);
            if (household) {
                const writeTarget = await matchHousehold(input.guestName);
                const sameHousehold = !!writeTarget && writeTarget.id === household.id;

                if (mode === 'link') {
                    const link = await verifyRsvpLink(typeof record.token === 'string' ? record.token : null);
                    if (!link || link.guestListId !== household.id || !sameHousehold) {
                        return NextResponse.json(
                            { error: 'This RSVP needs a valid link from your email. Ask for a fresh one on the RSVP page.' },
                            { status: 403 }
                        );
                    }
                } else {
                    const existingRsvp = await existingRsvpFor(household.guest_name);
                    if (existingRsvp) {
                        const onFile = (existingRsvp.email || '').trim().toLowerCase();
                        if (!onFile || onFile !== input.email.trim().toLowerCase() || !sameHousehold) {
                            return NextResponse.json(
                                { error: "That doesn't match our records. Go back and verify with the email on file, or ask us for help." },
                                { status: 403 }
                            );
                        }
                    }
                }
            }
        }

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
    return handle(request, 'POST');
}

/**
 * Same gate as POST in 'link' and 'verify' mode, but the household it checks
 * comes from the existing RSVP row the update edits — `body.id` — not from
 * the name in the body. 'simple' mode skips the gate on both the same way.
 * The write itself still lands by the household's primary name, as always.
 */
export async function PUT(request: Request) {
    return handle(request, 'PUT');
}
