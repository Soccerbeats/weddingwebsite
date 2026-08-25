'use client';

import { useState } from 'react';
import { describeRate, formatMoney } from '@/lib/honeymoonBudget';
import type { HoneymoonApi } from './useHoneymoon';
import { Button, TextField } from './ui';

/**
 * The budget, the rates, and a converter.
 *
 * `home_currency` decided which symbol got printed and nothing else, so a trip
 * priced in rupiah and dollars had two numbers that could not be added. A stored
 * rate per pair fixes that — and a rate *you typed* is never overwritten by a
 * fetch, because if you agreed 15,800 with the hotel that is the number the
 * budget should use, not today's mid-market print.
 */
export default function MoneySettings({ api }: { api: HoneymoonApi }) {
    const trip = api.data?.trip;
    const rates = api.data?.rates ?? [];
    const home = trip?.home_currency || 'USD';

    const [quote, setQuote] = useState('IDR');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [manual, setManual] = useState('');
    const [amount, setAmount] = useState('');

    if (!trip) return null;

    const fetchRate = async () => {
        const code = quote.trim().toUpperCase();
        if (!/^[A-Z]{3}$/.test(code)) { setError('Three letters, like IDR'); return; }
        setBusy(true);
        setError('');
        try {
            const res = await fetch(
                `/api/admin/honeymoon/rate?base=${home}&quote=${code}`,
            );
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                setError(body.error ?? 'Could not fetch that rate');
                return;
            }
            await api.refresh();
        } finally {
            setBusy(false);
        }
    };

    const saveManual = async () => {
        const code = quote.trim().toUpperCase();
        const value = Number(manual);
        if (!/^[A-Z]{3}$/.test(code) || !Number.isFinite(value) || value <= 0) {
            setError('A three-letter code and a positive number');
            return;
        }
        setError('');
        const pair = `${home}${code}`;
        const existing = rates.find((rate) => rate.pair === pair);
        if (existing) {
            await api.update('rates', { id: existing.id, rate: value, manual: true });
        } else {
            await api.create('rates', { pair, rate: value, manual: true });
        }
        setManual('');
    };

    /** The converter: one number, every currency you have a rate for. */
    const parsed = Number(amount);
    const converted = Number.isFinite(parsed) && amount.trim()
        ? rates.map((rate) => {
            if (rate.pair.slice(0, 3) !== home) return null;
            return { code: rate.pair.slice(3, 6), value: parsed * rate.rate };
        }).filter((row): row is { code: string; value: number } => row != null)
        : [];

    return (
        <div className="space-y-4">
            <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500">
                    Budget ({home})
                </label>
                <TextField
                    type="number"
                    min="0"
                    step="1"
                    key={`b${trip.budget ?? ''}`}
                    defaultValue={trip.budget != null ? String(trip.budget) : ''}
                    placeholder="8000"
                    onBlur={(e) => {
                        const current = trip.budget != null ? String(trip.budget) : '';
                        if (e.target.value !== current) api.update('trip', { budget: e.target.value });
                    }}
                />
                <p className="mt-1.5 text-xs text-gray-400">
                    What you mean to spend. The dashboard measures the real total against it —
                    stays by the nights they are the base for, plus travel, excursions and bookings.
                </p>
            </div>

            <div>
                <h4 className="text-xs font-semibold text-gray-500 mb-1.5">Exchange rates</h4>
                {rates.length === 0 ? (
                    <p className="text-xs text-gray-400">
                        None yet. Without a rate, a price in another currency is counted at face
                        value and the dashboard says so.
                    </p>
                ) : (
                    <ul className="space-y-1.5">
                        {rates.map((rate) => (
                            <li
                                key={rate.id}
                                className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-50
                                    px-2.5 py-1.5"
                            >
                                <span className="text-sm text-gray-800 tabular-nums">
                                    {describeRate(rate)}
                                </span>
                                {rate.manual ? (
                                    <span className="rounded-full bg-gray-900 px-2 py-0.5 text-[10px]
                                        font-semibold text-white">
                                        yours
                                    </span>
                                ) : (
                                    <span className="text-[11px] text-gray-400">
                                        fetched{rate.fetched_at
                                            ? ` ${new Date(rate.fetched_at).toLocaleDateString()}`
                                            : ''}
                                    </span>
                                )}
                                <div className="flex-1" />
                                <button
                                    type="button"
                                    onClick={() => api.removeRow(
                                        'rates', rate, `Removed the ${rate.pair} rate`,
                                    )}
                                    className="text-[11px] text-gray-500 underline decoration-dotted"
                                >
                                    Remove
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="mt-2 flex flex-wrap items-end gap-2">
                    <div className="w-24">
                        <label className="mb-1 block text-[10px] font-semibold uppercase
                            tracking-wide text-gray-400">
                            {home} →
                        </label>
                        <TextField
                            value={quote}
                            maxLength={3}
                            placeholder="IDR"
                            onChange={(e) => setQuote(e.target.value.toUpperCase())}
                        />
                    </div>
                    <Button onClick={fetchRate} disabled={busy}>
                        {busy ? 'Fetching…' : 'Fetch today’s rate'}
                    </Button>
                    <div className="w-32">
                        <label className="mb-1 block text-[10px] font-semibold uppercase
                            tracking-wide text-gray-400">
                            Or set it
                        </label>
                        <TextField
                            type="number"
                            min="0"
                            step="any"
                            value={manual}
                            placeholder="15800"
                            onChange={(e) => setManual(e.target.value)}
                        />
                    </div>
                    <Button onClick={saveManual} disabled={!manual.trim()}>Save mine</Button>
                </div>
                {error && <p className="mt-1.5 text-xs text-rose-600">{error}</p>}
            </div>

            {rates.length > 0 && (
                <div>
                    <h4 className="text-xs font-semibold text-gray-500 mb-1.5">Quick convert</h4>
                    <div className="flex items-center gap-2">
                        <TextField
                            type="number"
                            value={amount}
                            placeholder="100"
                            onChange={(e) => setAmount(e.target.value)}
                            className="max-w-[8rem]"
                        />
                        <span className="text-sm text-gray-500">{home} =</span>
                    </div>
                    {converted.length > 0 && (
                        <p className="mt-1.5 text-sm text-gray-800">
                            {converted.map((row) => formatMoney(row.value, row.code)).join(' · ')}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
