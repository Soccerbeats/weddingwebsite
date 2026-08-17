'use client';

import { useState } from 'react';
import { addDays, daysBetween, formatDayDate, planRange } from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import DateRangePicker from './DateRangePicker';
import { Button, Card, SelectField, TextField } from './ui';

/** The handful anyone planning from the US actually prices in. */
const CURRENCIES = [
    { key: 'USD', label: 'US dollar ($)' },
    { key: 'EUR', label: 'Euro (€)' },
    { key: 'GBP', label: 'Pound (£)' },
    { key: 'AUD', label: 'Australian dollar (A$)' },
    { key: 'CAD', label: 'Canadian dollar (C$)' },
    { key: 'SGD', label: 'Singapore dollar (S$)' },
    { key: 'IDR', label: 'Rupiah (Rp)' },
];

export default function SettingsTab({ api }: { api: HoneymoonApi }) {
    const trip = api.data?.trip;
    const days = api.data?.days ?? [];
    const [working, setWorking] = useState(false);
    if (!trip) return null;

    const lastDay = days.length ? Math.max(...days.map((d) => d.day_number)) : 0;

    /**
     * Make the day rows match the dates you just drew.
     *
     * This is the part that earns the calendar: the range *is* the trip length,
     * so setting it builds the days rather than leaving you to press "+ Add day"
     * fourteen times. Dropping days is destructive — it cascades their stops and
     * travel legs — so it says exactly what would go before it goes, and the day
     * rows are only touched once you agree.
     */
    const applyRange = async (start: string, end: string) => {
        const plan = planRange(start, end, days.map((d) => d.day_number));

        if (plan.remove.length) {
            const doomed = days.filter((d) => plan.remove.includes(d.day_number));
            const stops = doomed.reduce((n, d) => n + d.stops.length, 0);
            const legs = doomed.reduce((n, d) => n + d.travel.length, 0);
            const spans = plan.remove.length === 1
                ? `Day ${plan.remove[0]}`
                : `Days ${plan.remove[0]}–${plan.remove[plan.remove.length - 1]}`;
            const carrying = [
                stops ? `${stops} stop${stops === 1 ? '' : 's'}` : '',
                legs ? `${legs} travel leg${legs === 1 ? '' : 's'}` : '',
            ].filter(Boolean).join(' and ');
            const message = carrying
                ? `That shortens the trip to ${plan.length} days. ${spans} would be deleted, `
                    + `along with ${carrying}. Continue?`
                : `That shortens the trip to ${plan.length} days. ${spans} would be deleted. Continue?`;
            if (!confirm(message)) return;
        }

        setWorking(true);
        try {
            await api.update('trip', { start_date: plan.start, end_date: plan.end });
            for (const dayNumber of plan.add) {
                await api.create('days', { day_number: dayNumber });
            }
            for (const dayNumber of plan.remove) {
                const day = days.find((d) => d.day_number === dayNumber);
                if (day) await api.remove('days', day.id);
            }
        } finally {
            setWorking(false);
        }
    };

    const clearDates = async () => {
        if (!confirm('Clear the dates? The days stay — they go back to being numbered.')) return;
        await api.update('trip', { start_date: '', end_date: '' });
    };

    /** The whole portal as one file, for the day a bulk edit goes wrong. */
    const download = async () => {
        const res = await fetch('/api/admin/honeymoon', { cache: 'no-store' });
        if (!res.ok) return;
        const blob = new Blob([JSON.stringify(await res.json(), null, 2)], {
            type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `honeymoon-backup-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    /** Where the trip ends according to the day rows, for a trip with no end_date. */
    const impliedEnd = trip.start_date && lastDay > 0
        ? addDays(trip.start_date, lastDay - 1)
        : null;
    const nights = daysBetween(trip.start_date, trip.end_date ?? impliedEnd);

    return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start max-w-6xl">
            {/* ---- Dates ---- */}
            <Card className="p-4 space-y-3 xl:row-span-2">
                <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-gray-900">When you&apos;re away</h3>
                    {working && <span className="text-xs text-gray-400">Updating days…</span>}
                </div>

                {/* A trip planned before end_date existed has a start and a
                    number of days but no stored end. Deriving one from the day
                    rows shows the range that is actually already there, rather
                    than an empty calendar next to a filled-in summary. The first
                    drag then writes it down properly. */}
                <DateRangePicker
                    start={trip.start_date}
                    end={trip.end_date ?? impliedEnd}
                    onChange={applyRange}
                />

                <div className="rounded-2xl bg-gray-50 px-3 py-2.5">
                    {trip.start_date ? (
                        <>
                            <p className="text-xs text-gray-700">
                                Day 1 is {formatDayDate(trip.start_date, 1)}
                                {lastDay > 1 && <> · day {lastDay} is {formatDayDate(trip.start_date, lastDay)}</>}
                                {nights != null && <> · {nights} night{nights === 1 ? '' : 's'} away</>}
                            </p>
                            {trip.end_date && lastDay !== (daysBetween(trip.start_date, trip.end_date) ?? 0) + 1 && (
                                <p className="text-[11px] text-amber-700 mt-1">
                                    You have {lastDay} day{lastDay === 1 ? '' : 's'} planned for a{' '}
                                    {(nights ?? 0) + 1}-day trip. Drag the range again to line them up.
                                </p>
                            )}
                            <Button className="mt-2" onClick={clearDates}>Clear dates</Button>
                        </>
                    ) : (
                        <p className="text-xs text-gray-500">
                            No dates yet — the days stay numbered until you set some. Drag a range above
                            and the day rows are created to match it.
                        </p>
                    )}
                </div>
            </Card>

            {/* ---- Trip ---- */}
            <Card className="p-4 space-y-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Trip name</label>
                    <TextField
                        defaultValue={trip.title}
                        onBlur={(e) => api.update('trip', { title: e.target.value })}
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Currency</label>
                    <SelectField
                        value={trip.home_currency || 'USD'}
                        onChange={(e) => api.update('trip', { home_currency: e.target.value })}
                    >
                        {CURRENCIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </SelectField>
                    <p className="text-xs text-gray-400 mt-1.5">
                        Used for the symbol on prices you type as a bare number, and for the
                        dashboard&apos;s rough costs. Nothing is converted.
                    </p>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Notes</label>
                    <TextField
                        defaultValue={trip.notes ?? ''}
                        placeholder="Anything trip-wide"
                        onBlur={(e) => api.update('trip', { notes: e.target.value })}
                    />
                </div>
            </Card>

            {/* ---- Take it with you ---- */}
            <Card className="p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">Take it with you</h3>
                <div className="flex flex-wrap gap-2">
                    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                    <a
                        href="/api/admin/honeymoon/ics"
                        className="rounded-full bg-accent text-white px-4 py-1.5 text-sm font-medium
                            hover:opacity-90"
                    >
                        Add to calendar (.ics)
                    </a>
                    <Button onClick={download}>Download a backup (JSON)</Button>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                    The calendar file puts every day, travel leg and timed stop into your phone — it
                    needs the dates above to be set. The backup is the whole portal in one file; keep
                    one before any big change, because nothing here is versioned.
                </p>
            </Card>

            <Card className="p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Adding places</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                    In the place editor, the Find box takes three kinds of input: a name to search
                    (&ldquo;Tukad Cepung Waterfall&rdquo;), a Google Maps link pasted straight in, or raw
                    <span className="tabular-nums"> lat, lng</span> numbers. Right-clicking a pin in Google
                    Maps copies those numbers, which is the most reliable option for anywhere the search
                    can&apos;t find. Press <kbd className="px-1 rounded bg-gray-100">⌘K</kbd> anywhere in
                    the portal to jump to a place, a note or a day by name.
                </p>
            </Card>
        </div>
    );
}
