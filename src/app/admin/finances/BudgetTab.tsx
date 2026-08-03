'use client';

import { useState } from 'react';
import { itemTotal, subItemTotal, effectiveQuantity, type BudgetItem, type Category } from '@/lib/finance';
import type { FinanceApi, FinancePayload } from './useFinances';
import {
    Bar, Card, EmptyState, InlineNumber, InlineText, Money, PillButton, Toggle, formatMoney,
} from './ui';

const QTY_LABELS: Record<string, string> = {
    manual: 'Fixed',
    adults: 'Adults',
    minors: 'Minors',
    total: 'All guests',
};

export default function BudgetTab({ data, api }: { data: FinancePayload; api: FinanceApi }) {
    const { settings, categories, summary } = data;
    const [expanded, setExpanded] = useState<Set<number>>(new Set());
    const [newCategory, setNewCategory] = useState('');

    const toggleExpanded = (id: number) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const addCategory = async () => {
        const name = newCategory.trim();
        if (!name) return;
        await api.create('categories', { name, sort_order: categories.length });
        setNewCategory('');
    };

    return (
        <div className="space-y-6">
            <Card className="p-5">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">
                            Total budget
                        </div>
                        <div className="text-3xl font-semibold tabular-nums text-gray-900">
                            {formatMoney(summary.budgetTotal)}
                        </div>
                    </div>
                    <div className="text-xs text-gray-400 text-right">
                        {summary.itemCount} line{summary.itemCount === 1 ? '' : 's'} ·{' '}
                        {summary.paidItemCount} marked paid
                        <div className="mt-0.5">
                            Headcount: {settings.adult_count} adults + {settings.minor_count} minors
                        </div>
                    </div>
                </div>
            </Card>

            {categories.map((category) => (
                <CategoryBlock
                    key={category.id}
                    category={category}
                    data={data}
                    api={api}
                    expanded={expanded}
                    onToggleExpanded={toggleExpanded}
                />
            ))}

            {!categories.length && (
                <Card className="p-6">
                    <EmptyState>No budget sections yet. Add one below to get started.</EmptyState>
                </Card>
            )}

            <Card className="p-4">
                <div className="flex gap-2 items-center">
                    <input
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addCategory(); }}
                        placeholder="New section name (e.g. Honeymoon)"
                        className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />
                    <PillButton tone="accent" onClick={addCategory} disabled={!newCategory.trim()}>
                        Add section
                    </PillButton>
                </div>
            </Card>
        </div>
    );
}

function CategoryBlock({ category, data, api, expanded, onToggleExpanded }: {
    category: Category;
    data: FinancePayload;
    api: FinanceApi;
    expanded: Set<number>;
    onToggleExpanded: (id: number) => void;
}) {
    const stats = data.summary.categories.find((c) => c.id === category.id);

    const addItem = () =>
        api.create('items', {
            category_id: category.id,
            name: 'New line item',
            unit_cost: 0,
            quantity: 1,
            qty_source: 'manual',
            sort_order: category.items.length,
        });

    const deleteCategory = () => {
        const count = category.items.length;
        const message = count
            ? `Delete "${category.name}" and its ${count} line item${count === 1 ? '' : 's'}? Purchases stay, but lose their budget link.`
            : `Delete "${category.name}"?`;
        if (confirm(message)) api.remove('categories', category.id);
    };

    return (
        <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 bg-gray-50/50">
                <div className="flex-1 min-w-0">
                    <InlineText
                        value={category.name}
                        onCommit={(name) => api.update('categories', { id: category.id, name })}
                        className="font-semibold text-gray-900"
                    />
                </div>
                <div className="text-right shrink-0">
                    <div className="font-semibold tabular-nums text-sm">{formatMoney(stats?.total ?? 0)}</div>
                    <div className="text-[11px] text-gray-400">{(stats?.pct ?? 0).toFixed(1)}% of budget</div>
                </div>
                <button
                    onClick={deleteCategory}
                    aria-label={`Delete ${category.name}`}
                    className="text-gray-300 hover:text-rose-500 transition-colors px-1"
                >
                    &times;
                </button>
            </div>

            <div className="hidden md:grid grid-cols-[1.6fr_5.5rem_5rem_6rem_5rem_4.5rem_1.5rem] gap-2 px-4 py-2
                text-[10px] uppercase tracking-wide text-gray-400 font-semibold border-b border-gray-50">
                <div>Item</div>
                <div className="text-right">Unit cost</div>
                <div className="text-right">Qty</div>
                <div>Qty from</div>
                <div className="text-right">Total</div>
                <div className="text-center">Paid</div>
                <div />
            </div>

            {category.items.map((item) => (
                <ItemRow
                    key={item.id}
                    item={item}
                    data={data}
                    api={api}
                    expanded={expanded.has(item.id)}
                    onToggleExpanded={() => onToggleExpanded(item.id)}
                />
            ))}

            {!category.items.length && <EmptyState>No line items in this section yet.</EmptyState>}

            <div className="px-4 py-3 border-t border-gray-50">
                <button
                    onClick={addItem}
                    className="w-full border-2 border-dashed border-gray-200 rounded-2xl py-2 text-sm
                        text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors font-medium"
                >
                    + Add line item
                </button>
            </div>

            <SectionPayments category={category} data={data} api={api} />
        </Card>
    );
}

/**
 * Paid-vs-budgeted for a whole section, plus its installment log.
 *
 * Bills like the venue arrive as one number covering every line in the section
 * and get paid down in chunks, so tagging each installment to a single line
 * would both misattribute it and fire a bogus overrun warning.
 */
function SectionPayments({ category, data, api }: {
    category: Category;
    data: FinancePayload;
    api: FinanceApi;
}) {
    const stats = data.summary.categories.find((c) => c.id === category.id);
    if (!stats) return null;

    // Own-pocket installments and earmarked gift payments both paid this bill, so
    // both belong in the list. Gift rows are badged and edit via the receipts API.
    const installments = [
        ...data.purchases
            .filter((p) => p.category_id === category.id)
            .map((p) => ({
                key: `p${p.id}`, id: p.id, kind: 'purchase' as const,
                label: p.description, date: p.purchased_on, amount: p.amount,
                payerId: p.payer_id, who: null as string | null,
            })),
        ...data.contributors.flatMap((c) =>
            (c.receipts || [])
                .filter((r) => r.category_id === category.id)
                .map((r) => ({
                    key: `r${r.id}`, id: r.id, kind: 'gift' as const,
                    label: r.note ?? '', date: r.received_on, amount: r.amount,
                    payerId: null as number | null, who: c.name,
                }))),
    ].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    // Summed from the displayed rows so the subtotal can never disagree with them.
    const installmentSubtotal = installments.reduce((sum, r) => sum + r.amount, 0);
    const overpaid = stats.remaining < 0;

    const addInstallment = () =>
        api.create('purchases', {
            category_id: category.id,
            description: `${category.name} payment`,
            amount: 0,
            payer_id: data.payers[0]?.id ?? null,
            purchased_on: new Date().toISOString().slice(0, 10),
        });

    return (
        <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                <h4 className="text-sm font-semibold text-gray-800">Paid toward this section</h4>
                <span className="text-xs text-gray-400">
                    {installments.length
                        ? `${installments.length} payment${installments.length === 1 ? '' : 's'}`
                        : 'no payments yet'}
                    {stats.itemSpent > 0 && ` · ${formatMoney(stats.itemSpent)} tagged to single lines`}
                </span>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
                <Figure label="budgeted" value={stats.total} />
                <Figure label="paid so far" value={stats.paid} tone="good" />
                <Figure
                    label={overpaid ? 'overpaid by' : 'still owed'}
                    value={Math.abs(stats.remaining)}
                    tone={overpaid ? 'bad' : 'warn'}
                />
            </div>

            <Bar pct={stats.paidPct} tone={overpaid ? 'rose' : 'accent'} />
            <div className="flex justify-between text-[11px] text-gray-400 mt-1 mb-3">
                <span>{stats.paidPct.toFixed(1)}% paid</span>
                {stats.giftApplied > 0 && (
                    <span>
                        {formatMoney(stats.ownSpent)} yours + {formatMoney(stats.giftApplied)} gift money
                    </span>
                )}
            </div>

            {installments.length > 0 && (
                <div className="space-y-1 mb-2">
                    {installments.map((row) => {
                        const resource = row.kind === 'gift' ? 'receipts' as const : 'purchases' as const;
                        const labelField = row.kind === 'gift' ? 'note' : 'description';
                        const dateField = row.kind === 'gift' ? 'received_on' : 'purchased_on';
                        return (
                            <div key={row.key}
                                className={`grid grid-cols-[1fr_7rem_1.2fr_5.5rem_1.5rem] gap-2 items-center
                                    rounded-xl border px-2 py-1.5
                                    ${row.kind === 'gift'
                                        ? 'bg-emerald-50/60 border-emerald-100'
                                        : 'bg-white border-gray-100'}`}>
                                <InlineText
                                    value={row.label}
                                    placeholder="e.g. Venue 3/4"
                                    onCommit={(v) => api.update(resource, { id: row.id, [labelField]: v })}
                                    className="text-xs"
                                />
                                <input
                                    type="date"
                                    value={(row.date ?? '').slice(0, 10)}
                                    onChange={(e) => api.update(resource, {
                                        id: row.id, [dateField]: e.target.value,
                                    })}
                                    className="bg-transparent text-[11px] text-gray-500 rounded-lg px-1 py-0.5
                                        focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/30"
                                />
                                {row.kind === 'gift' ? (
                                    <span className="text-[11px] text-emerald-700 truncate px-1">
                                        🎁 {row.who}
                                    </span>
                                ) : (
                                    <select
                                        value={row.payerId ?? ''}
                                        onChange={(e) => api.update('purchases', {
                                            id: row.id, payer_id: e.target.value || null,
                                        })}
                                        className="bg-transparent text-[11px] text-gray-600 rounded-lg px-1 py-0.5
                                            focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/30"
                                    >
                                        <option value="">Unassigned</option>
                                        {data.payers.map((payer) => (
                                            <option key={payer.id} value={payer.id}>{payer.name}</option>
                                        ))}
                                    </select>
                                )}
                                <InlineNumber
                                    value={row.amount} prefix="$"
                                    onCommit={(amount) => api.update(resource, { id: row.id, amount })}
                                />
                                <button
                                    onClick={() => {
                                        const what = row.kind === 'gift'
                                            ? `${row.who}'s gift payment "${row.label}"`
                                            : `"${row.label}"`;
                                        if (confirm(`Delete ${what}?`)) api.remove(resource, row.id);
                                    }}
                                    aria-label={`Delete ${row.label}`}
                                    className="text-gray-300 hover:text-rose-500 transition-colors"
                                >
                                    &times;
                                </button>
                            </div>
                        );
                    })}
                    <div className="flex justify-between px-2 pt-1 text-[11px] text-gray-500">
                        <span>Payments subtotal</span>
                        <span className="font-semibold tabular-nums">
                            {formatMoney(installmentSubtotal)}
                        </span>
                    </div>
                </div>
            )}

            <button
                onClick={addInstallment}
                className="text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors"
            >
                + Log an installment
            </button>
            {installments.length === 0 && (
                <p className="text-[11px] text-gray-400 mt-1">
                    Use this for payments covering the whole section, like a venue deposit — not tied to
                    any single line.
                </p>
            )}
        </div>
    );
}

function Figure({ label, value, tone = 'default' }: {
    label: string;
    value: number;
    tone?: 'default' | 'good' | 'warn' | 'bad';
}) {
    const toneClass = {
        default: 'text-gray-900',
        good: 'text-emerald-600',
        warn: 'text-amber-600',
        bad: 'text-rose-600',
    }[tone];
    return (
        <div className="bg-white rounded-xl border border-gray-100 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{label}</div>
            <div className={`text-sm font-semibold tabular-nums mt-0.5 ${toneClass}`}>
                {formatMoney(value)}
            </div>
        </div>
    );
}

function ItemRow({ item, data, api, expanded, onToggleExpanded }: {
    item: BudgetItem;
    data: FinancePayload;
    api: FinanceApi;
    expanded: boolean;
    onToggleExpanded: () => void;
}) {
    const { settings, summary } = data;
    const stats = summary.items.find((i) => i.id === item.id);
    const total = itemTotal(item, settings);
    const paid = stats?.paid ?? 0;
    const ownSpent = stats?.ownSpent ?? 0;
    const giftApplied = stats?.giftApplied ?? 0;
    const variance = stats?.variance ?? 0;
    const derivedQty = item.qty_source !== 'manual';

    const patch = (fields: Record<string, unknown>) => api.update('items', { id: item.id, ...fields });

    return (
        <div className={`border-b border-gray-50 last:border-0 ${item.is_paid ? 'bg-emerald-50/30' : ''}`}>
            <div className="grid grid-cols-2 md:grid-cols-[1.6fr_5.5rem_5rem_6rem_5rem_4.5rem_1.5rem]
                gap-2 px-4 py-2 items-center">
                <div className="col-span-2 md:col-span-1 flex items-center gap-1 min-w-0">
                    <button
                        onClick={onToggleExpanded}
                        aria-label={expanded ? 'Collapse' : 'Expand'}
                        className={`text-gray-300 hover:text-gray-600 text-xs w-4 shrink-0 transition-transform
                            ${expanded ? 'rotate-90' : ''}`}
                    >
                        ▶
                    </button>
                    <InlineText
                        value={item.name}
                        onCommit={(name) => patch({ name })}
                        className={item.is_paid ? 'font-semibold text-gray-900' : 'text-gray-800'}
                    />
                </div>

                <div>
                    {item.use_subitems ? (
                        <div className="text-right text-xs text-gray-400 pr-2 italic">from parts</div>
                    ) : (
                        <InlineNumber value={item.unit_cost} prefix="$" onCommit={(unit_cost) => patch({ unit_cost })} />
                    )}
                </div>

                <div>
                    {item.use_subitems ? (
                        <div className="text-right text-xs text-gray-300 pr-2">—</div>
                    ) : derivedQty ? (
                        <div className="text-right text-sm tabular-nums text-gray-500 pr-2"
                            title="Driven by the headcount in Settings">
                            {effectiveQuantity(item, settings)}
                        </div>
                    ) : (
                        <InlineNumber value={item.quantity} onCommit={(quantity) => patch({ quantity })} />
                    )}
                </div>

                <div>
                    {item.use_subitems ? (
                        <div className="text-xs text-gray-300 px-2">—</div>
                    ) : (
                        <select
                            value={item.qty_source}
                            onChange={(e) => patch({ qty_source: e.target.value })}
                            className="w-full bg-transparent text-xs text-gray-500 rounded-lg px-1 py-1
                                hover:bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/30"
                        >
                            {Object.entries(QTY_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                    )}
                </div>

                <div className="text-right font-medium text-sm">
                    <Money value={total} />
                </div>

                <div className="flex justify-center">
                    <Toggle
                        checked={item.is_paid}
                        onChange={(is_paid) => patch({ is_paid })}
                        label={`Mark ${item.name} paid`}
                    />
                </div>

                <button
                    onClick={() => { if (confirm(`Delete "${item.name}"?`)) api.remove('items', item.id); }}
                    aria-label={`Delete ${item.name}`}
                    className="text-gray-300 hover:text-rose-500 transition-colors text-right"
                >
                    &times;
                </button>
            </div>

            {paid > 0 && (
                <div className="px-4 pb-2 -mt-1 md:pl-9 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                    <span className="text-gray-400">
                        Paid so far <Money value={paid} className="font-medium" />
                    </span>
                    {giftApplied > 0 && (
                        <span className="text-gray-400">
                            {ownSpent > 0 ? `${formatMoney(ownSpent)} yours + ` : ''}
                            <span className="font-medium">{formatMoney(giftApplied)} gift money</span>
                        </span>
                    )}
                    {variance > 0 && (
                        <span className="text-rose-600 font-medium">
                            Over budget by {formatMoney(variance)}
                        </span>
                    )}
                    {variance < 0 && (
                        <span className="text-gray-400">
                            {formatMoney(-variance)} left on this line
                        </span>
                    )}
                </div>
            )}

            {expanded && <ItemDetail item={item} data={data} api={api} />}
        </div>
    );
}

function ItemDetail({ item, data, api }: { item: BudgetItem; data: FinancePayload; api: FinanceApi }) {
    const { settings } = data;
    const linkedPurchases = data.purchases.filter((p) => p.item_id === item.id);
    const payerName = (id: number | null) =>
        data.payers.find((p) => p.id === id)?.name ?? 'Unassigned';

    const addSubItem = () =>
        api.create('subitems', {
            item_id: item.id,
            name: 'New part',
            unit_cost: 0,
            quantity: 1,
            sort_order: item.subitems.length,
        });

    const enableSubitems = async (use_subitems: boolean) => {
        await api.update('items', { id: item.id, use_subitems });
        if (use_subitems && !item.subitems.length) await addSubItem();
    };

    return (
        <div className="bg-gray-50/60 px-4 py-4 md:pl-9 space-y-4 border-t border-gray-100">
            <div className="flex items-center gap-3">
                <Toggle checked={item.use_subitems} onChange={enableSubitems} label="Break into parts" />
                <div>
                    <div className="text-sm font-medium text-gray-700">Break into parts</div>
                    <div className="text-xs text-gray-400">
                        Build this line from components — the parts add up to the line total.
                    </div>
                </div>
            </div>

            {item.use_subitems && (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="grid grid-cols-[1fr_5.5rem_5rem_5rem_1.5rem] gap-2 px-3 py-2
                        text-[10px] uppercase tracking-wide text-gray-400 font-semibold border-b border-gray-50">
                        <div>Part</div>
                        <div className="text-right">Unit cost</div>
                        <div className="text-right">Qty</div>
                        <div className="text-right">Total</div>
                        <div />
                    </div>
                    {item.subitems.map((sub) => (
                        <div key={sub.id}
                            className="grid grid-cols-[1fr_5.5rem_5rem_5rem_1.5rem] gap-2 px-3 py-1.5
                                items-center border-b border-gray-50 last:border-0">
                            <InlineText
                                value={sub.name}
                                onCommit={(name) => api.update('subitems', { id: sub.id, name })}
                            />
                            <InlineNumber
                                value={sub.unit_cost} prefix="$"
                                onCommit={(unit_cost) => api.update('subitems', { id: sub.id, unit_cost })}
                            />
                            <InlineNumber
                                value={sub.quantity}
                                onCommit={(quantity) => api.update('subitems', { id: sub.id, quantity })}
                            />
                            <div className="text-right text-sm"><Money value={subItemTotal(sub)} /></div>
                            <button
                                onClick={() => api.remove('subitems', sub.id)}
                                aria-label={`Delete ${sub.name}`}
                                className="text-gray-300 hover:text-rose-500 transition-colors"
                            >
                                &times;
                            </button>
                        </div>
                    ))}
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50/60">
                        <button
                            onClick={addSubItem}
                            className="text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors"
                        >
                            + Add part
                        </button>
                        <div className="text-sm font-semibold tabular-nums">
                            {formatMoney(itemTotal(item, settings))}
                        </div>
                    </div>
                </div>
            )}

            <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">Notes</div>
                <InlineText
                    value={item.notes ?? ''}
                    placeholder="Vendor, contract terms, deposit schedule…"
                    onCommit={(notes) => api.update('items', { id: item.id, notes })}
                    className="bg-white border border-gray-200 rounded-xl"
                />
            </div>

            <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">
                    Payments against this line ({linkedPurchases.length})
                </div>
                {linkedPurchases.length ? (
                    <div className="space-y-1">
                        {linkedPurchases.map((p) => (
                            <div key={p.id} className="flex items-center gap-2 text-xs text-gray-600
                                bg-white rounded-xl border border-gray-100 px-3 py-1.5">
                                <span className="flex-1 truncate">{p.description}</span>
                                <span className="text-gray-400">{payerName(p.payer_id)}</span>
                                <Money value={p.amount} className="font-medium" />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-xs text-gray-400">
                        Nothing logged yet. Add one from the Purchases tab.
                    </div>
                )}
            </div>
        </div>
    );
}
