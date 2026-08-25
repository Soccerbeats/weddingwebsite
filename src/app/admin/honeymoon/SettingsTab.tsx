'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    addDays, daysBeyondRange, daysBetween, formatDate, formatDayDate, planRange,
} from '@/lib/honeymoon';
import { INFO_SECTIONS } from '@/lib/honeymoonToday';
import type { HoneymoonApi } from './useHoneymoon';
import DateRangePicker from './DateRangePicker';
import ShareLinks from './ShareLinks';
import { Button, Card, SelectField, TextArea, TextField } from './ui';

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
     * Days that now sit past the end of the trip.
     *
     * Shortening the range leaves these behind rather than deleting them, so
     * this card has to say so — otherwise the only sign would be red cards on
     * another tab you might not open.
     */
    const beyond = daysBeyondRange(
        days.map((d) => d.day_number), trip.start_date, trip.end_date,
    );

    /**
     * Set the trip's dates, and grow the day rows to fill a longer range.
     *
     * Changing the dates is **not** destructive, in either direction. A longer
     * range is the part that earns the calendar — the range *is* the trip
     * length, so it builds the missing days rather than leaving you to press
     * "+ Add day" fourteen times. A shorter range writes the dates and stops
     * there: the days you have already planned keep their stops, travel legs and
     * notes, take their new dates from the new start, and the ones that now fall
     * past the end are flagged in red on the Itinerary for you to deal with.
     *
     * It used to delete that tail behind a confirm, which is the wrong trade at
     * any level of warning: dragging a date is an ordinary, exploratory edit, and
     * an hour of planning should not be one mis-drag and one reflexive OK away
     * from being gone.
     */
    const applyRange = async (start: string, end: string) => {
        const plan = planRange(start, end, days.map((d) => d.day_number));
        setWorking(true);
        try {
            await api.update('trip', { start_date: plan.start, end_date: plan.end });
            // One transaction for the new days, not one round trip each.
            if (plan.add.length) {
                await api.createMany('days', plan.add.map((day_number) => ({ day_number })));
                await api.refresh();
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
                            {beyond.length > 0 ? (
                                <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200
                                    rounded-xl px-2.5 py-1.5 mt-1.5">
                                    {beyond.length === 1
                                        ? `Day ${beyond[0]} now falls`
                                        : `Days ${beyond[0]}–${beyond[beyond.length - 1]} now fall`}
                                    {' '}past {formatDate(trip.end_date)}, the end of the trip.{' '}
                                    <strong className="font-semibold">Nothing was deleted</strong> — they
                                    keep their stops and travel legs, and are flagged in red on the{' '}
                                    <Link href="/admin/honeymoon/itinerary" className="underline">
                                        Itinerary
                                    </Link>. Move their stops onto earlier days, delete the days you
                                    don&apos;t need, or drag the range back out.
                                </p>
                            ) : trip.end_date
                                && lastDay < (daysBetween(trip.start_date, trip.end_date) ?? 0) + 1 ? (
                                    <p className="text-[11px] text-amber-700 mt-1">
                                        The dates cover {(nights ?? 0) + 1} days and you have {lastDay}{' '}
                                        planned. Drag the range again to fill in the rest.
                                    </p>
                                ) : null}
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
                        key={trip.title}
                        defaultValue={trip.title}
                        onBlur={(e) => {
                            if (e.target.value.trim() && e.target.value !== trip.title) {
                                api.update('trip', { title: e.target.value });
                            }
                        }}
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

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">
                            Clock
                        </label>
                        <SelectField
                            value={trip.time_format}
                            onChange={(e) => api.update('trip', { time_format: e.target.value })}
                        >
                            <option value="24h">24-hour (14:05)</option>
                            <option value="12h">12-hour (2:05 PM)</option>
                        </SelectField>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">
                            Distances
                        </label>
                        <SelectField
                            value={trip.distance_unit}
                            onChange={(e) => api.update('trip', { distance_unit: e.target.value })}
                        >
                            <option value="km">Kilometres</option>
                            <option value="mi">Miles</option>
                        </SelectField>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">
                        The two of you
                    </label>
                    <TextField
                        key={trip.partner_names}
                        defaultValue={trip.partner_names}
                        placeholder="Austin, Heaven"
                        onBlur={(e) => {
                            if (e.target.value !== trip.partner_names) {
                                api.update('trip', { partner_names: e.target.value });
                            }
                        }}
                    />
                    <p className="text-xs text-gray-400 mt-1.5">
                        Used for per-person ratings, packing lists and who a shared link is for.
                    </p>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Notes</label>
                    <TextField
                        key={trip.notes ?? ''}
                        defaultValue={trip.notes ?? ''}
                        placeholder="Anything trip-wide"
                        onBlur={(e) => {
                            if (e.target.value !== (trip.notes ?? '')) api.update('trip', { notes: e.target.value });
                        }}
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

            {/* ---- The things you need at 2am ---- */}
            <Card className="p-4 space-y-3 xl:col-span-2">
                <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                        Emergency &amp; practical details
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                        These show up on the Today view behind one tap, and they are what you will
                        want when the phone is at 4% in a taxi. `trip.notes` above is for planning
                        thoughts; this is for facts.
                    </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {INFO_SECTIONS.map((section) => (
                        <div key={section.key}>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">
                                {section.label}
                            </label>
                            <TextArea
                                key={`${section.key}-${trip.info?.[section.key] ?? ''}`}
                                defaultValue={trip.info?.[section.key] ?? ''}
                                placeholder={section.hint}
                                rows={3}
                                onBlur={(e) => {
                                    const value = e.target.value;
                                    if (value === (trip.info?.[section.key] ?? '')) return;
                                    // The whole blob goes back, so a second tab
                                    // editing another section cannot be lost by
                                    // this one — the payload is refetched between
                                    // saves and this reads the fresh copy.
                                    api.update('trip', {
                                        info: { ...(trip.info ?? {}), [section.key]: value },
                                    });
                                }}
                            />
                        </div>
                    ))}
                </div>
            </Card>

            {/* ---- Sharing ---- */}
            <Card className="p-4 space-y-3 xl:col-span-2">
                <div>
                    <h3 className="text-sm font-semibold text-gray-900">Share it with someone</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                        A link that opens the trip read-only — no login, nothing editable, no access
                        to the shortlists or the budget. The link itself is the password, so treat it
                        like one: revoke it rather than hoping.
                    </p>
                </div>
                <ShareLinks api={api} />
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
