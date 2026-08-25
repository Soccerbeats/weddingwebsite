import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { ensureHoneymoonTables } from '@/lib/honeymoonDb';
import { priceValue } from '@/lib/honeymoon';

/**
 * Price checks on a shortlisted stay.
 *
 * Booking.com serves a challenge page to a server-side fetch — the stays tab
 * already documents that — so this cannot poll. Instead it takes what a
 * bookmarklet read off the page you were already looking at, exactly like the
 * registry's Target import: the browser does the reading, the server does the
 * remembering.
 *
 * Matching is by link: the URL the bookmarklet was run on is looked up against
 * every place's links. Anything unmatched is reported rather than dropped, so a
 * paste that did nothing says why.
 */

interface Entry { url?: unknown; price?: unknown; currency?: unknown }

export async function POST(request: Request) {
    try {
        await ensureHoneymoonTables();
        const body = await request.json().catch(() => ({}));
        const entries: Entry[] = Array.isArray(body?.entries) ? body.entries.slice(0, 60) : [];
        if (!entries.length) {
            return NextResponse.json({ error: 'Nothing to record' }, { status: 400 });
        }

        const places = await pool.query('SELECT id, name, links, price_note FROM honeymoon_places');
        const byUrl = new Map<string, { id: number; name: string; price_note: string | null }>();
        for (const row of places.rows) {
            const links = Array.isArray(row.links) ? row.links : [];
            for (const link of links) {
                const url = typeof link?.url === 'string' ? link.url : '';
                if (url) byUrl.set(normalise(url), row);
            }
        }

        const recorded: {
            place_id: number; name: string; amount: number | null;
            previous: number | null; change: number | null;
        }[] = [];
        const unmatched: string[] = [];

        for (const entry of entries) {
            const url = typeof entry.url === 'string' ? entry.url : '';
            const priceText = String(entry.price ?? '').trim();
            if (!url) continue;
            const place = byUrl.get(normalise(url));
            if (!place) { unmatched.push(url); continue; }

            const amount = priceValue(priceText);
            const currency = typeof entry.currency === 'string' && /^[A-Za-z]{3}$/.test(entry.currency)
                ? entry.currency.toUpperCase()
                : null;

            const before = await pool.query(
                `SELECT amount FROM honeymoon_price_checks
                 WHERE place_id = $1 ORDER BY checked_at DESC LIMIT 1`,
                [place.id],
            );
            const previous = before.rows[0]?.amount != null ? Number(before.rows[0].amount) : null;

            await pool.query(
                `INSERT INTO honeymoon_price_checks (place_id, price_note, amount, currency)
                 VALUES ($1, $2, $3, $4)`,
                [place.id, priceText || null, amount, currency],
            );

            // The note is updated too, so the card shows today's price without
            // anyone having to open the history.
            if (priceText) {
                await pool.query(
                    'UPDATE honeymoon_places SET price_note = $1 WHERE id = $2',
                    [priceText, place.id],
                );
            }

            recorded.push({
                place_id: place.id,
                name: place.name,
                amount,
                previous,
                change: amount != null && previous != null ? amount - previous : null,
            });
        }

        return NextResponse.json({ success: true, recorded, unmatched });
    } catch (error) {
        console.error('Error recording price checks:', error);
        return NextResponse.json({ error: 'Could not record those prices' }, { status: 500 });
    }
}

/**
 * Compare URLs by what identifies the listing.
 *
 * A Booking.com link carries a different session, currency and date query every
 * time it is copied, so a raw string comparison never matches. Host plus path is
 * the part that names the hotel.
 */
function normalise(raw: string): string {
    try {
        const url = new URL(raw);
        return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`
            .toLowerCase();
    } catch {
        return raw.trim().toLowerCase();
    }
}

/** The history for one place, newest first. */
export async function GET(request: Request) {
    try {
        await ensureHoneymoonTables();
        const placeId = Math.trunc(Number(new URL(request.url).searchParams.get('place_id')));
        if (!Number.isFinite(placeId) || placeId <= 0) {
            return NextResponse.json({ error: 'place_id required' }, { status: 400 });
        }
        const rows = await pool.query(
            `SELECT id, price_note, amount, currency, checked_at FROM honeymoon_price_checks
             WHERE place_id = $1 ORDER BY checked_at DESC LIMIT 30`,
            [placeId],
        );
        return NextResponse.json({ checks: rows.rows });
    } catch (error) {
        console.error('Error reading price checks:', error);
        return NextResponse.json({ error: 'Could not read that history' }, { status: 500 });
    }
}
