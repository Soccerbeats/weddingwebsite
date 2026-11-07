import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { foldName, foldNameSql } from '@/lib/names';
import { getI18n } from '@/lib/i18n/server';
import { isMailConfigured, sendRsvpLinkMail } from '@/lib/mail';
import { signRsvpLink } from '@/lib/rsvpLink';

/**
 * Send the RSVP link for a name on the guest list.
 *
 * The answer is the same — one 200 with one message — for every outcome:
 * found and mailed, found but mail unconfigured, found with no email on
 * file, and not found at all. That is a decision, not an oversight: a
 * different answer for "not on the list" would let a stranger enumerate who
 * is invited by typing names, and the mail goes only ever to an address this
 * site already holds (the household's own, read from the database), so the
 * endpoint has no business being aimable at a third party either. A 400 is
 * reserved for a body that is not a name at all.
 */
export async function POST(request: Request) {
    try {
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: getI18n().m.api.enterName }, { status: 400 });
        }
        const rawName = body && typeof body === 'object' ? (body as { name?: unknown }).name : null;
        const typedName = typeof rawName === 'string' ? rawName.trim() : '';
        if (!typedName || typedName.length > 255) {
            return NextResponse.json({ error: getI18n().m.api.enterName }, { status: 400 });
        }

        const normalized = foldName(typedName);

        // The exact match semantics of `guest-verification`: anyone in the
        // party can ask by their own name — the primary guest, a plus-one or
        // any named party member. An exact primary match wins over being
        // listed inside someone else's party, then lowest id, so the answer
        // is deterministic either way.
        const guestResult = await pool.query(
            `SELECT * FROM guest_list
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

        const generic = NextResponse.json({
            ok: true,
            message: getI18n().m.api.linkSent,
        });

        if (guestResult.rows.length === 0) return generic;
        const guest = guestResult.rows[0];

        // Who actually asked, in the stored spelling — the same logic as
        // `guest-verification`, so the link greets the right seat.
        const isPrimary = foldName(guest.guest_name) === normalized;
        const members = Array.isArray(guest.party_members) ? guest.party_members : [];
        const matchedMember = members.find(
            (m: { name?: string | null }) => foldName(m?.name) === normalized
        );
        const matchedPlusOne = foldName(guest.plus_one_name) === normalized
            ? guest.plus_one_name
            : null;
        const matchedName = isPrimary
            ? guest.guest_name
            : (matchedMember?.name || matchedPlusOne || typedName);

        const token = await signRsvpLink(guest.id, matchedName);
        const email = (guest.email || '').trim();
        if (!token || !isMailConfigured() || email === '') return generic;

        // The origin the link points at. `SITE_URL` wins when set — a proxy
        // that mangles the Host header is the instance that needs it.
        const siteUrl = (process.env.SITE_URL ?? '').trim().replace(/\/+$/, '');
        const proto = (request.headers.get('x-forwarded-proto') ?? 'http').split(',')[0].trim() || 'http';
        const host = request.headers.get('host') || new URL(request.url).host;
        const linkUrl = `${siteUrl || `${proto}://${host}`}/rsvp?token=${token}`;

        const result = await sendRsvpLinkMail(email, linkUrl);
        if (!result.ok) console.error('Failed to send RSVP link mail:', result.error);

        return generic;
    } catch (error) {
        console.error('Error sending RSVP link:', error);
        // Even a server error keeps the same answer: the endpoint cannot be
        // used to tell what is on the list, in any state.
        return NextResponse.json({
            ok: true,
            message: getI18n().m.api.linkSent,
        });
    }
}
