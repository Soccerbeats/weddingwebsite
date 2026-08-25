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
    arcPoints, arrivalsOn, legArrivalDay, legEnds, legIsOvernight, travelModeMeta,
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
    baseRun, dayNumberFor, emergencyFor, minutesOf, navUrl, neighbourDays, nextStop,
    planForDay, planForToday, standingOf, stopWindow, timeOf,
} from '../src/lib/honeymoonToday';
import {
    isAfterDark, localTimeIn, nominalZone, sunTimes, sunTimesLocal,
} from '../src/lib/honeymoonSun';
import {
    dayOfWeek, describeHours, openAt, parseHours, stopIsOutsideHours,
} from '../src/lib/honeymoonHours';
import {
    addDaysIso, buildTimeline, estimateHop, formatDuration, instantOf, isWalkable,
    legRealMinutes, zoneOffsetMinutes,
} from '../src/lib/honeymoonTimeline';
import {
    buildBudget, completenessOf, convert, deadlinesOf, describeRate, formatMoney,
    nightsAtBase, unbookedDays,
} from '../src/lib/honeymoonBudget';
import {
    assignRegions, findDuplicates, nearbyPlaces, parseImport, placesToCsv, placesToGeoJson,
    placesToKml, providerOf, regionForPlace, suggestDay,
} from '../src/lib/honeymoonPlaces';
import { markdownToText, parseInline, parseMarkdown } from '../src/lib/honeymoonMarkdown';
import {
    bucketTodos, conflictsOf, dueSoon, packingSuggestions, stayStretches,
} from '../src/lib/honeymoonChecks';
import {
    coordsFromMapsUrl, coordsFromPair, nameFromMapsUrl,
} from '../src/app/api/admin/honeymoon/geocode/route';
import { SEED_PLACES, SEED_REGIONS, SEED_NOTES } from '../src/lib/honeymoonSeed';

let failures = 0;
let checks = 0;

/*
 * Fixture defaults, one per row type.
 *
 * Spread rather than repeated: these objects are full rows, and every column
 * added to the schema would otherwise have to be typed into a dozen literals
 * that do not care about it. The literals below name only the fields their
 * check is about.
 */
const PLACE_DEFAULTS = {
    region_id: null, category: 'misc', address: null, description: null,
    status: 'idea' as const, price_note: null, links: [], photos: [],
    source: 'manual', needs_review: false, sort_order: 0,
    rating: null, is_excursion: false, image_url: null, country: '', rank: null,
    archived: false, cost: null, cost_currency: null, cost_per: 'total' as const,
    opening_hours: null, best_time: null, ratings: {}, star_rating: null,
    price_range: null, amenities: [],
};

const STOP_DEFAULTS = {
    place_id: null, custom_label: null, start_time: null, notes: null, sort_order: 0,
    duration_minutes: null, outcome: null, favourite: false, journal: null, photos: [],
};

const LEG_DEFAULTS = {
    mode: 'flight' as const, from_text: null, to_text: null,
    depart_time: null, arrive_time: null, confirmation_ref: null, notes: null,
    arrive_day_offset: 0,
    from_lat: null, from_lng: null, to_lat: null, to_lng: null,
    sort_order: 0, cost: null, cost_currency: null, booked_by: null,
    depart_tz: null, arrive_tz: null, flight_no: null,
    from_terminal: null, to_terminal: null, aircraft: null,
};

const REGION_DEFAULTS = {
    country: '', description: null, center_lat: null, center_lng: null,
    sort_order: 0, boundary: null,
};

const NOTE_DEFAULTS = {
    body: '', category: null, source: null, sort_order: 0, region_id: null, place_id: null,
};

const TODO_DEFAULTS = {
    done: false, result: null, category: null, due_on: null, sort_order: 0,
    kind: 'task' as const, person: null, place_id: null, day_id: null,
};

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
        f('250', 'THB') === 'THB 250 per night', f('250','THB'));
    check('rupiah has a symbol', f('250', 'IDR') === 'Rp250 per night', f('250','IDR'));
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
        ...LEG_DEFAULTS,
        id: 1, day_id: 1, from_text: 'DPS', to_text: 'SIN',
        depart_time: '14:05', arrive_time: '16:50',
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

    // ---- legs that land on another day ----
    const redEye = { ...leg, id: 2, depart_time: '23:40', arrive_time: '06:20', arrive_day_offset: 1 };
    check('a same-day leg lands on its own day', legArrivalDay(leg, 3) === 3);
    check('a red-eye lands on the next one', legArrivalDay(redEye, 3) === 4);
    check('a long haul with a layover lands further out',
        legArrivalDay({ ...redEye, arrive_day_offset: 2 }, 3) === 5);
    check('a negative offset is not a thing', legArrivalDay({ arrive_day_offset: -2 }, 3) === 3);
    check('only a later arrival counts as overnight',
        legIsOvernight(redEye) && !legIsOvernight(leg));

    const dayWith = (n: number, legs: typeof leg[]) => ({
        id: n, day_number: n, title: null, base_place_id: null, notes: null,
        stops: [], travel: legs,
    });
    const trip = [dayWith(3, [redEye, leg]), dayWith(4, []), dayWith(5, [])];
    check('the arrival day knows what lands on it',
        arrivalsOn(trip, 4).length === 1 && arrivalsOn(trip, 4)[0].fromDay.day_number === 3);
    check('the same-day leg is not counted as an arrival elsewhere',
        arrivalsOn(trip, 5).length === 0);
    check('and the departure day does not list its own leg as an arrival',
        arrivalsOn(trip, 3).length === 0);
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

    // An overnight flight: the end time is earlier on the clock than the start,
    // which is only legal because it is on the next date.
    const redEyeIcs = buildIcs([{
        uid: 'i@j', summary: 'Flight', date: '2026-09-28', endDate: '2026-09-29',
        start: '23:40', end: '06:20',
    }], stamp);
    check('an overnight event ends on the next date',
        redEyeIcs.includes('DTSTART:20260928T234000')
        && redEyeIcs.includes('DTEND:20260929T062000'),
        redEyeIcs.split('\r\n').filter((l) => l.startsWith('DT')).join(' '));

    // An endDate equal to the date is the same as not giving one at all.
    const sameDay = buildIcs([{
        uid: 'k@l', summary: 'Flight', date: '2026-09-28', endDate: '2026-09-28',
        start: '09:30', end: '12:45',
    }], stamp);
    check('a same-date endDate changes nothing', sameDay.includes('DTEND:20260928T124500'));

    const long = buildIcs([{ uid: 'g@h', summary: 'x'.repeat(200), date: '2026-09-28' }], stamp);
    check('long lines are folded',
        long.split('\r\n').every((line) => line.length <= 75), 'a line ran past 75 octets');

    // A trip with no dates cannot be a calendar.
    check('no start date means no events',
        tripEvents({ start_date: null, title: 'T' }, [], () => undefined).length === 0);

    const day: Day = {
        id: 4, day_number: 2, title: 'Ubud', base_place_id: null, notes: 'bring cash',
        stops: [
            { ...STOP_DEFAULTS, id: 1, day_id: 4, place_id: 9, start_time: '09:30' },
            { ...STOP_DEFAULTS, id: 2, day_id: 4, custom_label: 'Lunch', sort_order: 1 },
        ],
        travel: [{
            ...LEG_DEFAULTS,
            id: 7, day_id: 4, mode: 'car', from_text: 'Canggu', to_text: 'Ubud',
            depart_time: '08:00', arrive_time: '09:15', confirmation_ref: 'XY12',
        }],
    };
    const overnight: Day = {
        id: 9, day_number: 3, title: 'Fly home', base_place_id: null, notes: null, stops: [],
        travel: [{
            ...LEG_DEFAULTS,
            id: 11, day_id: 9, from_text: 'DPS', to_text: 'LAX',
            depart_time: '23:40', arrive_time: '06:20', arrive_day_offset: 1,
        }],
    };
    const overnightEvents = tripEvents({ start_date: '2026-09-28', title: 'T' }, [overnight],
        () => undefined);
    const flight = overnightEvents.find((e) => e.uid.startsWith('honeymoon-travel'));
    check('an overnight leg starts on its departure day', flight?.date === '2026-09-30');
    check('and ends on the day it lands', flight?.endDate === '2026-10-01');
    check('and says so in the summary', /\(\+1 day\)/.test(flight?.summary ?? ''), flight?.summary);

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
        ...REGION_DEFAULTS, id: 1, name: 'Ubud', country: 'Indonesia',
    }];
    const notes: GuideNote[] = [{
        ...NOTE_DEFAULTS, id: 1, title: 'Money', body: 'ATMs in Ubud', category: 'General',
    }];
    const todos: TodoItem[] = [{
        ...TODO_DEFAULTS, id: 1, text: 'Book Ubud driver', category: 'Transport',
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

console.log('\nTrip mode — today');
{
    const trip = {
        id: 1, title: 'Honeymoon', start_date: '2026-09-12', end_date: '2026-09-21',
        home_currency: 'USD', notes: null, focus_country: '', budget: null,
        partner_names: 'Austin, Heaven', info: {}, time_format: '24h' as const,
        distance_unit: 'km' as const, phase: 'planning' as const,
    };

    check('minutes parse off a stored time', minutesOf('09:30') === 570);
    check('a malformed time is not a time',
        minutesOf('9:5') === null && minutesOf('25:00') === null && minutesOf(null) === null);
    check('and come back as one', timeOf(570) === '09:30' && timeOf(0) === '00:00');
    check('past midnight wraps rather than lying', timeOf(1500) === '01:00');

    check('day one is the start date', dayNumberFor(trip, '2026-09-12', 10) === 1);
    check('and day ten is nine days later', dayNumberFor(trip, '2026-09-21', 10) === 10);
    check('a date before the trip is no day', dayNumberFor(trip, '2026-09-11', 10) === null);
    check('a date past the plan is no day', dayNumberFor(trip, '2026-09-22', 10) === null);

    check('before the trip', standingOf(trip, 10, '2026-09-01') === 'before');
    check('during it', standingOf(trip, 10, '2026-09-15') === 'during');
    check('on the last day it is still during', standingOf(trip, 10, '2026-09-21') === 'during');
    check('after it', standingOf(trip, 10, '2026-09-30') === 'after');
    check('an undated trip stands nowhere',
        standingOf({ start_date: null, end_date: null }, 10, '2026-09-15') === 'undated');
    check('dates longer than the plan still count as during',
        standingOf({ start_date: '2026-09-12', end_date: '2026-09-25' }, 3, '2026-09-20') === 'during');

    const dayRows: Day[] = [1, 2, 3, 4, 5].map((n) => ({
        id: n, day_number: n, title: null, notes: null,
        base_place_id: n <= 2 ? 100 : 200,
        stops: [], travel: [],
    }));
    check('a base run counts the nights at one place',
        baseRun(dayRows, 4)?.nights === 3 && baseRun(dayRows, 4)?.night === 2);
    check('and the first night of a run is night one', baseRun(dayRows, 1)?.night === 1);
    check('a day with no base has no run',
        baseRun([{ ...dayRows[0], base_place_id: null }], 1) === null);

    const amankila = makePlace(200, 'Amankila', -8.4788, 115.5628);
    const warung = makePlace(300, 'Warung Ibu Oka', -8.5069, 115.2625);
    const payload = {
        trip,
        categories: [], regions: [], notes: [], todos: [], documents: [], comments: [],
        views: [], rates: [], shares: [], price_checks: [], archives: [],
        bookings: [{
            id: 1, place_id: 200, travel_id: null, stop_id: null, kind: 'stay' as const,
            provider: 'Direct', confirmation: 'AMK-9931', url: null, contact: null,
            check_in: '2026-09-15', check_out: '2026-09-18', check_in_time: '14:00',
            check_out_time: '12:00', cost: 2400, cost_currency: 'USD', cost_paid: 600,
            deposit_due_on: null, cancel_by: '2026-09-08', party_size: 2, dress_code: null,
            paid: false, documents: [], notes: null, created_at: null,
        }],
        places: [amankila, warung],
        days: [
            { ...dayRows[0], base_place_id: 200, travel: [{
                ...LEG_DEFAULTS, id: 9, day_id: 1, from_text: 'DPS', to_text: 'Ubud',
                mode: 'car' as const, depart_time: '15:00',
            }] },
            { ...dayRows[1], base_place_id: 200, stops: [
                { ...STOP_DEFAULTS, id: 21, day_id: 2, place_id: 300, start_time: '11:00',
                  duration_minutes: 90, sort_order: 0 },
                { ...STOP_DEFAULTS, id: 22, day_id: 2, custom_label: 'Sunset walk',
                  start_time: '18:00', sort_order: 1 },
                { ...STOP_DEFAULTS, id: 23, day_id: 2, custom_label: 'Somewhere, sometime',
                  sort_order: 2 },
            ] },
            { ...dayRows[2], base_place_id: 200 },
        ],
    };

    const dayTwo = planForDay(payload, 2);
    check('the day resolves its stops in order',
        dayTwo.stops.map((s) => s.label).join(' | ')
        === 'Warung Ibu Oka | Sunset walk | Somewhere, sometime');
    check('a stop on a pinned place carries its coordinates',
        dayTwo.stops[0].lat === -8.5069 && dayTwo.stops[0].lng === 115.2625);
    check('a duration closes the window', dayTwo.stops[0].until === '12:30');
    check('no duration means no window', dayTwo.stops[1].until === null);
    check('the base comes back as the place, with the night counted',
        dayTwo.base?.name === 'Amankila' && dayTwo.baseNight === 2 && dayTwo.baseNights === 3);
    check("the base's booking is attached to its stops or place",
        planForDay(payload, 2).stops.every((s) => s.booking === null || s.booking.confirmation === 'AMK-9931'));
    check('a window reads as a range',
        stopWindow(dayTwo.stops[0], '24h') === '11:00 – 12:30');
    check('and in 12-hour form when that is the setting',
        stopWindow(dayTwo.stops[0], '12h') === '11:00 AM – 12:30 PM',
        stopWindow(dayTwo.stops[0], '12h') ?? '');
    check('an untimed stop has no window', stopWindow(dayTwo.stops[2], '24h') === null);

    const dayOne = planForDay(payload, 1);
    check('a leg leaving today is a departure',
        dayOne.departures.length === 1 && dayOne.departures[0].to_text === 'Ubud');
    check('and is not counted on the day it does not land on',
        dayTwo.departures.length === 0 && dayTwo.arrivals.length === 0);

    const overnight = {
        ...payload,
        days: payload.days.map((d, i) => (i !== 0 ? d : {
            ...d,
            travel: [{ ...LEG_DEFAULTS, id: 31, day_id: 1, from_text: 'SIN', to_text: 'DPS',
                depart_time: '23:30', arrive_time: '05:40', arrive_day_offset: 1 }],
        })),
    };
    check('a red-eye lands on the next day',
        planForDay(overnight, 2).arrivals.length === 1
        && planForDay(overnight, 2).arrivals[0].fromDayNumber === 1);

    check('mid-trip, today is the day the date says',
        planForToday(payload, '2026-09-13').dayNumber === 2);
    check('before the trip it leads with day one, and counts down',
        planForToday(payload, '2026-09-01').dayNumber === 1
        && planForToday(payload, '2026-09-01').daysUntil === 11);
    check('after the trip it shows the last planned day',
        planForToday(payload, '2026-10-01').dayNumber === 3);
    check('a date inside the dates but past the rows shows the last row',
        planForToday({ ...payload, trip: { ...trip, end_date: '2026-09-30' } }, '2026-09-25')
            .dayNumber === 3);
    check('a trip with no days at all has no day',
        planForToday({ ...payload, days: [] }, '2026-09-13').day === null);

    check('the next thing is the next timed stop',
        nextStop(dayTwo.stops, 600)?.label === 'Warung Ibu Oka');
    check('and after it, the one after', nextStop(dayTwo.stops, 720)?.label === 'Sunset walk');
    check('nothing left today is nothing', nextStop(dayTwo.stops, 1300) === null);
    check('an untimed stop is never "next"',
        nextStop([dayTwo.stops[2]], 0) === null);

    check('the arrows know their neighbours',
        neighbourDays(payload.days, 2).previous === 1 && neighbourDays(payload.days, 2).next === 3);
    check('and the first day has nothing before it',
        neighbourDays(payload.days, 1).previous === null);

    check('a pinned stop navigates by coordinate',
        navUrl(warung) === 'https://www.google.com/maps/dir/?api=1&destination=-8.5069,115.2625');
    check('an unpinned one navigates by name and address',
        navUrl({ name: 'Ibu Oka', address: 'Ubud' })
        === 'https://www.google.com/maps/dir/?api=1&destination=Ibu%20Oka%2C%20Ubud');

    check('Indonesia has its own numbers',
        emergencyFor('Indonesia').numbers[0].number === '112'
        && emergencyFor('Indonesia').numbers.some((n) => n.label === 'Ambulance'));
    check("Singapore's police and ambulance differ",
        emergencyFor('Singapore').numbers.map((n) => n.number).join(',') === '999,995,995');
    check('an unknown country falls back to 112, and says it is a guess',
        emergencyFor('Ruritania').guessed && emergencyFor('Ruritania').numbers[0].number === '112');
    check('so does no country at all', emergencyFor(null).guessed);
}

console.log('\nSun');
{
    // Bali, mid-September: sunrise a little after six, sunset a little after
    // six, because it is eight degrees off the equator.
    const bali = sunTimesLocal(-8.65, 115.2167, '2026-09-15', 'Asia/Makassar');
    check('Bali sunrise is around 06:1x', /^06:[0-2]\d$/.test(bali.sunrise ?? ''), bali.sunrise ?? 'null');
    check('and sunset around 18:2x', /^18:[0-3]\d$/.test(bali.sunset ?? ''), bali.sunset ?? 'null');
    check('neither is a polar case', bali.polar === null);

    // London in June: a long day, and the zone is BST not GMT.
    const london = sunTimesLocal(51.5072, -0.1276, '2026-06-21', 'Europe/London');
    check('midsummer in London starts before five', (london.sunrise ?? '') < '05:00', london.sunrise ?? '');
    check('and ends after nine', (london.sunset ?? '') > '21:00', london.sunset ?? '');

    const tromso = sunTimes(69.6492, 18.9553, '2026-06-21');
    check('the midnight sun has no sunset', tromso.polar === 'day' && tromso.sunset === null);
    const polarNight = sunTimes(69.6492, 18.9553, '2026-12-21');
    check('and the polar night has no sunrise', polarNight.polar === 'night');

    check('a UTC instant reads in its zone',
        localTimeIn(new Date('2026-09-15T10:00:00Z'), 'Asia/Makassar') === '18:00');
    check('an unknown zone falls back to UTC rather than throwing',
        localTimeIn(new Date('2026-09-15T10:00:00Z'), 'Mars/Olympus') === '10:00');
    check('a longitude has a nominal zone', nominalZone(115.2) === 'Etc/GMT-8');
    check('and Greenwich is UTC', nominalZone(0) === 'UTC');

    check('dinner after sunset is after dark', isAfterDark('19:30', '18:20'));
    check('and lunch is not', !isAfterDark('12:30', '18:20'));
    check('no sunset means no verdict', !isAfterDark('19:30', null));
}

console.log('\nOpening hours');
{
    check('24/7 is always open', openAt('24/7', 3, 3 * 60) === 'open');
    const office = 'Mo-Fr 09:00-17:00; Sa 10:00-14:00; Su off';
    check('a weekday morning is open', openAt(office, 3, 10 * 60) === 'open');
    check('a weekday evening is closed', openAt(office, 3, 19 * 60) === 'closed');
    check('Saturday afternoon is closed', openAt(office, 6, 15 * 60) === 'closed');
    check('Saturday lunchtime is open', openAt(office, 6, 12 * 60) === 'open');
    check('Sunday is closed', openAt(office, 0, 12 * 60) === 'closed');
    check('a day range that wraps includes both ends',
        openAt('Sa-Mo 08:00-12:00', 0, 9 * 60) === 'open'
        && openAt('Sa-Mo 08:00-12:00', 2, 9 * 60) === 'closed');
    check('a split day handles both windows',
        openAt('Mo-Su 08:00-12:00,17:00-21:00', 1, 18 * 60) === 'open'
        && openAt('Mo-Su 08:00-12:00,17:00-21:00', 1, 14 * 60) === 'closed');
    check('a window past midnight opens the small hours of the next day',
        openAt('Fr 20:00-02:00', 6, 1 * 60) === 'open');
    check('and not the small hours of the same day',
        openAt('Fr 20:00-02:00', 5, 1 * 60) === 'closed');

    check('a spec with public holidays is not guessed at',
        openAt('Mo-Fr 09:00-17:00; PH off', 3, 10 * 60) === 'unknown');
    check('nor is one with month ranges',
        openAt('Apr-Oct Mo-Su 09:00-18:00', 3, 10 * 60) === 'unknown');
    check('nor a sunset rule', openAt('Mo-Su 09:00-sunset', 3, 10 * 60) === 'unknown');
    check('nor nonsense', openAt('open when we feel like it', 3, 600) === 'unknown');
    check('nor nothing at all', openAt(null, 3, 600) === 'unknown' && parseHours('') === null);

    check('a date knows its weekday', dayOfWeek('2026-09-15') === 2);
    check('24/7 describes itself', describeHours('24/7') === 'Open all hours');
    check('and a spec is tidied for reading',
        describeHours('Mo-Fr 09:00-17:00; Sa 10:00-14:00')
        === 'Mo-Fr 09:00-17:00 · Sa 10:00-14:00');

    check('a stop outside the hours is flagged',
        stopIsOutsideHours(office, '2026-09-15', '19:00'));
    check('a stop inside them is not',
        !stopIsOutsideHours(office, '2026-09-15', '10:00'));
    check('an unparseable spec never flags anything',
        !stopIsOutsideHours('Apr-Oct 09:00-18:00', '2026-09-15', '23:00'));
}

console.log('\nDay timeline');
{
    const hotel = makePlace(1, 'Hotel', -8.5069, 115.2625);
    const nearby = makePlace(2, 'Cafe next door', -8.5074, 115.2631);
    const far = makePlace(3, 'Waterfall', -8.3405, 115.3220);
    const places = new Map([[1, hotel], [2, nearby], [3, far]]);

    check('a hop between two pins is estimated', (estimateHop(hotel, far)?.seconds ?? 0) > 0);
    check('and is labelled an estimate', estimateHop(hotel, far)?.source === 'estimate');
    check('an unpinned end has no hop',
        estimateHop(hotel, makePlace(9, 'Nowhere', null, null)) === null);
    check('a stroll is walkable', isWalkable(hotel, nearby));
    check('a waterfall is not', !isWalkable(hotel, far));

    const stops: Stop[] = [
        { ...STOP_DEFAULTS, id: 1, day_id: 1, place_id: 2, start_time: '09:00',
          duration_minutes: 60, sort_order: 0 },
        { ...STOP_DEFAULTS, id: 2, day_id: 1, place_id: 3, start_time: '10:15',
          duration_minutes: 120, sort_order: 1 },
        { ...STOP_DEFAULTS, id: 3, day_id: 1, place_id: 1, sort_order: 2 },
    ];

    // A fixed 45-minute road time, so the arithmetic is checkable.
    const road = () => ({ seconds: 45 * 60, meters: 30_000, source: 'road' as const });
    const timeline = buildTimeline(stops, places, hotel, road);
    check('the first stop starts when it says', timeline.rows[0].arrive === '09:00');
    check('and leaves after its duration', timeline.rows[0].leave === '10:00');
    check('the second cannot be reached by 10:15',
        timeline.rows[1].late && timeline.rows[1].lateBy === 30, String(timeline.rows[1].lateBy));
    check('so its arrival is the honest one', timeline.rows[1].arrive === '10:45');
    check('and its departure follows from that', timeline.rows[1].leave === '12:45');
    check('an untimed stop takes the time the day reached',
        timeline.rows[2].arrive === '13:30', timeline.rows[2].arrive ?? 'null');
    check('the day totals its driving', timeline.driveMinutes === 90);
    check('road times are not estimates', !timeline.estimated);
    check('the walkable stop is flagged, the far one is not',
        timeline.rows[0].walkable && !timeline.rows[1].walkable);
    check('lateness is counted for the day card', timeline.lateCount === 1);

    const relaxed = buildTimeline([
        { ...STOP_DEFAULTS, id: 1, day_id: 1, place_id: 2, start_time: '09:00',
          duration_minutes: 30, sort_order: 0 },
        { ...STOP_DEFAULTS, id: 2, day_id: 1, place_id: 3, start_time: '14:00', sort_order: 1 },
    ], places, hotel, road);
    check('a day with time to spare flags nothing',
        relaxed.lateCount === 0 && relaxed.overlapCount === 0);
    check('and the later stop keeps the time it was given', relaxed.rows[1].arrive === '14:00');

    const overlapping = buildTimeline([
        { ...STOP_DEFAULTS, id: 1, day_id: 1, place_id: 2, start_time: '09:00',
          duration_minutes: 180, sort_order: 0 },
        { ...STOP_DEFAULTS, id: 2, day_id: 1, place_id: 2, start_time: '10:00', sort_order: 1 },
    ], places, hotel, road);
    check('two stops that overlap are flagged', overlapping.overlapCount === 1);

    check('with no road times, the estimate stands in and says so',
        buildTimeline(stops, places, hotel).estimated);
    check('a long day of driving is flagged',
        buildTimeline([
            { ...STOP_DEFAULTS, id: 1, day_id: 1, place_id: 1, start_time: '08:00', sort_order: 0 },
            { ...STOP_DEFAULTS, id: 2, day_id: 1, place_id: 3, sort_order: 1 },
            { ...STOP_DEFAULTS, id: 3, day_id: 1, place_id: 1, sort_order: 2 },
        ], places, hotel, () => ({ seconds: 100 * 60, meters: 90_000, source: 'road' as const }))
            .longDrive);

    check('a drive reads as hours and minutes', formatDuration(6000) === '1 h 40 m');
    check('a round hour drops the minutes', formatDuration(7200) === '2 h');
    check('and a short one is minutes', formatDuration(900) === '15 min');
}

console.log('\nTime zones on a leg');
{
    check('Bali is eight hours ahead in September',
        zoneOffsetMinutes('Asia/Makassar', new Date('2026-09-15T00:00:00Z')) === 480);
    check('London is on summer time in June',
        zoneOffsetMinutes('Europe/London', new Date('2026-06-21T12:00:00Z')) === 60);
    check('and on GMT in January',
        zoneOffsetMinutes('Europe/London', new Date('2026-01-21T12:00:00Z')) === 0);

    const instant = instantOf('2026-09-15', '14:05', 'Asia/Makassar');
    check('a local wall time resolves to the right instant',
        instant?.toISOString() === '2026-09-15T06:05:00.000Z', instant?.toISOString() ?? 'null');

    // DPS 14:05 → SIN 16:50 is a 2h45 flight: same clock offset, both UTC+8.
    check('a same-zone leg is its clock difference',
        legRealMinutes({
            depart_time: '14:05', arrive_time: '16:50', arrive_day_offset: 0,
            depart_tz: 'Asia/Makassar', arrive_tz: 'Asia/Singapore',
        }, '2026-09-15') === 165);

    /*
     * SIN 09:20 → LAX 09:00 the same calendar day: fifteen hours in the air and
     * the clock says minus twenty minutes. This is the case the zones exist for,
     * and the one the Travel tab used to render as a negative flight.
     */
    check('a westbound leg that arrives "before" it left is still fifteen hours',
        legRealMinutes({
            depart_time: '09:20', arrive_time: '09:00', arrive_day_offset: 0,
            depart_tz: 'Asia/Singapore', arrive_tz: 'America/Los_Angeles',
        }, '2026-09-16') === 880,
        String(legRealMinutes({
            depart_time: '09:20', arrive_time: '09:00', arrive_day_offset: 0,
            depart_tz: 'Asia/Singapore', arrive_tz: 'America/Los_Angeles',
        }, '2026-09-16')));

    check('a red-eye takes its arrival offset into account',
        legRealMinutes({
            depart_time: '23:40', arrive_time: '06:20', arrive_day_offset: 1,
            depart_tz: 'Asia/Makassar', arrive_tz: 'Asia/Makassar',
        }, '2026-09-15') === 400);
    check('no zones means no answer, rather than a wrong one',
        legRealMinutes({
            depart_time: '23:40', arrive_time: '06:20', arrive_day_offset: 1,
            depart_tz: null, arrive_tz: null,
        }, '2026-09-15') === null);

    check('a date walks forward in UTC', addDaysIso('2026-09-30', 1) === '2026-10-01');
    check('and across a year', addDaysIso('2026-12-31', 1) === '2027-01-01');
}

console.log('\nBudget');
{
    const rates = [
        { id: 1, pair: 'USDIDR', rate: 15800, manual: false, fetched_at: null },
        { id: 2, pair: 'USDSGD', rate: 1.35, manual: true, fetched_at: null },
    ];
    check('the same currency converts to itself', convert(100, 'USD', 'USD', rates) === 100);
    check('a stored pair converts', convert(2, 'USD', 'IDR', rates) === 31_600);
    check('and the reverse of a stored pair', convert(31_600, 'IDR', 'USD', rates) === 2);
    check('an unknown pair does not guess', convert(10, 'JPY', 'IDR', rates) === null);
    check('a missing currency is treated as the target',
        convert(10, null, 'USD', rates) === 10);
    check('a rate describes itself', describeRate(rates[0]) === '1 USD = 15,800 IDR');
    check('and a small one keeps its decimals', describeRate(rates[1]) === '1 USD = 1.35 SGD');

    const hotel = { ...makePlace(1, 'Amankila', -8.4, 115.5), cost: 420, cost_currency: 'USD',
        cost_per: 'night' as const };
    const dive = { ...makePlace(2, 'Dive day', -8.4, 115.5), cost: 180, cost_currency: 'USD',
        cost_per: 'person' as const, is_excursion: true };
    const temple = { ...makePlace(3, 'Temple', -8.4, 115.5), cost: 50_000,
        cost_currency: 'IDR', cost_per: 'total' as const };
    const vague = { ...makePlace(4, 'Somewhere', null, null), price_note: 'about a million rupiah' };

    const days: Day[] = [1, 2, 3].map((n) => ({
        id: n, day_number: n, title: null, notes: null, base_place_id: 1, stops: [], travel: [],
    }));
    days[2].travel = [{ ...LEG_DEFAULTS, id: 1, day_id: 3, from_text: 'DPS', to_text: 'SIN',
        cost: 260, cost_currency: 'USD' }];

    check('a base is counted for the nights it is the base',
        nightsAtBase(days, 1) === 3 && nightsAtBase(days, 2) === 0);

    const payload = {
        trip: { id: 1, title: 'T', start_date: '2026-09-12', end_date: '2026-09-14',
            home_currency: 'USD', notes: null, focus_country: '', budget: 5000,
            partner_names: '', info: {}, time_format: '24h' as const,
            distance_unit: 'km' as const, phase: 'planning' as const },
        places: [hotel, dive, temple, vague],
        days,
        bookings: [],
        rates,
    };

    const budget = buildBudget(payload);
    check('a per-night stay is nights times rate', budget.stays === 1260, String(budget.stays));
    check('a per-person excursion is doubled', budget.excursions === 360, String(budget.excursions));
    check('a travel leg is counted', budget.travel === 260, String(budget.travel));
    check('a rupiah price is converted to the home currency',
        Math.abs(budget.other - 50_000 / 15_800) < 0.01, String(budget.other));
    check('the total is the sum of the lines',
        Math.abs(budget.total - (1260 + 360 + 260 + 50_000 / 15_800)) < 0.01,
        String(budget.total));
    check('a place with only a price note is counted as unpriced', budget.unpriced === 1);
    check('the biggest line is first', budget.lines[0].label === 'Amankila');
    check('the detail says how it was worked out', budget.lines[0].detail === '3 nights × 420');
    check('a budget gives a remainder',
        budget.remaining != null && Math.abs(budget.remaining - (5000 - budget.total)) < 0.01);

    const unconvertible = buildBudget({
        ...payload,
        places: [{ ...makePlace(9, 'Yen thing', null, null), cost: 9000, cost_currency: 'JPY',
            cost_per: 'total' as const }],
        days: [],
    });
    check('an unconvertible price is counted at face value and flagged',
        unconvertible.total === 9000 && unconvertible.unconverted === 1
        && unconvertible.lines[0].assumed);

    const booked = buildBudget({
        ...payload,
        bookings: [{
            id: 1, place_id: 1, travel_id: null, stop_id: null, kind: 'stay' as const,
            provider: null, confirmation: 'AMK-1', url: null, contact: null,
            check_in: null, check_out: null, check_in_time: null, check_out_time: null,
            cost: 1180, cost_currency: 'USD', cost_paid: 400, deposit_due_on: null,
            cancel_by: null, party_size: null, dress_code: null, paid: false,
            documents: [], notes: null, created_at: null,
        }],
    });
    check("a booking's cost replaces the place's estimate, rather than doubling it",
        booked.lines.filter((line) => line.label === 'Amankila').length === 1
        && booked.lines.find((line) => line.label === 'Amankila')?.amount === 1180);
    check('what has been paid is counted', booked.paid === 400);
    check('and what is left to pay', Math.abs(booked.outstanding - (booked.total - 400)) < 0.01);

    check('money reads as money', formatMoney(1260, 'USD') === '$1,260');
    check('and an unknown code still prints', formatMoney(1260, 'XXZ').includes('1,260'));
}

console.log('\nWhat still needs doing');
{
    const stay = { ...makePlace(1, 'Amankila', -8.4, 115.5), status: 'booked' as const };
    const maybe = { ...makePlace(2, 'Maybe villa', -8.4, 115.5), status: 'shortlisted' as const };
    const bookings = [{
        id: 1, place_id: 1, travel_id: null, stop_id: null, kind: 'stay' as const,
        provider: 'Direct', confirmation: 'A1', url: null, contact: null,
        check_in: null, check_out: null, check_in_time: null, check_out_time: null,
        cost: 1200, cost_currency: 'USD', cost_paid: null,
        deposit_due_on: '2026-09-01', cancel_by: '2026-09-05',
        party_size: null, dress_code: null, paid: false, documents: [], notes: null,
        created_at: null,
    }];

    const deadlines = deadlinesOf(bookings, '2026-08-25', () => 'Amankila');
    check('both dates on a booking become deadlines', deadlines.length === 2);
    check('the soonest is first',
        deadlines[0].kind === 'deposit' && deadlines[0].daysAway === 7, String(deadlines[0].daysAway));
    check('and the cancellation date follows', deadlines[1].daysAway === 11);
    check('a date already passed is not a task',
        deadlinesOf(bookings, '2026-09-10', () => 'X').length === 0);
    check('a paid deposit stops being a deadline',
        deadlinesOf([{ ...bookings[0], paid: true }], '2026-08-25', () => 'X')
            .every((entry) => entry.kind !== 'deposit'));

    const days: Day[] = [1, 2, 3].map((n) => ({
        id: n, day_number: n, title: null, notes: null,
        base_place_id: n === 1 ? 1 : n === 2 ? 2 : null,
        stops: [], travel: [],
    }));
    const payload = {
        trip: { id: 1, title: 'T', start_date: '2026-09-12', end_date: null,
            home_currency: 'USD', notes: null, focus_country: '', budget: null,
            partner_names: '', info: {}, time_format: '24h' as const,
            distance_unit: 'km' as const, phase: 'planning' as const },
        places: [stay, maybe],
        days,
        bookings,
    };

    const unbooked = unbookedDays(payload, '2026-08-25');
    check('a booked base is not flagged', !unbooked.some((entry) => entry.dayNumber === 1));
    check('a shortlisted base is', unbooked.some((entry) => entry.dayNumber === 2
        && entry.reason === 'not-booked'));
    check('and a day with no base at all is', unbooked.some((entry) => entry.dayNumber === 3
        && entry.reason === 'no-base'));
    check('a trip far in the future is not nagged about',
        unbookedDays({ ...payload, trip: { ...payload.trip, start_date: '2027-09-12' } },
            '2026-08-25').length === 0);

    const withStops: Day[] = [
        { ...days[0], stops: [makeStop(1, null), makeStop(2, null)] },
        { ...days[1], base_place_id: 1, stops: [makeStop(3, null), makeStop(4, null)] },
    ];
    const complete = completenessOf({ places: [stay], days: withStops, bookings });
    check('a fully planned pair of days scores 100', complete.score === 100, String(complete.score));
    check('and counts what it looked at',
        complete.days === 2 && complete.withBase === 2 && complete.withStops === 2);

    const moved: Day[] = [
        { ...withStops[0], base_place_id: 1 },
        { ...withStops[1], base_place_id: 2 },
    ];
    const gap = completenessOf({ places: [stay, maybe], days: moved, bookings });
    check('a change of base with no travel leg is flagged',
        gap.missingTravel.join(',') === '2', gap.missingTravel.join(','));
    check('and it costs the score', gap.score < 100);
    check('an empty trip scores zero', completenessOf({ places: [], days: [], bookings: [] }).score === 0);
}

console.log('\nFiling places, and finding them again');
{
    const ubud = { ...REGION_DEFAULTS, id: 1, name: 'Ubud', center_lat: -8.5069, center_lng: 115.2625 };
    const south = { ...REGION_DEFAULTS, id: 2, name: 'South Bali', center_lat: -8.7, center_lng: 115.17 };
    const drawn = {
        ...REGION_DEFAULTS,
        id: 3,
        name: 'Sidemen valley',
        center_lat: -8.45,
        center_lng: 115.44,
        boundary: [
            { lat: -8.40, lng: 115.40 }, { lat: -8.40, lng: 115.50 },
            { lat: -8.50, lng: 115.50 }, { lat: -8.50, lng: 115.40 },
        ],
    };

    const inUbud = makePlace(10, 'Ubud cafe', -8.51, 115.26);
    const inCanggu = makePlace(11, 'Canggu beach club', -8.65, 115.13);
    const inSidemen = makePlace(12, 'Rice terrace hut', -8.45, 115.45);
    const nowhere = makePlace(13, 'Unpinned idea', null, null);

    check('a place inside a drawn boundary is filed by geometry',
        regionForPlace(inSidemen, [ubud, south, drawn])?.how === 'boundary');
    check('and it goes to that region',
        regionForPlace(inSidemen, [ubud, south, drawn])?.regionId === 3);
    check('a place with no boundary goes to the nearest centre',
        regionForPlace(inUbud, [ubud, south])?.regionId === 1);
    check('the far one goes to the other region',
        regionForPlace(inCanggu, [ubud, south])?.regionId === 2);
    check('and it says the answer is a guess',
        regionForPlace(inCanggu, [ubud, south])?.how === 'nearest');
    check('an unpinned place is not filed at all',
        regionForPlace(nowhere, [ubud, south]) === null);

    const assignments = assignRegions([inUbud, inCanggu, nowhere], [ubud, south]);
    check('only the pinned, unfiled places are offered', assignments.length === 2);
    check('a place already filed is left alone',
        assignRegions([{ ...inUbud, region_id: 2 }], [ubud, south]).length === 0);
    check('unless you ask for everything',
        assignRegions([{ ...inUbud, region_id: 2 }], [ubud, south], true).length === 1);

    const hotel = makePlace(20, 'Hotel', -8.5069, 115.2625);
    const near = makePlace(21, 'Cafe', -8.5074, 115.2631);
    const mid = makePlace(22, 'Temple', -8.52, 115.28);
    const far = makePlace(23, 'Volcano', -8.24, 115.37);
    const nearby = nearbyPlaces(hotel, [near, mid, far, nowhere], 10);
    check('nearby is nearest first', nearby.map((n) => n.place.name).join(',') === 'Cafe,Temple');
    check('and drops what is too far', !nearby.some((n) => n.place.name === 'Volcano'));
    check('an unpinned place is never nearby', !nearby.some((n) => n.place.name === 'Unpinned idea'));
    check('a place is not near itself', !nearbyPlaces(hotel, [hotel], 10).length);
}

console.log('\nSuggesting a day');
{
    const base = { ...makePlace(1, 'Villa', -8.5069, 115.2625), category: 'stay' };
    const liked = [
        { ...makePlace(2, 'Waterfall', -8.52, 115.27), category: 'nature', rating: 'yes' as const },
        { ...makePlace(3, 'Warung', -8.51, 115.265), category: 'food', rating: 'yes' as const },
        { ...makePlace(4, 'Second warung', -8.505, 115.26), category: 'food', rating: 'yes' as const },
        { ...makePlace(5, 'Temple', -8.515, 115.28), category: 'temple', rating: null },
        { ...makePlace(6, 'Rejected spa', -8.508, 115.262), category: 'spa', rating: 'no' as const },
        { ...makePlace(7, 'Miles away', -9.2, 116.0), category: 'nature', rating: 'yes' as const },
    ];

    const suggestion = suggestDay(base, [base, ...liked], new Set<number>());
    check('a day is suggested', suggestion != null && suggestion.places.length === 3);
    check('a place you rejected is never suggested',
        !suggestion?.places.some((place) => place.name === 'Rejected spa'));
    check('nor is one miles away',
        !suggestion?.places.some((place) => place.name === 'Miles away'));
    check('nor the base itself', !suggestion?.places.some((place) => place.id === base.id));
    check('the categories are mixed rather than three warungs',
        new Set(suggestion?.places.map((place) => place.category)).size === 3,
        suggestion?.places.map((p) => p.category).join(','));
    check('it says why', (suggestion?.why ?? '').includes('within'));
    check('the loop has a length', (suggestion?.km ?? 0) > 0);
    check('already-scheduled places are skipped',
        !suggestDay(base, [base, ...liked], new Set([2, 3]))?.places
            .some((place) => place.id === 2 || place.id === 3));
    check('nothing nearby means no suggestion',
        suggestDay(base, [base], new Set<number>()) === null);
    check('an unpinned base cannot suggest anything',
        suggestDay(makePlace(99, 'Nowhere', null, null), liked, new Set<number>()) === null);
}

console.log('\nExport');
{
    const places = [
        { ...makePlace(1, 'Ibu Oka, "the one"', -8.5069, 115.2625), category: 'food',
          address: 'Ubud', links: [{ label: 'Site', url: 'https://example.com' }] },
        makePlace(2, 'Unpinned', null, null),
    ];
    const csv = placesToCsv(places, () => 'Ubud');
    check('the CSV has a header and a row per place', csv.split('\r\n').length === 3);
    check('a comma and a quote in a name are escaped',
        csv.includes('"Ibu Oka, ""the one"""'), csv.split('\r\n')[1].slice(0, 40));
    check('an unpinned place still exports', csv.includes('Unpinned'));

    const geo = JSON.parse(placesToGeoJson(places, () => 'Ubud'));
    check('GeoJSON only carries the pinned ones', geo.features.length === 1);
    check('and in lng,lat order',
        geo.features[0].geometry.coordinates[0] === 115.2625);

    const kml = placesToKml(places);
    check('KML carries a placemark for the pinned one',
        (kml.match(/<Placemark>/g) ?? []).length === 1);
    check('and escapes the name', kml.includes('Ibu Oka, &quot;the one&quot;')
        || kml.includes('Ibu Oka, "the one"'));
}

console.log('\nImport');
{
    const csv = [
        'Name,Category,Lat,Lng,Notes',
        'Tegallalang,nature,-8.4312,115.2792,"Rice terraces, go early"',
        'Ibu Oka,food,,,Best babi guling',
        ',food,,,A row with no name',
    ].join('\n');
    const fromCsv = parseImport(csv);
    check('a spreadsheet is recognised', fromCsv.format === 'spreadsheet');
    check('and its rows become places', fromCsv.places.length === 2);
    check('coordinates come through', fromCsv.places[0].lat === -8.4312);
    check('a quoted note with a comma survives',
        fromCsv.places[0].description === 'Rice terraces, go early');
    check('a row with no name is skipped and reported',
        fromCsv.skipped.length === 1 && fromCsv.skipped[0].line === 4);
    check('a place with no coordinates still imports', fromCsv.places[1].lat === null);

    const tabbed = parseImport('Title\tType\nTanah Lot\ttemple');
    check('tab-separated works too', tabbed.places[0].name === 'Tanah Lot'
        && tabbed.places[0].category === 'temple');

    const bare = parseImport('Tirta Empul\nGoa Gajah');
    check('a bare list of names works', bare.places.length === 2
        && bare.places[1].name === 'Goa Gajah');

    const kml = `<?xml version="1.0"?><kml><Document>
      <Placemark><name>Sidemen</name><description><![CDATA[<b>Valley</b> walk]]></description>
      <Point><coordinates>115.45,-8.45,0</coordinates></Point></Placemark>
      <Placemark><Point><coordinates>1,2,0</coordinates></Point></Placemark>
    </Document></kml>`;
    const fromKml = parseImport(kml);
    check('KML is recognised', fromKml.format === 'KML');
    check('and its placemarks become places',
        fromKml.places.length === 1 && fromKml.places[0].name === 'Sidemen');
    check('lat and lng are read the GeoJSON way round',
        fromKml.places[0].lat === -8.45 && fromKml.places[0].lng === 115.45);
    check('CDATA and tags are stripped from the description',
        fromKml.places[0].description === 'Valley walk', fromKml.places[0].description ?? '');
    check('a placemark with no name is reported', fromKml.skipped.length === 1);

    const takeout = JSON.stringify({
        type: 'FeatureCollection',
        features: [{
            geometry: { coordinates: [115.2625, -8.5069] },
            properties: {
                location: { name: 'Ubud Palace', address: 'Jl. Raya Ubud' },
                google_maps_url: 'https://maps.google.com/?cid=1',
            },
        }],
    });
    const fromTakeout = parseImport(takeout);
    check('Takeout JSON is recognised', fromTakeout.format === 'Google Takeout');
    check('and gives a named, pinned place with its link',
        fromTakeout.places[0].name === 'Ubud Palace'
        && fromTakeout.places[0].lat === -8.5069
        && (fromTakeout.places[0].links?.[0].url.includes('maps.google.com') ?? false));
    check('the wrong JSON says so, rather than importing nothing quietly',
        parseImport('{"a":1}').skipped[0].why.includes('features'));

    const existing = [
        makePlace(1, 'Ibu Oka', -8.5069, 115.2625),
        makePlace(2, 'Tegallalang', -8.4312, 115.2792),
    ];
    const dupes = findDuplicates(fromCsv.places, existing);
    check('an existing name at the same spot is a duplicate',
        dupes.get(0)?.id === 2, String(dupes.get(0)?.id));
    check('and a name match with no coordinates counts too', dupes.get(1)?.id === 1);
    check('a new name is not a duplicate',
        findDuplicates([{ name: 'Somewhere new', line: 1 }], existing).size === 0);
    check('the same name a long way away is not a duplicate',
        findDuplicates([{ name: 'Ibu Oka', lat: 1, lng: 1, line: 1 }], existing).size === 0);
}

console.log('\nProviders and Markdown');
{
    check('a Klook link is Klook', providerOf('https://www.klook.com/activity/123') === 'Klook');
    check('a GetYourGuide link is GetYourGuide',
        providerOf('https://www.getyourguide.com/x') === 'GetYourGuide');
    check('an unknown host falls back to the host',
        providerOf('https://warungmurah.co.id/menu') === 'warungmurah.co.id');
    check('nonsense is not a provider', providerOf('not a url') === null);

    const blocks = parseMarkdown([
        '## Getting around',
        'Use **Grab** in the south, and *cash* in Ubud.',
        '',
        '- 50k to the airport',
        '- 100k to Canggu',
        '',
        '1. Book the driver',
        '2. Confirm the day before',
        '',
        '> Ask for Wayan',
        'See [the guide](https://example.com) and `Mo-Fr 09:00`.',
    ].join('\n'));
    check('a heading is a heading', blocks[0].kind === 'h' && blocks[0].level === 2);
    check('bold and italic are spans',
        blocks[1].kind === 'p'
        && blocks[1].spans.some((span) => span.kind === 'strong' && span.text === 'Grab')
        && blocks[1].spans.some((span) => span.kind === 'em' && span.text === 'cash'));
    check('a bullet list groups its items',
        blocks[2].kind === 'ul' && blocks[2].items.length === 2);
    check('a numbered list is its own block',
        blocks[3].kind === 'ol' && blocks[3].items.length === 2);
    check('a quote is a quote', blocks[4].kind === 'quote');
    check('a link keeps its href',
        blocks[5].kind === 'p'
        && blocks[5].spans.some((span) => span.kind === 'link'
            && span.href === 'https://example.com'));
    check('and code stays code',
        blocks[5].kind === 'p'
        && blocks[5].spans.some((span) => span.kind === 'code' && span.text === 'Mo-Fr 09:00'));

    check('bold inside backticks is left alone',
        parseInline('`**not bold**`').every((span) => span.kind === 'code'));
    check('a javascript: link is not a link',
        parseInline('[click](javascript:alert(1))').every((span) => span.kind === 'text'));
    check('plain text is one span',
        parseInline('just words').length === 1 && parseInline('just words')[0].kind === 'text');
    check('a note reduces to plain text for search',
        markdownToText('## Hi\n\nUse **Grab** here') === 'Hi Use Grab here',
        markdownToText('## Hi\n\nUse **Grab** here'));
}

console.log('\nWhat is wrong with the plan');
{
    const hotel = { ...makePlace(1, 'Amankila', -8.4788, 115.5628), category: 'stay' };
    const villa = { ...makePlace(2, 'Ubud villa', -8.5069, 115.2625), category: 'stay' };
    const temple = { ...makePlace(3, 'Besakih', -8.3742, 115.4508), category: 'temple' };
    const faraway = makePlace(4, 'Pemuteran', -8.1400, 114.6500);

    const trip = {
        id: 1, title: 'T', start_date: '2026-09-12', end_date: null, home_currency: 'USD',
        notes: null, focus_country: '', budget: null, partner_names: '', info: {},
        time_format: '24h' as const, distance_unit: 'km' as const, phase: 'planning' as const,
    };

    const days: Day[] = [
        { id: 1, day_number: 1, title: null, notes: null, base_place_id: 1, stops: [], travel: [] },
        { id: 2, day_number: 2, title: null, notes: null, base_place_id: 1, stops: [], travel: [] },
        // A move with no travel leg, a duplicate stop, two stops at one time, and
        // a stop the far side of the island.
        { id: 3, day_number: 3, title: null, notes: null, base_place_id: 2, travel: [], stops: [
            { ...STOP_DEFAULTS, id: 1, day_id: 3, place_id: 3, start_time: '10:00' },
            { ...STOP_DEFAULTS, id: 2, day_id: 3, place_id: 3, start_time: '10:00', sort_order: 1 },
            { ...STOP_DEFAULTS, id: 3, day_id: 3, place_id: 4, sort_order: 2 },
        ] },
        { id: 4, day_number: 4, title: null, notes: null, base_place_id: null, stops: [], travel: [] },
    ];

    const bookings = [{
        id: 1, place_id: 1, travel_id: null, stop_id: null, kind: 'stay' as const,
        provider: null, confirmation: 'A1', url: null, contact: null,
        check_in: '2026-09-12', check_out: '2026-09-15', check_in_time: null,
        check_out_time: null, cost: null, cost_currency: null, cost_paid: null,
        deposit_due_on: null, cancel_by: null, party_size: null, dress_code: null,
        paid: false, documents: [], notes: null, created_at: null,
    }];

    const todos: TodoItem[] = [
        { ...TODO_DEFAULTS, id: 1, text: 'Renew passport', due_on: '2026-08-01' },
        { ...TODO_DEFAULTS, id: 2, text: 'Buy adapters', due_on: '2026-09-20' },
        { ...TODO_DEFAULTS, id: 3, text: 'Done already', due_on: '2026-08-01', done: true },
    ];

    const payload = { trip, places: [hotel, villa, temple, faraway], days, bookings, todos };
    const conflicts = conflictsOf(payload, '2026-08-25');
    const kinds = conflicts.map((entry) => entry.kind);

    check('a day with nowhere to sleep is the first thing said', kinds[0] === 'no-base');
    check('a place scheduled twice on a day is noticed', kinds.includes('duplicate-stop'));
    check('two stops at the same time are noticed', kinds.includes('same-time'));
    check('a stop the far side of the island is noticed', kinds.includes('far-from-base'));
    check('moving stay with no travel leg is noticed', kinds.includes('base-change-no-travel'));
    check('a booking whose dates disagree with the days is noticed',
        kinds.includes('booking-dates'));
    check('an overdue to-do is noticed', kinds.includes('todo-overdue'));
    check('a to-do due after departure is noticed', kinds.includes('todo-after-departure'));
    check('a to-do already done is not', conflicts.filter(
        (entry) => entry.message.includes('Done already'),
    ).length === 0);

    // The same trip with the holes filled: no conflicts at all.
    const tidy = {
        ...payload,
        days: [
            days[0], days[1],
            { ...days[2], travel: [{ ...LEG_DEFAULTS, id: 9, day_id: 3, mode: 'car' as const }],
              stops: [{ ...STOP_DEFAULTS, id: 1, day_id: 3, place_id: 3, start_time: '10:00' }] },
            { ...days[3], base_place_id: 2 },
        ],
        bookings: [{ ...bookings[0], check_out: '2026-09-14' }],
        todos: [todos[2]],
    };
    check('a tidy trip has nothing wrong with it',
        conflictsOf(tidy, '2026-08-25').length === 0,
        conflictsOf(tidy, '2026-08-25').map((c) => c.kind).join(','));

    const overlapping = conflictsOf({
        ...payload,
        bookings: [
            bookings[0],
            { ...bookings[0], id: 2, place_id: 2, check_in: '2026-09-13', check_out: '2026-09-16' },
        ],
    }, '2026-08-25');
    check('two stays booked over the same nights are noticed',
        overlapping.some((entry) => entry.kind === 'two-stays'));
    check('and the same stay booked twice is not counted as an overlap',
        !conflictsOf({
            ...payload,
            bookings: [bookings[0], { ...bookings[0], id: 2 }],
        }, '2026-08-25').some((entry) => entry.kind === 'two-stays'));
}

console.log('\nStays as stretches');
{
    const hotel = { ...makePlace(1, 'Amankila', -8.4, 115.5), category: 'stay' };
    const villa = { ...makePlace(2, 'Ubud villa', -8.5, 115.2), category: 'stay' };
    const trip = {
        id: 1, title: 'T', start_date: '2026-09-12', end_date: null, home_currency: 'USD',
        notes: null, focus_country: '', budget: null, partner_names: '', info: {},
        time_format: '24h' as const, distance_unit: 'km' as const, phase: 'planning' as const,
    };
    const days: Day[] = [1, 2, 3, 4, 5].map((n) => ({
        id: n, day_number: n, title: null, notes: null,
        base_place_id: n <= 3 ? 1 : 2, stops: [], travel: [],
    }));
    const bookings = [{
        id: 1, place_id: 1, travel_id: null, stop_id: null, kind: 'stay' as const,
        provider: null, confirmation: null, url: null, contact: null,
        check_in: '2026-09-12', check_out: '2026-09-15', check_in_time: null, check_out_time: null,
        cost: null, cost_currency: null, cost_paid: null, deposit_due_on: null, cancel_by: null,
        party_size: null, dress_code: null, paid: false, documents: [], notes: null,
        created_at: null,
    }];

    const stretches = stayStretches({ trip, places: [hotel, villa], days, bookings });
    check('consecutive days at one stay become one stretch', stretches.length === 2);
    check('with the nights counted',
        stretches[0].nights === 3 && stretches[0].firstDay === 1 && stretches[0].lastDay === 3);
    check('check-out is the morning after the last night, so this booking matches',
        stretches[0].mismatch === false);
    check('and one day out is a mismatch',
        stayStretches({
            trip, places: [hotel, villa], days,
            bookings: [{ ...bookings[0], check_out: '2026-09-16' }],
        })[0].mismatch === true);
    check('a stay with no booking is not a mismatch', stretches[1].mismatch === false);
    check('returning to the same stay later is a second stretch',
        stayStretches({
            trip,
            places: [hotel, villa],
            days: days.map((d) => ({ ...d, base_place_id: d.day_number === 3 ? 2 : 1 })),
            bookings: [],
        }).length === 3);
}

console.log('\nChecklist dates');
{
    const todos: TodoItem[] = [
        { ...TODO_DEFAULTS, id: 1, text: 'Late', due_on: '2026-08-20' },
        { ...TODO_DEFAULTS, id: 2, text: 'Today', due_on: '2026-08-25' },
        { ...TODO_DEFAULTS, id: 3, text: 'This week', due_on: '2026-08-30' },
        { ...TODO_DEFAULTS, id: 4, text: 'Later', due_on: '2026-10-01' },
        { ...TODO_DEFAULTS, id: 5, text: 'No date' },
        { ...TODO_DEFAULTS, id: 6, text: 'Done', due_on: '2026-08-01', done: true },
    ];
    const buckets = bucketTodos(todos, '2026-08-25');
    check('an overdue item is overdue', buckets[0].bucket === 'overdue' && buckets[0].daysAway === -5);
    check('today is today', buckets[1].bucket === 'today' && buckets[1].daysAway === 0);
    check('inside a week is this week', buckets[2].bucket === 'week');
    check('beyond that is later', buckets[3].bucket === 'later');
    check('no date is no bucket', buckets[4].bucket === 'none' && buckets[4].daysAway === null);

    const soon = dueSoon(todos, '2026-08-25');
    check('the next-week strip is soonest first',
        soon.map((entry) => entry.todo.text).join(',') === 'Late,Today,This week');
    check('and leaves out what is done', !soon.some((entry) => entry.todo.done));
}

console.log('\nPacking');
{
    const beach = { ...makePlace(1, 'Beach club', -8.6, 115.1), category: 'beach' };
    const temple = { ...makePlace(2, 'Besakih', -8.3, 115.4), category: 'temple' };
    const villa = { ...makePlace(3, 'Villa', -8.5, 115.2), category: 'stay' };
    const days: Day[] = [{
        id: 1, day_number: 1, title: null, notes: null, base_place_id: 3,
        stops: [
            { ...STOP_DEFAULTS, id: 1, day_id: 1, place_id: 1 },
            { ...STOP_DEFAULTS, id: 2, day_id: 1, place_id: 2, sort_order: 1 },
        ],
        travel: [{ ...LEG_DEFAULTS, id: 1, day_id: 1, arrive_day_offset: 1 }],
    }];
    const suggestions = packingSuggestions({ places: [beach, temple, villa], days });
    const texts = suggestions.map((entry) => entry.text).join(' | ');
    check('a beach day suggests sunscreen', texts.includes('sunscreen'));
    check('a temple suggests a sarong', texts.includes('Sarong'));
    check('a flight suggests passports', texts.includes('Passports'));
    check('an overnight flight suggests an eye mask', texts.includes('Eye mask'));
    check('every suggestion says why', suggestions.every((entry) => entry.why.length > 0));
    check('a trip with nothing planned still suggests the universals',
        packingSuggestions({ places: [], days: [] }).length >= 2);
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed.\n`);
process.exit(failures === 0 ? 0 : 1);

/* ---- helpers ---- */

function makePlace(id: number, name: string, lat: number | null, lng: number | null): Place {
    return { ...PLACE_DEFAULTS, id, name, lat, lng };
}

function makeStop(id: number, placeId: number | null): Stop {
    return { ...STOP_DEFAULTS, id, day_id: 1, place_id: placeId, sort_order: id };
}
