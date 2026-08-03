import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { loadFinanceData } from '@/lib/financeDb';
import { buildSummary } from '@/lib/finance';
import { getSiteConfig } from '@/lib/config';

/**
 * Live headcount from the guest list, offered as a *suggestion* next to the
 * manual counts. The budget deliberately does not read these directly — a $33k
 * total that re-totals itself whenever an RSVP lands is worse than one updated
 * on purpose. There's also no adult/minor marker on guests, so the split the
 * budget needs can't be derived anyway.
 */
async function guestHeadcount() {
    try {
        const [invited, attending] = await Promise.all([
            pool.query(`SELECT COALESCE(SUM(party_size), 0)::int AS n
                          FROM guest_list WHERE invited IS NOT FALSE`),
            pool.query(`SELECT COALESCE(SUM(number_of_guests), 0)::int AS n
                          FROM rsvps WHERE attending = TRUE`),
        ]);
        return { invited: invited.rows[0]?.n ?? 0, attending: attending.rows[0]?.n ?? 0 };
    } catch {
        // Guest list / RSVP tables may not exist yet on a fresh install.
        return null;
    }
}

/** Everything the finance suite needs, plus the derived report, in one round trip. */
export async function GET() {
    try {
        const data = await loadFinanceData();
        const weddingDate = getSiteConfig()?.weddingDate ?? null;
        const summary = buildSummary({ ...data, weddingDate });
        const headcount = await guestHeadcount();
        return NextResponse.json({ ...data, summary, weddingDate, headcount });
    } catch (error) {
        console.error('Error loading finances:', error);
        return NextResponse.json({ error: 'Failed to load finances' }, { status: 500 });
    }
}
