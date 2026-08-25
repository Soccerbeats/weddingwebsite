'use client';

import { useEffect, useState } from 'react';
import TodaySheet, { useNightMode, useNowMinutes } from './TodaySheet';
import { planForDay, planForToday } from '@/lib/honeymoonToday';
import { nominalZone, sunTimesLocal } from '@/lib/honeymoonSun';
import { hasCoords } from '@/lib/honeymoon';
import type { HoneymoonPayload, ShareScope } from '@/lib/honeymoon';

const NIGHT_KEY = 'honeymoon-shared-night';

/**
 * The shared link's whole interface.
 *
 * Everything is already here as data — the server resolved and trimmed it — so
 * this component never fetches, which is also why it works with no signal once
 * the page has been opened once.
 */
export default function SharedTodayView({ payload, scope, label }: {
    payload: HoneymoonPayload;
    scope: ShareScope;
    label: string;
}) {
    const now = useNowMinutes();
    const [dayNumber, setDayNumber] = useState<number | null>(null);
    const [night, setNight] = useNightMode(NIGHT_KEY);

    // Offline for the person carrying the link too: same worker, same narrow
    // scope. Nothing here can write, so a stale copy is only ever a stale read.
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;
        navigator.serviceWorker.register('/honeymoon-sw.js', { scope: '/' }).catch(() => {});
    }, []);

    const canBrowse = scope !== 'today';
    const plan = dayNumber == null || !canBrowse
        ? planForToday(payload)
        : planForDay(payload, dayNumber);

    /*
     * Daylight, but no forecast.
     *
     * Sun times are arithmetic and can be worked out here; the weather needs the
     * admin API, which a share link deliberately cannot reach. Rather than
     * proxying it out to an unauthenticated route, the shared view shows the
     * half it can honestly show.
     */
    const sun = plan.base && hasCoords(plan.base) && plan.date
        ? sunTimesLocal(plan.base.lat, plan.base.lng, plan.date, nominalZone(plan.base.lng))
        : null;

    return (
        <TodaySheet
            plan={plan}
            trip={payload.trip}
            now={now}
            sun={sun ? { sunrise: sun.sunrise, sunset: sun.sunset } : null}
            night={night}
            onNightChange={setNight}
            onSelectDay={canBrowse ? (next) => {
                if (payload.days.some((day) => day.day_number === next)) setDayNumber(next);
            } : undefined}
            footer={(
                <>
                    {/* The guide travels with an `all` link: the notes are the
                        part of the planning that is useful on the trip. */}
                    {payload.notes.length > 0 && (
                        <div className="mt-4 space-y-2">
                            {payload.notes.map((note) => (
                                <details
                                    key={note.id}
                                    className="rounded-2xl border border-gray-200 night:border-gray-800
                                        bg-white night:bg-gray-900 p-4"
                                >
                                    <summary className="min-h-8 cursor-pointer font-medium">
                                        {note.title}
                                    </summary>
                                    <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700
                                        night:text-gray-200">
                                        {note.body}
                                    </p>
                                </details>
                            ))}
                        </div>
                    )}
                    <div className="mt-8 space-y-1 text-center text-xs text-gray-400">
                        {label && <p>Shared with {label}</p>}
                        <p>Read-only. {canBrowse ? 'Every day of the trip.' : 'Today only.'}</p>
                    </div>
                </>
            )}
        />
    );
}
