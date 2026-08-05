/**
 * Web App Manifest.
 *
 * The site had none. Without one, iOS has no idea which URLs belong to the
 * installed app, so every navigation off the page you launched on counts as
 * leaving it — and iOS drops its in-app browser chrome on top (the ✕ at the
 * top-left, the back/forward bar at the bottom). Declaring `scope` is what
 * tells it "all of this is still my app".
 *
 * NOTE: iOS reads the manifest once, when the icon is added to the Home
 * Screen. An already-installed icon keeps whatever it was installed with, so
 * it has to be deleted and re-added for this to take effect.
 */
import type { MetadataRoute } from 'next';
import { getSiteConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

export default function manifest(): MetadataRoute.Manifest {
    const config = getSiteConfig();
    // Both names or neither — "Our & Wedding" is worse than a generic title.
    const couple = config.brideName && config.groomName
        ? `${config.brideName} & ${config.groomName}`
        : null;

    return {
        id: '/',
        name: couple ? `${couple} | The Wedding` : 'Our Wedding',
        // iOS truncates the Home Screen label around 12 characters anyway.
        short_name: couple ?? 'Our Wedding',
        description: config.weddingDate
            ? `Join us in celebrating our wedding on ${config.weddingDate}.`
            : 'Our wedding website.',
        start_url: '/',
        // The whole point — every path on the site stays inside the app.
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: config.accentColor || '#D4AF37',
        icons: [
            { src: '/api/app-icon?size=192', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/api/app-icon?size=512', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/api/app-icon?size=512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
    };
}
