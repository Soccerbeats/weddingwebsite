'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Changelog from '@/components/admin/Changelog';
import OfflineStatus from '@/components/offline/OfflineStatus';

/*
 * The admin panel's navigation.
 *
 * On a desktop it is a rail of icons (76px) that widens to show the labels —
 * the toggle at the top, remembered per device. Nothing moves vertically
 * between the two states: group titles keep their row and become a short
 * divider, so the icons stay exactly where your eye left them and only the
 * labels slide in. One highlight slides between items as you change page.
 * Collapsed, hovering an icon shows its name beside the rail.
 *
 * On a phone it is the same list as a drawer, always with labels.
 */

const COLLAPSED_KEY = 'admin-nav-collapsed';
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

type NavIcon =
    | 'dashboard' | 'rsvps' | 'finances' | 'seating' | 'honeymoon'
    | 'home' | 'cards' | 'about' | 'faqs' | 'story' | 'party' | 'schedule' | 'photos' | 'registry'
    | 'settings' | 'color' | 'wip' | 'logout' | 'panel';

const ICONS: Record<NavIcon, React.ReactNode> = {
    dashboard: (<><path d="M3.5 10.5 12 3.5l8.5 7" /><path d="M5.5 9v11h13V9" /><path d="M10 20v-5.5h4V20" /></>),
    rsvps: (<><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 7.5 8.5 6 8.5-6" /></>),
    finances: (<><rect x="3" y="6" width="18" height="14" rx="2.5" /><path d="M3 10.5h18M15.5 15h2.5" /><path d="M6 6V5a2 2 0 0 1 2-2h9" /></>),
    seating: (<><path d="M7 3.5h10v8H7z" /><path d="M5 11.5h14M7 11.5V21M17 11.5V21M7 16.5h10" /></>),
    honeymoon: (<path d="M10.2 13.8 4 12.2l-1.2 1.2 5 2.6 2.6 5 1.2-1.2-1.6-6.2 4.6-4.6 3.6 6.9 1.4-1.4-1.3-8.7 2.2-2.2a1.8 1.8 0 0 0-2.5-2.5l-2.2 2.2-8.7-1.3L3.7 5.2l6.9 3.6-4.6 4.6" />),
    home: (<><rect x="3" y="3.5" width="18" height="17" rx="2.5" /><path d="M3 9h18M9 20.5V9" /></>),
    cards: (<><rect x="3" y="7.5" width="13.5" height="13.5" rx="2" /><path d="M7.5 3.5H19a2 2 0 0 1 2 2V17" /></>),
    about: (<><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.8h.01" /></>),
    faqs: (<><path d="M20.5 12a8.5 8.5 0 0 1-12.4 7.6L3.5 21l1.4-4.6A8.5 8.5 0 1 1 20.5 12Z" /><path d="M9.6 9.6a2.4 2.4 0 1 1 3.2 2.3c-.5.2-.8.6-.8 1.1v.4M12 16h.01" /></>),
    story: (<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20Z" />),
    party: (<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6" /></>),
    schedule: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 2" /></>),
    photos: (<><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="9.5" r="1.8" /><path d="m21 15.5-5-5L6.5 20" /></>),
    registry: (<><rect x="3" y="8" width="18" height="4.5" rx="1.2" /><path d="M5 12.5V20h14v-7.5M12 8v12" /><path d="M12 8S10.5 3.6 8 4.3C6 4.9 6.6 8 9 8M12 8s1.5-4.4 4-3.7c2 .6 1.4 3.7-1 3.7" /></>),
    settings: (<><circle cx="12" cy="12" r="3" /><path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" /></>),
    color: (<><path d="M12 3a9 9 0 0 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.3-1-1.6-1-2.8 0-1 .8-1.5 1.8-1.5H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3Z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="15" cy="7.5" r="1" /></>),
    wip: (<><path d="M9.5 4h5l4 16h-13l4-16Z" /><path d="M8 10.5h8M7 15.5h10M3.5 20h17" /></>),
    logout: (<><path d="M9 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3" /><path d="m15.5 16 4-4-4-4M19.5 12H9" /></>),
    panel: (<><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M9 4v16" /><path d="m13.5 10 2 2-2 2" /></>),
};

function NavGlyph({ name, className = 'size-5' }: { name: NavIcon; className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
            strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
            {ICONS[name]}
        </svg>
    );
}

// Grouped by what you're actually doing, because a flat list of sixteen
// gave no clue that Finances and Seating are the same kind of job as RSVPs
// while Colour and WIP are not.
const NAV_GROUPS: { title?: string; items: { href: string; label: string; icon: NavIcon }[] }[] = [
    { items: [{ href: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard' }] },
    {
        // Running the wedding — the live, day-to-day work.
        title: 'Planning',
        items: [
            { href: '/admin/rsvps', label: 'RSVPs', icon: 'rsvps' },
            { href: '/admin/finances', label: 'Finances', icon: 'finances' },
            { href: '/admin/seating', label: 'Seating Chart', icon: 'seating' },
            { href: '/admin/honeymoon', label: 'Honeymoon', icon: 'honeymoon' },
        ],
    },
    {
        // Page editors, in the order the pages appear in the public nav bar.
        // Nav Cards and Q&A sit under Home Page and About Page because
        // that's where those sections render.
        title: 'Pages',
        items: [
            { href: '/admin/home', label: 'Home Page', icon: 'home' },
            { href: '/admin/nav-cards', label: 'Nav Cards', icon: 'cards' },
            { href: '/admin/about', label: 'About Page', icon: 'about' },
            { href: '/admin/faqs', label: 'Q&A', icon: 'faqs' },
            { href: '/admin/timeline', label: 'Our Story', icon: 'story' },
            { href: '/admin/wedding-party', label: 'Wedding Party', icon: 'party' },
            { href: '/admin/schedule', label: 'Schedule', icon: 'schedule' },
            { href: '/admin/photos', label: 'Photos', icon: 'photos' },
            { href: '/admin/registry', label: 'Registry', icon: 'registry' },
        ],
    },
    {
        // Set once, rarely touched again.
        title: 'Settings',
        items: [
            { href: '/admin/settings', label: 'General Settings', icon: 'settings' },
            { href: '/admin/color', label: 'Color', icon: 'color' },
            { href: '/admin/wip-control', label: 'Work in Progress', icon: 'wip' },
        ],
    },
];

export default function AdminSidebar({ pathname, open, onClose, onLogout }: {
    pathname: string | null;
    /** The phone drawer. */
    open: boolean;
    onClose: () => void;
    onLogout: () => void;
}) {
    // Starts collapsed (the server cannot know), then follows what this device
    // chose. Transitions switch on only after that, so a device that keeps it
    // open does not watch it open on every load.
    const [collapsed, setCollapsed] = useState(true);
    const [animate, setAnimate] = useState(false);
    useEffect(() => {
        try {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            if (window.localStorage.getItem(COLLAPSED_KEY) === '0') setCollapsed(false);
        } catch {
            // No storage: stays a rail.
        }
        const frame = requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true)));
        return () => cancelAnimationFrame(frame);
    }, []);
    const toggle = () => {
        setTip(null);
        setCollapsed((was) => {
            try { window.localStorage.setItem(COLLAPSED_KEY, was ? '0' : '1'); } catch { /* not remembered */ }
            return !was;
        });
    };

    // The highlight under the current page, slid there rather than redrawn.
    const navRef = useRef<HTMLElement>(null);
    const links = useRef(new Map<string, HTMLAnchorElement>());
    const activeHref = NAV_GROUPS.flatMap((g) => g.items)
        .filter((item) => pathname?.startsWith(item.href))
        .sort((a, b) => b.href.length - a.href.length)[0]?.href;
    const [pill, setPill] = useState<{ top: number; height: number } | null>(null);
    const placePill = useCallback(() => {
        const el = activeHref ? links.current.get(activeHref) : undefined;
        setPill(el ? { top: el.offsetTop, height: el.offsetHeight } : null);
    }, [activeHref]);
    useLayoutEffect(() => {
        placePill();
        window.addEventListener('resize', placePill);
        return () => window.removeEventListener('resize', placePill);
    }, [placePill]);

    // Collapsed, an icon's name floats beside the rail. Drawn outside the
    // scrolling list, which would clip it.
    const [tip, setTip] = useState<{ label: string; top: number; left: number } | null>(null);
    const showTip = (label: string) => (event: React.SyntheticEvent<HTMLElement>) => {
        if (!collapsed || !window.matchMedia('(min-width: 768px)').matches) return;
        const rect = event.currentTarget.getBoundingClientRect();
        setTip({ label, top: rect.top + rect.height / 2, left: rect.right + 12 });
    };
    const hideTip = () => setTip(null);

    const motion = animate ? 'motion-reduce:transition-none' : 'transition-none';
    const ease = { transitionTimingFunction: EASE };
    // Labels fade and slide in after the rail has started to widen; going the
    // other way they leave at once, so they are never squashed by the edge.
    const labelClass = `whitespace-nowrap transition-[opacity,transform] duration-300 ${motion} ${
        collapsed ? 'md:pointer-events-none md:-translate-x-2 md:opacity-0' : ''}`;
    const labelStyle = (index: number) => ({
        ...ease,
        transitionDelay: collapsed ? '0ms' : `${80 + index * 8}ms`,
    });

    let index = 0;
    return (
        <>
            <aside
                data-admin-sidebar
                data-collapsed={collapsed}
                className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col overflow-hidden border-r border-gray-200 bg-white
                    transition-[transform,width] duration-500 ${motion}
                    ${open ? 'translate-x-0' : '-translate-x-full'}
                    md:relative md:shrink-0 md:translate-x-0 ${collapsed ? 'md:w-[76px]' : 'md:w-64'}`}
                style={ease}
                onMouseLeave={hideTip}
            >
                <div className="flex h-16 shrink-0 items-center gap-2 border-b border-gray-200 px-3">
                    <button
                        type="button"
                        onClick={toggle}
                        onMouseEnter={showTip(collapsed ? 'Expand menu' : '')}
                        onMouseLeave={hideTip}
                        aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
                        aria-expanded={!collapsed}
                        aria-controls="admin-nav"
                        className="hidden size-[52px] shrink-0 items-center justify-center rounded-2xl text-gray-500
                            transition-colors hover:bg-gray-100 hover:text-gray-900 md:flex"
                    >
                        <span
                            className={`transition-transform duration-500 ${motion} ${collapsed ? '' : 'rotate-180'}`}
                            style={ease}
                        >
                            <NavGlyph name="panel" className="size-[22px]" />
                        </span>
                    </button>
                    <span
                        className={`font-serif text-lg font-bold text-gray-800 max-md:flex-1 max-md:px-2 ${labelClass}`}
                        style={labelStyle(0)}
                    >
                        Admin Panel
                    </span>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                    <nav id="admin-nav" ref={navRef} className="relative p-3">
                        {pill && (
                            <span
                                aria-hidden
                                className={`pointer-events-none absolute inset-x-3 top-0 rounded-2xl bg-accent/10
                                    transition-transform duration-500 ${motion}`}
                                style={{ ...ease, height: pill.height, transform: `translateY(${pill.top}px)` }}
                            >
                                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-x-3 -translate-y-1/2 rounded-r-full bg-accent" />
                            </span>
                        )}
                        {NAV_GROUPS.map((group, g) => (
                            <div key={group.title ?? 'top'} className={g > 0 ? 'mt-3' : ''}>
                                {group.title && (
                                    <div className="relative flex h-8 items-center px-[14px]">
                                        <span
                                            aria-hidden
                                            className={`absolute left-1/2 top-1/2 h-px w-6 -translate-x-1/2 bg-gray-200 transition-opacity duration-300 ${motion}
                                                max-md:hidden ${collapsed ? 'opacity-100' : 'opacity-0'}`}
                                        />
                                        <p
                                            className={`text-[11px] font-semibold uppercase tracking-widest text-gray-400 ${labelClass}`}
                                            style={labelStyle(index)}
                                        >
                                            {group.title}
                                        </p>
                                    </div>
                                )}
                                <div className="space-y-1">
                                    {group.items.map((item) => {
                                        const active = item.href === activeHref;
                                        const i = ++index;
                                        return (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                ref={(el) => { if (el) links.current.set(item.href, el); else links.current.delete(item.href); }}
                                                onClick={onClose}
                                                onMouseEnter={showTip(item.label)}
                                                onMouseLeave={hideTip}
                                                onFocus={showTip(item.label)}
                                                onBlur={hideTip}
                                                aria-label={collapsed ? item.label : undefined}
                                                aria-current={active ? 'page' : undefined}
                                                className={`relative flex h-11 items-center gap-3 rounded-2xl px-[14px] text-sm font-medium transition-colors ${
                                                    active ? 'text-accent-dark' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}
                                            >
                                                <NavGlyph name={item.icon} className="size-6 shrink-0" />
                                                <span className={labelClass} style={labelStyle(i)}>{item.label}</span>
                                            </Link>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </nav>
                </div>

                <div className="shrink-0 space-y-2 border-t border-gray-200 p-3">
                    {/* The sync status needs words; collapsed, it waits for the menu to open. */}
                    <div className={collapsed ? 'md:hidden' : ''}>
                        <OfflineStatus />
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onLogout}
                            onMouseEnter={showTip('Logout')}
                            onMouseLeave={hideTip}
                            aria-label={collapsed ? 'Logout' : undefined}
                            className={`flex h-11 items-center gap-3 rounded-2xl px-[14px] text-sm font-medium text-red-600
                                transition-colors hover:bg-red-50 flex-1`}
                        >
                            <NavGlyph name="logout" className="size-6 shrink-0" />
                            <span className={labelClass} style={labelStyle(0)}>Logout</span>
                        </button>
                        {/* The release notes belong where the panel is named,
                            not only in the repository. The version is too wide
                            for the rail, so collapsed it waits with the labels. */}
                        <span className={collapsed ? 'md:hidden' : ''}><Changelog /></span>
                    </div>
                </div>
            </aside>

            {tip?.label && (
                <div
                    role="tooltip"
                    className="pointer-events-none fixed z-[60] hidden -translate-y-1/2 rounded-full bg-gray-900 px-3 py-1.5
                        text-xs font-medium text-white shadow-lg md:block"
                    style={{ top: tip.top, left: tip.left, animation: 'admin-tip-in 180ms ease-out' }}
                >
                    {tip.label}
                </div>
            )}
        </>
    );
}
