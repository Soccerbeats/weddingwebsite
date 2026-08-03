'use client';

import { useState } from 'react';
import type { PayerSummary } from '@/lib/finance';
import type { FinancePayload } from './useFinances';
import { Bar, Card, EmptyState, StatTile, formatMoney } from './ui';

type Scenario = 'pledged' | 'cash';

export default function OverviewTab({ data }: { data: FinancePayload }) {
    const { summary, weddingDate } = data;
    const [scenario, setScenario] = useState<Scenario>('cash');

    const optimistic = scenario === 'pledged';
    const deficit = optimistic ? summary.deficitPledged : summary.deficitCash;
    const stillToSpend = optimistic ? summary.stillToSpendPledged : summary.stillToSpendCash;
    const share = (p: PayerSummary) => (optimistic ? p.sharePledged : p.shareCash);
    const remaining = (p: PayerSummary) => (optimistic ? p.remainingPledged : p.remainingCash);
    const plan = (p: PayerSummary) => (optimistic ? p.planPledged : p.planCash);

    // No days left means the wedding date has passed or was never set, so a
    // per-month figure would be meaningless.
    const noHorizon = summary.horizon.days <= 0;

    const overruns = summary.items
        .filter((i) => i.variance > 0)
        .sort((a, b) => b.variance - a.variance);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatTile label="Total budget" value={formatMoney(summary.budgetTotal)}
                    hint={`${summary.itemCount} line items`} />
                <StatTile label="Spent so far" value={formatMoney(summary.spentTotal)}
                    hint={summary.budgetTotal > 0
                        ? `${((summary.spentTotal / summary.budgetTotal) * 100).toFixed(0)}% of budget`
                        : undefined} />
                <StatTile label="Gift money received" value={formatMoney(summary.receivedTotal)} tone="good"
                    hint={summary.outstandingPledges > 0
                        ? `+${formatMoney(summary.outstandingPledges)} pledged`
                        : 'all pledges collected'} />
                <StatTile
                    label="Left to pay"
                    value={formatMoney(Math.max(0, stillToSpend))}
                    tone={stillToSpend > 0 ? 'warn' : 'good'}
                    hint={optimistic ? 'assuming pledges land' : 'cash in hand only'}
                />
            </div>

            <Card className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-semibold text-gray-800">Planning scenario</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                            {optimistic
                                ? 'Counting every pledge as money you will receive.'
                                : 'Counting only money already in hand — the safe number.'}
                        </div>
                    </div>
                    <div className="flex gap-1.5">
                        <ScenarioPill active={!optimistic} onClick={() => setScenario('cash')}>
                            Cash in hand
                        </ScenarioPill>
                        <ScenarioPill active={optimistic} onClick={() => setScenario('pledged')}>
                            If pledges land
                        </ScenarioPill>
                    </div>
                </div>
            </Card>

            <Card className="p-5">
                <h3 className="font-semibold text-gray-900 mb-1">What you two have to cover</h3>
                <p className="text-xs text-gray-400 mb-4">
                    Budget {formatMoney(summary.budgetTotal)} minus{' '}
                    {optimistic ? 'pledged' : 'received'} contributions{' '}
                    {formatMoney(optimistic ? summary.pledgedTotal : summary.receivedTotal)}
                    {' = '}
                    <strong className="text-gray-700">{formatMoney(deficit)}</strong>, split by share below.
                </p>

                {summary.payers.length ? (
                    <div className="space-y-3">
                        {summary.payers.map((payer) => {
                            const owed = remaining(payer);
                            const ahead = owed < 0;
                            const p = plan(payer);
                            return (
                                <div key={payer.id} className="rounded-2xl border border-gray-100 p-4">
                                    <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                                        <div>
                                            <span className="font-semibold text-gray-900">{payer.name}</span>
                                            <span className="text-xs text-gray-400 ml-2">
                                                {payer.sharePct}% share
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <div className={`font-semibold tabular-nums ${ahead ? 'text-emerald-600' : 'text-gray-900'}`}>
                                                {ahead
                                                    ? `${formatMoney(-owed)} ahead`
                                                    : `${formatMoney(owed)} to go`}
                                            </div>
                                            <div className="text-[11px] text-gray-400">
                                                share {formatMoney(share(payer))} · paid {formatMoney(payer.spent)}
                                            </div>
                                        </div>
                                    </div>

                                    {ahead ? (
                                        <p className="text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">
                                            {payer.name} has already paid more than their share — the next
                                            expenses should come from someone else to even things out.
                                        </p>
                                    ) : noHorizon ? (
                                        <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
                                            Due now — there&apos;s no time left to spread this over.{' '}
                                            {weddingDate
                                                ? 'Your wedding date has passed; set a planning horizon in Settings to keep using the plan.'
                                                : 'Set your wedding date in General Settings, or a planning horizon in Settings, to see this broken down.'}
                                        </p>
                                    ) : (
                                        <div className="grid grid-cols-3 gap-2">
                                            <PlanCell label="per month" value={p.perMonth} />
                                            <PlanCell label="per paycheck" value={p.perPaycheck} />
                                            <PlanCell label="per day" value={p.perDay} />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <EmptyState>Add payers in Settings to see the split.</EmptyState>
                )}

                {!noHorizon && (
                    <p className="text-[11px] text-gray-400 mt-3">
                        Spread over {summary.horizon.days.toLocaleString()} days
                        {' '}({summary.horizon.months.toFixed(1)} months, ~{Math.floor(summary.horizon.paychecks)} paychecks)
                        {summary.horizon.derived && weddingDate
                            ? ` until ${weddingDate}.`
                            : ' from your custom planning horizon.'}
                    </p>
                )}
            </Card>

            <Card className="p-5">
                <h3 className="font-semibold text-gray-900 mb-4">Where the money goes</h3>
                <div className="space-y-3">
                    {summary.categories.map((category) => (
                        <div key={category.id}>
                            <div className="flex justify-between items-baseline text-sm mb-1">
                                <span className="font-medium text-gray-700">{category.name}</span>
                                <span className="text-gray-400 text-xs">
                                    <span className="tabular-nums font-medium text-gray-700">
                                        {formatMoney(category.total)}
                                    </span>
                                    {' · '}{category.pct.toFixed(1)}%
                                </span>
                            </div>
                            <Bar pct={category.pct} />
                            {category.spent > 0 && (
                                <div className="text-[11px] text-gray-400 mt-1">
                                    {formatMoney(category.spent)} paid
                                </div>
                            )}
                        </div>
                    ))}
                    {!summary.categories.length && <EmptyState>No budget sections yet.</EmptyState>}
                </div>
            </Card>

            <Card className="p-5">
                <h3 className="font-semibold text-gray-900 mb-1">Biggest line items</h3>
                <p className="text-xs text-gray-400 mb-4">Top 10 by cost, with what&apos;s been paid against each.</p>
                <div className="space-y-2">
                    {[...summary.items]
                        .sort((a, b) => b.total - a.total)
                        .slice(0, 10)
                        .map((item) => (
                            <div key={item.id} className="flex items-center gap-3 text-sm">
                                <span className="flex-1 truncate text-gray-700">
                                    {item.name}
                                    {item.isPaid && (
                                        <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-700
                                            font-semibold px-1.5 py-0.5 rounded-full align-middle">PAID</span>
                                    )}
                                </span>
                                <span className="text-[11px] text-gray-400 tabular-nums w-12 text-right">
                                    {item.pct.toFixed(1)}%
                                </span>
                                <span className="tabular-nums w-24 text-right font-medium">
                                    {formatMoney(item.total)}
                                </span>
                            </div>
                        ))}
                    {!summary.items.length && <EmptyState>No line items yet.</EmptyState>}
                </div>
            </Card>

            {(overruns.length > 0 || summary.unlinkedSpend > 0) && (
                <Card className="p-5 border-amber-200 bg-amber-50/40">
                    <h3 className="font-semibold text-amber-900 mb-1">Worth a look</h3>
                    <p className="text-xs text-amber-700 mb-3">
                        Lines where spending has passed the budgeted amount, or money that isn&apos;t
                        counted against any line.
                    </p>
                    <div className="space-y-1.5">
                        {overruns.map((item) => (
                            <div key={item.id} className="flex items-center gap-2 text-sm bg-white rounded-xl
                                border border-amber-100 px-3 py-2">
                                <span className="flex-1 truncate text-gray-700">{item.name}</span>
                                <span className="text-[11px] text-gray-400">
                                    budget {formatMoney(item.total)} · paid {formatMoney(item.spent)}
                                </span>
                                <span className="text-rose-600 font-semibold tabular-nums text-xs">
                                    +{formatMoney(item.variance)}
                                </span>
                            </div>
                        ))}
                        {summary.unlinkedSpend > 0 && (
                            <div className="flex items-center gap-2 text-sm bg-white rounded-xl
                                border border-amber-100 px-3 py-2">
                                <span className="flex-1 text-gray-700">Purchases with no budget line</span>
                                <span className="font-semibold tabular-nums text-xs text-amber-700">
                                    {formatMoney(summary.unlinkedSpend)}
                                </span>
                            </div>
                        )}
                    </div>
                </Card>
            )}
        </div>
    );
}

function PlanCell({ label, value }: { label: string; value: number }) {
    return (
        <div className="bg-gray-50 rounded-xl px-3 py-2 text-center">
            <div className="font-semibold tabular-nums text-sm text-gray-900">{formatMoney(value)}</div>
            <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mt-0.5">{label}</div>
        </div>
    );
}

function ScenarioPill({ active, onClick, children }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors border
                ${active
                    ? 'bg-accent text-white border-transparent'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}
        >
            {children}
        </button>
    );
}
