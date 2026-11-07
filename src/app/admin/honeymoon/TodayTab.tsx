'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import TodaySheet, { useNightMode, useNowMinutes } from '@/components/honeymoon/TodaySheet';
import { planForDay, planForToday } from '@/lib/honeymoonToday';
import { useTripIntel } from './useTripIntel';
import { useOfflineFiles } from './FilesTab';
import type { HoneymoonApi } from './useHoneymoon';
import { useSwipePager } from './kit/useSwipePager';
import { registerSiteWorker } from '@/lib/offlineWorker';

const NIGHT_KEY = 'honeymoon-today-night';

/**
 * Today, inside the portal.
 *
 * The same sheet a shared link renders, plus the two things only the admin
 * wants: arrows to look at another day, and the offline snapshot that makes this
 * page open at an airport with no signal.
 */
const EMPTY_DOCS: never[] = [];

export default function TodayTab({ api }: { api: HoneymoonApi }) {
    const { data } = api;
    const now = useNowMinutes();
    // Today is the page opened with no signal, so it keeps the documents saved too.
    useOfflineFiles(api.data?.documents ?? EMPTY_DOCS);
    const intel = useTripIntel(data);
    const [dayNumber, setDayNumber] = useState<number | null>(null);
    const [night, setNight] = useNightMode(NIGHT_KEY);
    const [offline, setOffline] = useState<'off' | 'ready' | 'failed'>('off');

    /*
     * The offline snapshot.
     *
     * A service worker registered from this page caches the shell and the last
     * good payload, so the itinerary opens on a boat, in a taxi, or in the
     * hour before a flight when roaming has not woken up yet. Registered here
     * rather than globally: the guest-facing site has no use for it, and a
     * worker that caches pages nobody asked it to is how stale sites happen.
     */
    useEffect(() => {
        registerSiteWorker()
            .then(() => setOffline('ready'))
            .catch(() => setOffline('failed'));
    }, []);

    /* `[` and `]` step the day, from the shell's key handler. */
    useEffect(() => {
        const onStep = (event: Event) => {
            const delta = (event as CustomEvent<number>).detail;
            setDayNumber((current) => {
                const days = (data?.days ?? []).map((day) => day.day_number)
                    .sort((a, b) => a - b);
                if (!days.length) return current;
                const from = current ?? planForToday(data ?? { days: [] } as never).dayNumber
                    ?? days[0];
                const at = days.indexOf(from);
                const next = days[Math.min(Math.max(at + delta, 0), days.length - 1)];
                return next ?? current;
            });
        };
        window.addEventListener('honeymoon:step-day', onStep);
        return () => window.removeEventListener('honeymoon:step-day', onStep);
    }, [data]);

    const plan = !data ? null : dayNumber == null ? planForToday(data) : planForDay(data, dayNumber);
    const shown = plan?.dayNumber ?? null;
    const lastDay = data?.days.reduce((max, day) => Math.max(max, day.day_number), 0) ?? 0;
    const hasDay = (n: number) => data?.days.some((day) => day.day_number === n) ?? false;
    /* Swipe the page to look at the day before or after. */
    const swipeRef = useSwipePager<HTMLDivElement>({
        pageKey: shown,
        order: shown ?? 0,
        canPrev: shown != null && shown > 1,
        canNext: shown != null && shown < lastDay,
        onPrev: () => { if (shown != null && hasDay(shown - 1)) setDayNumber(shown - 1); },
        onNext: () => { if (shown != null && hasDay(shown + 1)) setDayNumber(shown + 1); },
    });

    if (!data || !plan) return null;
    const awayFromToday = dayNumber != null && dayNumber !== planForToday(data).dayNumber;

    const dayIntel = plan.dayNumber != null ? intel.intelFor(plan.dayNumber) : null;

    const chooseDay = (next: number) => {
        const exists = data.days.some((day) => day.day_number === next);
        if (exists) setDayNumber(next);
    };

    return (
        <>
        {/* Edge to edge on a phone: the day is the whole screen, not a card on one. */}
        <div ref={swipeRef} className="mx-auto w-full max-w-xl max-md:-mx-4 max-md:-mt-2 max-md:w-[calc(100%+2rem)]">
            <TodaySheet
                swipeDays
                plan={plan}
                trip={data.trip}
                now={now}
                weather={dayIntel?.weather ?? null}
                sun={dayIntel ? { sunrise: dayIntel.sunrise, sunset: dayIntel.sunset } : null}
                night={night}
                onNightChange={setNight}
                onSelectDay={chooseDay}
                footer={(
                    <div className="mt-6 space-y-2 text-center text-xs text-gray-400">
                        {awayFromToday && (
                            <button
                                type="button"
                                onClick={() => setDayNumber(null)}
                                className="max-md:hidden min-h-11 rounded-full border border-gray-200 px-4
                                    text-sm text-gray-600"
                            >
                                Back to today
                            </button>
                        )}
                        <Link
                            href="/admin/honeymoon/files"
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-gray-200
                                bg-white px-4 text-sm text-gray-700 hover:bg-gray-50"
                        >
                            🗂️ Travel documents
                        </Link>
                        <p>
                            {offline === 'ready'
                                ? 'Saved for offline — this page opens without signal.'
                                : offline === 'failed'
                                    ? 'Offline copy unavailable in this browser.'
                                    : 'Preparing the offline copy…'}
                        </p>
                    </div>
                )}
            />
        </div>
        {/* Swiped away from today: the way back floats above the tab bar
            rather than waiting at the foot of a long page. */}
        {awayFromToday && (
            <button
                type="button"
                onClick={() => setDayNumber(null)}
                className="md:hidden fixed left-1/2 bottom-[calc(var(--hm-nav-clearance)+0.75rem)] z-30 -translate-x-1/2
                    rounded-full bg-gray-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-black/20
                    transition active:scale-95 motion-reduce:active:scale-100"
            >
                Back to today
            </button>
        )}
        </>
    );
}
