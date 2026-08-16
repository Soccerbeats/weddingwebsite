/**
 * Seed the honeymoon portal from the Bali travel guide.
 *
 *   npm run seed:honeymoon              # insert missing rows, geocode new pins
 *   npm run seed:honeymoon -- --dry     # show what would happen, touch nothing
 *   npm run seed:honeymoon -- --no-geo  # insert rows but skip the geocoder
 *
 * Idempotent: a place already in the database is left completely alone, so
 * re-running never reverts an edit you made in the admin. That is the whole
 * reason the seed matches on name and does not update.
 *
 * Every geocoded pin is written with needs_review = true. Nominatim will
 * happily return *a* result for a name it only half-recognises, and this guide
 * contains several waterfalls that share names across regions — an unreviewed
 * pin is a guess, and the admin renders it as one.
 */
import { Pool } from 'pg';
import { SEED_NOTES, SEED_PLACES, SEED_REGIONS } from '../src/lib/honeymoonSeed';
import { SEED_COORDS } from '../src/lib/honeymoonCoords';

const DRY = process.argv.includes('--dry');
const NO_GEO = process.argv.includes('--no-geo');

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = process.env.GEOCODER_USER_AGENT
    ?? 'WeddingWebsite-HoneymoonPortal/1.0 (self-hosted; admin planning tool)';

// Nominatim's usage policy is a hard 1 request/second. 200+ places is roughly
// four minutes; going faster gets the IP blocked.
const RATE_LIMIT_MS = 1100;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface GeoResult { lat: number; lng: number; label: string }

async function geocode(query: string): Promise<GeoResult | null> {
    const url = new URL(NOMINATIM);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');

    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) return null;
        const body = await res.json();
        const hit = Array.isArray(body) ? body[0] : null;
        if (!hit) return null;
        const lat = Number(hit.lat);
        const lng = Number(hit.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        if (lat === 0 && lng === 0) return null;
        return { lat, lng, label: hit.display_name ?? '' };
    } catch {
        return null;
    }
}

async function main() {
    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL is not set.');
        process.exit(1);
    }

    console.log(DRY ? '— DRY RUN, nothing will be written —\n' : '');

    /* ---- Regions ---- */
    const regionIds = new Map<string, number>();
    let regionsAdded = 0;

    for (const [index, region] of SEED_REGIONS.entries()) {
        const existing = await pool.query(
            'SELECT id FROM honeymoon_regions WHERE lower(name) = lower($1) LIMIT 1',
            [region.name],
        );
        if (existing.rowCount) {
            regionIds.set(region.name, existing.rows[0].id);
            continue;
        }
        if (DRY) {
            console.log(`+ region ${region.name}`);
            regionsAdded += 1;
            continue;
        }
        const inserted = await pool.query(
            `INSERT INTO honeymoon_regions (name, country, description, sort_order)
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [region.name, region.country, region.description, index],
        );
        regionIds.set(region.name, inserted.rows[0].id);
        regionsAdded += 1;
    }
    console.log(`Regions: ${regionsAdded} added, ${SEED_REGIONS.length - regionsAdded} already present.`);

    /* ---- Notes ---- */
    let notesAdded = 0;
    for (const [index, note] of SEED_NOTES.entries()) {
        const existing = await pool.query(
            'SELECT id FROM honeymoon_notes WHERE lower(title) = lower($1) LIMIT 1',
            [note.title],
        );
        if (existing.rowCount) continue;
        if (!DRY) {
            await pool.query(
                'INSERT INTO honeymoon_notes (title, body, category, sort_order) VALUES ($1, $2, $3, $4)',
                [note.title, note.body, note.category, index],
            );
        }
        notesAdded += 1;
    }
    console.log(`Notes: ${notesAdded} added, ${SEED_NOTES.length - notesAdded} already present.`);

    /* ---- Places ---- */
    const hintByRegion = new Map(SEED_REGIONS.map((r) => [r.name, r.searchHint]));
    const toGeocode: { id: number | null; name: string; query: string }[] = [];
    let placesAdded = 0;
    let placesSkipped = 0;
    let prePinned = 0;

    for (const [index, place] of SEED_PLACES.entries()) {
        const existing = await pool.query(
            'SELECT id FROM honeymoon_places WHERE lower(name) = lower($1) LIMIT 1',
            [place.name],
        );
        if (existing.rowCount) { placesSkipped += 1; continue; }

        const regionId = regionIds.get(place.region) ?? null;
        // Biasing the query with the region keeps "Campuhan Waterfall" in the
        // north from resolving to the Campuhan ridge in Ubud.
        const hint = hintByRegion.get(place.region) ?? 'Bali, Indonesia';
        const query = `${place.name}, ${hint}`;

        // Coordinates harvested ahead of time and committed to the repo, so the
        // common case needs no network at all.
        const baked = SEED_COORDS[place.name];

        if (DRY) {
            console.log(`+ place ${place.name} (${place.category}, ${place.region})`
                + `${baked ? ' [pre-pinned]' : ''}`);
            placesAdded += 1;
            if (!baked) toGeocode.push({ id: null, name: place.name, query });
            continue;
        }

        const inserted = await pool.query(
            `INSERT INTO honeymoon_places
                (region_id, name, category, description, lat, lng, address,
                 links, status, source, needs_review, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'idea', 'guide', TRUE, $9)
             RETURNING id`,
            [
                regionId, place.name, place.category, place.description ?? null,
                baked?.lat ?? null, baked?.lng ?? null, baked?.address ?? null,
                JSON.stringify(place.links ?? []), index,
            ],
        );
        placesAdded += 1;
        if (baked) prePinned += 1;
        else toGeocode.push({ id: inserted.rows[0].id, name: place.name, query });
    }
    console.log(`Places: ${placesAdded} added (${prePinned} pre-pinned from the harvested `
        + `coordinates), ${placesSkipped} already present.\n`);

    /* ---- Geocoding ---- */
    if (!toGeocode.length) {
        console.log('Nothing left to geocode — every new place came pre-pinned.');
    } else if (NO_GEO || DRY) {
        console.log(NO_GEO
            ? `Skipping geocoding (--no-geo). ${toGeocode.length} place(s) left unpinned.`
            : `Would geocode ${toGeocode.length} place(s).`);
    } else {
        console.log(`Geocoding ${toGeocode.length} place(s) at 1/sec — roughly `
            + `${Math.ceil((toGeocode.length * RATE_LIMIT_MS) / 60000)} minute(s).\n`);

        let resolved = 0;
        let missed = 0;

        for (const [i, entry] of toGeocode.entries()) {
            const hit = await geocode(entry.query);
            if (hit && entry.id != null) {
                await pool.query(
                    'UPDATE honeymoon_places SET lat = $1, lng = $2, address = $3 WHERE id = $4',
                    [hit.lat, hit.lng, hit.label || null, entry.id],
                );
                resolved += 1;
            } else {
                missed += 1;
            }

            const marker = hit ? '·' : '✗';
            process.stdout.write(
                `${marker} [${i + 1}/${toGeocode.length}] ${entry.name}`
                + `${hit ? '' : '  — no match'}\n`,
            );
            await sleep(RATE_LIMIT_MS);
        }

        console.log(`\nGeocoded ${resolved}, missed ${missed}.`);
        console.log('Every pin is flagged "needs review" — confirm them in the admin\'s '
            + 'Places tab (filter: ⚠ Needs review) before trusting the map.');
        if (missed) {
            console.log(`${missed} place(s) have no coordinates. Filter by "Not pinned" and add them `
                + 'by pasting a Google Maps link.');
        }
    }

    await pool.end();
}

main().catch(async (error) => {
    console.error('Seed failed:', error);
    await pool.end().catch(() => {});
    process.exit(1);
});
