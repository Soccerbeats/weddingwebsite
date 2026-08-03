'use client';

import { useMemo, useState } from 'react';
import { contributorExpected, contributorReceived, type Contributor } from '@/lib/finance';
import type { FinanceApi, FinancePayload } from './useFinances';
import {
    Bar, Card, EmptyState, InlineNumber, InlineText, Money, PillButton, StatTile, formatMoney,
} from './ui';

/**
 * Money given to help pay for the wedding — parents, family, anyone chipping in.
 *
 * Deliberately separate from the `donations` table behind the Registry page,
 * which tracks wedding and shower *gifts* from guests (guest-linked, registry
 * fund items, thank-you notes). Different concept, different money.
 */
export default function ContributionsTab({ data, api }: { data: FinancePayload; api: FinanceApi }) {
    const { contributors, summary, categories } = data;
    const [newName, setNewName] = useState('');

    const itemGroups = useMemo(
        () => categories.map((c) => ({ name: c.name, items: c.items.map((i) => ({ id: i.id, name: i.name })) })),
        [categories],
    );

    const addContributor = async () => {
        const name = newName.trim();
        if (!name) return;
        await api.create('contributors', { name, pledged: 0, sort_order: contributors.length });
        setNewName('');
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatTile label="Pledged" value={formatMoney(summary.pledgedTotal)}
                    hint={`${contributors.length} contributor${contributors.length === 1 ? '' : 's'}`} />
                <StatTile label="Received" value={formatMoney(summary.receivedTotal)} tone="good" />
                <StatTile label="Still expected" value={formatMoney(summary.outstandingPledges)}
                    tone={summary.outstandingPledges > 0 ? 'warn' : 'good'}
                    hint={summary.outstandingPledges > 0 ? 'Promised but not in hand' : 'All pledges collected'} />
                <StatTile label="Covers" value={
                    summary.budgetTotal > 0
                        ? `${((summary.receivedTotal / summary.budgetTotal) * 100).toFixed(1)}%`
                        : '—'
                } hint="of the total budget, in cash" />
            </div>

            <Card className="p-4 bg-amber-50/50 border-amber-100">
                <p className="text-xs text-amber-800 leading-relaxed">
                    <strong>This is money toward the wedding bill</strong> — your parents&apos; $5,000, family
                    chipping in. Wedding and shower <em>gifts</em> from guests live on the{' '}
                    <a href="/admin/registry" className="underline font-medium">Registry</a> page instead,
                    where they stay tied to a guest for thank-you notes.
                </p>
            </Card>

            <div className="space-y-4">
                {contributors.map((contributor) => (
                    <ContributorCard
                        key={contributor.id}
                        contributor={contributor}
                        itemGroups={itemGroups}
                        api={api}
                    />
                ))}
            </div>

            {!contributors.length && (
                <Card className="p-6"><EmptyState>No contributors yet.</EmptyState></Card>
            )}

            <Card className="p-4">
                <div className="flex gap-2 items-center">
                    <input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addContributor(); }}
                        placeholder="Who's contributing? (e.g. Karie & Dave)"
                        className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />
                    <PillButton tone="accent" onClick={addContributor} disabled={!newName.trim()}>
                        Add contributor
                    </PillButton>
                </div>
            </Card>
        </div>
    );
}

function ContributorCard({ contributor, itemGroups, api }: {
    contributor: Contributor;
    itemGroups: { name: string; items: { id: number; name: string }[] }[];
    api: FinanceApi;
}) {
    const received = contributorReceived(contributor);
    const expected = contributorExpected(contributor);
    const outstanding = Math.max(0, expected - received);
    const pct = expected > 0 ? (received / expected) * 100 : 0;
    const overDelivered = received > contributor.pledged;

    const addReceipt = () =>
        api.create('receipts', {
            contributor_id: contributor.id,
            amount: outstanding > 0 ? outstanding : 0,
            received_on: new Date().toISOString().slice(0, 10),
        });

    return (
        <Card className="overflow-hidden">
            <div className="px-4 py-3 flex flex-wrap items-center gap-3 border-b border-gray-100">
                <div className="flex-1 min-w-[8rem]">
                    <InlineText
                        value={contributor.name}
                        onCommit={(name) => api.update('contributors', { id: contributor.id, name })}
                        className="font-semibold text-gray-900"
                    />
                </div>
                <div className="flex items-center gap-4 text-right">
                    <div>
                        <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Pledged</div>
                        <div className="w-24">
                            <InlineNumber
                                value={contributor.pledged} prefix="$"
                                onCommit={(pledged) => api.update('contributors', { id: contributor.id, pledged })}
                            />
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Received</div>
                        <div className="text-sm font-semibold tabular-nums px-2 py-1">
                            <Money value={received} />
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => {
                        const count = contributor.receipts.length;
                        const message = count
                            ? `Delete ${contributor.name} and their ${count} logged payment${count === 1 ? '' : 's'}?`
                            : `Delete ${contributor.name}?`;
                        if (confirm(message)) api.remove('contributors', contributor.id);
                    }}
                    aria-label={`Delete ${contributor.name}`}
                    className="text-gray-300 hover:text-rose-500 transition-colors"
                >
                    &times;
                </button>
            </div>

            <div className="px-4 py-2">
                <Bar pct={pct} />
                <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                    <span>{pct.toFixed(0)}% collected</span>
                    {overDelivered ? (
                        <span className="text-emerald-600 font-medium">
                            Gave {formatMoney(received - contributor.pledged)} over the pledge
                        </span>
                    ) : outstanding > 0 ? (
                        <span>{formatMoney(outstanding)} still expected</span>
                    ) : (
                        <span className="text-emerald-600 font-medium">Fully collected</span>
                    )}
                </div>
            </div>

            <div className="px-4 pb-3">
                {contributor.receipts.length > 0 && (
                    <div className="space-y-1 mb-2">
                        {contributor.receipts.map((receipt) => (
                            <div key={receipt.id}
                                className="grid grid-cols-[1fr_7rem_1.4fr_5.5rem_1.5rem] gap-2 items-center
                                    bg-gray-50 rounded-xl px-2 py-1.5">
                                <InlineText
                                    value={receipt.note ?? ''}
                                    placeholder="What it's for…"
                                    onCommit={(note) => api.update('receipts', { id: receipt.id, note })}
                                    className="text-xs"
                                />
                                <input
                                    type="date"
                                    value={(receipt.received_on ?? '').slice(0, 10)}
                                    onChange={(e) => api.update('receipts', {
                                        id: receipt.id, received_on: e.target.value,
                                    })}
                                    className="bg-transparent text-[11px] text-gray-500 rounded-lg px-1 py-0.5
                                        focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/30"
                                />
                                <select
                                    value={receipt.item_id ?? ''}
                                    onChange={(e) => api.update('receipts', {
                                        id: receipt.id, item_id: e.target.value || null,
                                    })}
                                    className="bg-transparent text-[11px] text-gray-600 rounded-lg px-1 py-0.5
                                        focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/30"
                                >
                                    <option value="">— not earmarked —</option>
                                    {itemGroups.map((group) => (
                                        <optgroup key={group.name} label={group.name}>
                                            {group.items.map((i) => (
                                                <option key={i.id} value={i.id}>{i.name}</option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                                <InlineNumber
                                    value={receipt.amount} prefix="$"
                                    onCommit={(amount) => api.update('receipts', { id: receipt.id, amount })}
                                />
                                <button
                                    onClick={() => api.remove('receipts', receipt.id)}
                                    aria-label="Delete payment"
                                    className="text-gray-300 hover:text-rose-500 transition-colors"
                                >
                                    &times;
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                <button
                    onClick={addReceipt}
                    className="text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors"
                >
                    + Log a payment received
                </button>
            </div>
        </Card>
    );
}
