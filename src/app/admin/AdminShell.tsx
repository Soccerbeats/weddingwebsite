'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function AdminShell({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const [config, setConfig] = useState<any>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Fetch config on mount and whenever pathname changes (including when navigating to /admin)
    useEffect(() => {
        fetch('/api/admin/site-config')
            .then(res => res.json())
            .then(data => setConfig(data))
            .catch(err => console.error('Error fetching config:', err));
    }, [pathname]);

    // Close drawer on navigation
    useEffect(() => {
        setSidebarOpen(false);
    }, [pathname]);

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/admin/login');
        router.refresh();
    };

    // Grouped by what you're actually doing, because a flat list of sixteen
    // gave no clue that Finances and Seating are the same kind of job as RSVPs
    // while Colour and WIP are not.
    const isFullBleed = pathname?.startsWith('/admin/seating')
        || pathname?.startsWith('/admin/honeymoon');

    const navGroups: { title?: string; items: { href: string; label: string }[] }[] = [
        { items: [{ href: '/admin/dashboard', label: '⌂ Dashboard' }] },
        {
            // Running the wedding — the live, day-to-day work.
            title: 'Planning',
            items: [
                { href: '/admin/rsvps', label: 'RSVPs' },
                { href: '/admin/finances', label: 'Finances' },
                { href: '/admin/seating', label: 'Seating Chart' },
                { href: '/admin/honeymoon', label: 'Honeymoon' },
            ],
        },
        {
            // Page editors, in the order the pages appear in the public nav bar.
            // Nav Cards and Q&A sit under Home Page and About Page because
            // that's where those sections render.
            title: 'Pages',
            items: [
                { href: '/admin/home', label: 'Home Page' },
                { href: '/admin/nav-cards', label: 'Nav Cards' },
                { href: '/admin/about', label: 'About Page' },
                { href: '/admin/faqs', label: 'Q&A' },
                { href: '/admin/timeline', label: 'Our Story' },
                { href: '/admin/wedding-party', label: 'Wedding Party' },
                { href: '/admin/schedule', label: 'Schedule' },
                { href: '/admin/photos', label: 'Photos' },
                { href: '/admin/registry', label: 'Registry' },
            ],
        },
        {
            // Set once, rarely touched again.
            title: 'Settings',
            items: [
                { href: '/admin/settings', label: 'General Settings' },
                { href: '/admin/color', label: 'Color' },
                { href: '/admin/wip-control', label: 'Work in Progress' },
            ],
        },
    ];

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
            {/* flex-1 + min-h-0: fills the fixed AppShell container, won't overflow it */}
            <div className="flex-1 min-h-0 bg-gray-100 flex flex-col overflow-hidden">

                {/* Mobile top bar — hidden on desktop */}
                <div className="md:hidden h-14 shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-4">
                    <span className="text-base font-serif font-bold text-gray-800">Admin Panel</span>
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

                    {/* Sidebar — drawer on mobile, static on desktop */}
                    <aside className={`
                        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col overflow-y-auto
                        transition-transform duration-300 ease-in-out
                        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                        md:relative md:translate-x-0 md:shrink-0
                    `}>
                        <div className="h-16 flex items-center justify-center border-b border-gray-200 px-4 shrink-0">
                            <span className="text-lg font-serif font-bold text-gray-800 text-center">
                                Admin Panel
                            </span>
                        </div>
                        <nav className="p-4 flex-1">
                            {navGroups.map((group, i) => (
                                <div key={group.title ?? 'top'} className={i > 0 ? 'mt-6' : ''}>
                                    {group.title && (
                                        <p className="px-4 mb-2 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                                            {group.title}
                                        </p>
                                    )}
                                    <div className="space-y-1">
                                        {group.items.map((item) => (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                onClick={() => setSidebarOpen(false)}
                                                className={`block px-4 py-2 rounded-md text-sm font-medium transition-colors ${pathname?.startsWith(item.href)
                                                    ? 'bg-accent/10 text-accent'
                                                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                                    }`}
                                            >
                                                {item.label}
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            <button
                                onClick={handleLogout}
                                className="w-full text-left px-4 py-2 rounded-md text-sm font-medium text-red-600 hover:bg-red-50 transition-colors mt-8"
                            >
                                Logout
                            </button>
                        </nav>
                    </aside>

                    {/* Main Content — full-bleed pages (seating, honeymoon) own their
                        own padding and scrolling so a map can fill the viewport
                        without the shell adding a second scrollbar; everything
                        else stays padded and scrollable here. */}
                    <main className={`flex-1 min-w-0 flex flex-col ${isFullBleed ? 'overflow-hidden' : 'overflow-auto'}`}>
                        {isFullBleed
                            ? <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
                            : <div className="p-4 md:p-8">{children}</div>
                        }
                    </main>
                </div>
            </div>
        </>
    );
}
