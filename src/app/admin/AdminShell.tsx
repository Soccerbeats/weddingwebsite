'use client';

import Changelog from '@/components/admin/Changelog';
import AdminSidebar from './AdminSidebar';
import PullToRefresh from '@/components/offline/PullToRefresh';
import { clearOffline, inFrame, isStandalone } from '@/components/offline/offlineStore';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { LAST_ADMIN_PAGE_KEY, launchRestore } from '@/lib/loginReturn';

export default function AdminShell({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const [config, setConfig] = useState<{ accentColor?: string; accentLightColor?: string; accentDarkColor?: string } | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Fetch config on mount and whenever pathname changes (including when navigating to /admin)
    useEffect(() => {
        fetch('/api/admin/site-config')
            .then(res => res.json())
            .then(data => setConfig(data))
            .catch(err => console.error('Error fetching config:', err));
    }, [pathname]);

    /*
     * Reopen the installed app where you left it — the fallback.
     *
     * Normally the offline worker does this before anything draws (it answers
     * the launch's `/admin` with a redirect; see the effect below and
     * `launchTarget` in sw.js). This covers a launch the worker did not answer:
     * the very first one, or a phone that has not got the worker yet.
     *
     * The phone opens the app at its front door (`/admin`, which is the
     * dashboard) whenever it had been closed in the background. Once per launch,
     * and only in the installed app, that sends you to the last page instead. A
     * browser tab opened at /admin is a deliberate visit and is left alone.
     *
     * `/admin` itself is skipped, not handled: it redirects to the dashboard in
     * the browser after this shell has mounted, and a replace issued there loses
     * the race to that redirect. The launch is handled on the page it settles on.
     *
     * A full page replace, not `router.replace`: issued while the app is still
     * starting up, the router fetched the page and then never switched to it.
     * One extra load at launch, answered from the saved copy when offline.
     *
     * Declared before the effect that records the page, so it reads the page
     * you were on before this launch rather than the dashboard it just opened.
     *
     * Neither effect runs in a hidden frame: the offline save pass opens every
     * admin page in one, and they share this tab's storage — they used to spend
     * the launch and overwrite the last page with whatever they opened last.
     */
    useEffect(() => {
        if (!pathname || pathname === '/admin' || inFrame()) return;
        try {
            if (window.sessionStorage.getItem('admin-launch-seen')) return;
            window.sessionStorage.setItem('admin-launch-seen', '1');
            if (pathname === '/admin/login' || !isStandalone()) return;
            const target = launchRestore(pathname, window.localStorage.getItem(LAST_ADMIN_PAGE_KEY));
            if (target) window.location.replace(target);
        } catch {
            // No storage (a private window): nothing to restore.
        }
    }, [pathname]);

    /* Remember the page shown, for the sign-in and the next launch to return to. */
    useEffect(() => {
        // `/admin` is only ever on its way to the dashboard; it is nowhere you were.
        if (!pathname || pathname === '/admin' || pathname === '/admin/login' || inFrame()) return;
        try {
            window.localStorage.setItem(LAST_ADMIN_PAGE_KEY, pathname + window.location.search);
        } catch {
            // Storage refused: signing in falls back to the page asked for.
        }
        // The worker answers the next launch with it, so the app opens on this
        // page instead of drawing the dashboard first (`launchTarget` in sw.js).
        // Only from the installed app: a browser tab opening /admin means it.
        if (isStandalone()) {
            navigator.serviceWorker?.controller?.postMessage({
                type: 'site-sw:last-page', path: pathname + window.location.search,
            });
        }
    }, [pathname]);

    // Close drawer on navigation
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSidebarOpen(false);
    }, [pathname]);

    const handleLogout = async () => {
        // Signing out also forgets everything saved on this device for offline
        // use — the admin pages and their data were saved under this session.
        await clearOffline();
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
        router.push('/admin/login');
        router.refresh();
    };

    const isFullBleed = pathname?.startsWith('/admin/seating')
        || pathname?.startsWith('/admin/honeymoon')
        // The changelog owns its own scrolling: its version nav is sticky and
        // its scrollspy needs a scroll container it can name as the root.
        || pathname?.startsWith('/admin/changelog');

    // Pages whose content is tabular and wants the width: 32px of gutter either
    // side is breathing room on a form and lost column on a budget.
    const isWideGutter = pathname?.startsWith('/admin/finances');

    if (pathname === '/admin/login') {
        return <>{children}</>;
    }

    return (
        <>
            <style dangerouslySetInnerHTML={{
                __html: `
                    :root {
                        --accent: ${config?.accentColor || '#D4AF37'};
                        --accent-light: ${config?.accentLightColor || '#F4E5C3'};
                        --accent-dark: ${config?.accentDarkColor || '#B8941F'};
                    }
                `
            }} />
            <PullToRefresh />
            {/* flex-1 + min-h-0: fills the fixed AppShell container, won't overflow it */}
            <div className="flex-1 min-h-0 bg-gray-100 flex flex-col overflow-hidden">

                {/* Mobile top bar — hidden on desktop */}
                <div
                    data-admin-topbar
                    className="md:hidden h-14 shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-4"
                >
                    <span className="flex items-center gap-2">
                        <span className="text-base font-serif font-bold text-gray-800">Admin Panel</span>
                        {/* Also here: on a phone the sidebar's own header sits
                            behind the site's floating nav and can't be tapped. */}
                        <Changelog />
                    </span>
                    <button
                        onClick={() => setSidebarOpen(o => !o)}
                        className="p-2 rounded-md text-gray-600 hover:bg-gray-100 transition-colors"
                        aria-label="Toggle navigation"
                    >
                        {sidebarOpen ? (
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        ) : (
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        )}
                    </button>
                </div>

                <div className="flex-1 min-h-0 flex overflow-hidden relative">
                    {/* Backdrop — mobile only, shown when drawer open */}
                    {sidebarOpen && (
                        <div
                            className="fixed inset-0 bg-black/40 z-40 md:hidden"
                            onClick={() => setSidebarOpen(false)}
                        />
                    )}

                    {/* Drawer on a phone; on a desktop a rail of icons that widens. */}
                    <AdminSidebar
                        pathname={pathname}
                        open={sidebarOpen}
                        onClose={() => setSidebarOpen(false)}
                        onLogout={handleLogout}
                    />

                    {/* Main Content — full-bleed pages (seating, honeymoon) own their
                        own padding and scrolling so a map can fill the viewport
                        without the shell adding a second scrollbar; everything
                        else stays padded and scrollable here. */}
                    <main className={`flex-1 min-w-0 flex flex-col ${isFullBleed ? 'overflow-hidden' : 'overflow-auto'}`}>
                        {isFullBleed
                            ? <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
                            : <div className={isWideGutter ? 'p-3 md:p-5' : 'p-4 md:p-8'}>{children}</div>
                        }
                    </main>
                </div>
            </div>
        </>
    );
}
