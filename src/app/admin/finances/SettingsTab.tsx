'use client';

import { useState } from 'react';
import type { FinanceApi, FinancePayload } from './useFinances';
import { Card, EmptyState, InlineNumber, InlineText, PillButton, formatMoney } from './ui';

export default function SettingsTab({ data, api }: { data: FinancePayload; api: FinanceApi }) {
    const { settings, payers, summary, headcount, weddingDate } = data;
    const [newPayer, setNewPayer] = useState('');

    const shareSum = payers.reduce((sum, p) => sum + p.share_pct, 0);

    const addPayer = async () => {
        const name = newPayer.trim();
        if (!name) return;
        await api.create('payers', { name, share_pct: 0, sort_order: payers.length });
        setNewPayer('');
    };

    return (
        <div className="space-y-6">
            <Card className="p-5">
                <h3 className="font-semibold text-gray-900 mb-1">Headcount</h3>
                <p className="text-xs text-gray-400 mb-4">
                    Drives any line whose quantity is set to Adults, Minors, or All guests — dinner, kids&apos;
                    meals, the bar.
                </p>

                <div className="grid grid-cols-2 gap-4 max-w-sm">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Adults</label>
                        <div className="bg-gray-50 border border-gray-200 rounded-2xl px-2">
                            <InlineNumber
                                value={settings.adult_count}
                                onCommit={(adult_count) => api.update('settings', { adult_count })}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Minors</label>
                        <div className="bg-gray-50 border border-gray-200 rounded-2xl px-2">
                            <InlineNumber
                                value={settings.minor_count}
                                onCommit={(minor_count) => api.update('settings', { minor_count })}
                            />
                        </div>
                    </div>
                </div>

                <div className="text-xs text-gray-500 mt-3">
                    Total: <strong>{settings.adult_count + settings.minor_count} guests</strong>
                </div>

                {headcount && (
                    <div className="mt-4 bg-gray-50 rounded-2xl p-4">
                        <div className="text-xs font-semibold text-gray-600 mb-1">From your guest list</div>
                        <p className="text-xs text-gray-500 mb-3">
                            {headcount.invited.toLocaleString()} invited ·{' '}
                            {headcount.attending.toLocaleString()} confirmed attending.
                            These are only a reference — your budget stays on the numbers you set above, so a
                            late RSVP can&apos;t quietly move your total. Your guest list has no adult/minor
                            marker, so the split is yours to make.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <PillButton
                                onClick={() => api.update('settings', { adult_count: headcount.invited, minor_count: 0 })}
                            >
                                Use {headcount.invited} invited as adults
                            </PillButton>
                            {headcount.attending > 0 && (
                                <PillButton
                                    onClick={() => api.update('settings', { adult_count: headcount.attending, minor_count: 0 })}
                                >
                                    Use {headcount.attending} attending as adults
                                </PillButton>
                            )}
                        </div>
                    </div>
                )}
            </Card>

            <Card className="p-5">
                <h3 className="font-semibold text-gray-900 mb-1">Who pays</h3>
                <p className="text-xs text-gray-400 mb-4">
                    Shares split whatever the contributions don&apos;t cover. Anyone who buys things but
                    doesn&apos;t owe a share — a parent picking up the decor — gets <strong>0%</strong>; their
                    spending still shows up, just as a credit.
                </p>

                <div className="space-y-2">
                    {payers.map((payer) => {
                        const stats = summary.payers.find((p) => p.id === payer.id);
                        return (
                            <div key={payer.id}
                                className="flex flex-wrap items-center gap-3 border border-gray-100 rounded-2xl px-3 py-2">
                                <div className="flex-1 min-w-[7rem]">
                                    <InlineText
                                        value={payer.name}
                                        onCommit={(name) => api.update('payers', { id: payer.id, name })}
                                        className="font-medium text-gray-800"
                                    />
                                </div>
                                <div className="w-20">
                                    <div className="bg-gray-50 border border-gray-200 rounded-xl px-1 flex items-center">
                                        <InlineNumber
                                            value={payer.share_pct}
                                            onCommit={(share_pct) => api.update('payers', { id: payer.id, share_pct })}
                                        />
                                        <span className="text-xs text-gray-400 pr-1">%</span>
                                    </div>
                                </div>
                                <div className="text-[11px] text-gray-400 w-32 text-right tabular-nums">
                                    paid {formatMoney(stats?.spent ?? 0)}
                                </div>
                                <button
                                    onClick={() => {
                                        if (confirm(`Remove ${payer.name}? Their purchases stay but become unassigned.`)) {
                                            api.remove('payers', payer.id);
                                        }
                                    }}
                                    aria-label={`Remove ${payer.name}`}
                                    className="text-gray-300 hover:text-rose-500 transition-colors"
                                >
                                    &times;
                                </button>
                            </div>
                        );
                    })}
                    {!payers.length && <EmptyState>No payers yet.</EmptyState>}
                </div>

                {payers.length > 0 && shareSum !== 100 && (
                    <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2 mt-3">
                        Shares add up to <strong>{shareSum}%</strong>, not 100%. That still works — each person
                        is charged their slice of the {shareSum}% — but setting them to total 100% makes the
                        numbers easier to read.
                    </p>
                )}

                <div className="flex gap-2 items-center mt-4">
                    <input
                        value={newPayer}
                        onChange={(e) => setNewPayer(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addPayer(); }}
                        placeholder="Add someone who pays for things"
                        className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />
                    <PillButton tone="accent" onClick={addPayer} disabled={!newPayer.trim()}>Add payer</PillButton>
                </div>
            </Card>

            <Card className="p-5">
                <h3 className="font-semibold text-gray-900 mb-1">Payment plan</h3>
                <p className="text-xs text-gray-400 mb-4">
                    How far ahead to spread what&apos;s left. Left blank, it counts down to your wedding date
                    on its own.
                </p>

                <div className="grid sm:grid-cols-2 gap-4 max-w-lg">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">
                            Planning horizon (months)
                        </label>
                        <input
                            type="number"
                            min={1}
                            value={settings.plan_horizon_months ?? ''}
                            placeholder={weddingDate ? 'Auto — to wedding day' : 'Auto'}
                            onChange={(e) => api.update('settings', {
                                plan_horizon_months: e.target.value === '' ? null : e.target.value,
                            })}
                            className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2 text-sm
                                focus:outline-none focus:ring-2 focus:ring-accent/30"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">
                            {summary.horizon.derived
                                ? `Auto: ${summary.horizon.days.toLocaleString()} days left${weddingDate ? ` until ${weddingDate}` : ''}.`
                                : `Fixed at ${settings.plan_horizon_months} months.`}
                        </p>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">
                            Days between paychecks
                        </label>
                        <div className="bg-gray-50 border border-gray-200 rounded-2xl px-2">
                            <InlineNumber
                                value={settings.paycheck_interval_days}
                                onCommit={(paycheck_interval_days) =>
                                    api.update('settings', { paycheck_interval_days })}
                            />
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1">
                            14 for every other week, 7 for weekly, 15 for twice monthly.
                            ~{Math.floor(summary.horizon.paychecks)} paychecks left.
                        </p>
                    </div>
                </div>
            </Card>
        </div>
    );
}
