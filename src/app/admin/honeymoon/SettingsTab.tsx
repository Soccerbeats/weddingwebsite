'use client';

import { formatDayDate } from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import { Button, Card, TextField } from './ui';

export default function SettingsTab({ api }: { api: HoneymoonApi }) {
    const trip = api.data?.trip;
    const days = api.data?.days ?? [];
    if (!trip) return null;

    const lastDay = days.length ? Math.max(...days.map((d) => d.day_number)) : 0;

    return (
        <div className="space-y-3 max-w-xl">
            <Card className="p-4 space-y-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Trip name</label>
                    <TextField
                        defaultValue={trip.title}
                        onBlur={(e) => api.update('trip', { title: e.target.value })}
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Start date</label>
                    <TextField
                        type="date"
                        defaultValue={trip.start_date ?? ''}
                        onBlur={(e) => api.update('trip', { start_date: e.target.value })}
                    />
                    <p className="text-xs text-gray-400 mt-1.5">
                        {trip.start_date
                            ? `Day 1 is ${formatDayDate(trip.start_date, 1)}${lastDay > 1
                                ? `, day ${lastDay} is ${formatDayDate(trip.start_date, lastDay)}` : ''}.`
                            : 'Leave blank to keep planning in relative days. Set it and every day picks up its real date.'}
                    </p>
                    {trip.start_date && (
                        <Button
                            className="mt-2"
                            onClick={() => api.update('trip', { start_date: '' })}
                        >
                            Clear date
                        </Button>
                    )}
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

            <Card className="p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Adding places</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                    In the place editor, the Find box takes three kinds of input: a name to search
                    (&ldquo;Tukad Cepung Waterfall&rdquo;), a Google Maps link pasted straight in, or raw
                    <span className="tabular-nums"> lat, lng</span> numbers. Right-clicking a pin in Google
                    Maps copies those numbers, which is the most reliable option for anywhere the search
                    can&apos;t find.
                </p>
            </Card>
        </div>
    );
}
