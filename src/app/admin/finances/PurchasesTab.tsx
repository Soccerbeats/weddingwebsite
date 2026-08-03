'use client';

import { useMemo, useState } from 'react';
import type { FinanceApi, FinancePayload } from './useFinances';
import {
    Card, EmptyState, InlineNumber, InlineText, PillButton, StatTile, formatMoney,
} from './ui';

export default function PurchasesTab({ data, api }: { data: FinancePayload; api: FinanceApi }) {
    const { purchases, payers, categories, summary } = data;
    const [payerFilter, setPayerFilter] = useState<'all' | number>('all');
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
    const targetValue = (p: { item_id: number | null; category_id: number | null }) =>
        p.item_id != null ? `i:${p.item_id}` : p.category_id != null ? `c:${p.category_id}` : '';
    const targetPatch = (raw: string) => {
        if (!raw) return { item_id: null, category_id: null };
        const id = Number(raw.slice(2));
        return raw.startsWith('c:')
            ? { category_id: id, item_id: null }
            : { item_id: id, category_id: null };
    };

    const visible = useMemo(() => {
        const term = search.trim().toLowerCase();
        return purchases.filter((p) => {
            if (payerFilter !== 'all' && p.payer_id !== payerFilter) return false;
            if (!term) return true;
            return p.description.toLowerCase().includes(term)
                || (p.notes ?? '').toLowerCase().includes(term);
        });
    }, [purchases, payerFilter, search]);

    const visibleTotal = visible.reduce((sum, p) => sum + p.amount, 0);

    const addPurchase = () =>
        api.create('purchases', {
            description: 'New purchase',
            amount: 0,
            payer_id: payerFilter !== 'all' ? payerFilter : payers[0]?.id ?? null,
            purchased_on: new Date().toISOString().slice(0, 10),
        });

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatTile label="Total spent" value={formatMoney(summary.spentTotal)}
                    hint={`${purchases.length} purchase${purchases.length === 1 ? '' : 's'}`} />
                {summary.payers.map((p) => (
                    <StatTile key={p.id} label={`${p.name} paid`} value={formatMoney(p.spent)} />
                ))}
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
                    </div>
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search purchases…"
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

                {visible.map((purchase) => {
                    const patch = (fields: Record<string, unknown>) =>
                        api.update('purchases', { id: purchase.id, ...fields });
                    return (
                        <div key={purchase.id}
                            className="grid grid-cols-2 md:grid-cols-[1.7fr_7rem_1.3fr_1.3fr_6rem_1.5rem] gap-2
                                px-4 py-2 items-center border-b border-gray-50 last:border-0">
                            <div className="col-span-2 md:col-span-1">
                                <InlineText
                                    value={purchase.description}
                                    onCommit={(description) => patch({ description })}
                                    className="text-gray-800"
                                />
                            </div>
                            <input
                                type="date"
                                value={(purchase.purchased_on ?? '').slice(0, 10)}
                                onChange={(e) => patch({ purchased_on: e.target.value })}
                                className="bg-transparent text-xs text-gray-500 rounded-lg px-1 py-1
                                    hover:bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/30"
                            />
                            <select
                                value={purchase.payer_id ?? ''}
                                onChange={(e) => patch({ payer_id: e.target.value || null })}
                                className="bg-transparent text-xs text-gray-600 rounded-lg px-1 py-1
                                    hover:bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/30"
                            >
                                <option value="">Unassigned</option>
                                {payers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            <select
                                value={targetValue(purchase)}
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
                                value={purchase.amount} prefix="$"
                                onCommit={(amount) => patch({ amount })}
                            />
                            <button
                                onClick={() => {
                                    if (confirm(`Delete "${purchase.description}"?`)) {
                                        api.remove('purchases', purchase.id);
                                    }
                                }}
                                aria-label={`Delete ${purchase.description}`}
                                className="text-gray-300 hover:text-rose-500 transition-colors text-right"
                            >
                                &times;
                            </button>
                        </div>
                    );
                })}

                {!visible.length && (
                    <EmptyState>
                        {purchases.length
                            ? 'No purchases match this filter.'
                            : 'No purchases logged yet.'}
                    </EmptyState>
                )}

                {visible.length > 0 && (
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50/60 border-t border-gray-100">
                        <span className="text-xs text-gray-500">
                            {visible.length} shown
                            {visible.length !== purchases.length && ` of ${purchases.length}`}
                        </span>
                        <span className="font-semibold tabular-nums text-sm">{formatMoney(visibleTotal)}</span>
                    </div>
                )}
            </Card>
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
