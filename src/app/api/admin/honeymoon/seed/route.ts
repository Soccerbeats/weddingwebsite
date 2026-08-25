import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { ensureHoneymoonTables } from '@/lib/honeymoonDb';
import {
    DEFAULT_SEED_SOURCE, SEED_NOTES, SEED_PLACES, SEED_REGIONS,
} from '@/lib/honeymoonSeed';
import { SEED_COORDS } from '@/lib/honeymoonCoords';

/**
 * Load the bundled Bali/Singapore guide, from a button.
 *
 * The same data `npm run seed:honeymoon` writes, and idempotent in the same way
 * — matched on name, never overwriting an edit — because the empty state of a
 * brand-new portal used to say "run npm run seed:honeymoon", which is not a
 * thing you can do from a phone, or from the admin panel at all.
 *
 * No network: the coordinates were harvested once and committed
 * (`honeymoonCoords.ts`), which is what makes this a request rather than a
 * ten-minute job. They are guesses and are written with `needs_review` set, so
 * the map draws them with a dashed ring until you confirm each one.
 */
export async function POST() {
    try {
        await ensureHoneymoonTables();
        const added = { regions: 0, places: 0, notes: 0 };

        const regionIds = new Map<string, number>();
        for (const [index, region] of SEED_REGIONS.entries()) {
            const existing = await pool.query(
                'SELECT id FROM honeymoon_regions WHERE LOWER(name) = LOWER($1)', [region.name],
            );
            if (existing.rows[0]) {
                regionIds.set(region.name, existing.rows[0].id);
                continue;
            }
            const inserted = await pool.query(
                `INSERT INTO honeymoon_regions (name, country, description, sort_order)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [region.name, region.country ?? '', region.description ?? null, index],
            );
            regionIds.set(region.name, inserted.rows[0].id);
            added.regions += 1;
        }

        for (const [index, note] of SEED_NOTES.entries()) {
            const existing = await pool.query(
                'SELECT id FROM honeymoon_notes WHERE LOWER(title) = LOWER($1)', [note.title],
            );
            if (existing.rows[0]) continue;
            await pool.query(
                `INSERT INTO honeymoon_notes (title, body, category, source, sort_order)
                 VALUES ($1, $2, $3, $4, $5)`,
                [note.title, note.body, note.category, note.source ?? DEFAULT_SEED_SOURCE, index],
            );
            added.notes += 1;
        }

        for (const [index, place] of SEED_PLACES.entries()) {
            const existing = await pool.query(
                'SELECT id FROM honeymoon_places WHERE LOWER(name) = LOWER($1)', [place.name],
            );
            if (existing.rows[0]) continue;
            const coord = SEED_COORDS[place.name];
            await pool.query(
                `INSERT INTO honeymoon_places
                    (name, region_id, category, description, links, source, sort_order,
                     lat, lng, address, needs_review, country)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                [
                    place.name,
                    regionIds.get(place.region) ?? null,
                    place.category,
                    place.description ?? null,
                    JSON.stringify(place.links ?? []),
                    place.source ?? DEFAULT_SEED_SOURCE,
                    index,
                    coord?.lat ?? null,
                    coord?.lng ?? null,
                    coord?.address ?? null,
                    // Every harvested coordinate is a guess; the flag is what
                    // keeps the map honest about that.
                    coord != null,
                    '',
                ],
            );
            added.places += 1;
        }

        return NextResponse.json({ success: true, added });
    } catch (error) {
        console.error('Error loading the honeymoon seed:', error);
        return NextResponse.json({ error: 'Could not load the guide' }, { status: 500 });
    }
}
