/**
 * Server wrapper around the admin shell.
 *
 * Exists only to override one piece of metadata: the manifest link. iOS uses
 * the linked manifest's `start_url` when you Add to Home Screen, ignoring
 * whatever page you were actually on — so with a single site-wide manifest,
 * adding /admin produced an icon that opened the public home page. Pointing
 * admin pages at a second manifest variant gives that icon `start_url:
 * '/admin'` instead. A nested layout's `manifest` field wins over the root's.
 *
 * The interactive shell stays in AdminShell (a client component, which cannot
 * export metadata).
 */
import type { Metadata } from 'next';
import AdminShell from './AdminShell';

export const metadata: Metadata = {
    manifest: '/manifest.webmanifest?app=admin',
    // On iOS the apple-touch-icon wins over the manifest's icons, so the admin
    // variant has to be declared here too or the Home Screen icon would be
    // identical to the public site's.
    icons: {
        icon: [{ url: '/api/app-icon?size=192&variant=admin', sizes: '192x192', type: 'image/png' }],
        apple: [{ url: '/api/app-icon?size=180&variant=admin', sizes: '180x180', type: 'image/png' }],
    },
    // Restated in full: this object replaces the root's rather than merging
    // into it, so omitting a field would silently drop it.
    appleWebApp: {
        capable: true,
        title: 'Wedding Admin',
        statusBarStyle: 'default',
    },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return <AdminShell>{children}</AdminShell>;
}
