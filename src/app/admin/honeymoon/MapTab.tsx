'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
    STATUSES, categoriesOf, categoryMeta, formatDayDate, hasCoords, sourceLabel, sourcesOf,
    type Day, type Place, type PlaceStatus,
} from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import PlaceEditor from './PlaceEditor';
import { Button, CategoryChip, EmptyState, MiniSelect, SelectField, StatusChip } from './ui';

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
    /**
     * Unconfirmed pins are hidden by default — a bulk-geocoded guess reads
     * exactly like a real location, and a map you cannot trust is worse than a
     * smaller one. Turning this on *adds* them to the confirmed pins rather than
     * swapping to them, so you always keep your bearings while reviewing.
     */
    const [showUnconfirmed, setShowUnconfirmed] = useState(false);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [editing, setEditing] = useState<Place | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);

    // Lasso
    const [selectMode, setSelectMode] = useState(false);
    const [lassoed, setLassoed] = useState<Set<number>>(new Set());
    const [showItinerary, setShowItinerary] = useState(false);
    // Bumped only on purpose — never by a filter. See TripMap's fit effect.
    const [fitSignal, setFitSignal] = useState(0);

    const places = useMemo(() => data?.places ?? [], [data]);
    const days = useMemo(() => data?.days ?? [], [data]);
    const regions = useMemo(() => data?.regions ?? [], [data]);

    /** The saved country filter — a trip setting, not a session preference. */
    const country = data?.trip.focus_country ?? '';

    const countries = useMemo(() => {
        const seen = new Set<string>();
        for (const r of regions) if (r.country) seen.add(r.country);
        return [...seen].sort((a, b) => a.localeCompare(b));
    }, [regions]);

    /** Region id -> country, so a place can be judged by where its region is. */
    const countryOfRegion = useMemo(() => {
        const map = new Map<number, string>();
        for (const r of regions) map.set(r.id, r.country ?? '');
        return map;
    }, [regions]);

    const selectedDay = dayFilter === '' ? null : days.find((d) => String(d.id) === dayFilter) ?? null;

    /**
     * Everything the filters allow *except* the category filter.
     *
     * The type dropdown is built from this, so it only ever offers types that
     * are actually on the map — and picking one doesn't collapse the list to
     * that single option.
     */
    const visibleIgnoringCategory = useMemo(() => {
        if (selectedDay) {
            // A day view shows exactly that day's stops, in order, and nothing else.
            const ids = new Set(selectedDay.stops.map((s) => s.place_id).filter((id): id is number => id != null));
            if (selectedDay.base_place_id != null) ids.add(selectedDay.base_place_id);
            return places.filter((p) => ids.has(p.id));
        }
        return places.filter((p) => {
            // Additive: off hides the unconfirmed, on shows everything.
            if (!showUnconfirmed && p.needs_review) return false;
            // Exclude only places known to be somewhere *else*. A place whose
            // country is simply unknown — no region, or a region created without
            // one — stays visible: a filter that silently drops unclassified data
            // loses things you can't see to go and fix.
            if (country) {
                const its = countryOfRegion.get(p.region_id ?? -1) ?? '';
                if (its && its !== country) return false;
            }
            if (regionFilter && String(p.region_id ?? '') !== regionFilter) return false;
            if (statusFilter && p.status !== statusFilter) return false;
            if (sourceFilter && sourceLabel(p.source) !== sourceFilter) return false;
            return true;
        });
    }, [places, selectedDay, regionFilter, statusFilter, sourceFilter, showUnconfirmed,
        country, countryOfRegion]);

    /** Pins currently drawn. */
    const visible = useMemo(
        () => (categoryFilter
            ? visibleIgnoringCategory.filter((p) => p.category === categoryFilter)
            : visibleIgnoringCategory),
        [visibleIgnoringCategory, categoryFilter],
    );

    /**
     * Changing country re-frames the map.
     *
     * This is the one filter that is a change of *destination* rather than a
     * change of what is drawn — switching to Singapore and staying zoomed on
     * Bali would show an empty sea. Layer toggles still leave the view alone;
     * clearing back to all countries frames everything again.
     *
     * Skipped on the first run so arriving at the page fits once, not twice.
     */
    const lastCountryRef = useRef<string | null>(null);
    useEffect(() => {
        if (lastCountryRef.current === null) { lastCountryRef.current = country; return; }
        if (lastCountryRef.current === country) return;
        lastCountryRef.current = country;
        setFitSignal((n) => n + 1);
    }, [country]);

    /** Types actually on the map, plus whatever is selected so it can't vanish. */
    const typeOptions = useMemo(() => {
        const present = categoriesOf(visibleIgnoringCategory).filter(
            (c) => visibleIgnoringCategory.some((p) => p.category === c.key),
        );
        if (categoryFilter && !present.some((c) => c.key === categoryFilter)) {
            present.push(categoryMeta(categoryFilter));
        }
        return present;
    }, [visibleIgnoringCategory, categoryFilter]);

    /** Distinct, readable line colours for overlaid days. */
    const DAY_COLORS = [
        '#0f172a', '#be123c', '#0891b2', '#a16207', '#7c3aed',
        '#059669', '#ea580c', '#db2777', '#4d7c0f', '#0284c7',
    ];

    const pointsForDay = useCallback((day: Day) => day.stops
        .map((stop) => {
            const place = stop.place_id == null ? undefined : api.placeById.get(stop.place_id);
            if (!place || !hasCoords(place)) return null;
            return { lat: place.lat, lng: place.lng, label: stop.custom_label || place.name };
        })
        .filter((p): p is { lat: number; lng: number; label: string } => p != null),
    [api.placeById]);

    /**
     * Routes to draw: the selected day on its own, or every day at once when the
     * itinerary overlay is on. Each day keeps its own colour so overlapping
     * routes stay readable.
     */
    const routes = useMemo(() => {
        const forDay = (day: Day) => ({
            points: pointsForDay(day),
            color: DAY_COLORS[(day.day_number - 1) % DAY_COLORS.length],
            label: `Day ${day.day_number}${day.title ? ` — ${day.title}` : ''}`,
        });
        if (selectedDay) return [forDay(selectedDay)].filter((r) => r.points.length > 0);
        if (!showItinerary) return [];
        return days.map(forDay).filter((r) => r.points.length > 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDay, showItinerary, days, pointsForDay]);

    const pinnedCount = visible.filter(hasCoords).length;
    const unpinnedCount = visible.length - pinnedCount;
    /** Pins on screen whose country nobody has set — the ones worth classifying. */
    const unclassified = useMemo(
        () => (country
            ? visible.filter((p) => hasCoords(p)
                && !(countryOfRegion.get(p.region_id ?? -1) ?? '')).length
            : 0),
        [visible, country, countryOfRegion],
    );

    /** How many of the visible pins are unconfirmed, once they're shown. */
    const unconfirmedShown = useMemo(
        () => visible.filter((p) => p.needs_review && hasCoords(p)).length,
        [visible],
    );

    /** Confirmed-but-hidden count, so the map never quietly omits things. */
    const hiddenUnconfirmed = useMemo(
        () => (selectedDay || showUnconfirmed
            ? 0
            : places.filter((p) => p.needs_review && hasCoords(p)).length),
        [places, selectedDay, showUnconfirmed],
    );
    const selected = selectedId == null ? null : api.placeById.get(selectedId) ?? null;

    const resetFilters = () => {
        setRegionFilter(''); setCategoryFilter(''); setStatusFilter('');
        setDayFilter(''); setShowUnconfirmed(false); setSourceFilter('');
    };

    /** Bulk action over the lassoed set — same verbs as the Places tab. */
    const bulk = async (fields: Record<string, unknown>) => {
        if (!lassoed.size) return;
        await api.update('places', { ids: [...lassoed], ...fields });
        setLassoed(new Set());
    };

    /**
     * Put every lassoed place onto a day as stops.
     *
     * Drawing a loop around an area and sending it to a day is the whole point
     * of selecting on a map — otherwise you would be re-finding each place by
     * name in the itinerary's dropdown.
     */
    const addToDay = async (dayId: number) => {
        const day = days.find((d) => d.id === dayId);
        if (!day) return;
        // Skip anything already on that day rather than stacking duplicates.
        const already = new Set(day.stops.map((s) => s.place_id).filter((v): v is number => v != null));
        const toAdd = [...lassoed].filter((id) => !already.has(id));
        for (const placeId of toAdd) {
            await api.create('stops', { day_id: dayId, place_id: placeId });
        }
        setLassoed(new Set());
        setSelectMode(false);
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
                <div className="flex flex-wrap 2xl:flex-nowrap items-center gap-1.5">
                    <SelectField
                        className="flex-1 min-w-[7rem] !py-1.5 !px-2.5 !text-sm"
                        value={country}
                        title="Saved with the trip — it stays set across refreshes and logins"
                        onChange={(e) => api.update('trip', { focus_country: e.target.value })}
                    >
                        <option value="">All countries</option>
                        {countries.map((c) => <option key={c} value={c}>{c}</option>)}
                    </SelectField>
                    <SelectField
                        className="flex-1 min-w-[7rem] !py-1.5 !px-2.5 !text-sm"
                        value={dayFilter}
                        onChange={(e) => setDayFilter(e.target.value)}
                    >
                        <option value="">All places</option>
                        {days.map((d) => (
                            <option key={d.id} value={d.id}>
                                Day {d.day_number}{d.title ? ` — ${d.title}` : ''}
                            </option>
                        ))}
                    </SelectField>
                    <SelectField
                        className="flex-1 min-w-[7rem] !py-1.5 !px-2.5 !text-sm"
                        value={sourceFilter}
                        onChange={(e) => setSourceFilter(e.target.value)}
                        disabled={!!selectedDay}
                    >
                        <option value="">All sources</option>
                        {sourcesOf(places).map((src) => <option key={src} value={src}>{src}</option>)}
                    </SelectField>
                    <SelectField
                        className="flex-1 min-w-[7rem] !py-1.5 !px-2.5 !text-sm"
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
                        className="flex-1 min-w-[7rem] !py-1.5 !px-2.5 !text-sm"
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        disabled={!!selectedDay}
                    >
                        <option value="">All types ({typeOptions.length})</option>
                        {typeOptions.map((c) => (
                            <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
                        ))}
                    </SelectField>
                    <SelectField
                        className="flex-1 min-w-[7rem] !py-1.5 !px-2.5 !text-sm"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        disabled={!!selectedDay}
                    >
                        <option value="">Any status</option>
                        {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </SelectField>
                    <button
                        onClick={() => setShowUnconfirmed((v) => !v)}
                        disabled={!!selectedDay}
                        title="Unconfirmed pins are hidden from the map. Turn this on to work through them."
                        className={`shrink-0 rounded-2xl px-2.5 py-1.5 text-sm font-medium border transition
                            disabled:opacity-40 ${showUnconfirmed
                            ? 'bg-amber-500 border-amber-500 text-white'
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                    >
                        {showUnconfirmed ? '⚠ Hide' : '⚠ Unconfirmed'}
                    </button>
                    <button
                        onClick={() => setShowItinerary((v) => !v)}
                        disabled={!!selectedDay || days.length === 0}
                        title="Overlay each day's stops, in order"
                        className={`shrink-0 rounded-2xl px-2.5 py-1.5 text-sm font-medium border transition
                            disabled:opacity-40 ${showItinerary
                            ? 'bg-slate-900 border-slate-900 text-white'
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                    >
                        {showItinerary ? '🗓 On' : '🗓 Itinerary'}
                    </button>
                    <button
                        onClick={() => setFitSignal((n) => n + 1)}
                        title="Frame everything currently shown"
                        className="shrink-0 rounded-2xl px-2.5 py-1.5 text-sm font-medium border
                            border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 transition"
                    >
                        ⤢ Fit
                    </button>
                    <button
                        onClick={() => { setEditing(null); setEditorOpen(true); }}
                        className="shrink-0 rounded-2xl px-2.5 py-1.5 text-sm font-medium border
                            border-transparent bg-accent text-white hover:opacity-90 transition"
                    >
                        + Add
                    </button>
                    <button
                        onClick={() => {
                            if (selectMode) setLassoed(new Set());
                            setSelectMode((v) => !v);
                        }}
                        className={`shrink-0 rounded-2xl px-2.5 py-1.5 text-sm font-medium border transition
                            ${selectMode
                            ? 'bg-slate-900 border-slate-900 text-white'
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                    >
                        {selectMode ? '◯ Drawing' : '◯ Lasso'}
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
                        {unclassified > 0 && (
                            <span className="text-sky-700">
                                {' '}· {unclassified} with no country set
                            </span>
                        )}
                        {hiddenUnconfirmed > 0 && (
                            <span className="text-amber-600">
                                {' '}· {hiddenUnconfirmed} unconfirmed hidden
                            </span>
                        )}
                        {showUnconfirmed && unconfirmedShown > 0 && (
                            <span className="text-amber-700">
                                {' '}· including {unconfirmedShown} unconfirmed — lasso them and Mark reviewed
                            </span>
                        )}
                        {showItinerary && routes.length > 0 && (
                            <span className="text-slate-700">
                                {' '}· {routes.length} day{routes.length === 1 ? '' : 's'} overlaid
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
                            title={hiddenUnconfirmed > 0
                                ? 'No confirmed pins to show'
                                : 'Nothing to show on the map yet'}
                            hint={hiddenUnconfirmed > 0
                                ? `${hiddenUnconfirmed} pin(s) are hidden because they haven't been `
                                    + 'confirmed yet. Hit ⚠ Show unconfirmed, lasso the ones that look '
                                    + 'right, and Mark reviewed.'
                                : places.length
                                    ? 'These places have no coordinates yet. Open one and use Find to pin it.'
                                    : 'Add places in the Places tab, or run the seed script to load the Bali guide.'}
                        />
                    </div>
                ) : (
                    <TripMap
                        places={visible}
                        routes={routes}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        fitSignal={fitSignal}
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
                {/* w-max: the bar is exactly as wide as its contents. It used to be a
                    fixed-width flex row that scrolled sideways, which is a worse
                    answer than simply being the right size. On a narrow screen it
                    wraps rather than scrolling. */}
                {lassoed.size > 0 && (
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500]
                        w-max max-w-[calc(100%-1.5rem)]
                        bg-white/95 backdrop-blur rounded-2xl shadow-lg border border-gray-200
                        px-3 py-2 flex flex-wrap items-center justify-center gap-2">
                        <span className="text-sm font-medium text-gray-700 pl-1">
                            {lassoed.size} selected
                        </span>
                        <MiniSelect
                            value=""
                            onChange={(e) => {
                                if (e.target.value) bulk({ status: e.target.value as PlaceStatus });
                            }}
                        >
                            {/* A native select is sized by its widest option, so these
                                are abbreviated — the full words live in the Places tab. */}
                            <option value="">Status</option>
                            <option value="idea">Idea</option>
                            <option value="shortlisted">Short</option>
                            <option value="booked">Booked</option>
                        </MiniSelect>
                        {days.length > 0 && (
                            <MiniSelect
                                value=""
                                onChange={(e) => {
                                    if (e.target.value) addToDay(Number(e.target.value));
                                }}
                            >
                                <option value="">Add to day…</option>
                                {days.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        Day {d.day_number}{d.title ? ` — ${d.title}` : ''}
                                    </option>
                                ))}
                            </MiniSelect>
                        )}
                        <Button className="!px-3" onClick={() => bulk({ needs_review: false })}>
                            Mark reviewed
                        </Button>
                        <Button className="!px-3" tone="danger" onClick={bulkDelete}>Delete</Button>
                        <Button className="!px-3" tone="ghost" onClick={() => setLassoed(new Set())}>
                            Clear
                        </Button>
                    </div>
                )}

                {/* ---- What happens each day, while the overlay is on ---- */}
                {showItinerary && routes.length > 0 && (
                    <div className="absolute top-3 left-3 z-[500] w-[min(20rem,45%)]
                        max-h-[70%] overflow-auto bg-white/95 backdrop-blur rounded-2xl
                        shadow-lg border border-gray-200 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-2">
                            Itinerary
                        </p>
                        <ul className="space-y-2.5">
                            {routes.map((r) => (
                                <li key={r.label}>
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="inline-block w-4 h-1 rounded-full shrink-0"
                                            style={{ backgroundColor: r.color }}
                                        />
                                        <span className="text-xs font-semibold text-gray-800 truncate">
                                            {r.label}
                                        </span>
                                    </div>
                                    {/* The numbers match the badges on the map, so a line
                                        on screen can be read back to a real plan. */}
                                    <ol className="mt-1 ml-6 space-y-0.5">
                                        {r.points.map((pt, i) => (
                                            <li key={`${r.label}-${i}`}
                                                className="text-[11px] text-gray-600 truncate">
                                                <span className="text-gray-400 tabular-nums">{i + 1}.</span>{' '}
                                                {pt.label}
                                            </li>
                                        ))}
                                    </ol>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* ---- Legend, floating bottom-left ---- */}
                {pinnedCount > 0 && (
                    <div className="absolute bottom-3 left-3 z-[500] bg-white/90 backdrop-blur
                        rounded-2xl shadow border border-gray-200 px-3 py-2 max-w-[45%]
                        hidden md:block pointer-events-none">
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                            {categoriesOf(visible).filter((c) => visible.some((p) => p.category === c.key && hasCoords(p)))
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
