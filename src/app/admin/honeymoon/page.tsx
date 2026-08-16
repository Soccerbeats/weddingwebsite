'use client';

import { useState } from 'react';
import { hasCoords } from '@/lib/honeymoon';
import GuideTab from './GuideTab';
import ItineraryTab from './ItineraryTab';
import MapTab from './MapTab';
import PlacesTab from './PlacesTab';
import SettingsTab from './SettingsTab';
import { useHoneymoon } from './useHoneymoon';

const TABS = [
    { key: 'map', label: 'Map' },
    { key: 'itinerary', label: 'Itinerary' },
    { key: 'places', label: 'Places' },
    { key: 'guide', label: 'Guide' },
    { key: 'settings', label: 'Settings' },
] as const;

type TabKey = typeof TABS[number]['key'];

export default function AdminHoneymoonPage() {
    const api = useHoneymoon();
    const { data, loading, error, saving } = api;
    const [tab, setTab] = useState<TabKey>('map');

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
                    <h2 className="font-semibold text-rose-900 mb-1">Couldn&apos;t load the honeymoon portal</h2>
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

    const pinned = data.places.filter(hasCoords).length;
    const review = data.places.filter((p) => p.needs_review).length;

    return (
        <div className="max-w-5xl mx-auto">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">{data.trip.title}</h1>
                    <p className="text-xs md:text-sm text-gray-400 mt-0.5">
                        {data.days.length} day{data.days.length === 1 ? '' : 's'} ·{' '}
                        {data.places.length} place{data.places.length === 1 ? '' : 's'} ·{' '}
                        {pinned} pinned
                        {review > 0 && <span className="text-amber-600"> · {review} to review</span>}
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
                    <button
                        onClick={api.clearError}
                        className="text-rose-400 hover:text-rose-700 text-lg leading-none"
                    >
                        &times;
                    </button>
                </div>
            )}

            <div className="flex gap-1.5 overflow-x-auto py-3 md:py-4 -mx-1 px-1">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition
                            ${tab === t.key
                            ? 'bg-accent text-white'
                            : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 'map' && <MapTab api={api} />}
            {tab === 'itinerary' && <ItineraryTab api={api} />}
            {tab === 'places' && <PlacesTab api={api} />}
            {tab === 'guide' && <GuideTab api={api} />}
            {tab === 'settings' && <SettingsTab api={api} />}
        </div>
    );
}
