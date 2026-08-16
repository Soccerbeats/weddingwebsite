/**
 * One-off: resolve coordinates for every place in the Bali guide and write them
 * to src/lib/honeymoonCoords.ts.
 *
 *   npx tsx scripts/harvest-honeymoon-coords.mts
 *
 * Run once, commit the result. Baking the coordinates into the repo means the
 * actual seed is instant and needs no network — important because the seed runs
 * against the production database, where a four-minute rate-limited crawl
 * against a third-party service is a bad thing to depend on.
 *
 * These are guesses, and the seed marks every one of them needs_review.
 *
 * Incremental: names already resolved in honeymoonCoords.ts are kept as-is and
 * skipped, so adding a handful of places costs a handful of lookups rather than
 * a full four-minute re-crawl. Previously-missed names are retried, since a
 * place absent from OSM last time may have been added since.
 */
import { writeFileSync } from 'node:fs';
import { SEED_PLACES, SEED_REGIONS } from '../src/lib/honeymoonSeed';
import { SEED_COORDS } from '../src/lib/honeymoonCoords';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = process.env.GEOCODER_USER_AGENT
    ?? 'WeddingWebsite-HoneymoonPortal/1.0 (self-hosted; admin planning tool)';
const RATE_LIMIT_MS = 1100;

/**
 * Sanity box for Bali + Singapore. Nominatim will cheerfully return a "Nook"
 * in England or a "Vault" in Texas for a bare business name, and a pin 10,000
 * km away would wreck the map's fitBounds. Anything outside this is discarded.
 */
const BOX = { minLat: -9.6, maxLat: 2.0, minLng: 102.0, maxLng: 116.5 };

/**
 * Alternate search terms for places OpenStreetMap files under a different name
 * than the guide uses — a different transliteration ("Tegalalang" vs OSM's
 * "Tegallalang"), a brand short-name, or the operator rather than the venue.
 * Tried in order after the plain name fails.
 */
const ALIASES: Record<string, string[]> = {
    'Tegalalang Rice Terrace': ['Tegallalang Rice Terraces', 'Ceking Rice Terrace, Tegallalang'],
    'Beachwalk Shopping Center': ['Beachwalk Bali', 'Beachwalk Mall, Kuta'],
    'Courtyard by Marriott Bali Seminyak Resort': ['Courtyard Bali Seminyak', 'Courtyard Seminyak'],
    'Sacred Monkey Forest Sanctuary': ['Mandala Suci Wenara Wana'],
    'Goa Gajah Elephant Cave': ['Goa Gajah'],
    'Ubud Traditional Art Market': ['Pasar Seni Ubud'],
    'Ngurah Rai International Airport': ['Bandara Internasional I Gusti Ngurah Rai'],
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function inBox(lat: number, lng: number): boolean {
    return lat >= BOX.minLat && lat <= BOX.maxLat && lng >= BOX.minLng && lng <= BOX.maxLng;
}

async function lookup(query: string): Promise<{ lat: number; lng: number; label: string } | null> {
    const url = new URL(NOMINATIM);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '3');
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
            signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) return null;
        const body = await res.json();
        if (!Array.isArray(body)) return null;
        for (const hit of body) {
            const lat = Number(hit.lat);
            const lng = Number(hit.lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
            if (!inBox(lat, lng)) continue;
            return { lat, lng, label: String(hit.display_name ?? '') };
        }
        return null;
    } catch {
        return null;
    }
}

const hintByRegion = new Map(SEED_REGIONS.map((r) => [r.name, r.searchHint]));
// Start from what is already known and only look up the gaps.
const resolved: Record<string, { lat: number; lng: number; address: string }> =
    { ...SEED_COORDS };
const pending = SEED_PLACES.filter((p) => !resolved[p.name]);
let hits = 0;
let misses = 0;

console.log(`${Object.keys(resolved).length} already pinned, ${pending.length} to look up.\n`);

for (const [i, place] of pending.entries()) {
    const hint = hintByRegion.get(place.region) ?? 'Bali, Indonesia';

    // Try the specific query first, then a broader one — a business name plus a
    // village often finds nothing while the name plus the island does.
    const country = place.region === 'Singapore' ? 'Singapore' : 'Bali, Indonesia';
    let found = await lookup(`${place.name}, ${hint}`);
    if (!found) {
        await sleep(RATE_LIMIT_MS);
        found = await lookup(`${place.name}, ${country}`);
    }
    // Last resort: any alternate name OSM might file this place under.
    for (const alias of ALIASES[place.name] ?? []) {
        if (found) break;
        await sleep(RATE_LIMIT_MS);
        found = await lookup(`${alias}, ${country}`);
    }

    if (found) {
        resolved[place.name] = {
            lat: Number(found.lat.toFixed(6)),
            lng: Number(found.lng.toFixed(6)),
            address: found.label,
        };
        hits += 1;
    } else {
        misses += 1;
    }

    console.log(`${found ? '·' : '✗'} [${i + 1}/${pending.length}] ${place.name}`);
    await sleep(RATE_LIMIT_MS);
}

const header = `/**
 * Geocoded coordinates for the Bali guide's places — generated by
 * scripts/harvest-honeymoon-coords.mts and committed so the seed needs no
 * network.
 *
 * EVERY ENTRY IS A GUESS. The seed writes them with needs_review = true and the
 * admin draws them with a dashed ring until you confirm each one.
 * ${Object.keys(resolved).length} of ${SEED_PLACES.length} places are pinned;
 * the remaining ${SEED_PLACES.length - Object.keys(resolved).length} are pinned by hand.
 */

export interface SeedCoord { lat: number; lng: number; address: string }

export const SEED_COORDS: Record<string, SeedCoord> = ${JSON.stringify(resolved, null, 4)};
`;

writeFileSync(new URL('../src/lib/honeymoonCoords.ts', import.meta.url), header);
console.log(`\nNewly resolved ${hits}, still missing ${misses}. `
    + `${Object.keys(resolved).length}/${SEED_PLACES.length} pinned overall. `
    + `Written to src/lib/honeymoonCoords.ts`);
