'use client';

import { useMemo, useState } from 'react';
import {
    buildSummary, formatMoney, PAID_STATE_LABEL,
    type PaidState, type Snapshot,
} from '@/lib/finance';
import type { FinanceApi, FinancePayload } from './useFinances';
import { Card, Modal, PillButton, SelectField, TextField } from './ui';

/* ------------------------------------------------------------------ undo --- */

/** Ten-second "Undone?" bar. Beats a confirm dialog for low-risk deletes. */
export function UndoBar({ api }: { api: FinanceApi }) {
    if (!api.undo) return null;
    return (
        <div className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-md items-center gap-3
            rounded-2xl bg-gray-900/95 px-4 py-3 text-sm text-white shadow-lg backdrop-blur">
            <span className="min-w-0 flex-1 truncate">Deleted {api.undo.label}</span>
            <button
                onClick={() => api.undo?.restore()}
                className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold
                    transition-colors hover:bg-white/25"
            >
                Undo
            </button>
            <button onClick={api.dismissUndo} aria-label="Dismiss"
                className="shrink-0 text-white/50 hover:text-white">&times;</button>
        </div>
    );
}

/* -------------------------------------------------------------- paid state -- */

const STATE_STYLE: Record<PaidState, string> = {
    unpaid: 'bg-gray-100 text-gray-500',
    partial: 'bg-amber-100 text-amber-700',
    paid: 'bg-emerald-100 text-emerald-700',
    overpaid: 'bg-rose-100 text-rose-700',
};

export function StateBadge({ state, className = '' }: { state: PaidState; className?: string }) {
    return (
        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase
            tracking-wide ${STATE_STYLE[state]} ${className}`}>
            {PAID_STATE_LABEL[state]}
        </span>
    );
}

/* ----------------------------------------------------------------- export --- */

function csvCell(value: unknown) {
    const text = value == null ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
}

/** Download the budget as a spreadsheet, or hand it to the browser's print dialog. */
export function ExportButtons({ data }: { data: FinancePayload }) {
    const download = () => {
        const rows: string[][] = [
            ['Section', 'Line item', 'Unit cost', 'Qty', 'Budgeted', 'Paid', 'Remaining', 'Status'],
        ];
        for (const category of data.categories) {
            for (const item of category.items) {
                const stats = data.summary.items.find((i) => i.id === item.id);
                rows.push([
                    category.name, item.name,
                    String(item.unit_cost), String(item.quantity),
                    (stats?.total ?? 0).toFixed(2),
                    (stats?.paid ?? 0).toFixed(2),
                    (-(stats?.variance ?? 0)).toFixed(2),
                    PAID_STATE_LABEL[stats?.state ?? 'unpaid'],
                ]);
            }
            const cat = data.summary.categories.find((c) => c.id === category.id);
            rows.push([category.name, 'SECTION TOTAL', '', '',
                (cat?.total ?? 0).toFixed(2), (cat?.paid ?? 0).toFixed(2),
                (cat?.remaining ?? 0).toFixed(2), '']);
        }
        rows.push([]);
        rows.push(['TOTAL BUDGET', '', '', '', data.summary.budgetTotal.toFixed(2),
            data.summary.paidTotal.toFixed(2), data.summary.billRemaining.toFixed(2), '']);
        rows.push(['Gift money received', '', '', '', '', data.summary.receivedTotal.toFixed(2), '', '']);
        rows.push(['Left for the couple', '', '', '', '', '', data.summary.stillToSpendCash.toFixed(2), '']);

        // BOM so Excel keeps the currency and accented characters intact.
        const csv = '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `wedding-budget-${data.today}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="flex flex-wrap gap-2">
            <PillButton onClick={download}>⬇ Export CSV</PillButton>
            <PillButton onClick={() => window.print()}>🖨 Print / PDF</PillButton>
        </div>
    );
}

/* -------------------------------------------------------------- what-if ----- */

/**
 * Re-runs the real engine against altered inputs without touching the database.
 * Cheap because every calculation is a pure function of the loaded data.
 */
export function WhatIf({ data }: { data: FinancePayload }) {
    const [guests, setGuests] = useState(data.settings.adult_count);
    const [pledgesLand, setPledgesLand] = useState(true);
    const [contingency, setContingency] = useState(0);

    const projected = useMemo(() => {
        const settings = { ...data.settings, adult_count: guests };
        const contributors = pledgesLand
            ? data.contributors
            // Drop unreceived pledges entirely rather than trusting them.
            : data.contributors.map((c) => ({
                ...c,
                pledged: c.receipts.reduce((sum, r) => sum + r.amount, 0),
            }));
        const s = buildSummary({
            categories: data.categories, payers: data.payers, purchases: data.purchases,
            contributors, settings, schedule: data.schedule, weddingDate: data.weddingDate,
        });
        const buffer = s.budgetTotal * (contingency / 100);
        return { ...s, buffer };
    }, [data, guests, pledgesLand, contingency]);

    const delta = projected.budgetTotal + projected.buffer - data.summary.budgetTotal;

    return (
        <Card className="p-5">
            <h3 className="font-semibold text-gray-900 mb-1">What if…</h3>
            <p className="mb-4 text-xs text-gray-400">
                Try a change without saving anything. Nothing here touches your real numbers.
            </p>

            <div className="grid gap-4 sm:grid-cols-3">
                <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-gray-500">
                        Adult guests
                    </span>
                    <TextField
                        type="number" min={0} value={guests}
                        onChange={(e) => setGuests(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
                    />
                </label>
                <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-gray-500">
                        Contingency buffer
                    </span>
                    <SelectField value={contingency}
                        onChange={(e) => setContingency(Number(e.target.value))}>
                        {[0, 5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}%</option>)}
                    </SelectField>
                </label>
                <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-gray-500">
                        Unreceived pledges
                    </span>
                    <SelectField
                        value={pledgesLand ? 'yes' : 'no'}
                        onChange={(e) => setPledgesLand(e.target.value === 'yes')}
                    >
                        <option value="yes">All arrive</option>
                        <option value="no">None arrive</option>
                    </SelectField>
                </label>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <Figure label="projected budget"
                    value={projected.budgetTotal + projected.buffer}
                    delta={delta} />
                <Figure label="left for you two"
                    value={Math.max(0, projected.stillToSpendCash + projected.buffer)}
                    delta={(projected.stillToSpendCash + projected.buffer) - data.summary.stillToSpendCash} />
                <Figure label="each per month"
                    value={projected.payers.length
                        ? (projected.stillToSpendCash + projected.buffer) /
                          Math.max(1, projected.payers.length) /
                          Math.max(1, projected.horizon.months)
                        : 0} />
            </div>
        </Card>
    );
}

function Figure({ label, value, delta }: { label: string; value: number; delta?: number }) {
    const moved = delta != null && Math.abs(delta) >= 0.01;
    return (
        <div className="rounded-xl bg-gray-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{label}</div>
            <div className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">
                {formatMoney(value)}
            </div>
            {moved && (
                <div className={`text-[11px] tabular-nums ${delta! > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {delta! > 0 ? '+' : ''}{formatMoney(delta!)} vs now
                </div>
            )}
        </div>
    );
}

/* --------------------------------------------------------------- trend ------ */

/** Sparkline of the budget and what's been paid, from the daily snapshots. */
export function TrendCard({ snapshots }: { snapshots: Snapshot[] }) {
    if (snapshots.length < 2) {
        return (
            <Card className="p-5">
                <h3 className="font-semibold text-gray-900 mb-1">Trend</h3>
                <p className="text-xs text-gray-400">
                    A reading is saved each day you open this page. Come back tomorrow and the
                    budget&apos;s drift over time will show up here —
                    {' '}{snapshots.length === 1 ? '1 reading' : 'no readings'} so far.
                </p>
            </Card>
        );
    }

    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    const max = Math.max(...snapshots.map((s) => Math.max(s.budget_total, s.paid_total))) || 1;
    const points = (pick: (s: Snapshot) => number) => snapshots.map((s, i) => {
        const x = (i / (snapshots.length - 1)) * 100;
        const y = 100 - (pick(s) / max) * 100;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');

    const budgetMove = last.budget_total - first.budget_total;

    return (
        <Card className="p-5">
            <h3 className="font-semibold text-gray-900 mb-1">Trend</h3>
            <p className="mb-3 text-xs text-gray-400">
                {snapshots.length} readings, {first.taken_on} to {last.taken_on}.{' '}
                {Math.abs(budgetMove) < 0.01
                    ? 'Your budget total has held steady.'
                    : `Your budget has ${budgetMove > 0 ? 'grown' : 'shrunk'} by ${formatMoney(Math.abs(budgetMove))}.`}
            </p>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-28 w-full" role="img"
                aria-label="Budget and paid over time">
                <polyline points={points((s) => s.budget_total)} fill="none"
                    stroke="var(--accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                <polyline points={points((s) => s.paid_total)} fill="none"
                    stroke="#059669" strokeWidth={1.5} strokeDasharray="3 2"
                    vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="mt-2 flex gap-4 text-[11px] text-gray-500">
                <span className="flex items-center gap-1">
                    <span className="inline-block h-0.5 w-4" style={{ background: 'var(--accent)' }} />
                    budget {formatMoney(last.budget_total)}
                </span>
                <span className="flex items-center gap-1">
                    <span className="inline-block h-0.5 w-4 bg-emerald-600" />
                    paid {formatMoney(last.paid_total)}
                </span>
            </div>
        </Card>
    );
}

/* ------------------------------------------------------------ templates ---- */

const TEMPLATES: Record<string, { name: string; unit_cost: number; qty_source: 'manual' | 'adults' | 'minors' | 'total' }[]> = {
    'Venue & catering': [
        { name: 'Venue hire', unit_cost: 0, qty_source: 'manual' },
        { name: 'Dinner', unit_cost: 0, qty_source: 'adults' },
        { name: 'Kids meals', unit_cost: 0, qty_source: 'minors' },
        { name: 'Bar', unit_cost: 0, qty_source: 'adults' },
        { name: 'Cake / dessert', unit_cost: 0, qty_source: 'manual' },
        { name: 'Service charge', unit_cost: 0, qty_source: 'manual' },
        { name: 'Taxes', unit_cost: 0, qty_source: 'manual' },
    ],
    'Photo & video': [
        { name: 'Photographer', unit_cost: 0, qty_source: 'manual' },
        { name: 'Videographer', unit_cost: 0, qty_source: 'manual' },
        { name: 'Engagement shoot', unit_cost: 0, qty_source: 'manual' },
        { name: 'Albums / prints', unit_cost: 0, qty_source: 'manual' },
    ],
    'Attire & beauty': [
        { name: 'Dress', unit_cost: 0, qty_source: 'manual' },
        { name: 'Alterations', unit_cost: 0, qty_source: 'manual' },
        { name: 'Suit / tux', unit_cost: 0, qty_source: 'manual' },
        { name: 'Shoes', unit_cost: 0, qty_source: 'manual' },
        { name: 'Hair', unit_cost: 0, qty_source: 'manual' },
        { name: 'Makeup', unit_cost: 0, qty_source: 'manual' },
    ],
    'Flowers & decor': [
        { name: 'Bridal bouquet', unit_cost: 0, qty_source: 'manual' },
        { name: 'Bridesmaid bouquets', unit_cost: 0, qty_source: 'manual' },
        { name: 'Boutonnieres', unit_cost: 0, qty_source: 'manual' },
        { name: 'Centrepieces', unit_cost: 0, qty_source: 'manual' },
        { name: 'Ceremony flowers', unit_cost: 0, qty_source: 'manual' },
    ],
    'Stationery': [
        { name: 'Save the dates', unit_cost: 0, qty_source: 'manual' },
        { name: 'Invitations', unit_cost: 0, qty_source: 'manual' },
        { name: 'Postage', unit_cost: 0, qty_source: 'manual' },
        { name: 'Programs / menus', unit_cost: 0, qty_source: 'manual' },
        { name: 'Thank you cards', unit_cost: 0, qty_source: 'manual' },
    ],
    'Music & extras': [
        { name: 'DJ / band', unit_cost: 0, qty_source: 'manual' },
        { name: 'Ceremony musician', unit_cost: 0, qty_source: 'manual' },
        { name: 'Officiant', unit_cost: 0, qty_source: 'manual' },
        { name: 'Wedding insurance', unit_cost: 0, qty_source: 'manual' },
        { name: 'Transport', unit_cost: 0, qty_source: 'manual' },
        { name: 'Favours', unit_cost: 0, qty_source: 'manual' },
    ],
};

/** Add a batch of common line items so a new section isn't 15 manual rows. */
export function TemplatePicker({ data, api, onClose }: {
    data: FinancePayload;
    api: FinanceApi;
    onClose: () => void;
}) {
    const [categoryId, setCategoryId] = useState(data.categories[0]?.id ?? 0);
    const [group, setGroup] = useState(Object.keys(TEMPLATES)[0]);
    const [picked, setPicked] = useState<Set<string>>(new Set(TEMPLATES[Object.keys(TEMPLATES)[0]].map((t) => t.name)));
    const [busy, setBusy] = useState(false);

    const lines = TEMPLATES[group];

    const choose = (next: string) => {
        setGroup(next);
        setPicked(new Set(TEMPLATES[next].map((t) => t.name)));
    };

    const add = async () => {
        const category = data.categories.find((c) => c.id === categoryId);
        if (!category) return;
        setBusy(true);
        let order = category.items.length;
        for (const line of lines) {
            if (!picked.has(line.name)) continue;
            await api.create('items', {
                category_id: categoryId, name: line.name, unit_cost: line.unit_cost,
                quantity: 1, qty_source: line.qty_source, sort_order: order,
            });
            order += 1;
        }
        setBusy(false);
        onClose();
    };

    return (
        <Modal title="Add common line items" onClose={onClose}>
            <div className="space-y-4">
                <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-gray-500">Add to section</span>
                    <SelectField value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))}>
                        {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </SelectField>
                </label>

                <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-gray-500">Template</span>
                    <SelectField value={group} onChange={(e) => choose(e.target.value)}>
                        {Object.keys(TEMPLATES).map((g) => <option key={g} value={g}>{g}</option>)}
                    </SelectField>
                </label>

                <div className="max-h-56 space-y-1 overflow-y-auto rounded-2xl bg-gray-50 p-3">
                    {lines.map((line) => (
                        <label key={line.name} className="flex items-center gap-2 py-1 text-sm text-gray-700">
                            <input
                                type="checkbox"
                                checked={picked.has(line.name)}
                                onChange={(e) => setPicked((prev) => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(line.name); else next.delete(line.name);
                                    return next;
                                })}
                                className="h-4 w-4 rounded border-gray-300"
                            />
                            <span className="flex-1">{line.name}</span>
                            {line.qty_source !== 'manual' && (
                                <span className="text-[10px] uppercase tracking-wide text-gray-400">
                                    per {line.qty_source === 'minors' ? 'child' : 'guest'}
                                </span>
                            )}
                        </label>
                    ))}
                </div>

                <p className="text-[11px] text-gray-400">
                    Costs come in at $0 — fill them in as you get quotes. Per-guest lines are wired to
                    your headcount already.
                </p>

                <div className="flex justify-end gap-2">
                    <PillButton onClick={onClose}>Cancel</PillButton>
                    <PillButton tone="accent" onClick={add} disabled={busy || !picked.size || !categoryId}>
                        {busy ? 'Adding…' : `Add ${picked.size} line${picked.size === 1 ? '' : 's'}`}
                    </PillButton>
                </div>
            </div>
        </Modal>
    );
}
