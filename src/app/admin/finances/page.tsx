'use client';

import { useState } from 'react';
import BudgetTab from './BudgetTab';
import ContributionsTab from './ContributionsTab';
import OverviewTab from './OverviewTab';
import PurchasesTab from './PurchasesTab';
import ScheduleTab from './ScheduleTab';
import SettingsTab from './SettingsTab';
import { UndoBar } from './extras';
import { useFinances } from './useFinances';
import { formatMoney } from './ui';

const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'budget', label: 'Budget' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'purchases', label: 'Purchases' },
    { key: 'contributions', label: 'Gift Money' },
    { key: 'settings', label: 'Settings' },
] as const;

type TabKey = typeof TABS[number]['key'];

export default function AdminFinancesPage() {
    const api = useFinances();
    const { data, loading, error, saving } = api;
    const [tab, setTab] = useState<TabKey>('overview');

    if (loading) {
        return (
            <div className="w-full">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-gray-100 rounded-2xl w-56" />
                    <div className="h-24 bg-gray-100 rounded-2xl" />
                    <div className="h-64 bg-gray-100 rounded-2xl" />
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="w-full">
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5">
                    <h2 className="font-semibold text-rose-900 mb-1">Couldn&apos;t load your finances</h2>
                    <p className="text-sm text-rose-700">{error || 'Something went wrong.'}</p>
                    <button
                        onClick={api.refresh}
                        className="mt-3 rounded-full bg-white border border-rose-200 px-4 py-1.5
                            text-sm font-medium text-rose-700 hover:bg-rose-50"
                    >
                        Try again
                    </button>
                </div>
            </div>
        );
    }

    const { summary } = data;
    const leftToPay = Math.max(0, summary.stillToSpendCash);

    return (
        <div className="w-full" data-finance-suite>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h1 className="text-xl font-semibold text-gray-900 md:text-2xl">Finances</h1>
                <p className="text-xs text-gray-400 md:text-sm">
                    {formatMoney(summary.budgetTotal)} budgeted ·{' '}
                    {formatMoney(summary.paidTotal)} paid ·{' '}
                    <span className="text-gray-500">{formatMoney(leftToPay)} left for you two to cover</span>
                </p>
                {/* Fixed width, so the row does not reflow every time it appears. */}
                <span className="ml-auto w-16 text-right text-xs text-gray-400">
                    {saving ? 'Saving…' : ''}
                </span>
            </div>

            {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl px-4 py-2.5 my-3
                    flex items-center justify-between gap-3">
                    <span className="text-sm text-rose-700">{error}</span>
                    <button onClick={api.clearError}
                        className="text-rose-400 hover:text-rose-700 text-lg leading-none">&times;</button>
                </div>
            )}

            <div className="my-3 flex gap-1 overflow-x-auto rounded-full border border-gray-200
                bg-white p-1 print:hidden md:w-fit">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        aria-current={tab === t.key ? 'page' : undefined}
                        className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors
                            md:px-4 ${tab === t.key
                                ? 'bg-accent text-white shadow-sm'
                                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}
                    >
                        {t.label}
                        {t.key === 'schedule' && summary.overdueTotal > 0 && (
                            <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold
                                ${tab === t.key ? 'bg-white/25' : 'bg-rose-100 text-rose-700'}`}>
                                !
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {tab === 'overview' && <OverviewTab data={data} />}
            {tab === 'budget' && <BudgetTab data={data} api={api} />}
            {tab === 'schedule' && <ScheduleTab data={data} api={api} />}
            {tab === 'purchases' && <PurchasesTab data={data} api={api} />}
            {tab === 'contributions' && <ContributionsTab data={data} api={api} />}
            {tab === 'settings' && <SettingsTab data={data} api={api} />}

            <UndoBar api={api} />
        </div>
    );
}
