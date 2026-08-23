import { NextResponse } from 'next/server';

function detectStore(url: string): 'target' | 'amazon' | 'other' {
    if (url.includes('target.com')) return 'target';
    if (url.includes('amazon.com') || url.includes('amzn.to')) return 'amazon';
    return 'other';
}

/** The handful of HTML entities that actually show up in meta tag content. */
function decodeEntities(value: string): string {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

/** A coordinate pair that could plausibly be a real place on Earth. */
function validCoords(lat: number, lng: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
    // Null Island is what a missing value looks like once it has been parsed.
    return !(lat === 0 && lng === 0);
}

/** Types whose JSON-LD carries the address of the thing you are looking at. */
const PLACE_TYPES = new Set([
    'Hotel', 'LodgingBusiness', 'Resort', 'BedAndBreakfast', 'Hostel', 'Motel',
    'Apartment', 'ApartmentComplex', 'House', 'SingleFamilyResidence', 'Campground',
    'Place', 'LocalBusiness', 'TouristAttraction', 'Restaurant',
]);

interface PostalAddress {
    streetAddress?: string;
    addressLocality?: string;
    addressRegion?: string;
    postalCode?: string;
    addressCountry?: string | { name?: string };
}

/** A PostalAddress as one line, without repeating what is already in it. */
function addressLine(address: PostalAddress): string {
    const country = typeof address.addressCountry === 'string'
        ? address.addressCountry
        : address.addressCountry?.name ?? '';

    // Booking's streetAddress is usually the whole thing already — "Strand,
    // Westminster Borough, London, WC2R 0EU, United Kingdom". Appending the
    // region and country to that produces "…, United Kingdom, Greater London,
    // UK", which is worse than the address it started from. Three or more
    // comma-separated parts is the tell that it needs nothing added.
    const street = (address.streetAddress ?? '').trim();
    if (street.split(',').filter((part) => part.trim()).length >= 3) return street;

    const parts = [
        address.streetAddress, address.addressLocality, address.addressRegion,
        address.postalCode, country,
    ];
    const out: string[] = [];
    for (const part of parts) {
        const value = (part ?? '').trim();
        if (!value) continue;
        // Booking's streetAddress is often the whole address already —
        // "Strand, Westminster Borough, London, WC2R 0EU, United Kingdom" — so
        // anything already spelled out in what we have is not appended again.
        if (out.some((have) => have.toLowerCase().includes(value.toLowerCase()))) continue;
        out.push(value);
    }
    return out.join(', ');
}

/**
 * Address and coordinates from a listing page.
 *
 * Three sources, in order of how much they can be trusted:
 *
 *   1. JSON-LD — the page telling us, in a documented format, what this place is.
 *      Only a node whose @type is a place is read: Booking.com also embeds its
 *      *own* corporate address ("82 rue Henri Farman, Issy-les-Moulineaux") in a
 *      trader-info block, and a naive scan for "address" finds that instead.
 *   2. `b_map_center_latitude/longitude` — Booking's own map centre, which is
 *      where it drops its pin. Their JSON-LD carries no geo block, so for the
 *      site this feature exists for, this is the coordinate that actually works.
 *   3. A bare "latitude"/"longitude" pair anywhere in the page, as a last resort
 *      for other booking sites.
 */
function extractPlace(html: string): { address: string; lat: number | null; lng: number | null } {
    let address = '';
    let lat: number | null = null;
    let lng: number | null = null;

    const blocks = [...html.matchAll(
        /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    )];
    for (const block of blocks) {
        let parsed: unknown;
        try { parsed = JSON.parse(block[1].trim()); } catch { continue; }
        // A block can be one node, a list of them, or an @graph wrapper.
        const queue: unknown[] = [parsed];
        while (queue.length) {
            const node = queue.shift();
            if (Array.isArray(node)) { queue.push(...node); continue; }
            if (!node || typeof node !== 'object') continue;
            const row = node as Record<string, unknown>;
            if (Array.isArray(row['@graph'])) queue.push(...row['@graph']);

            const types = [row['@type']].flat().filter((t): t is string => typeof t === 'string');
            if (!types.some((t) => PLACE_TYPES.has(t))) continue;

            if (!address && row.address && typeof row.address === 'object') {
                address = addressLine(row.address as PostalAddress);
            } else if (!address && typeof row.address === 'string') {
                address = row.address.trim();
            }
            const geo = row.geo as { latitude?: unknown; longitude?: unknown } | undefined;
            if (lat == null && geo && typeof geo === 'object') {
                const gLat = Number(geo.latitude);
                const gLng = Number(geo.longitude);
                if (validCoords(gLat, gLng)) { lat = gLat; lng = gLng; }
            }
        }
    }

    if (lat == null) {
        const mapLat = Number(html.match(/b_map_center_latitude\s*[=:]\s*'?(-?\d+(\.\d+)?)/)?.[1]);
        const mapLng = Number(html.match(/b_map_center_longitude\s*[=:]\s*'?(-?\d+(\.\d+)?)/)?.[1]);
        if (validCoords(mapLat, mapLng)) { lat = mapLat; lng = mapLng; }
    }

    if (lat == null) {
        const pairLat = Number(html.match(/"latitude"\s*:\s*"?(-?\d+(\.\d+)?)/)?.[1]);
        const pairLng = Number(html.match(/"longitude"\s*:\s*"?(-?\d+(\.\d+)?)/)?.[1]);
        if (validCoords(pairLat, pairLng)) { lat = pairLat; lng = pairLng; }
    }

    // Six decimal places is roughly a tenth of a metre — more than a hotel
    // needs, and it keeps the stored value the same shape as a pin dropped by
    // hand in the editor.
    return {
        address,
        lat: lat == null ? null : Number(lat.toFixed(6)),
        lng: lng == null ? null : Number(lng.toFixed(6)),
    };
}

function extractMeta(html: string, url: string) {
    const getMeta = (prop: string) => {
        const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
            || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'));
        return m ? m[1] : '';
    };

    const title = getMeta('og:title') || getMeta('twitter:title')
        || (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? '');

    const description = getMeta('og:description') || getMeta('twitter:description')
        || getMeta('description');

    // Decode entities before anything else touches it: og:image is written into
    // HTML, so a query string arrives as "?k=...&amp;o=" and the &amp; becomes a
    // bogus parameter name. Title and description were already decoded below;
    // the image was not, which quietly corrupted every multi-parameter image URL.
    let image = decodeEntities(getMeta('og:image') || getMeta('twitter:image'));

    // Make relative image URLs absolute
    if (image && !image.startsWith('http')) {
        const base = new URL(url);
        image = image.startsWith('/') ? `${base.origin}${image}` : `${base.origin}/${image}`;
    }

    const price = getMeta('product:price:amount') || getMeta('og:price:amount') || '';

    const place = extractPlace(html);
    // Some sites put the coordinates in meta tags instead.
    if (place.lat == null) {
        const metaLat = Number(getMeta('place:location:latitude') || getMeta('og:latitude'));
        const metaLng = Number(getMeta('place:location:longitude') || getMeta('og:longitude'));
        if (validCoords(metaLat, metaLng)) {
            place.lat = Number(metaLat.toFixed(6));
            place.lng = Number(metaLng.toFixed(6));
        }
    }

    return {
        title: decodeEntities(title.trim()),
        description: decodeEntities(description.trim()),
        image,
        price,
        address: decodeEntities(place.address),
        lat: place.lat,
        lng: place.lng,
    };
}

export async function POST(req: Request) {
    try {
        const { url } = await req.json();
        if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 });

        const store = detectStore(url);

        // Two attempts, in order. A plain browser UA is the honest first ask;
        // some sites (Booking.com among them) answer that with a bot challenge
        // carrying no metadata at all, but serve the full Open Graph block to
        // link-preview crawlers — which is exactly what those tags exist for.
        const attempts = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        ];

        let lastStatus = 0;
        for (const ua of attempts) {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': ua,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                },
                // 10 second timeout
                signal: AbortSignal.timeout(10000),
            });
            lastStatus = res.status;
            if (!res.ok) continue;

            const html = await res.text();
            const meta = extractMeta(html, url);
            // A challenge page returns 200 with no Open Graph block, so an empty
            // result is a reason to try the next agent rather than to give up.
            if (meta.title || meta.image) {
                return NextResponse.json({ success: true, store, ...meta });
            }
        }

        return NextResponse.json({
            success: false,
            store,
            error: lastStatus && lastStatus !== 200
                ? `Site returned ${lastStatus}`
                : 'No preview data on that page',
            title: '',
            description: '',
            image: '',
            price: '',
            address: '',
            lat: null,
            lng: null,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Fetch failed';
        return NextResponse.json({
            success: false,
            error: msg,
            store: 'other',
            title: '',
            description: '',
            image: '',
            price: '',
            address: '',
            lat: null,
            lng: null,
        });
    }
}
