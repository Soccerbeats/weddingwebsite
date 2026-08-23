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
    arcPoints, legEnds, travelModeMeta,
    boundsOf, dateForDay, distanceKm, formatDayDate, formatDistance, formatTime,
    dayHops, hasCoords, categoryMeta, CATEGORIES,
    sourceLabel, sourcesOf, SOURCE_AMY, SOURCE_MANUAL, SOURCE_YOUTUBE,
    categoriesOf, normalizeCategoryKey,
    pointInPolygon, placesInPolygon, nameFromStayUrl, stayUrlsFromText, isStayUrl, cleanListingTitle, formatPerNight,
    formatPrice, nameFromAnyUrl, priceValue, effectiveCountry, countriesInUse, calendarMonths,
    monthMatrix, planRange, daysBeyondRange, tripLength, daysBetween, addDays, isoOf, buildIcs,
    tripEvents, searchHoneymoon,
    type Day, type GuideNote, type Region, type TodoItem,
    type Place, type Stop,
} from '../src/lib/honeymoon';
import {
    coordsFromMapsUrl, coordsFromPair, nameFromMapsUrl,
} from '../src/app/api/admin/honeymoon/geocode/route';
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

console.log('\nName from a Maps link');
{
    check('reads the place name',
        nameFromMapsUrl('https://www.google.com/maps/place/Ubud+Palace/@-8.5069,115.2625,17z')
        === 'Ubud Palace');
    // The /place/ slug often carries the whole address; the name is the head of
    // it, and the real address comes from reverse geocoding instead.
    check('keeps only the name, not the trailing address',
        nameFromMapsUrl('https://www.google.com/maps/place/Cafe+Lotus,+Jalan+Raya+Ubud,+Bali/@-8.5,115.2,17z')
        === 'Cafe Lotus');
    check('decodes percent-encoding',
        nameFromMapsUrl('https://www.google.com/maps/place/Caf%C3%A9%20Lotus/@-8.5,115.2,17z')
        === 'Café Lotus');
    check('no /place/ segment yields nothing',
        nameFromMapsUrl('https://www.google.com/maps/@-8.5,115.2,15z') === null);
    // A coordinate-only slug is not a name; filling the name field with digits
    // would be worse than leaving it blank.
    check('a coordinate slug is not treated as a name',
        nameFromMapsUrl('https://www.google.com/maps/place/-8.5069,115.2625/@-8.5,115.2,17z') === null);
    // Host-agnostic by design: it only looks for a /place/ segment, and the
    // caller has already established this is a maps link.
    check('any /place/ segment is read, whatever the host',
        nameFromMapsUrl('https://example.com/place/Thing') === 'Thing');
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

    // A custom category is something someone typed, not a mistake — it must keep
    // its own name rather than collapsing into "Other".
    const custom = categoryMeta('hot springs');
    check('a custom category keeps its name', custom.label === 'Hot Springs', custom.label);
    check('a custom category gets its own colour', custom.color !== categoryMeta('misc').color);
    check('a custom colour is stable across calls',
        categoryMeta('hot springs').color === custom.color);
    check('two custom categories differ',
        categoryMeta('hot springs').color !== categoryMeta('night market').color);
    check('blank still falls back to Other', categoryMeta('').key === 'misc');
    check('a built-in still wins', categoryMeta('waterfall').label === 'Waterfall');

    check('beach, hiking and nature exist',
        ['beach', 'hiking', 'nature'].every((k) => CATEGORIES.some((c) => c.key === k)));

    check('typed names normalise to one key',
        normalizeCategoryKey('  Hot   Springs ') === 'hot springs',
        normalizeCategoryKey('  Hot   Springs '));

    const listed = categoriesOf([{ category: 'hot springs' }, { category: 'waterfall' }]);
    check('custom categories in use are offered as filters',
        listed.some((c) => c.key === 'hot springs'));
    check('built-ins are still offered when unused',
        listed.some((c) => c.key === 'temple'));
    check('a category in use is not duplicated',
        listed.filter((c) => c.key === 'waterfall').length === 1);
}

console.log('\nLasso geometry');
{
    // A square around Ubud.
    const box = [
        { lat: -8.60, lng: 115.20 }, { lat: -8.60, lng: 115.30 },
        { lat: -8.45, lng: 115.30 }, { lat: -8.45, lng: 115.20 },
    ];
    check('a point inside is inside', pointInPolygon({ lat: -8.51, lng: 115.26 }, box));
    check('a point outside is outside', !pointInPolygon({ lat: -8.65, lng: 115.14 }, box));
    check('a point far away is outside', !pointInPolygon({ lat: 1.35, lng: 103.99 }, box));
    check('a degenerate loop selects nothing', !pointInPolygon({ lat: -8.5, lng: 115.25 }, box.slice(0, 2)));

    // Concave: a C-shape must not capture the gap it wraps around.
    const cShape = [
        { lat: 0, lng: 0 }, { lat: 0, lng: 10 }, { lat: 10, lng: 10 }, { lat: 10, lng: 0 },
        { lat: 8, lng: 0 }, { lat: 8, lng: 8 }, { lat: 2, lng: 8 }, { lat: 2, lng: 0 },
    ];
    check('a concave loop excludes its notch', !pointInPolygon({ lat: 5, lng: 4 }, cShape));
    check('a concave loop includes its arms', pointInPolygon({ lat: 9, lng: 5 }, cShape));

    const places: Place[] = [
        makePlace(1, 'inside', -8.51, 115.26),
        makePlace(2, 'outside', -8.90, 115.10),
        makePlace(3, 'unpinned', null, null),
    ];
    const hit = placesInPolygon(places, box);
    check('only pinned places inside are selected', hit.length === 1 && hit[0] === 1, hit.join(','));
    // An unpinned place has no position, so it can never be lassoed — it must
    // not be silently swept into a bulk delete.
    check('unpinned places are never lassoed', !hit.includes(3));
    check('too few points selects nothing', placesInPolygon(places, box.slice(0, 2)).length === 0);
}

console.log('\nBooking links');
{
    check('reads a Booking.com property name',
        nameFromStayUrl('https://www.booking.com/hotel/id/hard-rock-bali.html') === 'Hard Rock Bali');
    // Booking appends a locale before .html; leaving it in gives "Bali En Gb".
    check('strips the locale suffix',
        nameFromStayUrl('https://www.booking.com/hotel/id/the-legian-bali.en-gb.html') === 'The Legian Bali',
        String(nameFromStayUrl('https://www.booking.com/hotel/id/the-legian-bali.en-gb.html')));
    check('survives query strings',
        nameFromStayUrl('https://www.booking.com/hotel/id/desa-hay.html?checkin=2026-09-01&group_adults=2')
        === 'Desa Hay');
    check('handles an Airbnb room id',
        nameFromStayUrl('https://www.airbnb.com/rooms/12345678?source=x') === 'Airbnb 12345678');
    // A numeric slug is an id, not a name — better blank than "12345".
    check('a numeric slug is not a name',
        nameFromStayUrl('https://www.booking.com/hotel/id/12345.html') === null);
    check('an unrelated url yields nothing',
        nameFromStayUrl('https://example.com/about') === null);

    check('recognises booking hosts', isStayUrl('https://www.booking.com/hotel/id/x.html'));
    check('recognises airbnb', isStayUrl('https://www.airbnb.co.uk/rooms/1'));
    check('rejects a non-booking host', !isStayUrl('https://example.com/x'));
    check('rejects bare text', !isStayUrl('booking.com'));

    const block = `https://www.booking.com/hotel/id/a.html
        https://www.booking.com/hotel/id/b.html
        not-a-url
        https://www.booking.com/hotel/id/a.html`;
    const urls = stayUrlsFromText(block);
    // Pasting a block twice, or a list with a repeat, must not create duplicates.
    check('splits a pasted block into urls', urls.length === 2, urls.join(' | '));
    check('drops non-urls and duplicates', !urls.includes('not-a-url'));
    check('empty text yields nothing', stayUrlsFromText('   ').length === 0);

    // Booking's og:title is "Name, Town (updated prices YYYY)". Only the head is
    // a property name; the rest is location and marketing noise on a card.
    check('trims town and marketing suffix from a listing title',
        cleanListingTitle('Desa Hay Canggu, Canggu (updated prices 2026)') === 'Desa Hay Canggu',
        String(cleanListingTitle('Desa Hay Canggu, Canggu (updated prices 2026)')));
    check('handles two location segments',
        cleanListingTitle('The Legian Seminyak, Bali, Seminyak (updated prices 2026)')
        === 'The Legian Seminyak');
    check('a plain title passes through',
        cleanListingTitle('Hard Rock Hotel Bali') === 'Hard Rock Hotel Bali');
    check('empty title yields nothing', cleanListingTitle('') === null);
    check('a one-character title is not a name', cleanListingTitle('X, Bali') === null);
}

console.log('\nNightly price formatting');
{
    const f = (v: string, c?: string) => formatPerNight(v, c);

    check('a bare number becomes a rate', f('250') === '$250 per night', f('250'));
    check('thousands get separated', f('1200') === '$1,200 per night', f('1200'));
    check('cents are kept when typed', f('250.5') === '$250.50 per night', f('250.5'));
    check('trailing .00 is dropped', f('250.00') === '$250 per night', f('250.00'));
    check('an existing dollar sign is not doubled', f('$250') === '$250 per night', f('$250'));
    check('typed separators survive', f('1,200') === '$1,200 per night', f('1,200'));

    // The field commits on blur as well as Enter, so running over its own output
    // must not compound into "$$250 per night per night".
    check('re-formatting its own output is a no-op',
        f(f('250')) === '$250 per night', f(f('250')));
    check('idempotent over three passes', f(f(f('1200'))) === '$1,200 per night');

    check('"per night" already typed is not repeated',
        f('250 per night') === '$250 per night', f('250 per night'));
    check('slash-night spelling is understood',
        f('180/night') === '$180 per night', f('180/night'));

    // Free text must survive untouched: the seeded library has notes like
    // "~500k IDR entry", and rewriting those as dollars would be plain wrong.
    check('free text is left alone', f('~500k IDR entry') === '~500k IDR entry');
    check('a range is left alone', f('250-300') === '250-300');
    check('a foreign symbol is left alone', f('€200') === '€200');
    check('blank stays blank', f('') === '' && f('   ') === '');

    // The trip's own currency wins when it isn't dollars.
    check('honours a non-USD trip currency', f('250', 'GBP') === '£250 per night', f('250','GBP'));
    check('unknown currency codes fall back to the code',
        f('250', 'IDR') === 'IDR 250 per night', f('250','IDR'));
    check('a GBP amount is not re-prefixed', f('£250 per night', 'GBP') === '£250 per night');
}

console.log('\nExcursion pricing and naming');
{
    const g = (v: string, c?: string) => formatPrice(v, c);
    check('a bare number becomes a price', g('120') === '$120', g('120'));
    check('thousands separate', g('1500') === '$1,500', g('1500'));
    // No suffix is invented — an excursion might be per person, per couple or
    // per boat, and guessing would put words in the user's mouth.
    check('no unit is invented', g('120') === '$120');
    check('a typed unit is left as typed', g('120 per person') === '120 per person');
    check('re-formatting is a no-op', g(g('120')) === '$120');
    check('free text survives', g('ask at the desk') === 'ask at the desk');
    check('blank stays blank', g('') === '');
    check('honours the trip currency', g('120', 'GBP') === '£120', g('120','GBP'));

    // Any link needs a usable name — "Untitled" defeats the point of a list.
    check('reads a slug from a tour url',
        nameFromAnyUrl('https://www.getyourguide.com/bali-l376/ubud-rafting-t12345')
        === 'Ubud Rafting T12345',
        String(nameFromAnyUrl('https://www.getyourguide.com/bali-l376/ubud-rafting-t12345')));
    check('skips a numeric last segment',
        nameFromAnyUrl('https://example.com/tours/sunrise-trek/48291') === 'Sunrise Trek',
        String(nameFromAnyUrl('https://example.com/tours/sunrise-trek/48291')));
    check('falls back to the host when the path says nothing',
        nameFromAnyUrl('https://masonadventures.com/') === 'Masonadventures',
        String(nameFromAnyUrl('https://masonadventures.com/')));
    check('still prefers a booking slug',
        nameFromAnyUrl('https://www.booking.com/hotel/id/desa-hay.html') === 'Desa Hay');
    check('garbage yields nothing', nameFromAnyUrl('not a url') === null);

    // The dashboard totals prices, so reading a number back out has to be exact.
    check('reads a formatted price', priceValue('$120') === 120);
    check('reads a nightly rate', priceValue('$1,200 per night') === 1200, String(priceValue('$1,200 per night')));
    check('reads a decimal', priceValue('$250.50 per night') === 250.5);
    check('reads a bare number', priceValue('90') === 90);
    // "ask at the desk" is not zero — counting it as zero would understate a total.
    check('free text is not zero', priceValue('ask at the desk') === null);
    check('blank is not zero', priceValue('') === null && priceValue(null) === null);
    check('a foreign symbol still yields its number', priceValue('€200') === 200);
}

console.log('\nPlace country');
{
    const regions = new Map<number, string>([[1, 'Indonesia'], [2, 'Singapore'], [3, '']]);
    const at = (region: number | null, own = '') => ({ region_id: region, country: own });

    check('inherits its region', effectiveCountry(at(1), regions) === 'Indonesia');
    check('its own value wins over the region',
        effectiveCountry(at(1, 'Singapore'), regions) === 'Singapore');
    // A region with no country is not a country — it must stay "unknown" so the
    // map keeps showing it rather than filtering it away.
    check('a country-less region yields unknown', effectiveCountry(at(3), regions) === '');
    check('no region at all yields unknown', effectiveCountry(at(null), regions) === '');
    check('own value rescues a region-less place',
        effectiveCountry(at(null, 'Indonesia'), regions) === 'Indonesia');
    check('own value rescues a country-less region',
        effectiveCountry(at(3, 'Indonesia'), regions) === 'Indonesia');
    check('whitespace is not a country', effectiveCountry(at(null, '   '), regions) === '');

    const list = countriesInUse(
        [{ country: 'Indonesia' }, { country: '' }, { country: 'Singapore' }],
        [{ country: 'Japan' }, { country: 'Indonesia' }, { country: '' }],
    );
    check('countries come from regions and places', list.join(',') === 'Indonesia,Japan,Singapore',
        list.join(','));
    check('blanks are not offered as a country', !list.includes(''));
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

console.log('\nCalendar grid');
{
    // 2026-09-28 is a Monday; a 10-day trip from it runs into October, so this
    // covers the month rollover as well as the ordinary case.
    const months = calendarMonths('2026-09-28', 10);
    check('spans every month the trip touches', months.length === 2,
        months.map((m) => m.key).join(','));
    check('months are labelled', months[0].label === 'September 2026'
        && months[1].label === 'October 2026', months[0].label);

    for (const month of months) {
        check(`${month.key} is whole weeks`, month.cells.length % 7 === 0,
            `${month.cells.length} cells`);
        check(`${month.key} starts on a Sunday`, month.cells[0].date.getUTCDay() === 0);
        check(`${month.key} ends on a Saturday`,
            month.cells[month.cells.length - 1].date.getUTCDay() === 6);
    }

    const all = months.flatMap((m) => m.cells);
    const tripCells = all.filter((c) => c.dayNumber != null);
    // The trip appears once per month grid it falls in, and the overlap days
    // (Sep 28-30) are borrowed into October's leading week too.
    const numbers = [...new Set(tripCells.map((c) => c.dayNumber))].sort((a, b) => a! - b!);
    check('every trip day is on the grid', numbers.length === 10
        && numbers[0] === 1 && numbers[9] === 10, numbers.join(','));

    const dayOne = all.find((c) => c.dayNumber === 1)!;
    check('day 1 lands on its start date', dayOne.key === '2026-09-28', dayOne.key);
    check('day 1 is a Monday', dayOne.date.getUTCDay() === 1);
    const dayTen = all.find((c) => c.dayNumber === 10)!;
    check('day 10 lands 9 days later', dayTen.key === '2026-10-07', dayTen.key);

    check('the day before the trip is blank',
        all.find((c) => c.key === '2026-09-27')!.dayNumber === null);
    check('the day after the trip is blank',
        all.find((c) => c.key === '2026-10-08')!.dayNumber === null);

    check('September marks its own days as in-month',
        months[0].cells.filter((c) => c.inMonth).length === 30);
    check('borrowed days are marked',
        months[0].cells.some((c) => !c.inMonth));
    check('dayOfMonth matches the date',
        all.every((c) => c.dayOfMonth === c.date.getUTCDate()));

    // A trip inside one month must not spill into a second grid.
    check('a single-month trip yields one month',
        calendarMonths('2026-09-07', 5).length === 1);
    // Without a start date there is nothing to draw, and the view says so.
    check('no start date yields nothing', calendarMonths(null, 10).length === 0);
    check('no days yields nothing', calendarMonths('2026-09-28', 0).length === 0);
}

console.log('\nMonth grid');
{
    const sep = monthMatrix(2026, 8);          // September 2026
    check('is labelled', sep.label === 'September 2026', sep.label);
    check('is whole weeks', sep.cells.length % 7 === 0);
    check('starts on a Sunday', sep.cells[0].date.getUTCDay() === 0);
    check('has all 30 days in-month', sep.cells.filter((c) => c.inMonth).length === 30);
    check('numbers nothing without a rule',
        sep.cells.every((c) => c.dayNumber === null));

    // February in a leap year is the classic off-by-one.
    const feb = monthMatrix(2028, 1);
    check('handles a leap February', feb.cells.filter((c) => c.inMonth).length === 29);
    const feb27 = monthMatrix(2027, 1);
    check('handles a common February', feb27.cells.filter((c) => c.inMonth).length === 28);

    // December has to roll the year, not just the month.
    const dec = monthMatrix(2026, 11);
    check('December rolls into January', dec.cells.some((c) => c.date.getUTCFullYear() === 2027));

    const rule = (d: Date) => (d.getUTCDate() % 7 === 0 ? 1 : null);
    check('applies the numbering rule it is given',
        monthMatrix(2026, 8, rule).cells.filter((c) => c.dayNumber === 1).length >= 4);
}

console.log('\nDate arithmetic');
{
    check('counts whole days', daysBetween('2026-09-28', '2026-10-07') === 9);
    check('counts backwards too', daysBetween('2026-10-07', '2026-09-28') === -9);
    check('same day is zero', daysBetween('2026-09-28', '2026-09-28') === 0);
    check('a missing end is null', daysBetween('2026-09-28', null) === null);
    check('adds across a month end', addDays('2026-09-30', 1) === '2026-10-01');
    check('adds across a year end', addDays('2026-12-31', 1) === '2027-01-01');
    check('subtracts', addDays('2026-10-01', -1) === '2026-09-30');
    check('iso of a UTC date', isoOf(new Date(Date.UTC(2026, 8, 28))) === '2026-09-28');
}

console.log('\nTrip range');
{
    // Nothing planned yet: every day has to be created.
    const fresh = planRange('2026-09-28', '2026-10-07', []);
    check('a ten-day range is ten days', fresh.length === 10, String(fresh.length));
    check('creates all of them', fresh.add.length === 10 && fresh.add[9] === 10);
    check('leaves nothing outside', fresh.beyond.length === 0);
    check('is not a shift', !fresh.shiftOnly);

    // Dragged right-to-left means the same trip.
    const backwards = planRange('2026-10-07', '2026-09-28', []);
    check('a backwards drag normalises', backwards.start === '2026-09-28'
        && backwards.end === '2026-10-07');

    // Same length, later start: no rows change, only the dates.
    const shifted = planRange('2026-10-05', '2026-10-14', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    check('moving the whole trip touches no days', shifted.shiftOnly);
    check('and keeps its length', shifted.length === 10);

    // Longer: only the missing tail is added.
    const longer = planRange('2026-09-28', '2026-10-11', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    check('extending adds only the new days',
        longer.add.join(',') === '11,12,13,14', longer.add.join(','));
    check('extending leaves nothing outside', longer.beyond.length === 0);

    // Shorter: the tail is named so the UI can flag it. Nothing is deleted —
    // shortening a planned trip must never throw a day away.
    const shorter = planRange('2026-09-28', '2026-10-04', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    check('shortening names the days now outside the range',
        shorter.beyond.join(',') === '8,9,10', shorter.beyond.join(','));
    check('shortening adds nothing', shorter.add.length === 0);
    check('and is not a plain shift', !shorter.shiftOnly);

    // A single day is a real trip, not a zero-length one.
    const single = planRange('2026-09-28', '2026-09-28', []);
    check('one day is length 1', single.length === 1 && single.add.join(',') === '1');

    // Gaps left by deleting a day in the middle are filled, not ignored.
    const gappy = planRange('2026-09-28', '2026-10-02', [1, 2, 5]);
    check('fills a gap in the middle', gappy.add.join(',') === '3,4', gappy.add.join(','));
    check('and keeps day 5', !gappy.beyond.includes(5));

    // The saved range, against the days that actually exist.
    check('a full range has a one-based length', tripLength('2026-09-28', '2026-10-07') === 10);
    check('one date is not a range', tripLength('2026-09-28', null) === null);
    check('a single date is a one-day trip', tripLength('2026-09-28', '2026-09-28') === 1);
    check('days past the end are flagged',
        daysBeyondRange([1, 2, 3, 4, 5, 6, 7, 8], '2026-09-28', '2026-10-01').join(',') === '5,6,7,8');
    check('a trip inside its dates flags nothing',
        daysBeyondRange([1, 2, 3], '2026-09-28', '2026-10-01').length === 0);
    check('no end date flags nothing',
        daysBeyondRange([1, 2, 3, 99], '2026-09-28', null).length === 0);
}

console.log('\nTravel legs');
{
    const leg = {
        id: 1, day_id: 1, mode: 'flight' as const, from_text: 'DPS', to_text: 'SIN',
        depart_time: '14:05', arrive_time: '16:50', confirmation_ref: null, notes: null,
        from_lat: -8.7465, from_lng: 115.1674, to_lat: 1.3576, to_lng: 103.9885,
    };
    const ends = legEnds(leg);
    check('a pinned leg has two ends', ends?.from.lat === -8.7465 && ends?.to.lng === 103.9885);
    check('half a leg has none', legEnds({ ...leg, to_lat: null }) === null);
    check('an unlooked-up leg has none', legEnds({ ...leg, from_lat: null, from_lng: null }) === null);

    const arc = arcPoints(ends!.from, ends!.to, 0.22, 24);
    check('the arc starts and ends on the leg',
        arc[0].lat === ends!.from.lat && arc[0].lng === ends!.from.lng
        && arc[arc.length - 1].lat === ends!.to.lat && arc[arc.length - 1].lng === ends!.to.lng);
    check('and is sampled into the steps asked for', arc.length === 25, String(arc.length));

    // The middle must be off the straight line — that is the whole point.
    const midpoint = { lat: (ends!.from.lat + ends!.to.lat) / 2, lng: (ends!.from.lng + ends!.to.lng) / 2 };
    const apex = arc[12];
    const bowed = distanceKm(apex, midpoint);
    check('the middle bows away from the straight line', bowed > 100, `${Math.round(bowed)} km`);

    // A flatter curve bows less; a straight one barely at all.
    const flat = arcPoints(ends!.from, ends!.to, 0.05, 24);
    const flatBow = distanceKm(flat[12], midpoint);
    check('a smaller curve bows less', flatBow < bowed, `${Math.round(flatBow)} km vs ${Math.round(bowed)} km`);

    // Reversing the leg bows to the other side, so an outbound and a return
    // separate instead of drawing over each other.
    const back = arcPoints(ends!.to, ends!.from, 0.22, 24);
    const apart = distanceKm(apex, back[12]);
    check('the return leg arcs the other way', apart > 100, `${Math.round(apart)} km apart`);

    // Degenerate input must not produce NaN points.
    const same = arcPoints({ lat: 1, lng: 2 }, { lat: 1, lng: 2 });
    check('two points in the same place are a line, not a NaN',
        same.length === 2 && same.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)));

    check('every mode has a style',
        ['flight', 'boat', 'car', 'train', 'walk']
            .every((m) => travelModeMeta(m).dash.length > 0 && travelModeMeta(m).curve > 0));
    check('an unknown mode falls back to flight', travelModeMeta('teleport').key === 'flight');
    check('a flight bows more than a walk',
        travelModeMeta('flight').curve > travelModeMeta('walk').curve);
}

console.log('\nCalendar export');
{
    const stamp = '20260817T120000Z';
    const ics = buildIcs([{
        uid: 'a@b',
        summary: 'Day 1 — Fly out; then, dinner',
        description: 'Line one\nLine two',
        date: '2026-09-28',
    }], stamp, 'Our Honeymoon');

    check('is a calendar', ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.trimEnd().endsWith('END:VCALENDAR'));
    check('uses CRLF', ics.includes('\r\n') && !/[^\r]\n/.test(ics));
    check('names the calendar', ics.includes('X-WR-CALNAME:Our Honeymoon'));
    check('escapes semicolons and commas',
        ics.includes('SUMMARY:Day 1 — Fly out\\; then\\, dinner'),
        ics.split('\r\n').find((l) => l.startsWith('SUMMARY')));
    check('escapes newlines', ics.includes('Line one\\nLine two'));
    check('an all-day event is a DATE', ics.includes('DTSTART;VALUE=DATE:20260928'));
    check('and ends the next day', ics.includes('DTEND;VALUE=DATE:20260929'));

    const timed = buildIcs([{
        uid: 'c@d', summary: 'Flight', date: '2026-09-28', start: '09:30', end: '12:45',
    }], stamp);
    check('a timed event carries its times',
        timed.includes('DTSTART:20260928T093000') && timed.includes('DTEND:20260928T124500'));

    const open = buildIcs([{ uid: 'e@f', summary: 'Dinner', date: '2026-09-28', start: '19:00' }], stamp);
    check('no end time means an hour', open.includes('DTEND:20260928T200000'));

    const long = buildIcs([{ uid: 'g@h', summary: 'x'.repeat(200), date: '2026-09-28' }], stamp);
    check('long lines are folded',
        long.split('\r\n').every((line) => line.length <= 75), 'a line ran past 75 octets');

    // A trip with no dates cannot be a calendar.
    check('no start date means no events',
        tripEvents({ start_date: null, title: 'T' }, [], () => undefined).length === 0);

    const day: Day = {
        id: 4, day_number: 2, title: 'Ubud', base_place_id: null, notes: 'bring cash',
        stops: [
            { id: 1, day_id: 4, place_id: 9, custom_label: null, start_time: '09:30', notes: null, sort_order: 0 },
            { id: 2, day_id: 4, place_id: null, custom_label: 'Lunch', start_time: null, notes: null, sort_order: 1 },
        ],
        travel: [{
            id: 7, day_id: 4, mode: 'car', from_text: 'Canggu', to_text: 'Ubud',
            depart_time: '08:00', arrive_time: '09:15', confirmation_ref: 'XY12', notes: null,
            from_lat: null, from_lng: null, to_lat: null, to_lng: null,
        }],
    };
    const events = tripEvents({ start_date: '2026-09-28', title: 'T' }, [day],
        (id) => (id === 9 ? 'Monkey Forest' : undefined));
    check('a day becomes one all-day event',
        events.filter((e) => !e.start).length === 1);
    check('on its real date', events[0].date === '2026-09-29', events[0].date);
    check('carrying its stops', (events[0].description ?? '').includes('Monkey Forest')
        && (events[0].description ?? '').includes('Lunch'));
    check('and its notes', (events[0].description ?? '').includes('bring cash'));
    check('travel legs become timed events',
        events.some((e) => e.summary.startsWith('Car') && e.start === '08:00'));
    check('a timed stop gets its own event',
        events.some((e) => e.summary === 'Monkey Forest' && e.start === '09:30'));
    check('an untimed stop does not',
        !events.some((e) => e.summary === 'Lunch' && e.start));
    check('every event has a unique id',
        new Set(events.map((e) => e.uid)).size === events.length);
}

console.log('\nSearch');
{
    const places = [
        makePlace(1, 'Ubud Palace', null, null),
        makePlace(2, 'Cafe Lotus', null, null),
        makePlace(3, 'Nowhere', null, null),
    ];
    places[2].description = 'near ubud somewhere';
    const regions: Region[] = [{
        id: 1, name: 'Ubud', country: 'Indonesia', description: null,
        center_lat: null, center_lng: null, sort_order: 0,
    }];
    const notes: GuideNote[] = [{
        id: 1, title: 'Money', body: 'ATMs in Ubud', category: 'General', source: null, sort_order: 0,
    }];
    const todos: TodoItem[] = [{
        id: 1, text: 'Book Ubud driver', done: false, result: null,
        category: 'Transport', due_on: null, sort_order: 0,
    }];
    const days: Day[] = [{
        id: 1, day_number: 3, title: 'Ubud day', base_place_id: null, notes: null,
        stops: [], travel: [],
    }];
    const all = { places, notes, todos, days, regions };

    check('a short term finds nothing', searchHoneymoon('u', all).length === 0);
    const hits = searchHoneymoon('ubud', all);
    check('searches every kind at once',
        new Set(hits.map((h) => h.kind)).size >= 4, hits.map((h) => h.kind).join(','));
    check('an exact title wins', hits[0].label === 'Ubud', hits[0].label);
    check('a body-only match ranks last',
        hits[hits.length - 1].label === 'Nowhere', hits[hits.length - 1].label);
    check('is case-insensitive', searchHoneymoon('UBUD', all).length === hits.length);
    check('a miss is empty', searchHoneymoon('zzzz', all).length === 0);
    check('respects the limit', searchHoneymoon('ubud', all, 2).length === 2);
    check('finds a place by name', searchHoneymoon('lotus', all)[0].label === 'Cafe Lotus');
    check('a day hit is labelled with its number',
        searchHoneymoon('ubud day', all).some((h) => h.kind === 'day' && h.label.includes('Day 3')));

    // Two hundred places must not bury the one to-do that matches.
    const crowded = {
        ...all,
        places: Array.from({ length: 40 }, (_, i) => makePlace(100 + i, `Ubud place ${i}`, null, null)),
    };
    const spread = searchHoneymoon('ubud', crowded, 6);
    check('every kind gets a seat before score fills the rest',
        new Set(spread.map((h) => h.kind)).size === 5, spread.map((h) => h.kind).join(','));
    check('and the to-do is one of them',
        spread.some((h) => h.kind === 'todo'), spread.map((h) => h.label).join(' | '));
    check('the best match is still first',
        spread[0].kind === 'region' && spread[0].label === 'Ubud', spread[0].label);
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
        rating: null, is_excursion: false, image_url: null, country: '', rank: null,
    };
}

function makeStop(id: number, placeId: number | null): Stop {
    return {
        id, day_id: 1, place_id: placeId, custom_label: null,
        start_time: null, notes: null, sort_order: id,
    };
}
