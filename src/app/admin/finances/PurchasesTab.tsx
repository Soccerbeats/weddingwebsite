'use client';

import { useMemo, useState } from 'react';
import type { FinanceApi, FinancePayload } from './useFinances';
import {
    Card, DeleteButton, EmptyState, GlyphButton, InlineNumber, InlineText, PillButton,
    RowDate, RowField, RowSelect, StatTile, formatMoney,
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
    // Mobile collapses each payment to what you scan for; the rest is a tap away.
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const toggleExpanded = (key: string) => setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });

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
                <StatTile label="Counted toward budget" value={formatMoney(summary.paidTotal)}
                    hint={`${rows.length} payment${rows.length === 1 ? '' : 's'} logged`} />
                {summary.payers.map((p) => (
                    <StatTile key={p.id} label={`${p.name} paid`} value={formatMoney(p.spent)} />
                ))}
                <StatTile label="From gift money" value={formatMoney(summary.giftAppliedTotal)} tone="good"
                    hint={summary.giftUnapplied > 0
                        ? `${formatMoney(summary.giftUnapplied)} received, not applied`
                        : undefined} />
                {summary.unlinkedSpend > 0 && (
                    <StatTile label="Not in the budget" value={formatMoney(summary.unlinkedSpend)}
                        tone="warn" hint="Set 'counts toward' to include it" />
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
                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2
                            text-base md:w-auto md:flex-1 md:min-w-[10rem] md:py-1.5 md:text-sm
                            focus:outline-none focus:ring-2 focus:ring-accent/30"
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
                    const isOpen = expanded.has(row.key);
                    return (
                        <div key={row.key}
                            className={`grid grid-cols-1 gap-2 px-4 py-2 border-b border-gray-50 last:border-0
                                md:grid-cols-[1.7fr_7rem_1.3fr_1.3fr_6rem_1.5rem] md:items-center
                                ${row.kind === 'gift' ? 'bg-emerald-50/40' : ''}`}>
                            <div className="flex items-center gap-1 min-w-0 md:contents">
                                <GlyphButton
                                    onClick={() => toggleExpanded(row.key)}
                                    label={`${isOpen ? 'Collapse' : 'Expand'} ${row.label}`}
                                    className={`text-xs text-gray-400 transition-transform md:hidden
                                        ${isOpen ? 'rotate-90' : ''}`}
                                >
                                    ▶
                                </GlyphButton>
                                <InlineText
                                    value={row.label}
                                    placeholder={row.kind === 'gift' ? "What it's for…" : 'What was bought'}
                                    onCommit={(v) => patch({ [labelField]: v })}
                                    className="text-gray-800"
                                />
                                {/* Amount stays on the collapsed line — it's the other half of a glance. */}
                                <div className="w-24 shrink-0 md:hidden">
                                    <InlineNumber
                                        value={row.amount} prefix="$"
                                        onCommit={(amount) => patch({ amount })}
                                    />
                                </div>
                            </div>
                            <div className={`${isOpen ? 'grid grid-cols-1 gap-2 pb-1 pl-7' : 'hidden'} md:contents`}>
                            <RowField label="Date">
                                <RowDate
                                    value={(row.date ?? '').slice(0, 10)}
                                    aria-label={`Date for ${row.label}`}
                                    onChange={(e) => patch({ [dateField]: e.target.value })}
                                />
                            </RowField>
                            <RowField label={row.kind === 'gift' ? 'Gift from' : 'Paid by'}>
                                {row.kind === 'gift' ? (
                                    <span className="block truncate px-1 text-right text-xs font-medium
                                        text-emerald-700 md:text-left"
                                        title={`Gift money from ${row.who}`}>
                                        🎁 {row.who}
                                    </span>
                                ) : (
                                    <RowSelect
                                        value={row.payerId ?? ''}
                                        aria-label={`Who paid for ${row.label}`}
                                        onChange={(e) => patch({ payer_id: e.target.value || null })}
                                    >
                                        <option value="">Unassigned</option>
                                        {payers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </RowSelect>
                                )}
                            </RowField>
                            <RowField label="Counts toward">
                                <RowSelect
                                    value={targetValue(row)}
                                    aria-label={`What ${row.label} counts toward`}
                                    onChange={(e) => patch(targetPatch(e.target.value))}
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
                                </RowSelect>
                            </RowField>
                            <RowField label="Amount" className="hidden md:flex">
                                <InlineNumber
                                    value={row.amount} prefix="$"
                                    onCommit={(amount) => patch({ amount })}
                                />
                            </RowField>
                            <DeleteButton
                                label={`Delete ${row.label}`}
                                onClick={() => {
                                    const what = row.kind === 'gift'
                                        ? `${row.who}'s gift payment "${row.label}"`
                                        : `"${row.label}"`;
                                    if (confirm(`Delete ${what}?`)) api.remove(resource, row.id);
                                }}
                            />
                            </div>
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
            className={`inline-flex h-9 items-center rounded-full border px-3.5 text-xs font-medium
                transition-colors md:h-auto md:py-1.5
                ${active
                    ? 'bg-accent text-white border-transparent'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}
        >
            {children}
        </button>
    );
}
