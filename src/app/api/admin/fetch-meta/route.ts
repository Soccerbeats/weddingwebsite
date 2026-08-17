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

    return {
        title: decodeEntities(title.trim()),
        description: decodeEntities(description.trim()),
        image,
        price,
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
        });
    }
}
