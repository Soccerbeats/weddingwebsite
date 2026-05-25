import { NextResponse } from 'next/server';

function detectStore(url: string): 'target' | 'amazon' | 'other' {
    if (url.includes('target.com')) return 'target';
    if (url.includes('amazon.com') || url.includes('amzn.to')) return 'amazon';
    return 'other';
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

    let image = getMeta('og:image') || getMeta('twitter:image');

    // Make relative image URLs absolute
    if (image && !image.startsWith('http')) {
        const base = new URL(url);
        image = image.startsWith('/') ? `${base.origin}${image}` : `${base.origin}/${image}`;
    }

    const price = getMeta('product:price:amount') || getMeta('og:price:amount') || '';

    return {
        title: title.trim().replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
        description: description.trim().replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
        image,
        price,
    };
}

export async function POST(req: Request) {
    try {
        const { url } = await req.json();
        if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 });

        const store = detectStore(url);

        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            },
            // 10 second timeout
            signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
            return NextResponse.json({
                success: false,
                store,
                error: `Site returned ${res.status}`,
                title: '',
                description: '',
                image: '',
                price: '',
            });
        }

        const html = await res.text();
        const meta = extractMeta(html, url);

        return NextResponse.json({ success: true, store, ...meta });
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
