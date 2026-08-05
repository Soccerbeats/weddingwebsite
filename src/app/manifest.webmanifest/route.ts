/**
 * Web App Manifest, in two variants.
 *
 * Why a route handler instead of the `app/manifest.ts` convention: that export
 * receives no request, so it can only ever produce one manifest. iOS uses the
 * linked manifest's `start_url` when you Add to Home Screen — it ignores the
 * page you were actually on — so one site-wide manifest meant an admin page
 * added to the Home Screen opened the public site instead. `?app=admin` serves
 * a variant that starts at /admin; the admin layout links to it.
 *
 * `scope` stays '/' in both, which is the thing that stops iOS treating
 * in-app navigation as leaving the app and pasting its browser chrome on top.
 * That means the admin icon can still reach the public pages without breaking
 * out of standalone, and vice versa.
 *
 * NOTE: iOS reads the manifest once, when the icon is added. Changing anything
 * here has no effect on an already-installed icon until it's re-added.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSiteConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const config = getSiteConfig();
    const isAdmin = request.nextUrl.searchParams.get('app') === 'admin';

    // Both names or neither — "Our & Wedding" is worse than a generic title.
    const couple = config.brideName && config.groomName
        ? `${config.brideName} & ${config.groomName}`
        : null;

    const themeColor = config.accentColor || '#D4AF37';
    const iconQuery = isAdmin ? '&variant=admin' : '';

    const manifest = {
        // Distinct ids so the two are separate installed apps rather than one
        // app whose start_url keeps changing.
        id: isAdmin ? '/admin' : '/',
        name: isAdmin
            ? `${couple ? `${couple} ` : ''}Wedding Admin`
            : (couple ? `${couple} | The Wedding` : 'Our Wedding'),
        // iOS truncates the Home Screen label around 12 characters anyway.
        short_name: isAdmin ? 'Admin' : (couple ?? 'Our Wedding'),
        description: isAdmin
            ? 'Manage RSVPs, finances, photos and page content.'
            : (config.weddingDate
                ? `Join us in celebrating our wedding on ${config.weddingDate}.`
                : 'Our wedding website.'),
        start_url: isAdmin ? '/admin' : '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        // Neutral chrome for admin — it's a tool, not part of the celebration.
        theme_color: isAdmin ? '#374151' : themeColor,
        icons: [
            { src: `/api/app-icon?size=192${iconQuery}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: `/api/app-icon?size=512${iconQuery}`, sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: `/api/app-icon?size=512${iconQuery}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
    };

    return NextResponse.json(manifest, {
        headers: {
            'Content-Type': 'application/manifest+json',
            'Cache-Control': 'public, max-age=0, must-revalidate',
        },
    });
}
