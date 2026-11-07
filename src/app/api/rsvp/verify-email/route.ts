import { NextResponse } from 'next/server';
import { getI18n } from '@/lib/i18n/server';
import { matchHouseholdByName, matchedSeat, existingRsvpFor, buildVerifiedPayload } from '@/lib/rsvpHousehold';

const invalid = () => ({ error: getI18n().m.api.emailMismatch });

/**
 * 'verify' mode's second step: exchange a name and the email already on file
 * for the household's details, for a household that has an existing RSVP
 * (one with nothing on file skips this — `guest-verification` hands its
 * details out directly, since there is nothing yet to protect).
 *
 * This is weaker than the email link: it checks that the typist *knows* the
 * address on file, not that they *control* it — no mail is sent, nothing is
 * confirmed back to an inbox. Good enough to stop a casual guest from
 * overwriting someone else's answer without requiring SMTP at all, not a
 * replacement for the link where mail is configured.
 *
 * The write gate in `src/app/api/rsvp/route.ts` re-checks the same thing
 * independently at write time — this endpoint only decides what the form
 * gets to show, never what it gets to save.
 */
export async function POST(request: Request) {
    try {
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json(invalid(), { status: 400 });
        }
        const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
        const name = typeof b.name === 'string' ? b.name.trim() : '';
        const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
        if (!name || !email) return NextResponse.json(invalid(), { status: 400 });

        const guest = await matchHouseholdByName(name);
        if (!guest) return NextResponse.json(invalid(), { status: 400 });

        const existingRsvp = await existingRsvpFor(guest.guest_name);
        // Nothing on file: this route is only for confirming an existing RSVP.
        if (!existingRsvp) return NextResponse.json(invalid(), { status: 400 });

        const onFile = (existingRsvp.email || '').trim().toLowerCase();
        if (!onFile || onFile !== email) return NextResponse.json(invalid(), { status: 400 });

        return NextResponse.json(buildVerifiedPayload(guest, matchedSeat(guest, name), existingRsvp));
    } catch (error) {
        console.error('Error verifying RSVP by email:', error);
        return NextResponse.json(invalid(), { status: 500 });
    }
}
