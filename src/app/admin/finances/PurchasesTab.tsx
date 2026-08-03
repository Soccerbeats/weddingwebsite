'use client';

import { useMemo, useState } from 'react';
import type { FinanceApi, FinancePayload } from './useFinances';
import {
    Card, EmptyState, InlineNumber, InlineText, PillButton, StatTile, formatMoney,
} from './ui';

/**
 * Every payment that has gone out, from any source.
 *
 * Gift money that's been earmarked to a bill appears here too — Rob's $5,000 paid
 * the venue just as much as an own-pocket installment did, and leaving it off this
 * list made the venue look half as paid down as it really was. Gift rows are
 * badged, and editing one writes through to the receipt behind it.
 */

type Row = {
    key: string;
    id: number;
    kind: 'purchase' | 'gift';
    label: string;
    date: string | null;
    amount: number;
    payerId: number | null;
    /** contributor name, gift rows only */
    who: string | null;
    itemId: number | null;
    categoryId: number | null;
};

export default function PurchasesTab({ data, api }: { data: FinancePayload; api: FinanceApi }) {
    const { purchases, contributors, payers, categories, summary } = data;
    const [payerFilter, setPayerFilter] = useState<'all' | 'gift' | number>('all');
    const [search, setSearch] = useState('');

    /**
     * One dropdown covers both targets: a whole section (for lump-sum bills paid
     * in installments) or a single line. Encoded as `c:<id>` / `i:<id>` so the
     * two can never both be set.
     */
    const targetGroups = useMemo(
        () => categories.map((c) => ({
            name: c.name,
            sectionValue: `c:${c.id}`,
            items: c.items.map((i) => ({ value: `i:${i.id}`, name: i.name })),
        })),
        [categories],
    );
    const targetValue = (r: { itemId: number | null; categoryId: number | null }) =>
        r.itemId != null ? `i:${r.itemId}` : r.categoryId != null ? `c:${r.categoryId}` : '';
    const targetPatch = (raw: string) => {
        if (!raw) return { item_id: null, category_id: null };
        const id = Number(raw.slice(2));
        return raw.startsWith('c:')
            ? { category_id: id, item_id: null }
            : { item_id: id, category_id: null };
    };

    const rows: Row[] = useMemo(() => {
        const own: Row[] = purchases.map((p) => ({
            key: `p${p.id}`, id: p.id, kind: 'purchase', label: p.description,
            date: p.purchased_on, amount: p.amount, payerId: p.payer_id, who: null,
            itemId: p.item_id, categoryId: p.category_id,
        }));
        const gifts: Row[] = contributors.flatMap((c) =>
            (c.receipts || [])
                // Unearmarked gift money is cash in hand, not a payment made.
                .filter((r) => r.item_id != null || r.category_id != null)
                .map((r) => ({
                    key: `r${r.id}`, id: r.id, kind: 'gift' as const, label: r.note ?? '',
                    date: r.received_on, amount: r.amount, payerId: null, who: c.name,
                    itemId: r.item_id, categoryId: r.category_id,
                })));
        return [...own, ...gifts].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    }, [purchases, contributors]);

    const visible = useMemo(() => {
        const term = search.trim().toLowerCase();
        return rows.filter((r) => {
            if (payerFilter === 'gift' && r.kind !== 'gift') return false;
            if (typeof payerFilter === 'number' && r.payerId !== payerFilter) return false;
            if (!term) return true;
            return r.label.toLowerCase().includes(term)
                || (r.who ?? '').toLowerCase().includes(term);
        });
    }, [rows, payerFilter, search]);

    const visibleTotal = visible.reduce((sum, r) => sum + r.amount, 0);

    const addPurchase = () =>
        api.create('purchases', {
            description: 'New purchase',
            amount: 0,
            payer_id: typeof payerFilter === 'number' ? payerFilter : payers[0]?.id ?? null,
            purchased_on: new Date().toISOString().slice(0, 10),
        });

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatTile label="Paid to vendors" value={formatMoney(summary.paidTotal)}
                    hint={`${rows.length} payment${rows.length === 1 ? '' : 's'}`} />
                {summary.payers.map((p) => (
                    <StatTile key={p.id} label={`${p.name} paid`} value={formatMoney(p.spent)} />
                ))}
                <StatTile label="From gift money" value={formatMoney(summary.giftAppliedTotal)} tone="good"
                    hint={summary.giftUnapplied > 0
                        ? `${formatMoney(summary.giftUnapplied)} received, not applied`
                        : undefined} />
                {summary.unlinkedSpend > 0 && (
                    <StatTile label="Untracked" value={formatMoney(summary.unlinkedSpend)}
                        tone="warn" hint="Not counted toward any section or line" />
                )}
            </div>

            <Card className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap gap-1.5">
                        <FilterPill active={payerFilter === 'all'} onClick={() => setPayerFilter('all')}>
                            Everyone
                        </FilterPill>
                        {payers.map((p) => (
                            <FilterPill key={p.id} active={payerFilter === p.id} onClick={() => setPayerFilter(p.id)}>
                                {p.name}
                            </FilterPill>
                        ))}
                        <FilterPill active={payerFilter === 'gift'} onClick={() => setPayerFilter('gift')}>
                            🎁 Gift money
                        </FilterPill>
                    </div>
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search payments…"
                        className="flex-1 min-w-[10rem] bg-gray-50 border border-gray-200 rounded-2xl px-3 py-1.5
                            text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />
                    <PillButton tone="accent" onClick={addPurchase}>+ Log purchase</PillButton>
                </div>
            </Card>

            <Card className="overflow-hidden">
                <div className="hidden md:grid grid-cols-[1.7fr_7rem_1.3fr_1.3fr_6rem_1.5rem] gap-2 px-4 py-2
                    text-[10px] uppercase tracking-wide text-gray-400 font-semibold border-b border-gray-100">
                    <div>What</div>
                    <div>Date</div>
                    <div>Paid by</div>
                    <div>Counts toward</div>
                    <div className="text-right">Amount</div>
                    <div />
                </div>

                {visible.map((row) => {
                    const resource = row.kind === 'gift' ? 'receipts' as const : 'purchases' as const;
                    const labelField = row.kind === 'gift' ? 'note' : 'description';
                    const dateField = row.kind === 'gift' ? 'received_on' : 'purchased_on';
                    const patch = (fields: Record<string, unknown>) =>
                        api.update(resource, { id: row.id, ...fields });
                    return (
                        <div key={row.key}
                            className={`grid grid-cols-2 md:grid-cols-[1.7fr_7rem_1.3fr_1.3fr_6rem_1.5rem] gap-2
                                px-4 py-2 items-center border-b border-gray-50 last:border-0
                                ${row.kind === 'gift' ? 'bg-emerald-50/40' : ''}`}>
                            <div className="col-span-2 md:col-span-1">
                                <InlineText
                                    value={row.label}
                                    placeholder={row.kind === 'gift' ? "What it's for…" : 'What was bought'}
                                    onCommit={(v) => patch({ [labelField]: v })}
                                    className="text-gray-800"
                                />
                            </div>
                            <input
                                type="date"
                                value={(row.date ?? '').slice(0, 10)}
                                onChange={(e) => patch({ [dateField]: e.target.value })}
                                className="bg-transparent text-xs text-gray-500 rounded-lg px-1 py-1
                                    hover:bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/30"
                            />
                            {row.kind === 'gift' ? (
                                <span className="text-xs text-emerald-700 font-medium truncate px-1"
                                    title={`Gift money from ${row.who}`}>
                                    🎁 {row.who}
                                </span>
                            ) : (
                                <select
                                    value={row.payerId ?? ''}
                                    onChange={(e) => patch({ payer_id: e.target.value || null })}
                                    className="bg-transparent text-xs text-gray-600 rounded-lg px-1 py-1
                                        hover:bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/30"
                                >
                                    <option value="">Unassigned</option>
                                    {payers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            )}
                            <select
                                value={targetValue(row)}
                                onChange={(e) => patch(targetPatch(e.target.value))}
                                className="bg-transparent text-xs text-gray-600 rounded-lg px-1 py-1
                                    hover:bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/30"
                            >
                                <option value="">— nothing —</option>
                                {targetGroups.map((group) => (
                                    <optgroup key={group.name} label={group.name}>
                                        <option value={group.sectionValue}>
                                            {group.name} — whole section
                                        </option>
                                        {group.items.map((i) => (
                                            <option key={i.value} value={i.value}>{i.name}</option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                            <InlineNumber
                                value={row.amount} prefix="$"
                                onCommit={(amount) => patch({ amount })}
                            />
                            <button
                                onClick={() => {
                                    const what = row.kind === 'gift'
                                        ? `${row.who}'s gift payment "${row.label}"`
                                        : `"${row.label}"`;
                                    if (confirm(`Delete ${what}?`)) api.remove(resource, row.id);
                                }}
                                aria-label={`Delete ${row.label}`}
                                className="text-gray-300 hover:text-rose-500 transition-colors text-right"
                            >
                                &times;
                            </button>
                        </div>
                    );
                })}

                {!visible.length && (
                    <EmptyState>
                        {rows.length ? 'No payments match this filter.' : 'No payments logged yet.'}
                    </EmptyState>
                )}

                {visible.length > 0 && (
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50/60 border-t border-gray-100">
                        <span className="text-xs text-gray-500">
                            {visible.length} shown
                            {visible.length !== rows.length && ` of ${rows.length}`}
                        </span>
                        <span className="font-semibold tabular-nums text-sm">{formatMoney(visibleTotal)}</span>
                    </div>
                )}
            </Card>

            <p className="text-[11px] text-gray-400 px-1">
                Green rows are gift money earmarked to a bill — it counts toward the budget but not
                toward either of your out-of-pocket totals. Gift money with no earmark is cash still in
                hand and isn&apos;t listed here.
            </p>
        </div>
    );
}

function FilterPill({ active, onClick, children }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors border
                ${active
                    ? 'bg-accent text-white border-transparent'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}
        >
            {children}
        </button>
    );
}
