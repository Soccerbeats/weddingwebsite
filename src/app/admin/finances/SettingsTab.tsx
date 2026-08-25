'use client';

import { useCallback, useState } from 'react';
import type { FinanceApi, FinancePayload } from './useFinances';
import { Card, EmptyState, GlyphButton, InlineNumber, InlineText, PillButton, formatMoney } from './ui';

interface ArchivedRows {
    categories: { id: number; name: string }[];
    items: { id: number; name: string; category_name: string | null }[];
    purchases: { id: number; description: string; amount: number; purchased_on: string | null }[];
    contributors: { id: number; name: string; pledged: number }[];
}

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
        /* Same two-column treatment as the Overview, and for the same reason:
         * these are forms, and a text input a thousand pixels wide is harder to
         * use than a short one, not easier. */
        <div className="space-y-5 xl:space-y-0 xl:columns-2 xl:gap-5
            [&>*]:xl:mb-5 [&>*]:xl:break-inside-avoid">
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
                                <GlyphButton
                                    label={`Remove ${payer.name}`}
                                    className="text-lg leading-none hover:text-rose-500"
                                    onClick={() => {
                                        if (confirm(`Remove ${payer.name}? Their purchases stay but become unassigned.`)) {
                                            api.remove('payers', payer.id);
                                        }
                                    }}
                                >
                                    &times;
                                </GlyphButton>
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
                        className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2 text-base md:text-sm
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
                            // Uncontrolled and committed on blur: typing "12" used to
                            // save 1 and then 12, each with a full refetch.
                            key={settings.plan_horizon_months ?? 'auto'}
                            defaultValue={settings.plan_horizon_months ?? ''}
                            placeholder={weddingDate ? 'Auto — to wedding day' : 'Auto'}
                            onBlur={(e) => {
                                const next = e.target.value === '' ? null : e.target.value;
                                if (String(next ?? '') !== String(settings.plan_horizon_months ?? '')) {
                                    api.update('settings', { plan_horizon_months: next });
                                }
                            }}
                            className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2
                                text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
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

            <ArchiveCard data={data} api={api} />
        </div>
    );
}

/**
 * The way back from an archive.
 *
 * Archived rows are filtered out of the working set so they can't skew a total,
 * which means without this they'd be invisible and effectively lost.
 */
function ArchiveCard({ data, api }: { data: FinancePayload; api: FinanceApi }) {
    const total = data.archived.categories + data.archived.items
        + data.archived.purchases + data.archived.contributors;
    const [open, setOpen] = useState(false);
    const [rows, setRows] = useState<ArchivedRows | null>(null);

    const load = useCallback(async () => {
        const res = await fetch('/api/admin/finances/archived', { cache: 'no-store' });
        if (res.ok) setRows(await res.json());
    }, []);

    const toggle = () => {
        // Fetched on demand rather than in an effect: archived rows are only
        // needed when someone actually asks to see them.
        if (!open) load();
        setOpen((v) => !v);
    };

    const restore = async (resource: 'categories' | 'items' | 'purchases' | 'contributors', id: number) => {
        await api.update(resource, { id, archived: false });
        load();
    };

    if (total === 0) {
        return (
            <Card className="p-5">
                <h3 className="font-semibold text-gray-900 mb-1">Archive</h3>
                <p className="text-xs text-gray-400">
                    Nothing archived. Removing a section, line or payment archives it rather than
                    deleting it, so it stops counting toward your totals but stays recoverable here.
                </p>
            </Card>
        );
    }

    return (
        <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="font-semibold text-gray-900">Archive</h3>
                    <p className="mt-0.5 text-xs text-gray-400">
                        {total} archived row{total === 1 ? '' : 's'} — excluded from every total,
                        still here if you need them.
                    </p>
                </div>
                <PillButton onClick={toggle}>
                    {open ? 'Hide' : 'Show archived'}
                </PillButton>
            </div>

            {open && rows && (
                <div className="mt-4 space-y-4">
                    <ArchiveGroup title="Sections" items={rows.categories.map((c) => ({
                        id: c.id, label: c.name,
                    }))} onRestore={(id) => restore('categories', id)} />
                    <ArchiveGroup title="Line items" items={rows.items.map((i) => ({
                        id: i.id, label: i.category_name ? `${i.name} (${i.category_name})` : i.name,
                    }))} onRestore={(id) => restore('items', id)} />
                    <ArchiveGroup title="Payments" items={rows.purchases.map((p) => ({
                        id: p.id, label: `${p.description} — ${formatMoney(p.amount)}`,
                    }))} onRestore={(id) => restore('purchases', id)} />
                    <ArchiveGroup title="Contributors" items={rows.contributors.map((c) => ({
                        id: c.id, label: `${c.name} — ${formatMoney(c.pledged)} pledged`,
                    }))} onRestore={(id) => restore('contributors', id)} />
                </div>
            )}
        </Card>
    );
}

function ArchiveGroup({ title, items, onRestore }: {
    title: string;
    items: { id: number; label: string }[];
    onRestore: (id: number) => void;
}) {
    if (!items.length) return null;
    return (
        <div>
            <div className="mb-1 text-xs font-semibold text-gray-500">{title}</div>
            <div className="space-y-1">
                {items.map((item) => (
                    <div key={item.id}
                        className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-sm">
                        <span className="min-w-0 flex-1 truncate text-gray-600">{item.label}</span>
                        <button onClick={() => onRestore(item.id)}
                            className="shrink-0 text-xs font-medium text-accent hover:underline">
                            Restore
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
