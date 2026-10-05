'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Sheet } from './kit/Sheet';

const BASE = '/admin/honeymoon';

interface BarItem {
    href: string;
    label: string;
    icon: string;
    also?: string[];
}

/** The four a thumb reaches for on the trip, plus More. */
const PRIMARY: BarItem[] = [
    { href: `${BASE}/today`, label: 'Today', icon: '☀️' },
    { href: `${BASE}/itinerary`, label: 'Itinerary', icon: '🗓️' },
    { href: `${BASE}/map`, label: 'Map', icon: '🗺️' },
    { href: `${BASE}/places`, label: 'Places', icon: '📍', also: [`${BASE}/stays`, `${BASE}/excursions`] },
];

const MORE: BarItem[] = [
    { href: BASE, label: 'Overview', icon: '📊' },
    { href: `${BASE}/travel`, label: 'Travel', icon: '✈️' },
    { href: `${BASE}/checklist`, label: 'Checklist', icon: '✅' },
    { href: `${BASE}/files`, label: 'Files', icon: '🗂️' },
    { href: `${BASE}/guide`, label: 'Guide', icon: '📖' },
    { href: `${BASE}/settings`, label: 'Settings', icon: '⚙️' },
];

function isOn(item: BarItem, pathname: string | null): boolean {
    if (item.href === BASE) return pathname === BASE || pathname === `${BASE}/`;
    return [item.href, ...(item.also ?? [])].some((href) => pathname?.startsWith(href));
}

/**
 * The phone's navigation: a bar along the bottom, where a thumb already is.
 *
 * Replaces the strip of eleven pills that scrolled sideways under the title,
 * most of it off-screen. Below 768px only; the desktop keeps its tab row.
 */
export default function MobileTabBar() {
    const pathname = usePathname();
    const [more, setMore] = useState(false);
    const moreOn = MORE.some((item) => isOn(item, pathname));

    return (
        <>
            <nav
                data-mobile-tabbar
                aria-label="Honeymoon sections"
                className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95
                    pb-[env(safe-area-inset-bottom)] backdrop-blur"
            >
                <ul className="grid grid-cols-5">
                    {PRIMARY.map((item) => {
                        const on = isOn(item, pathname);
                        return (
                            <li key={item.href}>
                                <Link
                                    href={item.href}
                                    aria-current={on ? 'page' : undefined}
                                    className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium
                                        ${on ? 'text-accent' : 'text-gray-500'}`}
                                >
                                    <span aria-hidden className={`text-lg leading-none ${on ? '' : 'grayscale opacity-70'}`}>{item.icon}</span>
                                    {item.label}
                                </Link>
                            </li>
                        );
                    })}
                    <li>
                        <button
                            type="button"
                            onClick={() => setMore(true)}
                            aria-expanded={more}
                            className={`flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium
                                ${moreOn ? 'text-accent' : 'text-gray-500'}`}
                        >
                            <span aria-hidden className="text-lg leading-none">•••</span>
                            More
                        </button>
                    </li>
                </ul>
            </nav>
            <Sheet open={more} onClose={() => setMore(false)} title={<h2 className="font-semibold text-gray-900">More</h2>}>
                <ul className="grid grid-cols-1 gap-1">
                    {MORE.map((item) => (
                        <li key={item.href}>
                            <Link
                                href={item.href}
                                onClick={() => setMore(false)}
                                className={`flex min-h-12 items-center gap-3 rounded-2xl px-3 text-base
                                    ${isOn(item, pathname) ? 'bg-accent/10 font-semibold text-gray-900' : 'text-gray-700 hover:bg-gray-50'}`}
                            >
                                <span aria-hidden className="text-xl">{item.icon}</span>
                                {item.label}
                            </Link>
                        </li>
                    ))}
                </ul>
            </Sheet>
        </>
    );
}
