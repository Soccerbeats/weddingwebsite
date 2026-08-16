import { NextResponse } from 'next/server';

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

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

// Nominatim's usage policy requires a real identifying UA with contact info.
const USER_AGENT = process.env.GEOCODER_USER_AGENT
    ?? 'WeddingWebsite-HoneymoonPortal/1.0 (self-hosted; admin planning tool)';

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
}

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
        const res = await fetch(url, {
            redirect: 'follow',
            headers: { 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(8000),
        });
        return res.url || null;
    } catch {
        return null;
    }
}

export async function GET(request: Request) {
    const raw = new URL(request.url).searchParams.get('q')?.trim() ?? '';
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
            if (/goo\.gl|maps\.app\.goo\.gl/i.test(raw)) {
                target = (await expandShortLink(raw)) ?? raw;
            }
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
        const url = new URL(NOMINATIM);
        url.searchParams.set('q', raw);
        url.searchParams.set('format', 'jsonv2');
        url.searchParams.set('limit', '6');
        url.searchParams.set('addressdetails', '1');

        const res = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
            return NextResponse.json({ results: [], error: 'Geocoder unavailable' }, { status: 502 });
        }

        const body = await res.json();
        const results: GeocodeHit[] = (Array.isArray(body) ? body : [])
            .map((row: { display_name?: string; lat?: string; lon?: string }) => ({
                label: row.display_name ?? '',
                lat: Number(row.lat),
                lng: Number(row.lon),
                precision: 'geocoded' as const,
            }))
            .filter((hit: GeocodeHit) => valid(hit.lat, hit.lng));

        return NextResponse.json({ results });
    } catch (error) {
        console.error('Geocode failed:', error);
        return NextResponse.json({ results: [], error: 'Lookup failed' }, { status: 500 });
    }
}
