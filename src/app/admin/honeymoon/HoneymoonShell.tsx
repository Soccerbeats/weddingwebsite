'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { hasCoords } from '@/lib/honeymoon';
import { HoneymoonProvider } from './HoneymoonContext';
import { useHoneymoon } from './useHoneymoon';

const BASE = '/admin/honeymoon';

const TABS = [
    { href: BASE, label: 'Map' },
    { href: `${BASE}/itinerary`, label: 'Itinerary' },
    { href: `${BASE}/places`, label: 'Places' },
    { href: `${BASE}/stays`, label: 'Stays' },
    { href: `${BASE}/guide`, label: 'Guide' },
    { href: `${BASE}/settings`, label: 'Settings' },
] as const;

/**
 * Header, tab bar and shared data for every honeymoon route.
 *
 * The tabs are real links to real URLs, so a refresh keeps you on the page you
 * were on and each view is bookmarkable — previously they were local state and
 * every reload dropped you back on the map.
 */
export default function HoneymoonShell({ children }: { children: React.ReactNode }) {
    const api = useHoneymoon();
    const pathname = usePathname();
    const { data, loading, error, saving } = api;

    // The map owns the viewport and must not scroll; every other tab scrolls in
    // its own container so the header and tabs stay put.
    const isMap = pathname === BASE || pathname === `${BASE}/`;

    if (loading) {
        return (
            <div className="max-w-5xl mx-auto p-4 md:p-8">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-gray-100 rounded-2xl w-56" />
                    <div className="h-24 bg-gray-100 rounded-2xl" />
                    <div className="h-64 bg-gray-100 rounded-2xl" />
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="max-w-5xl mx-auto p-4 md:p-8">
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5">
                    <h2 className="font-semibold text-rose-900 mb-1">Couldn&apos;t load the honeymoon portal</h2>
                    <p className="text-sm text-rose-700">{error || 'Something went wrong.'}</p>
                    <button
                        onClick={api.refresh}
                        className="mt-3 rounded-full bg-white border border-rose-200 px-4 py-1.5
                            text-sm font-medium text-rose-700 hover:bg-rose-50"
                    >
                        Try again
                    </button>
                </div>
            </div>
        );
    }

    const pinned = data.places.filter(hasCoords).length;
    const review = data.places.filter((p) => p.needs_review).length;

    return (
        <HoneymoonProvider api={api}>
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <div className="w-full px-4 md:px-6 pt-4 md:pt-6 shrink-0">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
                        <div>
                            <h1 className="text-2xl font-semibold text-gray-900">{data.trip.title}</h1>
                            <p className="text-xs md:text-sm text-gray-400 mt-0.5">
                                {data.days.length} day{data.days.length === 1 ? '' : 's'} ·{' '}
                                {data.places.length} place{data.places.length === 1 ? '' : 's'} ·{' '}
                                {pinned} pinned
                                {review > 0 && <span className="text-amber-600"> · {review} to review</span>}
                            </p>
                        </div>
                        <div className="h-5 flex items-center">
                            {saving && <span className="text-xs text-gray-400">Saving…</span>}
                        </div>
                    </div>

                    {error && (
                        <div className="bg-rose-50 border border-rose-200 rounded-2xl px-4 py-2.5 my-3
                            flex items-center justify-between gap-3">
                            <span className="text-sm text-rose-700">{error}</span>
                            <button
                                onClick={api.clearError}
                                className="text-rose-400 hover:text-rose-700 text-lg leading-none"
                            >
                                &times;
                            </button>
                        </div>
                    )}

                    <div className="flex gap-1.5 overflow-x-auto py-3 md:py-4 -mx-1 px-1">
                        {TABS.map((t) => {
                            const active = t.href === BASE
                                ? isMap
                                : pathname?.startsWith(t.href);
                            return (
                                <Link
                                    key={t.href}
                                    href={t.href}
                                    className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition
                                        ${active
                                        ? 'bg-accent text-white'
                                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                >
                                    {t.label}
                                </Link>
                            );
                        })}
                    </div>
                </div>

                {isMap ? (
                    <div className="flex-1 min-h-0 px-4 md:px-6 pb-4 md:pb-6">{children}</div>
                ) : (
                    <div className="flex-1 min-h-0 overflow-auto">
                        <div className="w-full px-4 md:px-6 pb-6">{children}</div>
                    </div>
                )}
            </div>
        </HoneymoonProvider>
    );
}
