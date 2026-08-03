'use client';

import { useState } from 'react';
import BudgetTab from './BudgetTab';
import ContributionsTab from './ContributionsTab';
import OverviewTab from './OverviewTab';
import PurchasesTab from './PurchasesTab';
import SettingsTab from './SettingsTab';
import { useFinances } from './useFinances';
import { formatMoney } from './ui';

const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'budget', label: 'Budget' },
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
            <div className="max-w-5xl mx-auto">
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
            <div className="max-w-5xl mx-auto">
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
        <div className="max-w-5xl mx-auto">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">Finances</h1>
                    <p className="text-sm text-gray-400 mt-0.5">
                        {formatMoney(summary.budgetTotal)} budgeted ·{' '}
                        {formatMoney(summary.paidTotal)} paid ·{' '}
                        {formatMoney(leftToPay)} left for you two to cover
                    </p>
                </div>
                <div className="h-5 flex items-center">
                    {saving && <span className="text-xs text-gray-400">Saving…</span>}
                </div>
            </div>

            {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl px-4 py-2.5 my-3
                    flex items-center justify-between gap-3">
                    <span className="text-sm text-rose-700">{error}</span>
                    <button onClick={api.clearError}
                        className="text-rose-400 hover:text-rose-700 text-lg leading-none">&times;</button>
                </div>
            )}

            <div className="flex gap-1.5 overflow-x-auto py-4 -mx-1 px-1">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors border
                            ${tab === t.key
                                ? 'bg-accent text-white border-transparent'
                                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 'overview' && <OverviewTab data={data} />}
            {tab === 'budget' && <BudgetTab data={data} api={api} />}
            {tab === 'purchases' && <PurchasesTab data={data} api={api} />}
            {tab === 'contributions' && <ContributionsTab data={data} api={api} />}
            {tab === 'settings' && <SettingsTab data={data} api={api} />}
        </div>
    );
}
