'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
    CATEGORIES, STATUSES, categoryMeta, formatDayDate, hasCoords, sourceLabel, sourcesOf,
    type Place,
} from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import PlaceEditor from './PlaceEditor';
import { Button, Card, CategoryChip, EmptyState, SelectField, StatusChip } from './ui';

// Leaflet must never be part of the server bundle — it reaches for `window` on
// import. This is the only place the map is loaded.
const TripMap = dynamic(() => import('./TripMap'), {
    ssr: false,
    loading: () => <div className="h-full w-full bg-gray-100 animate-pulse rounded-2xl" />,
});

export default function MapTab({ api }: { api: HoneymoonApi }) {
    const { data } = api;
    const [regionFilter, setRegionFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [dayFilter, setDayFilter] = useState('');
    const [reviewOnly, setReviewOnly] = useState(false);
    const [sourceFilter, setSourceFilter] = useState('');
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [editing, setEditing] = useState<Place | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);

    // Memoised so the identity is stable: a fresh `?? []` each render would
    // defeat the filter memo below and re-scan every place on every keystroke.
    const places = useMemo(() => data?.places ?? [], [data]);
    const days = data?.days ?? [];

    const selectedDay = dayFilter === '' ? null : days.find((d) => String(d.id) === dayFilter) ?? null;

    /** Pins currently visible — this set is what the map fits itself to. */
    const visible = useMemo(() => {
        if (selectedDay) {
            // A day view shows exactly that day's stops, in order, and nothing else.
            const ids = new Set(selectedDay.stops.map((s) => s.place_id).filter((id): id is number => id != null));
            if (selectedDay.base_place_id != null) ids.add(selectedDay.base_place_id);
            return places.filter((p) => ids.has(p.id));
        }
        return places.filter((p) => {
            if (regionFilter && String(p.region_id ?? '') !== regionFilter) return false;
            if (categoryFilter && p.category !== categoryFilter) return false;
            if (statusFilter && p.status !== statusFilter) return false;
            if (reviewOnly && !p.needs_review) return false;
            if (sourceFilter && sourceLabel(p.source) !== sourceFilter) return false;
            return true;
        });
    }, [places, selectedDay, regionFilter, categoryFilter, statusFilter, reviewOnly, sourceFilter]);

    /** The ordered polyline for a selected day. */
    const route = useMemo(() => {
        if (!selectedDay) return [];
        return selectedDay.stops
            .map((stop) => {
                const place = stop.place_id == null ? undefined : api.placeById.get(stop.place_id);
                if (!place || !hasCoords(place)) return null;
                return { lat: place.lat, lng: place.lng, label: stop.custom_label || place.name };
            })
            .filter((p): p is { lat: number; lng: number; label: string } => p != null);
    }, [selectedDay, api.placeById]);

    const pinnedCount = visible.filter(hasCoords).length;
    const unpinnedCount = visible.length - pinnedCount;
    const selected = selectedId == null ? null : api.placeById.get(selectedId) ?? null;

    const resetFilters = () => {
        setRegionFilter(''); setCategoryFilter(''); setStatusFilter('');
        setDayFilter(''); setReviewOnly(false); setSourceFilter('');
    };

    const filterKey = `${regionFilter}|${categoryFilter}|${statusFilter}|${dayFilter}|${reviewOnly}|${sourceFilter}`;

    return (
        <div className="space-y-3">
            {/* ---- Filters ---- */}
            <Card className="p-3">
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                    <SelectField
                        value={sourceFilter}
                        onChange={(e) => setSourceFilter(e.target.value)}
                        disabled={!!selectedDay}
                    >
                        <option value="">All sources</option>
                        {sourcesOf(places).map((src) => <option key={src} value={src}>{src}</option>)}
                    </SelectField>
                    <SelectField value={dayFilter} onChange={(e) => setDayFilter(e.target.value)}>
                        <option value="">All places</option>
                        {days.map((d) => (
                            <option key={d.id} value={d.id}>
                                Day {d.day_number}{d.title ? ` — ${d.title}` : ''}
                            </option>
                        ))}
                    </SelectField>
                    <SelectField
                        value={regionFilter}
                        onChange={(e) => setRegionFilter(e.target.value)}
                        disabled={!!selectedDay}
                    >
                        <option value="">All regions</option>
                        {(data?.regions ?? []).map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                    </SelectField>
                    <SelectField
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        disabled={!!selectedDay}
                    >
                        <option value="">All types</option>
                        {CATEGORIES.map((c) => (
                            <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
                        ))}
                    </SelectField>
                    <SelectField
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        disabled={!!selectedDay}
                    >
                        <option value="">Any status</option>
                        {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </SelectField>
                    <button
                        onClick={() => setReviewOnly((v) => !v)}
                        disabled={!!selectedDay}
                        className={`rounded-2xl px-3 py-2 text-sm font-medium border transition
                            disabled:opacity-40 ${reviewOnly
                            ? 'bg-amber-50 border-amber-200 text-amber-800'
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                    >
                        ⚠ Needs review
                    </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 mt-2 px-1">
                    <p className="text-xs text-gray-400">
                        {pinnedCount} pinned
                        {unpinnedCount > 0 && (
                            <span className="text-amber-600"> · {unpinnedCount} without coordinates</span>
                        )}
                        {selectedDay && (
                            <span> · Day {selectedDay.day_number}
                                {formatDayDate(data?.trip.start_date ?? null, selectedDay.day_number)
                                    ? ` (${formatDayDate(data?.trip.start_date ?? null, selectedDay.day_number)})`
                                    : ''}
                            </span>
                        )}
                    </p>
                    <button onClick={resetFilters} className="text-xs text-gray-400 hover:text-gray-700">
                        Reset
                    </button>
                </div>
            </Card>

            {/* ---- Map ---- */}
            {pinnedCount === 0 ? (
                <Card>
                    <EmptyState
                        title="Nothing to show on the map yet"
                        hint={places.length
                            ? 'These places have no coordinates yet. Open one and use Find to pin it.'
                            : 'Add places in the Places tab, or run the seed script to load the Bali guide.'}
                    />
                </Card>
            ) : (
                <TripMap
                    places={visible}
                    route={route}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    fitKey={filterKey}
                    className="h-[55vh] md:h-[65vh] border border-gray-100 shadow-sm"
                />
            )}

            {/* ---- Legend ---- */}
            <Card className="p-3">
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {CATEGORIES.filter((c) => visible.some((p) => p.category === c.key && hasCoords(p)))
                        .map((c) => (
                            <span key={c.key} className="inline-flex items-center gap-1.5 text-[11px] text-gray-600">
                                <span
                                    className="inline-block w-2.5 h-2.5 rounded-full border border-white shadow"
                                    style={{ backgroundColor: c.color }}
                                />
                                {c.label}
                            </span>
                        ))}
                    {visible.some((p) => p.needs_review && hasCoords(p)) && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-700">
                            <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-dashed border-amber-500" />
                            Unconfirmed pin
                        </span>
                    )}
                </div>
            </Card>

            {/* ---- Selected place ---- */}
            {selected && (
                <Card className="p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h3 className="font-semibold text-gray-900">{selected.name}</h3>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                <CategoryChip category={selected.category} />
                                <StatusChip status={selected.status} />
                                {selected.region_id != null && (
                                    <span className="text-[11px] text-gray-400">
                                        {api.regionById.get(selected.region_id)}
                                    </span>
                                )}
                            </div>
                            {selected.description && (
                                <p className="text-sm text-gray-600 mt-2">{selected.description}</p>
                            )}
                            {selected.links.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {selected.links.map((link, i) => (
                                        <a
                                            key={i}
                                            href={link.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-accent hover:underline"
                                        >
                                            {link.label || 'Link'} ↗
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <Button onClick={() => { setEditing(selected); setEditorOpen(true); }}>Edit</Button>
                            <button
                                onClick={() => setSelectedId(null)}
                                className="text-gray-400 hover:text-gray-700 text-xl leading-none"
                                aria-label="Close"
                            >
                                &times;
                            </button>
                        </div>
                    </div>
                    {hasCoords(selected) && (
                        <a
                            href={`https://www.google.com/maps/search/?api=1&query=${selected.lat},${selected.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block text-xs text-gray-400 hover:text-gray-700 mt-3"
                        >
                            Open in Google Maps ↗
                        </a>
                    )}
                </Card>
            )}

            <p className="text-[11px] text-gray-400 px-1">
                Map data © OpenStreetMap contributors. Distances shown elsewhere are straight-line,
                not driving time — {categoryMeta('waterfall').label.toLowerCase()} trips in particular
                take far longer than the crow flies.
            </p>

            <PlaceEditor
                api={api}
                place={editing}
                open={editorOpen}
                onClose={() => { setEditorOpen(false); setEditing(null); }}
            />
        </div>
    );
}
