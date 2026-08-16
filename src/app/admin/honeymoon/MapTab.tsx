'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
    CATEGORIES, STATUSES, formatDayDate, hasCoords, sourceLabel, sourcesOf,
    type Place, type PlaceStatus,
} from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import PlaceEditor from './PlaceEditor';
import { Button, CategoryChip, EmptyState, SelectField, StatusChip } from './ui';

// Leaflet must never be part of the server bundle — it reaches for `window` on
// import. This is the only place the map is loaded.
const TripMap = dynamic(() => import('./TripMap'), {
    ssr: false,
    loading: () => <div className="h-full w-full bg-gray-100 animate-pulse rounded-2xl" />,
});

/**
 * Full-height map view.
 *
 * The map fills every pixel the shell gives it and nothing on this tab scrolls;
 * the filter row is fixed above it and everything else — legend, selected place,
 * lasso actions — floats over the map rather than stealing height from it.
 */
export default function MapTab({ api }: { api: HoneymoonApi }) {
    const { data } = api;
    const [regionFilter, setRegionFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [dayFilter, setDayFilter] = useState('');
    const [sourceFilter, setSourceFilter] = useState('');
    const [reviewOnly, setReviewOnly] = useState(false);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [editing, setEditing] = useState<Place | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);

    // Lasso
    const [selectMode, setSelectMode] = useState(false);
    const [lassoed, setLassoed] = useState<Set<number>>(new Set());

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
            if (sourceFilter && sourceLabel(p.source) !== sourceFilter) return false;
            if (reviewOnly && !p.needs_review) return false;
            return true;
        });
    }, [places, selectedDay, regionFilter, categoryFilter, statusFilter, sourceFilter, reviewOnly]);

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

    const filterKey = `${regionFilter}|${categoryFilter}|${statusFilter}|${dayFilter}`
        + `|${reviewOnly}|${sourceFilter}`;

    /** Bulk action over the lassoed set — same verbs as the Places tab. */
    const bulk = async (fields: Record<string, unknown>) => {
        if (!lassoed.size) return;
        await api.update('places', { ids: [...lassoed], ...fields });
        setLassoed(new Set());
    };

    const bulkDelete = async () => {
        const ids = [...lassoed];
        if (!ids.length) return;
        const scheduled = ids.filter((id) => api.scheduledPlaceIds.has(id)).length;
        const warning = scheduled
            ? `Delete ${ids.length} place(s)? ${scheduled} of them are on your itinerary — `
                + 'those stops stay put and become plain text.'
            : `Delete ${ids.length} place(s)?`;
        if (!confirm(warning)) return;
        await api.removeMany('places', ids);
        setLassoed(new Set());
    };

    return (
        <div className="h-full flex flex-col gap-2">
            {/* ---- Filters ---- */}
            <div className="shrink-0 bg-white rounded-2xl shadow-sm border border-gray-100 p-2.5">
                <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                    <SelectField value={dayFilter} onChange={(e) => setDayFilter(e.target.value)}>
                        <option value="">All places</option>
                        {days.map((d) => (
                            <option key={d.id} value={d.id}>
                                Day {d.day_number}{d.title ? ` — ${d.title}` : ''}
                            </option>
                        ))}
                    </SelectField>
                    <SelectField
                        value={sourceFilter}
                        onChange={(e) => setSourceFilter(e.target.value)}
                        disabled={!!selectedDay}
                    >
                        <option value="">All sources</option>
                        {sourcesOf(places).map((src) => <option key={src} value={src}>{src}</option>)}
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
                    <button
                        onClick={() => {
                            if (selectMode) setLassoed(new Set());
                            setSelectMode((v) => !v);
                        }}
                        className={`rounded-2xl px-3 py-2 text-sm font-medium border transition
                            ${selectMode
                            ? 'bg-slate-900 border-slate-900 text-white'
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                    >
                        {selectMode ? '◯ Drawing' : '◯ Lasso select'}
                    </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 mt-1.5 px-1">
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
                        {selectMode && (
                            <span className="text-slate-700">
                                {' '}· draw a loop around the pins you want (hold Shift to add)
                            </span>
                        )}
                    </p>
                    <button onClick={resetFilters} className="text-xs text-gray-400 hover:text-gray-700">
                        Reset
                    </button>
                </div>
            </div>

            {/* ---- Map ---- */}
            <div className="relative flex-1 min-h-0">
                {pinnedCount === 0 ? (
                    <div className="h-full bg-white rounded-2xl shadow-sm border border-gray-100
                        flex items-center justify-center">
                        <EmptyState
                            title="Nothing to show on the map yet"
                            hint={places.length
                                ? 'These places have no coordinates yet. Open one and use Find to pin it.'
                                : 'Add places in the Places tab, or run the seed script to load the Bali guide.'}
                        />
                    </div>
                ) : (
                    <TripMap
                        places={visible}
                        route={route}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        fitKey={filterKey}
                        selectMode={selectMode}
                        selectedIds={lassoed}
                        onLassoSelect={(ids, additive) => setLassoed((prev) => {
                            const next = additive ? new Set(prev) : new Set<number>();
                            for (const id of ids) next.add(id);
                            return next;
                        })}
                        className="h-full w-full border border-gray-100 shadow-sm"
                    />
                )}

                {/* ---- Lasso selection actions, floating over the map ---- */}
                {lassoed.size > 0 && (
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500]
                        bg-white/95 backdrop-blur rounded-2xl shadow-lg border border-gray-200
                        px-3 py-2 flex items-center gap-2 whitespace-nowrap max-w-[95%] overflow-x-auto">
                        <span className="text-sm font-medium text-gray-700 pl-1 shrink-0">
                            {lassoed.size} selected
                        </span>
                        <SelectField
                            className="w-[9rem] shrink-0 !py-1"
                            value=""
                            onChange={(e) => {
                                if (e.target.value) bulk({ status: e.target.value as PlaceStatus });
                            }}
                        >
                            <option value="">Set status…</option>
                            {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </SelectField>
                        <Button className="shrink-0" onClick={() => bulk({ needs_review: false })}>
                            Mark reviewed
                        </Button>
                        <Button className="shrink-0" tone="danger" onClick={bulkDelete}>Delete</Button>
                        <Button className="shrink-0" tone="ghost" onClick={() => setLassoed(new Set())}>
                            Clear
                        </Button>
                    </div>
                )}

                {/* ---- Legend, floating bottom-left ---- */}
                {pinnedCount > 0 && (
                    <div className="absolute bottom-3 left-3 z-[500] bg-white/90 backdrop-blur
                        rounded-2xl shadow border border-gray-200 px-3 py-2 max-w-[45%]
                        hidden md:block pointer-events-none">
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                            {CATEGORIES.filter((c) => visible.some((p) => p.category === c.key && hasCoords(p)))
                                .map((c) => (
                                    <span key={c.key} className="inline-flex items-center gap-1 text-[11px] text-gray-600">
                                        <span
                                            className="inline-block w-2.5 h-2.5 rounded-full border border-white shadow"
                                            style={{ backgroundColor: c.color }}
                                        />
                                        {c.label}
                                    </span>
                                ))}
                            {visible.some((p) => p.needs_review && hasCoords(p)) && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-amber-700">
                                    <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-dashed border-amber-500" />
                                    Unconfirmed
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* ---- Selected place, floating bottom-right ---- */}
                {selected && (
                    <div className="absolute bottom-3 right-3 z-[500] w-[min(22rem,90%)]
                        bg-white rounded-2xl shadow-lg border border-gray-200 p-4">
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
                                    <p className="text-sm text-gray-600 mt-2 line-clamp-3">
                                        {selected.description}
                                    </p>
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
                                <Button onClick={() => { setEditing(selected); setEditorOpen(true); }}>
                                    Edit
                                </Button>
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
                    </div>
                )}
            </div>

            <PlaceEditor
                api={api}
                place={editing}
                open={editorOpen}
                onClose={() => { setEditorOpen(false); setEditing(null); }}
            />
        </div>
    );
}
