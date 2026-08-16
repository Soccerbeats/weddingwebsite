/**
 * Verifies the honeymoon portal's pure logic — the parts that would fail
 * silently and wrongly rather than loudly.
 *
 *   npm run check:honeymoon
 *
 * No database and no network: this covers the maths and parsing that decide
 * where a pin lands and what date a day shows.
 */
import {
    boundsOf, dateForDay, distanceKm, formatDayDate, formatDistance, formatTime,
    dayHops, hasCoords, categoryMeta, CATEGORIES,
    sourceLabel, sourcesOf, SOURCE_AMY, SOURCE_MANUAL, SOURCE_YOUTUBE,
    type Place, type Stop,
} from '../src/lib/honeymoon';
import { coordsFromMapsUrl, coordsFromPair } from '../src/app/api/admin/honeymoon/geocode/route';
import { SEED_PLACES, SEED_REGIONS, SEED_NOTES } from '../src/lib/honeymoonSeed';

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail = '') {
    checks += 1;
    if (condition) {
        console.log(`  ✓ ${label}`);
    } else {
        failures += 1;
        console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    }
}

function close(a: number, b: number, tolerance: number): boolean {
    return Math.abs(a - b) <= tolerance;
}

console.log('\nDistance');
{
    // Singapore Changi to Ngurah Rai, Bali — about 1,670 km great-circle.
    const changi = { lat: 1.3644, lng: 103.9915 };
    const denpasar = { lat: -8.7482, lng: 115.1672 };
    const km = distanceKm(changi, denpasar);
    check('Singapore → Bali is ~1670 km', close(km, 1670, 40), `got ${km.toFixed(0)} km`);

    check('identical points are 0 km', distanceKm(changi, changi) === 0);

    // Canggu to Ubud, about 22 km.
    const canggu = { lat: -8.6478, lng: 115.1385 };
    const ubud = { lat: -8.5069, lng: 115.2625 };
    check('Canggu → Ubud is ~21 km', close(distanceKm(canggu, ubud), 21, 4),
        `got ${distanceKm(canggu, ubud).toFixed(1)} km`);

    check('formats sub-kilometre as metres', formatDistance(0.42) === '420 m');
    check('formats mid range with a decimal', formatDistance(4.25) === '4.3 km');
    check('formats long range as whole km', formatDistance(47.4) === '47 km');
}

console.log('\nBounds');
{
    check('no points yields null', boundsOf([]) === null);

    const single = boundsOf([{ lat: -8.5, lng: 115.2 }]);
    check('a single point gets a padded box', single != null && single[0][0] < single[1][0]);

    const pair = boundsOf([{ lat: 1.36, lng: 103.99 }, { lat: -8.75, lng: 115.17 }]);
    check('two points span both corners',
        pair != null && pair[0][0] === -8.75 && pair[1][0] === 1.36
        && pair[0][1] === 103.99 && pair[1][1] === 115.17);
}

console.log('\nDates');
{
    check('no start date means no real date', dateForDay(null, 1) === null);

    const day1 = dateForDay('2026-09-01', 1);
    check('day 1 is the start date', day1?.toISOString().slice(0, 10) === '2026-09-01',
        `got ${day1?.toISOString().slice(0, 10)}`);

    const day10 = dateForDay('2026-09-01', 10);
    check('day 10 is start + 9', day10?.toISOString().slice(0, 10) === '2026-09-10',
        `got ${day10?.toISOString().slice(0, 10)}`);

    // Crossing a month boundary is where naive arithmetic breaks.
    const day31 = dateForDay('2026-09-01', 31);
    check('day 31 rolls into October', day31?.toISOString().slice(0, 10) === '2026-10-01',
        `got ${day31?.toISOString().slice(0, 10)}`);

    check('formats a weekday', (formatDayDate('2026-09-01', 1) ?? '').includes('Sep'));
    check('blank start date formats as null', formatDayDate(null, 3) === null);
}

console.log('\nTimes');
{
    check('blank time stays blank', formatTime(null) === '');
    check('morning reads AM', formatTime('09:30') === '9:30 AM');
    check('afternoon reads PM', formatTime('19:00') === '7:00 PM');
    check('noon is 12 PM', formatTime('12:00') === '12:00 PM');
    check('midnight is 12 AM', formatTime('00:15') === '12:15 AM');
}

console.log('\nCoordinate parsing');
{
    const pin = coordsFromMapsUrl(
        'https://www.google.com/maps/place/Tukad+Cepung/@-8.4712,115.3562,17z/data=!3m1!4b1!4m6!3d-8.4715!4d115.3567',
    );
    // The !3d/!4d pin must win over the @ centre — with a side panel open they differ.
    check('prefers the !3d/!4d pin over the @ centre',
        pin != null && close(pin.lat, -8.4715, 0.0001) && close(pin.lng, 115.3567, 0.0001),
        `got ${JSON.stringify(pin)}`);

    const centre = coordsFromMapsUrl('https://www.google.com/maps/@-8.6478,115.1385,15z');
    check('falls back to the @ centre', centre != null && close(centre.lat, -8.6478, 0.0001));

    const query = coordsFromMapsUrl('https://maps.google.com/?q=-8.5069,115.2625');
    check('reads a ?q= coordinate query', query != null && close(query.lng, 115.2625, 0.0001));

    check('rejects a link with no coordinates',
        coordsFromMapsUrl('https://www.google.com/maps/place/Ubud') === null);

    check('parses a raw pair', coordsFromPair('-8.5069, 115.2625') != null);
    check('parses a pair without a space', coordsFromPair('-8.5069,115.2625') != null);
    check('rejects prose', coordsFromPair('Ubud, Bali') === null);
    // 0,0 is in the Atlantic; accepting it would drag fitBounds across the world.
    check('rejects null island', coordsFromPair('0, 0') === null);
    check('rejects an out-of-range latitude', coordsFromPair('130.5, 20.0') === null);
}

console.log('\nHops');
{
    const places: Place[] = [
        makePlace(1, 'Canggu spot', -8.6478, 115.1385),
        makePlace(2, 'Ubud spot', -8.5069, 115.2625),
        makePlace(3, 'Unpinned', null, null),
        makePlace(4, 'North Bali spot', -8.1700, 115.1000),
    ];
    const byId = new Map(places.map((p) => [p.id, p]));

    const stops: Stop[] = [
        makeStop(1, 1), makeStop(2, 2), makeStop(3, 3), makeStop(4, 4),
    ];

    const hops = dayHops(stops, byId);
    // The unpinned stop at index 2 must not create a hop, and must not break the
    // chain between the pinned stops on either side of it.
    check('unpinned stops do not produce hops', hops.length === 2, `got ${hops.length}`);
    check('hops bridge across an unpinned stop',
        hops[1]?.fromIndex === 1, `got fromIndex ${hops[1]?.fromIndex}`);

    const noPins = dayHops([makeStop(1, 3)], byId);
    check('a day of unpinned stops has no hops', noPins.length === 0);

    check('a stop pointing at a deleted place is skipped',
        dayHops([makeStop(1, 999), makeStop(2, 1)], byId).length === 0);
}

console.log('\nCoordinate guards');
{
    check('hasCoords rejects nulls', !hasCoords({ lat: null, lng: null }));
    check('hasCoords rejects a half pair', !hasCoords({ lat: -8.5, lng: null }));
    check('hasCoords accepts a real pair', hasCoords({ lat: -8.5, lng: 115.2 }));
    check('hasCoords rejects NaN', !hasCoords({ lat: NaN, lng: 115.2 }));
}

console.log('\nSeed data');
{
    const names = SEED_PLACES.map((p) => p.name.toLowerCase());
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
    // The seed matches on name, so a duplicate would silently insert only once.
    check('no duplicate place names', duplicates.length === 0,
        duplicates.length ? `duplicates: ${[...new Set(duplicates)].join(', ')}` : '');

    const regionNames = new Set(SEED_REGIONS.map((r) => r.name));
    const orphans = SEED_PLACES.filter((p) => !regionNames.has(p.region));
    check('every place points at a real region', orphans.length === 0,
        orphans.length ? `orphans: ${orphans.slice(0, 3).map((o) => o.name).join(', ')}` : '');

    const validCategories = new Set(CATEGORIES.map((c) => c.key as string));
    const badCategories = SEED_PLACES.filter((p) => !validCategories.has(p.category));
    check('every place has a known category', badCategories.length === 0,
        badCategories.length ? `bad: ${badCategories.slice(0, 3).map((b) => b.category).join(', ')}` : '');

    check('the guide produced a substantial library', SEED_PLACES.length >= 150,
        `got ${SEED_PLACES.length}`);
    check('notes carry a body', SEED_NOTES.every((n) => n.body.trim().length > 20));
    check('regions carry a search hint', SEED_REGIONS.every((r) => r.searchHint.trim().length > 0));

    check('unknown categories fall back to Other', categoryMeta('nonsense').key === 'misc');
}

console.log('\nSources');
{
    // Databases seeded before sources existed still hold the old enum values;
    // they must read as the batch they actually came from, not as raw strings.
    check('legacy "guide" reads as the YouTube guide', sourceLabel('guide') === SOURCE_YOUTUBE);
    check('legacy "manual" reads as added-by-hand', sourceLabel('manual') === SOURCE_MANUAL);
    check('a real label passes through', sourceLabel(SOURCE_AMY) === SOURCE_AMY);
    check('null falls back rather than blanking', sourceLabel(null) === SOURCE_MANUAL);

    const list = sourcesOf([
        { source: 'guide' }, { source: SOURCE_AMY }, { source: 'guide' }, { source: SOURCE_MANUAL },
    ]);
    check('sources dedupe after normalising', list.length === 3, list.join(' | '));
    check('sources are sorted', list.join('|') === [...list].sort((a, b) => a.localeCompare(b)).join('|'));
    // Legacy and modern values for the same batch must not appear as two
    // separate filter options, or the dropdown lies about how many batches exist.
    check('legacy and modern values collapse to one option',
        sourcesOf([{ source: 'guide' }, { source: SOURCE_YOUTUBE }]).length === 1);

    const amy = SEED_PLACES.filter((p) => p.source === SOURCE_AMY);
    check('Amy\'s batch is tagged', amy.length === 7, `got ${amy.length}`);
    check('everything else is untagged (defaults to the guide)',
        SEED_PLACES.filter((p) => p.source && p.source !== SOURCE_AMY).length === 0);
    check('Amy\'s notes are tagged',
        SEED_NOTES.filter((n) => n.source === SOURCE_AMY).length === 2);
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed.\n`);
process.exit(failures === 0 ? 0 : 1);

/* ---- helpers ---- */

function makePlace(id: number, name: string, lat: number | null, lng: number | null): Place {
    return {
        id, name, lat, lng,
        region_id: null, category: 'misc', address: null, description: null,
        status: 'idea', price_note: null, links: [], photos: [],
        source: 'manual', needs_review: false, sort_order: 0,
    };
}

function makeStop(id: number, placeId: number | null): Stop {
    return {
        id, day_id: 1, place_id: placeId, custom_label: null,
        start_time: null, notes: null, sort_order: id,
    };
}
