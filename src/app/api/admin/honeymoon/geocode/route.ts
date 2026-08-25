import { NextResponse } from 'next/server';
import { safeFetch } from '@/lib/safeFetch';

/**
 * Coordinate lookup for the honeymoon place editor.
 *
 * Three input styles, all through one endpoint because the admin has one box:
 *   1. A place name        -> forward geocode via Nominatim
 *   2. A Google Maps link  -> pull the coordinates straight out of the URL
 *   3. A raw "lat, lng"    -> parsed directly
 *
 * Nominatim is proxied server-side rather than called from the browser: their
 * policy requires an identifying User-Agent, which a browser will not let us
 * set, and going through the server also avoids CORS entirely.
 */

/**
 * The primary geocoder.
 *
 * Overridable so a self-hosted Nominatim can be used instead — and so the
 * fallback path can actually be exercised, which is otherwise only reachable by
 * waiting for the public instance to refuse you.
 */
const NOMINATIM = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search';

// Nominatim's usage policy requires a real identifying UA with contact info.
/**
 * How this instance identifies itself to Nominatim.
 *
 * Their usage policy requires a User-Agent that identifies the application *and
 * offers a way to reach whoever runs it* — a generic one is a documented reason
 * for a `403 Access denied`, which is exactly what a self-hosted instance
 * started getting. The default carries the project URL rather than an email,
 * because publishing a personal address in a public repository is not this
 * file's call; set `GEOCODER_USER_AGENT` to add one.
 */
const USER_AGENT = process.env.GEOCODER_USER_AGENT
    ?? 'WeddingWebsite-HoneymoonPortal/1.0 (+https://github.com/Soccerbeats/weddingwebsite)';

export interface GeocodeHit {
    label: string;
    lat: number;
    lng: number;
    /** Where the answer came from, so the UI can say whether to trust it. */
    precision: 'exact' | 'geocoded';
    /** Place name recovered from a Google Maps URL, when there is one. */
    name?: string;
    /** Postal-ish address, reverse-geocoded for a pasted link. */
    address?: string;
    /** The link that was pasted, so the editor can keep it on the place. */
    url?: string;
    /** Nominatim's own classification, e.g. "aeroway/aerodrome". */
    kind?: string;
    /**
     * OSM's `opening_hours` for the hit, when it has one.
     *
     * Comes free with `extratags=1` on a search that was happening anyway, and
     * is the difference between "we'll go at nine" and standing outside a
     * temple that opens at eleven. Kept as OSM's own string — the parser in
     * `honeymoonHours.ts` reads it, and says *unknown* for the syntax it does
     * not cover rather than guessing.
     */
    opening_hours?: string;
    /** A phone number, when OSM has one: worth having on a restaurant. */
    phone?: string;
    /** The listing's own website, offered as a link on the place. */
    website?: string;
    /**
     * Which service answered.
     *
     * Shown in the picker when it is not the primary one, because the fallback
     * is fuzzier: asked for "YBR airport" it will happily return *YBL* airport,
     * 1,800 km away, with no indication that it guessed.
     */
    source?: 'nominatim' | 'photon';
}

/**
 * What a travel mode wants a search to find.
 *
 * A leg is looked up by mode, because the answer depends on it: "DPS" typed for
 * a flight means the airport, and Nominatim on its own answers a bare three
 * letter code with a boundary in China. Appending the word, and then floating
 * the transport hits to the top, turns both halves of that into the right
 * result. `rank` is matched against `category/type`.
 */
const MODE_HINTS: Record<string, { suffix: string; rank: string[] }> = {
    flight: { suffix: 'airport', rank: ['aeroway/aerodrome', 'aeroway/terminal', 'aeroway'] },
    boat: {
        suffix: 'ferry terminal',
        rank: ['amenity/ferry_terminal', 'harbour', 'man_made/pier', 'landuse/port'],
    },
    train: { suffix: 'station', rank: ['railway/station', 'railway/halt', 'public_transport'] },
    car: { suffix: '', rank: [] },
    walk: { suffix: '', rank: [] },
};

/** IATA-shaped: three letters and nothing else. */
const CODE_ONLY = /^[A-Za-z]{3}$/;

function finite(value: number): boolean {
    return Number.isFinite(value) && Math.abs(value) <= 180;
}

function valid(lat: number, lng: number): boolean {
    return finite(lat) && finite(lng) && Math.abs(lat) <= 90 && !(lat === 0 && lng === 0);
}

/**
 * Extract coordinates from a Google Maps URL.
 *
 * Handles the three shapes Google actually emits:
 *   .../@-8.6478,115.1385,17z      the map centre
 *   ...!3d-8.6478!4d115.1385       the pin itself (preferred — the centre can
 *                                  be offset when a side panel is open)
 *   ...?q=-8.6478,115.1385         a coordinate query
 */
export function coordsFromMapsUrl(input: string): { lat: number; lng: number } | null {
    const pin = input.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (pin) {
        const lat = Number(pin[1]);
        const lng = Number(pin[2]);
        if (valid(lat, lng)) return { lat, lng };
    }

    const query = input.match(/[?&](?:q|query|ll|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
    if (query) {
        const lat = Number(query[1]);
        const lng = Number(query[2]);
        if (valid(lat, lng)) return { lat, lng };
    }

    const at = input.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (at) {
        const lat = Number(at[1]);
        const lng = Number(at[2]);
        if (valid(lat, lng)) return { lat, lng };
    }

    return null;
}

/**
 * Recover the place name from a Google Maps URL.
 *
 * The /place/ segment carries the name Google shows, plus-encoded. Worth having
 * because it is usually the name you would have typed anyway, and it saves
 * retyping it after a paste.
 */
export function nameFromMapsUrl(input: string): string | null {
    const match = input.match(/\/place\/([^/@?]+)/);
    if (!match) return null;
    try {
        const decoded = decodeURIComponent(match[1].replace(/\+/g, ' ')).trim();
        // "Ubud Palace, Jalan Raya Ubud, Bali" -> "Ubud Palace". The tail is the
        // address, which is reverse-geocoded separately and more reliably.
        const head = decoded.split(',')[0].trim();
        if (!head || /^-?\d+(\.\d+)?$/.test(head)) return null;
        return head;
    } catch {
        return null;
    }
}

/**
 * Turn coordinates into an address.
 *
 * A pasted link gives an exact point but no address; without this the address
 * field would stay blank on exactly the input that is most likely to be used.
 */
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('format', 'jsonv2');
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return null;
        const body = await res.json();
        return typeof body?.display_name === 'string' ? body.display_name : null;
    } catch {
        return null;
    }
}

/** A bare "-8.6478, 115.1385" pasted straight in. */
export function coordsFromPair(input: string): { lat: number; lng: number } | null {
    const match = input.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (!match) return null;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    return valid(lat, lng) ? { lat, lng } : null;
}

/**
 * Resolve a shortened Google link (maps.app.goo.gl / goo.gl/maps) by following
 * the redirect and reading the coordinates out of the destination URL.
 */
async function expandShortLink(url: string): Promise<string | null> {
    try {
        // Only Google's own shorteners, matched on the hostname — a URL that
        // merely *contains* "goo.gl" is not one — and followed through
        // safeFetch so a redirect cannot land on a LAN address.
        const host = new URL(url).hostname.toLowerCase();
        if (host !== 'goo.gl' && host !== 'maps.app.goo.gl') return null;
        const res = await safeFetch(url, { headers: { 'User-Agent': USER_AGENT }, timeoutMs: 8000 });
        return res.url || null;
    } catch {
        return null;
    }
}

/** Photon: the same OSM data, keyless, and it answers when Nominatim will not. */
const PHOTON = 'https://photon.komoot.io/api/';

interface NominatimRow {
    display_name?: string; lat?: string; lon?: string;
    category?: string; type?: string;
    extratags?: Record<string, string> | null;
}

/** Nominatim rows as hits, or a reason it could not be asked. */
async function searchNominatim(term: string): Promise<
    { hits: GeocodeHit[]; refused?: string }
> {
    const url = new URL(NOMINATIM);
    url.searchParams.set('q', term);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '6');
    url.searchParams.set('addressdetails', '1');
    // Opening hours, phone and website ride along on a request that was already
    // being made.
    url.searchParams.set('extratags', '1');

    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
            // 403 is their policy talking, not a fault: an unidentifiable
            // User-Agent or an IP they have decided is using too much.
            return { hits: [], refused: res.status === 403 || res.status === 429
                ? `OpenStreetMap's geocoder turned us away (${res.status})`
                : `OpenStreetMap's geocoder said ${res.status}` };
        }
        const body = await res.json();
        const rows: NominatimRow[] = Array.isArray(body) ? body : [];
        return {
            hits: rows.map((row) => ({
                label: row.display_name ?? '',
                lat: Number(row.lat),
                lng: Number(row.lon),
                precision: 'geocoded' as const,
                kind: [row.category, row.type].filter(Boolean).join('/'),
                opening_hours: row.extratags?.opening_hours || undefined,
                phone: row.extratags?.phone || row.extratags?.['contact:phone'] || undefined,
                website: row.extratags?.website || row.extratags?.['contact:website'] || undefined,
                source: 'nominatim' as const,
            })).filter((hit) => valid(hit.lat, hit.lng)),
        };
    } catch {
        return { hits: [], refused: "OpenStreetMap's geocoder did not answer in time" };
    }
}

interface PhotonFeature {
    geometry?: { coordinates?: [number, number] };
    properties?: {
        name?: string; street?: string; housenumber?: string; postcode?: string;
        city?: string; district?: string; state?: string; country?: string;
        osm_key?: string; osm_value?: string; website?: string;
    };
}

/**
 * Photon features as hits.
 *
 * Its properties are already split into name/city/country, so the label is
 * assembled rather than read — which happens to produce the same
 * "name, area, country" shape Nominatim's `display_name` has, so nothing
 * downstream has to know which service answered.
 */
async function searchPhoton(term: string): Promise<{ hits: GeocodeHit[]; refused?: string }> {
    const url = new URL(PHOTON);
    url.searchParams.set('q', term);
    url.searchParams.set('limit', '6');
    url.searchParams.set('lang', 'en');
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return { hits: [], refused: `The fallback geocoder said ${res.status}` };
        const body = await res.json();
        const features: PhotonFeature[] = Array.isArray(body?.features) ? body.features : [];
        return {
            hits: features.map((feature) => {
                const p = feature.properties ?? {};
                const coordinates = feature.geometry?.coordinates ?? [NaN, NaN];
                const label = [
                    [p.housenumber, p.street].filter(Boolean).join(' ') || p.name,
                    p.name && p.street ? p.name : null,
                    p.district, p.city, p.state, p.postcode, p.country,
                ].filter(Boolean).join(', ');
                return {
                    // GeoJSON is lng,lat — the opposite order to everything else
                    // in this codebase, which is worth writing down.
                    lat: Number(coordinates[1]),
                    lng: Number(coordinates[0]),
                    label: label || (p.name ?? ''),
                    precision: 'geocoded' as const,
                    kind: [p.osm_key, p.osm_value].filter(Boolean).join('/'),
                    website: p.website || undefined,
                    source: 'photon' as const,
                };
            }).filter((hit) => valid(hit.lat, hit.lng)),
        };
    } catch {
        return { hits: [], refused: 'The fallback geocoder did not answer in time' };
    }
}

/**
 * Look a name up, widening and then falling back.
 *
 * Four attempts at most, in the order that gets the best answer soonest:
 * Nominatim with the mode's word appended, Nominatim with what was typed,
 * then the same two against Photon. The first that returns anything wins.
 */
async function geocodeName(query: string, raw: string): Promise<{
    results: GeocodeHit[]; error?: string;
}> {
    const terms = query === raw ? [raw] : [query, raw];
    let refused: string | undefined;

    for (const search of [searchNominatim, searchPhoton]) {
        for (const term of terms) {
            const { hits, refused: why } = await search(term);
            if (hits.length) return { results: hits };
            // Remember the first refusal, but keep trying: "Sanur ferry
            // terminal" finds no such thing while "Sanur" finds the place.
            if (why && !refused) refused = why;
        }
    }

    return {
        results: [],
        error: refused
            ? `${refused}. Nothing was found for "${raw}" — paste a Google Maps link or `
                + 'right-click the pin there and copy the "lat, lng" numbers instead.'
            : undefined,
    };
}

export async function GET(request: Request) {
    const params = new URL(request.url).searchParams;
    const raw = params.get('q')?.trim() ?? '';
    const hint = MODE_HINTS[params.get('mode') ?? ''] ?? null;
    if (!raw) return NextResponse.json({ results: [] });

    try {
        // 1. Raw coordinate pair — nothing to look up.
        const pair = coordsFromPair(raw);
        if (pair) {
            return NextResponse.json({
                results: [{ label: `${pair.lat}, ${pair.lng}`, ...pair, precision: 'exact' }],
            } satisfies { results: GeocodeHit[] });
        }

        // 2. A URL — Google Maps or a shortened one.
        if (/^https?:\/\//i.test(raw)) {
            let target = raw;
            target = (await expandShortLink(raw)) ?? raw;
            const fromUrl = coordsFromMapsUrl(target);
            if (fromUrl) {
                const name = nameFromMapsUrl(target);
                const address = await reverseGeocode(fromUrl.lat, fromUrl.lng);
                return NextResponse.json({
                    results: [{
                        label: name ?? address ?? 'Pasted location',
                        ...fromUrl,
                        precision: 'exact',
                        ...(name ? { name } : {}),
                        ...(address ? { address } : {}),
                        // The link the user pasted, kept so the editor can store it.
                        url: raw,
                    }],
                } satisfies { results: GeocodeHit[] });
            }
            return NextResponse.json({
                results: [],
                error: 'No coordinates in that link. Open the place in Google Maps, right-click the pin, '
                    + 'and copy the "lat, lng" numbers instead.',
            });
        }

        // 3. A name — forward geocode.
        //
        // A bare code gets the mode's word appended: "DPS" finds a Chinese
        // boundary, "DPS airport" finds Ngurah Rai. Anything longer is left
        // alone — someone typing "Gilimanuk harbour" has already said it.
        const query = hint?.suffix && CODE_ONLY.test(raw) ? `${raw} ${hint.suffix}` : raw;

        /*
         * Nominatim first, Photon if Nominatim will not answer.
         *
         * Nominatim's results are better for this job — `extratags` brings back
         * opening hours, a phone and a website, and its ranking understands
         * "airport" — but it is a free service with a strict policy, and a
         * self-hosted instance can find itself getting `403 Access denied` with
         * no warning and no way to appeal. Photon is the same OSM data from
         * komoot, keyless, and it answers when Nominatim will not; it is fuzzier,
         * which the results are labelled with rather than hidden.
         */
        const { results, error } = await geocodeName(query, raw);
        if (!results.length) {
            return NextResponse.json({ results: [], error }, error ? { status: 502 } : undefined);
        }

        /*
         * Float the hits that match the mode.
         *
         * Nominatim's own order is by its relevance score, which for "Changi
         * Airport" puts a railway station above the airport and for "SIN Changi
         * T3" offers a taxiway. Ranking by what the leg *is* fixes both without
         * discarding anything: the rest of the list keeps its original order
         * underneath, so a search for a hotel by the airport still finds it.
         */
        /*
         * Rank by what the leg *is*, then by whether the name says what was
         * typed — in that order, and in one comparator.
         *
         * Kind has to win: both geocoders match fuzzily on short strings, and
         * "DPS" pulls back a Delhi Public School as well as Ngurah Rai. Sorting
         * on the typed code first floats the school, because its name really
         * does contain "DPS". Sorting on kind first and using the code only to
         * break ties keeps the airport at the top and still prefers *the* YBR
         * over a similar-looking YBL when both are aerodromes.
         *
         * Nothing is discarded either way: a search for a hotel by the airport
         * still finds it, further down.
         */
        const bareCode = CODE_ONLY.test(raw);
        if (hint?.rank.length || bareCode) {
            const code = raw.toLowerCase();
            const kindScore = (hit: GeocodeHit) => {
                if (!hint?.rank.length) return 0;
                const kind = hit.kind ?? '';
                const at = hint.rank.findIndex((want) => kind.startsWith(want));
                return at === -1 ? hint.rank.length : at;
            };
            const codeScore = (hit: GeocodeHit) => (
                bareCode && hit.label.toLowerCase().includes(code) ? 0 : 1
            );
            results.sort((a, b) => kindScore(a) - kindScore(b) || codeScore(a) - codeScore(b));
        }

        return NextResponse.json({ results });
    } catch (error) {
        console.error('Geocode failed:', error);
        return NextResponse.json({ results: [], error: 'Lookup failed' }, { status: 500 });
    }
}
