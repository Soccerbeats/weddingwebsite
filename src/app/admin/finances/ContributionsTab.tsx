'use client';

import { useMemo, useState } from 'react';
import { contributorExpected, contributorReceived, type Contributor } from '@/lib/finance';
import type { FinanceApi, FinancePayload } from './useFinances';
import {
    AddButton, Bar, Card, DeleteButton, EmptyState, GlyphButton, InlineNumber, InlineText,
    Money, PillButton, RowDate, RowField, RowSelect, StatTile, formatMoney,
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

    // Gift money can be earmarked to a whole section (Rob's $5,000 against the
    // venue bill) or a single line (Kim's $1,200 against the dress).
    const targetGroups = useMemo(
        () => categories.map((c) => ({
            name: c.name,
            sectionValue: `c:${c.id}`,
            items: c.items.map((i) => ({ value: `i:${i.id}`, name: i.name })),
        })),
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
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <StatTile label="Pledged" value={formatMoney(summary.pledgedTotal)}
                    hint={`${contributors.length} contributor${contributors.length === 1 ? '' : 's'}`} />
                <StatTile label="Received" value={formatMoney(summary.receivedTotal)} tone="good" />
                <StatTile label="Still expected" value={formatMoney(summary.outstandingPledges)}
                    tone={summary.outstandingPledges > 0 ? 'warn' : 'good'}
                    hint={summary.outstandingPledges > 0 ? 'Promised but not in hand' : 'All pledges collected'} />
                <StatTile label="Thanked" value={
                    `${contributors.filter((c) => c.thank_you_sent).length}/${contributors.length}`
                } tone={contributors.length > 0
                    && contributors.every((c) => c.thank_you_sent) ? 'good' : 'warn'}
                    hint="thank-you notes sent" />
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
                        targetGroups={targetGroups}
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
                        className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2 text-base md:text-sm
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

function ContributorCard({ contributor, targetGroups, api }: {
    contributor: Contributor;
    targetGroups: { name: string; sectionValue: string; items: { value: string; name: string }[] }[];
    api: FinanceApi;
}) {
    const targetValue = (r: { item_id: number | null; category_id: number | null }) =>
        r.item_id != null ? `i:${r.item_id}` : r.category_id != null ? `c:${r.category_id}` : '';
    const targetPatch = (raw: string) => {
        if (!raw) return { item_id: null, category_id: null };
        const id = Number(raw.slice(2));
        return raw.startsWith('c:')
            ? { category_id: id, item_id: null }
            : { item_id: id, category_id: null };
    };
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
            <div className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-100">
                <div className="flex-1 min-w-[8rem] basis-full sm:basis-auto">
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
                    onClick={() => api.update('contributors', {
                        id: contributor.id, thank_you_sent: !contributor.thank_you_sent,
                    })}
                    title={contributor.thank_you_sent_at
                        ? `Sent ${contributor.thank_you_sent_at.slice(0, 10)}`
                        : 'Not sent yet'}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors
                        ${contributor.thank_you_sent
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                    {contributor.thank_you_sent ? '✓ Thanked' : 'Thank you?'}
                </button>
                <GlyphButton
                    label={`Archive ${contributor.name}`}
                    className="text-lg leading-none hover:text-rose-500"
                    onClick={() => {
                        // Archived rather than deleted: removing a contributor would
                        // cascade their payment history, which an undo can't rebuild.
                        const count = contributor.receipts.length;
                        const message = count
                            ? `Archive ${contributor.name} and their ${count} logged payment${count === 1 ? '' : 's'}? Nothing is lost — they stop counting toward your totals and you can restore them from Settings.`
                            : `Archive ${contributor.name}?`;
                        if (confirm(message)) api.update('contributors', { id: contributor.id, archived: true });
                    }}
                >
                    &times;
                </GlyphButton>
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
                                className="grid grid-cols-1 gap-2 rounded-xl bg-gray-50 px-3 py-3
                                    md:grid-cols-[minmax(0,1.4fr)_7.5rem_minmax(0,1fr)_7rem_1.75rem] md:items-center
                                    md:px-2 md:py-1.5">
                                <InlineText
                                    value={receipt.note ?? ''}
                                    placeholder="What it's for…"
                                    onCommit={(note) => api.update('receipts', { id: receipt.id, note })}
                                    className="md:text-xs"
                                />
                                <RowField label="Received">
                                    <RowDate
                                        value={(receipt.received_on ?? '').slice(0, 10)}
                                        aria-label="Date received"
                                        onChange={(e) => api.update('receipts', {
                                            id: receipt.id, received_on: e.target.value,
                                        })}
                                        className="md:text-[11px]"
                                    />
                                </RowField>
                                <RowField label="Earmarked to">
                                    <RowSelect
                                        value={targetValue(receipt)}
                                        aria-label="What this payment is earmarked to"
                                        onChange={(e) => api.update('receipts', {
                                            id: receipt.id, ...targetPatch(e.target.value),
                                        })}
                                        className="md:text-[11px]"
                                    >
                                        <option value="">— not earmarked —</option>
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
                                <RowField label="Amount">
                                    <InlineNumber
                                        value={receipt.amount} prefix="$"
                                        onCommit={(amount) => api.update('receipts', { id: receipt.id, amount })}
                                    />
                                </RowField>
                                <DeleteButton
                                    label={`Delete payment ${receipt.note ?? ''}`.trim()}
                                    onClick={() => api.removeWithUndo(
                                        'receipts', receipt.id,
                                        `${contributor.name}'s ${receipt.note || 'payment'}`,
                                        {
                                            contributor_id: contributor.id, amount: receipt.amount,
                                            received_on: receipt.received_on, note: receipt.note,
                                            item_id: receipt.item_id, category_id: receipt.category_id,
                                        },
                                    )}
                                />
                            </div>
                        ))}
                    </div>
                )}
                <AddButton onClick={addReceipt}>+ Log a payment received</AddButton>
                <p className="text-[11px] text-gray-400">
                    A refund or a returned gift goes in as a negative amount.
                </p>
            </div>
        </Card>
    );
}
