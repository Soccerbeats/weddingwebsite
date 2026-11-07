import { NextResponse } from 'next/server';
import { getSiteConfig } from '@/lib/config';
import { isMailConfigured } from '@/lib/mail';
import { effectiveRsvpMode } from '@/lib/rsvpMode';
import { matchHouseholdByName, matchedSeat, existingRsvpFor, buildVerifiedPayload } from '@/lib/rsvpHousehold';
import { isPastWeddingDay } from '@/lib/weddingDate';

/**
 * Is that name on the guest list, and which seat did they type?
 *
 * How much rides out in the answer depends on the site's RSVP mode
 * (`effectiveRsvpMode()`):
 *
 * - **link** — the matched seat only, nothing else. The household's email,
 *   phone, party and existing RSVP used to ride out of this endpoint, so
 *   anyone who could read an invitation could read the household's contact
 *   details — and the write path sat on the same name, so seeing the details
 *   and editing the RSVP were one guess apart. Those details now travel
 *   behind the email link (exchanged at `/api/rsvp/magic-link/verify`).
 * - **simple** — the full details immediately, exactly as before the link
 *   existed. An admin's explicit choice to reopen the gap above.
 * - **verify** — the party immediately *if there is nothing on file yet*
 *   (nothing to protect), but never the stored email or phone; otherwise just the seat plus `hasExistingRsvp:
 *   true`, so the page asks for the email on file before handing out details
 *   (`/api/rsvp/verify-email`).
 *
 * `locked` says whether the wedding day has arrived — the lookup still
 * works either way, but the form it opens into should offer no way to
 * submit once it has, since the write gate in `src/app/api/rsvp/route.ts`
 * will refuse it regardless of mode.
 */
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
    const guest = await matchHouseholdByName(typedName);

    if (!guest) {
      return NextResponse.json({
        verified: false,
        message: 'We could not find your name on our guest list. Please check the spelling or contact us if you believe this is an error.',
      });
    }

    const matched = matchedSeat(guest, typedName);
    const mode = effectiveRsvpMode(getSiteConfig().rsvpMode, isMailConfigured());
    const locked = isPastWeddingDay(getSiteConfig().weddingDate);

    if (mode === 'link') {
      return NextResponse.json({ verified: true, mode, matched, locked });
    }

    if (mode === 'simple') {
      return NextResponse.json({ ...buildVerifiedPayload(guest, matched, await existingRsvpFor(guest.guest_name)), mode });
    }

    // mode === 'verify'
    const existingRsvp = await existingRsvpFor(guest.guest_name);
    if (!existingRsvp) {
      // Nothing on file to protect, so the form opens — but without the
      // household's stored email and phone: the guest types their own.
      return NextResponse.json({ ...buildVerifiedPayload(guest, matched, null, false), mode });
    }
    return NextResponse.json({ verified: true, mode, matched, hasExistingRsvp: true, locked });
  } catch (error) {
    console.error('Error verifying guest:', error);
    return NextResponse.json(
      { verified: false, message: 'Error verifying guest' },
      { status: 500 }
    );
  }
}
