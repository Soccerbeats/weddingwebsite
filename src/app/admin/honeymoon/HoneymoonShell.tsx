'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { daysBeyondRange, daysBetween, hasCoords } from '@/lib/honeymoon';
import { HoneymoonProvider } from './HoneymoonContext';
import SearchPalette from './SearchPalette';
import ReauthModal from './ReauthModal';
import { UndoToast } from './ui';
import { useHoneymoon } from './useHoneymoon';

const BASE = '/admin/honeymoon';

const TABS = [
    { href: BASE, label: 'Dashboard' },
    // Second, not last: on the trip itself this is the only tab that matters,
    // and it should be reachable without scrolling the strip.
    { href: `${BASE}/today`, label: 'Today' },
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
    const router = useRouter();
    const { data, loading, error, saving } = api;
    const [searching, setSearching] = useState(false);
    const [showKeys, setShowKeys] = useState(false);
    /** True while waiting for the second key of a `g`-prefixed jump. */
    const [goto, setGoto] = useState(false);

    /*
     * Portal-wide keys, bound on the shell because they must work on every tab
     * including the map, which owns its whole viewport.
     *
     * ⌘K opens search; ⌘Z undoes the last delete. Both are ignored while you are
     * typing — ⌘Z in a text box is the browser's, and taking it would make
     * editing a note feel broken to fix a problem it doesn't have.
     */
    useEffect(() => {
        const typing = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const tag = target?.tagName;
            return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
                || target?.isContentEditable === true;
        };

        const onKey = (event: KeyboardEvent) => {
            if (event.metaKey || event.ctrlKey) {
                const key = event.key.toLowerCase();
                if (key === 'k') {
                    event.preventDefault();
                    setSearching((v) => !v);
                    return;
                }
                if (key !== 'z' || event.shiftKey || typing(event) || !api.undo) return;
                event.preventDefault();
                void api.undoLast();
                return;
            }

            /*
             * Bare keys, only when you are not typing into something.
             *
             * `/` for search is the convention every list-shaped app follows;
             * `[` and `]` walk the days on the Today view, which is the one
             * screen where the next thing you want is almost always the next
             * day; `?` lists the lot, because a shortcut nobody can discover is
             * a shortcut nobody uses.
             */
            if (typing(event) || event.altKey) return;
            if (event.key === '/') { event.preventDefault(); setSearching(true); return; }
            if (event.key === '?') { event.preventDefault(); setShowKeys((v) => !v); return; }
            if (event.key === 'g') { event.preventDefault(); setGoto(true); return; }
            if (event.key === 'n') {
                event.preventDefault();
                window.dispatchEvent(new CustomEvent('honeymoon:new-place'));
                return;
            }
            if (event.key === '[' || event.key === ']') {
                window.dispatchEvent(new CustomEvent('honeymoon:step-day', {
                    detail: event.key === '[' ? -1 : 1,
                }));
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [api]);

    /* `g` then a letter: the two-key jump every keyboard-driven app has. */
    useEffect(() => {
        if (!goto) return;
        const targets: Record<string, string> = {
            d: BASE, t: `${BASE}/today`, m: `${BASE}/map`, i: `${BASE}/itinerary`,
            v: `${BASE}/travel`, p: `${BASE}/places`, s: `${BASE}/stays`,
            e: `${BASE}/excursions`, c: `${BASE}/checklist`, u: `${BASE}/guide`,
            g: `${BASE}/settings`,
        };
        const onKey = (event: KeyboardEvent) => {
            setGoto(false);
            const href = targets[event.key.toLowerCase()];
            if (href) { event.preventDefault(); router.push(href); }
        };
        window.addEventListener('keydown', onKey, { once: true });
        const timer = setTimeout(() => setGoto(false), 2000);
        return () => { window.removeEventListener('keydown', onKey); clearTimeout(timer); };
    }, [goto, router]);

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

            {goto && (
                <div className="fixed bottom-5 left-5 z-[75] rounded-2xl bg-gray-900 px-4 py-2
                    text-sm text-white shadow-xl">
                    Go to… <span className="text-white/60">d t m i v p s e c u g</span>
                </div>
            )}

            {showKeys && (
                <div className="fixed inset-0 z-[85] flex items-center justify-center p-4
                    bg-gray-900/40 backdrop-blur-sm">
                    <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
                        <div className="flex items-baseline justify-between gap-2">
                            <h2 className="text-base font-semibold text-gray-900">Shortcuts</h2>
                            <button
                                onClick={() => setShowKeys(false)}
                                className="text-xl leading-none text-gray-400 hover:text-gray-700"
                                aria-label="Close"
                            >
                                ×
                            </button>
                        </div>
                        <dl className="mt-3 space-y-1.5 text-sm">
                            {[
                                ['⌘K or /', 'Find anything'],
                                ['⌘Z', 'Undo the last delete'],
                                ['g then d/t/m/i/v/p/s/e/c/u/g', 'Jump to a tab'],
                                ['n', 'New place'],
                                ['[ ]', 'Previous / next day on Today'],
                                ['?', 'This list'],
                            ].map(([keys, what]) => (
                                <div key={keys} className="flex items-baseline justify-between gap-3">
                                    <dt className="shrink-0 font-mono text-xs text-gray-500">
                                        {keys}
                                    </dt>
                                    <dd className="text-right text-gray-800">{what}</dd>
                                </div>
                            ))}
                        </dl>
                        <p className="mt-3 text-[11px] text-gray-400">
                            Bare keys are ignored while you are typing in a field.
                        </p>
                    </div>
                </div>
            )}

            {/* One offer at a time, above everything, wherever you are — deleting
                on the map and undoing from the itinerary is fine. */}
            {api.undo && (
                <UndoToast
                    key={api.undo.label}
                    label={api.undo.label}
                    onUndo={api.undo.restore}
                    onDismiss={api.clearUndo}
                    stacked={api.undos.length}
                />
            )}

            {/* A two-hour session against an afternoon of planning: sign back in
                here and the refused save finishes itself. */}
            {api.sessionExpired && (
                <ReauthModal
                    onAuthenticate={api.reauthenticate}
                    onDismiss={api.dismissSessionExpiry}
                />
            )}
        </HoneymoonProvider>
    );
}
