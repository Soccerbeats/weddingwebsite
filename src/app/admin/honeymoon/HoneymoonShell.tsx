'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { daysBeyondRange, daysBetween, hasCoords } from '@/lib/honeymoon';
import { HoneymoonProvider } from './HoneymoonContext';
import SearchPalette from './SearchPalette';
import { UndoToast } from './ui';
import { useHoneymoon } from './useHoneymoon';

const BASE = '/admin/honeymoon';

const TABS = [
    { href: BASE, label: 'Dashboard' },
    { href: `${BASE}/map`, label: 'Map' },
    { href: `${BASE}/itinerary`, label: 'Itinerary' },
    { href: `${BASE}/travel`, label: 'Travel' },
    { href: `${BASE}/places`, label: 'Places' },
    { href: `${BASE}/stays`, label: 'Stays' },
    { href: `${BASE}/excursions`, label: 'Excursions' },
    { href: `${BASE}/checklist`, label: 'To Do' },
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
    const [searching, setSearching] = useState(false);

    // ⌘K / Ctrl-K from anywhere in the portal. Bound on the shell because it
    // must work on every tab, including the map, which owns its whole viewport.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
            event.preventDefault();
            setSearching((v) => !v);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // The map owns the viewport outright and never scrolls. The dashboard is
    // sized to fit too, but inside a scroller: its own min-height is the floor,
    // so a scrollbar appears only when the window is genuinely too small for it.
    // Everything else is a normal scrolling page.
    const isMap = pathname === `${BASE}/map`;
    const isDashboard = pathname === BASE || pathname === `${BASE}/`;

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
    const nights = daysBetween(data.trip.start_date, data.trip.end_date);
    /**
     * Days planned past the end of the trip's dates.
     *
     * Surfaced here because shortening the range leaves them behind on purpose,
     * and the only other sign is red cards on the Itinerary — which is a tab you
     * might not open for a week.
     */
    const beyond = daysBeyondRange(
        data.days.map((d) => d.day_number), data.trip.start_date, data.trip.end_date,
    );

    return (
        <HoneymoonProvider api={api}>
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <div className="w-full px-4 md:px-6 pt-4 md:pt-6 shrink-0">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
                        <div>
                            <h1 className="text-2xl font-semibold text-gray-900">{data.trip.title}</h1>
                            <p className="text-xs md:text-sm text-gray-400 mt-0.5">
                                {nights != null && <>{nights} night{nights === 1 ? '' : 's'} · </>}
                                {data.days.length} day{data.days.length === 1 ? '' : 's'} ·{' '}
                                {data.places.length} place{data.places.length === 1 ? '' : 's'} ·{' '}
                                {pinned} pinned
                                {review > 0 && <span className="text-amber-600"> · {review} to review</span>}
                                {beyond.length > 0 && (
                                    <Link
                                        href={`${BASE}/itinerary`}
                                        className="text-rose-600 hover:underline"
                                    >
                                        {' '}· {beyond.length} day{beyond.length === 1 ? '' : 's'} past
                                        the end
                                    </Link>
                                )}
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            {saving && <span className="text-xs text-gray-400">Saving…</span>}
                            <button
                                onClick={() => setSearching(true)}
                                className="rounded-full border border-gray-200 bg-white px-3 py-1.5
                                    text-sm text-gray-500 hover:bg-gray-50 transition"
                                title="Find a place, note, to-do or day"
                            >
                                Search <kbd className="text-[11px] text-gray-400">⌘K</kbd>
                            </button>
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

                    {/* Ten tabs don't fit a phone, so the strip scrolls — with a
                        fade on the right so it's visibly scrollable rather than
                        looking like the tabs simply end at Stays. Wrapping to
                        three rows instead would cost 100px of height on the one
                        screen size that can least afford it. */}
                    <div className="tab-scroller flex gap-1.5 overflow-x-auto py-3 md:py-4 -mx-1 px-1">
                        {TABS.map((t) => {
                            const active = t.href === BASE
                                ? pathname === BASE || pathname === `${BASE}/`
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
                ) : isDashboard ? (
                    <div className="flex-1 min-h-0 overflow-auto">
                        <div className="h-full w-full px-4 md:px-6 pb-4 md:pb-6">{children}</div>
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 overflow-auto">
                        <div className="w-full px-4 md:px-6 pb-6">{children}</div>
                    </div>
                )}
            </div>

            <SearchPalette api={api} open={searching} onClose={() => setSearching(false)} />

            {/* One offer at a time, above everything, wherever you are — deleting
                on the map and undoing from the itinerary is fine. */}
            {api.undo && (
                <UndoToast
                    key={api.undo.label}
                    label={api.undo.label}
                    onUndo={api.undo.restore}
                    onDismiss={api.clearUndo}
                />
            )}
        </HoneymoonProvider>
    );
}
