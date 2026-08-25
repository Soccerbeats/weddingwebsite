/**
 * Working with the place library: importing, exporting, filing and suggesting.
 *
 * Two hundred places arrive from a spreadsheet, a Google My Maps export or a
 * friend's list, need filing into regions, and then need finding again. All of
 * that is parsing and arithmetic, so it lives here and is covered by
 * `npm run check:honeymoon` rather than being discovered wrong on a Sunday.
 */
import { distanceKm, hasCoords, normalizeCategoryKey, pointInPolygon } from './honeymoon';
import type { Day, LatLng, Place, PlaceLink, Region } from './honeymoon';

/* ------------------------------------------------------------------ */
/* Filing places into regions                                          */
/* ------------------------------------------------------------------ */

export interface RegionMatch {
    placeId: number;
    regionId: number;
    /** How it was decided — a drawn boundary is certain, a centre is a guess. */
    how: 'boundary' | 'nearest';
    km: number | null;
}

/**
 * Which region a pinned place belongs to.
 *
 * A drawn boundary wins outright; otherwise the nearest region centre, which is
 * right often enough to be worth offering and is why the result says *how* it
 * was decided. A place with no coordinates gets no answer at all — guessing from
 * a name is how a Canggu villa ends up filed under Ubud.
 */
export function regionForPlace(place: Place, regions: Region[]): RegionMatch | null {
    if (!hasCoords(place)) return null;
    const point: LatLng = { lat: place.lat, lng: place.lng };

    for (const region of regions) {
        if (region.boundary && region.boundary.length >= 3
            && pointInPolygon(point, region.boundary)) {
            return { placeId: place.id, regionId: region.id, how: 'boundary', km: null };
        }
    }

    let best: RegionMatch | null = null;
    for (const region of regions) {
        if (region.center_lat == null || region.center_lng == null) continue;
        const km = distanceKm(point, { lat: region.center_lat, lng: region.center_lng });
        if (!best || km < (best.km ?? Infinity)) {
            best = { placeId: place.id, regionId: region.id, how: 'nearest', km };
        }
    }
    return best;
}

/**
 * Every place that could be filed, and where.
 *
 * Only the unfiled ones by default: re-filing a place you put somewhere on
 * purpose is exactly the kind of "helpful" that loses work.
 */
export function assignRegions(
    places: Place[], regions: Region[], includeFiled = false,
): RegionMatch[] {
    const out: RegionMatch[] = [];
    for (const place of places) {
        if (place.archived) continue;
        if (place.region_id != null && !includeFiled) continue;
        const match = regionForPlace(place, regions);
        if (match && match.regionId !== place.region_id) out.push(match);
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* Nearby                                                              */
/* ------------------------------------------------------------------ */

export interface Nearby {
    place: Place;
    km: number;
}

/**
 * What else is close to a place, nearest first.
 *
 * The gap this fills is real and specific: you have a temple at eleven and
 * dinner at seven, and the question is what is within ten minutes of the temple.
 * Excludes the place itself, anything archived, and anything unpinned.
 */
export function nearbyPlaces(
    origin: Place, places: Place[], withinKm = 10, limit = 8,
): Nearby[] {
    if (!hasCoords(origin)) return [];
    const from: LatLng = { lat: origin.lat, lng: origin.lng };
    return places
        .filter((place) => place.id !== origin.id && !place.archived && hasCoords(place))
        .map((place) => ({
            place,
            km: distanceKm(from, { lat: place.lat as number, lng: place.lng as number }),
        }))
        .filter((entry) => entry.km <= withinKm)
        .sort((a, b) => a.km - b.km)
        .slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Suggesting a day                                                    */
/* ------------------------------------------------------------------ */

export interface DaySuggestion {
    /** In the order they would be visited. */
    places: Place[];
    /** Total distance of the loop from the base and back. */
    km: number;
    /** Why these — "two you rated yes, one unrated, all within 12 km". */
    why: string;
}

/**
 * Three or four places near a base that are not already scheduled.
 *
 * Not clever: it takes what you have already said you like, keeps it near the
 * base, mixes the categories so the day is not four temples, and orders the
 * result by a nearest-neighbour walk so the driving is not absurd. The point is
 * a starting draft for a free day, which beats an empty one.
 */
export function suggestDay(
    base: Place,
    places: Place[],
    scheduledIds: Set<number>,
    options: { withinKm?: number; count?: number } = {},
): DaySuggestion | null {
    const withinKm = options.withinKm ?? 15;
    const count = options.count ?? 3;
    if (!hasCoords(base)) return null;

    const candidates = nearbyPlaces(base, places, withinKm, 60)
        .filter((entry) => !scheduledIds.has(entry.place.id))
        .filter((entry) => entry.place.category !== 'stay' && !entry.place.is_excursion);
    if (!candidates.length) return null;

    // Liked first, then unrated, then the rest; a rejected place is never
    // suggested — you already said no to it.
    const rank = (place: Place) => (place.rating === 'yes' ? 0
        : place.rating == null ? 1
            : place.rating === 'mid' ? 2 : 99);
    const pool = candidates
        .filter((entry) => rank(entry.place) < 99)
        .sort((a, b) => rank(a.place) - rank(b.place) || a.km - b.km);

    // One per category first, so a day is a mix rather than four temples.
    const picked: Place[] = [];
    const usedCategories = new Set<string>();
    for (const entry of pool) {
        if (picked.length >= count) break;
        const key = normalizeCategoryKey(entry.place.category);
        if (usedCategories.has(key)) continue;
        usedCategories.add(key);
        picked.push(entry.place);
    }
    for (const entry of pool) {
        if (picked.length >= count) break;
        if (!picked.includes(entry.place)) picked.push(entry.place);
    }
    if (!picked.length) return null;

    // Nearest-neighbour from the base: not optimal, but never silly.
    const ordered: Place[] = [];
    const remaining = [...picked];
    let cursor: LatLng = { lat: base.lat, lng: base.lng };
    let km = 0;
    while (remaining.length) {
        let bestIndex = 0;
        let bestKm = Infinity;
        remaining.forEach((place, index) => {
            const legKm = distanceKm(cursor, {
                lat: place.lat as number, lng: place.lng as number,
            });
            if (legKm < bestKm) { bestKm = legKm; bestIndex = index; }
        });
        const next = remaining.splice(bestIndex, 1)[0];
        ordered.push(next);
        km += bestKm;
        cursor = { lat: next.lat as number, lng: next.lng as number };
    }
    km += distanceKm(cursor, { lat: base.lat, lng: base.lng });

    const liked = ordered.filter((place) => place.rating === 'yes').length;
    const why = [
        liked ? `${liked} you rated yes` : null,
        ordered.length - liked ? `${ordered.length - liked} unrated` : null,
        `all within ${Math.ceil(withinKm)} km of ${base.name}`,
    ].filter(Boolean).join(', ');

    return { places: ordered, km, why };
}

/** Place ids already on the itinerary, as a base or a stop. */
export function scheduledPlaceIds(days: Day[]): Set<number> {
    const ids = new Set<number>();
    for (const day of days) {
        if (day.base_place_id != null) ids.add(day.base_place_id);
        for (const stop of day.stops) if (stop.place_id != null) ids.add(stop.place_id);
    }
    return ids;
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

function csvCell(value: unknown): string {
    const text = value == null ? '' : String(value);
    // Quote anything with a delimiter, a quote or a newline in it; double the
    // quotes inside. This is the whole of RFC 4180 that matters.
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const CSV_COLUMNS = [
    'name', 'category', 'region', 'country', 'status', 'rating', 'lat', 'lng',
    'address', 'price_note', 'cost', 'cost_currency', 'cost_per', 'opening_hours',
    'best_time', 'description', 'links',
] as const;

/** The library as a spreadsheet — for Google My Maps, or for a friend. */
export function placesToCsv(places: Place[], regionName: (id: number | null) => string): string {
    const rows = [CSV_COLUMNS.join(',')];
    for (const place of places) {
        rows.push([
            place.name,
            place.category,
            regionName(place.region_id),
            place.country,
            place.status,
            place.rating ?? '',
            place.lat ?? '',
            place.lng ?? '',
            place.address ?? '',
            place.price_note ?? '',
            place.cost ?? '',
            place.cost_currency ?? '',
            place.cost_per,
            place.opening_hours ?? '',
            place.best_time ?? '',
            place.description ?? '',
            place.links.map((link) => link.url).join(' '),
        ].map(csvCell).join(','));
    }
    return rows.join('\r\n');
}

/** GeoJSON, which is what every mapping tool actually wants. */
export function placesToGeoJson(places: Place[], regionName: (id: number | null) => string): string {
    return JSON.stringify({
        type: 'FeatureCollection',
        features: places.filter(hasCoords).map((place) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [place.lng, place.lat] },
            properties: {
                name: place.name,
                category: place.category,
                region: regionName(place.region_id),
                status: place.status,
                rating: place.rating,
                address: place.address,
                description: place.description,
                url: place.links[0]?.url ?? null,
            },
        })),
    }, null, 2);
}

/** KML, for the phone's own map app and for Google My Maps' importer. */
export function placesToKml(places: Place[], title = 'Honeymoon places'): string {
    const escape = (value: string) => value
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const marks = places.filter(hasCoords).map((place) => [
        '    <Placemark>',
        `      <name>${escape(place.name)}</name>`,
        `      <description>${escape([
            place.category, place.address, place.description,
        ].filter(Boolean).join(' · '))}</description>`,
        `      <Point><coordinates>${place.lng},${place.lat},0</coordinates></Point>`,
        '    </Placemark>',
    ].join('\n')).join('\n');
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<kml xmlns="http://www.opengis.net/kml/2.2">',
        '  <Document>',
        `    <name>${escape(title)}</name>`,
        marks,
        '  </Document>',
        '</kml>',
    ].join('\n');
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

export interface ImportedPlace {
    name: string;
    category?: string;
    lat?: number | null;
    lng?: number | null;
    address?: string;
    description?: string;
    price_note?: string;
    links?: PlaceLink[];
    /** Which row it came from, for the "line 14 had no name" report. */
    line: number;
}

export interface ImportReport {
    places: ImportedPlace[];
    skipped: { line: number; why: string }[];
}

/** Split a CSV line, honouring quotes. */
function splitCsvLine(line: string): string[] {
    const cells: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (quoted) {
            if (char === '"') {
                if (line[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
            } else cell += char;
        } else if (char === '"') quoted = true;
        else if (char === ',') { cells.push(cell); cell = ''; }
        else cell += char;
    }
    cells.push(cell);
    return cells;
}

const HEADER_ALIASES: Record<string, string> = {
    name: 'name', title: 'name', place: 'name', 'place name': 'name',
    category: 'category', type: 'category', kind: 'category',
    lat: 'lat', latitude: 'lat', y: 'lat',
    lng: 'lng', lon: 'lng', long: 'lng', longitude: 'lng', x: 'lng',
    address: 'address', location: 'address',
    notes: 'description', description: 'description', comment: 'description',
    price: 'price_note', cost: 'price_note', 'price note': 'price_note',
    url: 'url', link: 'url', website: 'url', 'google maps url': 'url',
};

/**
 * A pasted spreadsheet, as places.
 *
 * Tolerant on purpose: friends' lists arrive as CSV, as tab-separated, with the
 * columns in any order and named whatever the person felt like. A row with no
 * name is the only thing that is dropped, and it is reported rather than
 * silently ignored — a quiet import that loses six rows is worse than one that
 * says so.
 */
export function parseDelimited(text: string): ImportReport {
    const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((line) => line.trim());
    const report: ImportReport = { places: [], skipped: [] };
    if (!lines.length) return report;

    const tabbed = lines[0].includes('\t') && !lines[0].includes(',');
    const split = (line: string) => (tabbed ? line.split('\t') : splitCsvLine(line));

    const header = split(lines[0]).map((cell) => cell.trim().toLowerCase());
    const mapped = header.map((cell) => HEADER_ALIASES[cell] ?? null);
    // No recognisable header? Then the first column is the name and the file
    // starts at line 1 — a pasted list of names is a real thing people do.
    const hasHeader = mapped.some((key) => key === 'name');
    const columns = hasHeader ? mapped : ['name'];

    lines.slice(hasHeader ? 1 : 0).forEach((line, index) => {
        const lineNumber = index + (hasHeader ? 2 : 1);
        const cells = split(line);
        const row: Record<string, string> = {};
        columns.forEach((key, at) => {
            if (key && cells[at] != null) row[key] = cells[at].trim();
        });
        const name = (row.name ?? '').trim();
        if (!name) {
            report.skipped.push({ line: lineNumber, why: 'no name' });
            return;
        }
        const lat = Number(row.lat);
        const lng = Number(row.lng);
        report.places.push({
            name,
            category: row.category || undefined,
            lat: Number.isFinite(lat) && row.lat ? lat : null,
            lng: Number.isFinite(lng) && row.lng ? lng : null,
            address: row.address || undefined,
            description: row.description || undefined,
            price_note: row.price_note || undefined,
            links: row.url ? [{ label: 'Link', url: row.url }] : undefined,
            line: lineNumber,
        });
    });
    return report;
}

/** KML from Google My Maps, as places. */
export function parseKml(text: string): ImportReport {
    const report: ImportReport = { places: [], skipped: [] };
    const marks = text.match(/<Placemark[\s\S]*?<\/Placemark>/g) ?? [];
    marks.forEach((mark, index) => {
        const name = /<name>([\s\S]*?)<\/name>/.exec(mark)?.[1]?.trim();
        const coords = /<coordinates>([\s\S]*?)<\/coordinates>/.exec(mark)?.[1]?.trim();
        const description = /<description>([\s\S]*?)<\/description>/.exec(mark)?.[1]?.trim();
        if (!name) {
            report.skipped.push({ line: index + 1, why: 'placemark with no name' });
            return;
        }
        const [lng, lat] = (coords ?? '').split(',').map(Number);
        report.places.push({
            name: unescapeXml(name),
            lat: Number.isFinite(lat) ? lat : null,
            lng: Number.isFinite(lng) ? lng : null,
            description: description ? unescapeXml(stripTags(description)) : undefined,
            line: index + 1,
        });
    });
    return report;
}

function stripTags(value: string): string {
    return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ').trim();
}

function unescapeXml(value: string): string {
    return value
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .trim();
}

/**
 * Google Takeout's "Saved Places" JSON, as places.
 *
 * Takeout gives a GeoJSON `FeatureCollection` whose properties carry the name
 * under `location.name` and the address under `location.address`. Coordinates
 * are in the geometry, in GeoJSON's lng,lat order.
 */
export function parseTakeout(text: string): ImportReport {
    const report: ImportReport = { places: [], skipped: [] };
    let body: unknown;
    try {
        body = JSON.parse(text);
    } catch {
        report.skipped.push({ line: 0, why: 'not valid JSON' });
        return report;
    }
    const features = (body as { features?: unknown[] })?.features;
    if (!Array.isArray(features)) {
        report.skipped.push({ line: 0, why: 'no features array — is this the right file?' });
        return report;
    }
    features.forEach((raw, index) => {
        const feature = raw as {
            geometry?: { coordinates?: unknown };
            properties?: {
                location?: { name?: string; address?: string };
                google_maps_url?: string;
                Title?: string;
            };
        };
        const name = feature.properties?.location?.name
            ?? feature.properties?.Title
            ?? '';
        if (!name) {
            report.skipped.push({ line: index + 1, why: 'saved place with no name' });
            return;
        }
        const coordinates = feature.geometry?.coordinates;
        const [lng, lat] = Array.isArray(coordinates) ? coordinates.map(Number) : [NaN, NaN];
        const url = feature.properties?.google_maps_url;
        report.places.push({
            name,
            lat: Number.isFinite(lat) ? lat : null,
            lng: Number.isFinite(lng) ? lng : null,
            address: feature.properties?.location?.address,
            links: url ? [{ label: 'Google Maps', url }] : undefined,
            line: index + 1,
        });
    });
    return report;
}

/** Pick the parser from what the text looks like. */
export function parseImport(text: string): ImportReport & { format: string } {
    const trimmed = text.trim();
    if (trimmed.startsWith('<?xml') || trimmed.includes('<kml')) {
        return { ...parseKml(trimmed), format: 'KML' };
    }
    if (trimmed.startsWith('{')) return { ...parseTakeout(trimmed), format: 'Google Takeout' };
    return { ...parseDelimited(trimmed), format: 'spreadsheet' };
}

/**
 * Which imported places already exist.
 *
 * Matched on name, and on being within a kilometre when both have coordinates —
 * "Warung Ibu Oka" appears on every list anyone will ever send you, and importing
 * a friend's twenty suggestions should not produce nineteen duplicates.
 */
export function findDuplicates(
    incoming: ImportedPlace[], existing: Place[],
): Map<number, Place> {
    const byName = new Map<string, Place[]>();
    for (const place of existing) {
        const key = place.name.trim().toLowerCase();
        const list = byName.get(key);
        if (list) list.push(place); else byName.set(key, [place]);
    }
    const out = new Map<number, Place>();
    incoming.forEach((candidate, index) => {
        const matches = byName.get(candidate.name.trim().toLowerCase()) ?? [];
        if (!matches.length) return;
        if (candidate.lat == null || candidate.lng == null) {
            out.set(index, matches[0]);
            return;
        }
        const near = matches.find((place) => {
            if (!hasCoords(place)) return true;
            return distanceKm(
                { lat: candidate.lat as number, lng: candidate.lng as number },
                { lat: place.lat, lng: place.lng },
            ) <= 1;
        });
        if (near) out.set(index, near);
    });
    return out;
}

/* ------------------------------------------------------------------ */
/* Providers                                                           */
/* ------------------------------------------------------------------ */

const PROVIDERS: { pattern: RegExp; label: string }[] = [
    { pattern: /getyourguide\./i, label: 'GetYourGuide' },
    { pattern: /viator\./i, label: 'Viator' },
    { pattern: /klook\./i, label: 'Klook' },
    { pattern: /airbnb\./i, label: 'Airbnb' },
    { pattern: /booking\.com/i, label: 'Booking.com' },
    { pattern: /agoda\./i, label: 'Agoda' },
    { pattern: /expedia\./i, label: 'Expedia' },
    { pattern: /hotels\.com/i, label: 'Hotels.com' },
    { pattern: /tripadvisor\./i, label: 'Tripadvisor' },
    { pattern: /opentable\./i, label: 'OpenTable' },
    { pattern: /instagram\.com/i, label: 'Instagram' },
    { pattern: /youtube\.com|youtu\.be/i, label: 'YouTube' },
    { pattern: /maps\.google|goo\.gl\/maps|maps\.app\.goo\.gl/i, label: 'Google Maps' },
];

/**
 * Who a link is with.
 *
 * Used to label a link with the provider rather than "Website", which is the
 * difference between a card that says *Klook* and one that says nothing. Falls
 * back to the hostname, which is still better than a generic label.
 */
export function providerOf(url: string): string | null {
    for (const provider of PROVIDERS) {
        if (provider.pattern.test(url)) return provider.label;
    }
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return null;
    }
}
