'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
    STATUSES, categoriesOf, countriesInUse, distanceKm, formatDistance, hasCoords, sourceLabel,
    sourcesOf,
    type Place, type PlaceStatus,
} from '@/lib/honeymoon';
import {
    assignRegions, placesToCsv, placesToGeoJson, placesToKml,
} from '@/lib/honeymoonPlaces';
import type { HoneymoonApi } from './useHoneymoon';
import PlaceEditor from './PlaceEditor';
import PlaceDrawer from './PlaceDrawer';
import ImportPlaces from './ImportPlaces';
import SavedViews from './SavedViews';
import { useLocalPref } from './useLocalPref';
import { PLACE_DRAG } from './dragTypes';
import {
    BulkFieldMenu, Button, Card, CategoryChip, EmptyState, MiniSelect, OverflowMenu, SelectField,
    StatusChip, TextField, TriToggle, type TriState,
} from './ui';

/** The orders the list can be read in. */
type SortKey = 'name' | 'recent' | 'region' | 'status' | 'rating' | 'distance';

const SORTS: { key: SortKey; label: string }[] = [
    { key: 'name', label: 'Name' },
    { key: 'recent', label: 'Recently added' },
    { key: 'region', label: 'Region' },
    { key: 'status', label: 'Status' },
    { key: 'rating', label: 'Rating' },
    { key: 'distance', label: 'Distance from base' },
];

/**
 * Hand the browser a file.
 *
 * A blob URL rather than a data: URI, because a two-hundred-place KML is bigger
 * than some browsers will accept in a URL; revoked immediately after, since the
 * click has already started the download.
 */
function download(content: string, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

/** Liked first, then unrated, then mid, then rejected. */
function rank(place: Place): number {
    if (place.rating === 'yes') return 3;
    if (place.rating == null) return 2;
    if (place.rating === 'mid') return 1;
    return 0;
}

/**
 * The place library — every candidate from the guide plus anything added by hand.
 *
 * This is the tab that has to stay usable at 200+ rows, so it leads with search
 * and filters rather than the list.
 */
/**
 * @param panel Rendered as a narrow column beside the map rather than as the
 *   whole page: the five count cards go (the shell header already carries those
 *   numbers) and the filters stack two-up, so the list keeps the height.
 */
export default function PlacesTab({ api, panel = false }: {
    api: HoneymoonApi;
    panel?: boolean;
}) {
    const { data } = api;
    const [search, setSearch] = useState('');
    /*
     * Filters, sort and density are remembered per browser.
     *
     * They reset on every visit before this, which the map (which remembers its
     * split) made look like an oversight rather than a decision. Search is
     * deliberately *not* remembered: a stale search term hiding two hundred rows
     * on arrival reads as data loss.
     */
    const [regionFilter, setRegionFilter] = useLocalPref('hm-places-region', '');
    const [categoryFilter, setCategoryFilter] = useLocalPref('hm-places-category', '');
    const [statusFilter, setStatusFilter] = useLocalPref('hm-places-status', '');
    const [reviewState, setReviewState] = useLocalPref<TriState>('hm-places-review', 'off');
    const [pinState, setPinState] = useLocalPref<TriState>('hm-places-pin', 'off');
    const [sourceFilter, setSourceFilter] = useLocalPref('hm-places-source', '');
    const [sort, setSort] = useLocalPref<SortKey>('hm-places-sort', 'name');
    const [dense, setDense] = useLocalPref('hm-places-dense', false);
    const [editing, setEditing] = useState<Place | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [viewing, setViewing] = useState<Place | null>(null);
    const [importing, setImporting] = useState(false);
    const [filing, setFiling] = useState('');
    const [seeding, setSeeding] = useState(false);
    const [seedNote, setSeedNote] = useState('');
    const [selected, setSelected] = useState<Set<number>>(new Set());

    // Stable identity — see MapTab: a fresh `?? []` per render would defeat
    // the filter and counts memos below.
    const places = useMemo(() => data?.places ?? [], [data]);

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        return places.filter((p) => {
            if (term && !p.name.toLowerCase().includes(term)
                && !(p.description ?? '').toLowerCase().includes(term)) return false;
            if (regionFilter && String(p.region_id ?? '') !== regionFilter) return false;
            if (categoryFilter && p.category !== categoryFilter) return false;
            if (statusFilter && p.status !== statusFilter) return false;
            if (reviewState === 'on' && !p.needs_review) return false;
            if (reviewState === 'inverted' && p.needs_review) return false;
            if (pinState === 'on' && hasCoords(p)) return false;
            if (pinState === 'inverted' && !hasCoords(p)) return false;
            if (sourceFilter && sourceLabel(p.source) !== sourceFilter) return false;
            return true;
        });
    }, [places, search, regionFilter, categoryFilter, statusFilter,
        reviewState, pinState, sourceFilter]);

    /**
     * The order the list is in.
     *
     * Name was the only option, which is the wrong default for two of the three
     * things you come here to do: "what did I add last night" and "what is near
     * where we are staying" are both orderings, not searches. Distance sorts from
     * whichever base is set on the earliest day that has one — the trip's centre
     * of gravity — and says so in the label.
     */
    const distanceFrom = useMemo(() => {
        for (const day of data?.days ?? []) {
            if (day.base_place_id == null) continue;
            const base = api.placeById.get(day.base_place_id);
            if (base && hasCoords(base)) return base;
        }
        return null;
    }, [data?.days, api.placeById]);

    const sorted = useMemo(() => {
        const rows = [...filtered];
        switch (sort) {
            case 'recent':
                // Highest id first: `created_at` is only on places, and the id
                // is the same order without a parse.
                return rows.sort((a, b) => b.id - a.id);
            case 'region':
                return rows.sort((a, b) => (api.regionById.get(a.region_id ?? -1) ?? '~')
                    .localeCompare(api.regionById.get(b.region_id ?? -1) ?? '~')
                    || a.name.localeCompare(b.name));
            case 'status':
                return rows.sort((a, b) => STATUSES.findIndex((s) => s.key === b.status)
                    - STATUSES.findIndex((s) => s.key === a.status)
                    || a.name.localeCompare(b.name));
            case 'rating':
                return rows.sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name));
            case 'distance': {
                if (!distanceFrom) return rows;
                const from = { lat: distanceFrom.lat as number, lng: distanceFrom.lng as number };
                return rows.sort((a, b) => {
                    const left = hasCoords(a)
                        ? distanceKm(from, { lat: a.lat, lng: a.lng }) : Infinity;
                    const right = hasCoords(b)
                        ? distanceKm(from, { lat: b.lat, lng: b.lng }) : Infinity;
                    return left - right;
                });
            }
            default:
                return rows.sort((a, b) => a.name.localeCompare(b.name));
        }
    }, [filtered, sort, api.regionById, distanceFrom]);

    /** Built from the data, so a new batch of suggestions shows up on its own. */
    const sources = useMemo(() => sourcesOf(places), [places]);

    const counts = useMemo(() => ({
        total: places.length,
        pinned: places.filter(hasCoords).length,
        review: places.filter((p) => p.needs_review).length,
        shortlisted: places.filter((p) => p.status === 'shortlisted').length,
        booked: places.filter((p) => p.status === 'booked').length,
    }), [places]);

    const toggle = (id: number) => setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const bulk = async (fields: Record<string, unknown>) => {
        if (!selected.size) return;
        await api.update('places', { ids: [...selected], ...fields });
        setSelected(new Set());
    };

    /**
     * The same fields the map's lasso can set, offered here too.
     *
     * Which verbs you get shouldn't depend on whether you happened to select on
     * a map or in a list — they are the same places either way.
     */
    const bulkFields = useMemo(() => [
        {
            key: 'category',
            label: 'Type',
            options: (data?.categories ?? []).map((c) => ({
                value: c.key, label: `${c.icon} ${c.label}`,
            })),
        },
        {
            key: 'region_id',
            label: 'Region',
            options: [
                { value: null, label: '— no region —' },
                ...(data?.regions ?? []).map((r) => ({
                    value: r.id, label: r.country ? `${r.name} · ${r.country}` : r.name,
                })),
            ],
        },
        {
            key: 'country',
            label: 'Country',
            options: [
                { value: '', label: '— from region —' },
                ...countriesInUse(data?.regions ?? [], places).map((c) => ({ value: c, label: c })),
            ],
        },
        {
            key: 'source',
            label: 'Source',
            options: sources.map((src) => ({ value: src, label: src })),
        },
        {
            key: 'needs_review',
            label: 'Review flag',
            options: [
                { value: false, label: 'Reviewed — pin is right' },
                { value: true, label: 'Needs review' },
            ],
        },
        {
            key: 'is_excursion',
            label: 'Excursion',
            options: [
                { value: true, label: 'Is an excursion' },
                { value: false, label: 'Not an excursion' },
            ],
        },
        {
            key: 'rating',
            label: 'Rating',
            options: [
                { value: 'yes', label: '\u{1F44D} Interested' },
                { value: 'mid', label: '\u{1F610} Mid tier' },
                { value: 'no', label: '\u{1F44E} Not interested' },
                { value: '', label: '— unrated —' },
            ],
        },
    ], [data?.categories, data?.regions, places, sources]);

    /**
     * Load the bundled guide, from a button.
     *
     * The empty state used to say "run npm run seed:honeymoon", which is not
     * something you can do from the admin panel, let alone from a phone. The
     * seed is idempotent — matched on name — so pressing it twice is harmless.
     */
    const loadGuide = async () => {
        setSeeding(true);
        setSeedNote('');
        try {
            const res = await fetch('/api/admin/honeymoon/seed', { method: 'POST' });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) { setSeedNote(body.error ?? 'Could not load the guide.'); return; }
            await api.refresh();
            setSeedNote(
                `Added ${body.added.places} places, ${body.added.regions} regions and `
                + `${body.added.notes} guide notes. The pins are geocoded guesses — they show with `
                + 'a dashed ring until you confirm them.',
            );
        } finally {
            setSeeding(false);
        }
    };

    /* `n` from anywhere in the portal opens the new-place editor here. */
    useEffect(() => {
        const onNew = () => { setEditing(null); setEditorOpen(true); };
        window.addEventListener('honeymoon:new-place', onNew);
        return () => window.removeEventListener('honeymoon:new-place', onNew);
    }, []);

    /**
     * File the unfiled places by where they are.
     *
     * A drawn region boundary decides outright; otherwise the nearest region
     * centre, which is a guess and is described as one. Only places with no
     * region are touched — re-filing something you put somewhere on purpose is
     * the kind of help that loses work — and it is one request, not one per row.
     */
    const fileByLocation = async () => {
        const matches = assignRegions(places, data?.regions ?? []);
        if (!matches.length) {
            setFiling('Nothing to file: every pinned place already has a region.');
            return;
        }
        const ok = await api.updateMany('places', matches.map((match) => ({
            id: match.placeId, region_id: match.regionId,
        })));
        const drawn = matches.filter((match) => match.how === 'boundary').length;
        setFiling(ok
            ? `Filed ${matches.length} place${matches.length === 1 ? '' : 's'}`
                + `${drawn ? `, ${drawn} by a drawn boundary` : ''}`
                + `${matches.length - drawn ? `, ${matches.length - drawn} by nearest region centre — worth a glance` : ''}.`
            : 'Could not file those.');
    };

    /** Schedule the whole selection onto a day, skipping anything already on it. */
    const addToDay = async (dayId: number) => {
        const day = (data?.days ?? []).find((d) => d.id === dayId);
        if (!day) return;
        const already = new Set(day.stops.map((s) => s.place_id).filter((v) => v != null));
        const rows = [...selected]
            .filter((id) => !already.has(id))
            .map((id) => ({ day_id: dayId, place_id: id }));
        await api.createMany('stops', rows);
        await api.refresh();
        setSelected(new Set());
    };

    return (
        <div className="space-y-3">
            {/* ---- Counts ---- */}
            {!panel && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {[
                    { label: 'Places', value: counts.total },
                    { label: 'Pinned', value: counts.pinned },
                    { label: 'Needs review', value: counts.review, warn: counts.review > 0 },
                    { label: 'Shortlisted', value: counts.shortlisted },
                    { label: 'Booked', value: counts.booked },
                ].map((stat) => (
                    <Card key={stat.label} className="p-3">
                        <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
                            {stat.label}
                        </div>
                        <div className={`mt-0.5 text-base md:text-xl font-semibold tabular-nums
                            ${stat.warn ? 'text-amber-600' : 'text-gray-900'}`}>
                            {stat.value}
                        </div>
                    </Card>
                ))}
            </div>
            )}

            {/* ---- Search & filters ---- */}
            <Card className="p-3 space-y-2">
                <div className="flex gap-2">
                    <TextField
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search places…"
                    />
                    <Button tone="primary" onClick={() => { setEditing(null); setEditorOpen(true); }}>
                        + Add
                    </Button>
                </div>
                <div className={`grid gap-2 ${panel ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-6'}`}>
                    <SelectField value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                        <option value="">All sources</option>
                        {sources.map((src) => <option key={src} value={src}>{src}</option>)}
                    </SelectField>
                    <SelectField value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}>
                        <option value="">All regions</option>
                        {(data?.regions ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </SelectField>
                    <SelectField value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                        <option value="">All types</option>
                        {categoriesOf(places).map((c) => (
                            <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
                        ))}
                    </SelectField>
                    <SelectField value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="">Any status</option>
                        {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </SelectField>
                    <TriToggle
                        state={reviewState}
                        onChange={setReviewState}
                        offLabel="⚠ Review: any"
                        onLabel="⚠ Needs review"
                        invertedLabel="✓ Already reviewed"
                    />
                    <TriToggle
                        state={pinState}
                        onChange={setPinState}
                        tone="sky"
                        offLabel="Pin: any"
                        onLabel="Not pinned"
                        invertedLabel="Pinned"
                    />
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2">
                    <MiniSelect
                        value={sort}
                        onChange={(e) => setSort(e.target.value as SortKey)}
                        aria-label="Sort by"
                    >
                        {SORTS.map((option) => (
                            <option key={option.key} value={option.key}>
                                {option.key === 'distance' && !distanceFrom
                                    ? 'Distance (set a base first)'
                                    : option.label}
                            </option>
                        ))}
                    </MiniSelect>
                    <Button onClick={() => setDense(!dense)}>
                        {dense ? 'Comfortable rows' : 'Dense rows'}
                    </Button>
                    <SavedViews
                        api={api}
                        current={{
                            region: regionFilter, category: categoryFilter, status: statusFilter,
                            source: sourceFilter, review: reviewState, pin: pinState, sort,
                        }}
                        onApply={(filters: Record<string, unknown>) => {
                            setRegionFilter(String(filters.region ?? ''));
                            setCategoryFilter(String(filters.category ?? ''));
                            setStatusFilter(String(filters.status ?? ''));
                            setSourceFilter(String(filters.source ?? ''));
                            setReviewState((filters.review as TriState) ?? 'off');
                            setPinState((filters.pin as TriState) ?? 'off');
                            setSort((filters.sort as SortKey) ?? 'name');
                        }}
                    />
                    <div className="flex-1" />
                    {(regionFilter || categoryFilter || statusFilter || sourceFilter
                        || reviewState !== 'off' || pinState !== 'off') && (
                        <Button
                            tone="ghost"
                            onClick={() => {
                                setRegionFilter(''); setCategoryFilter(''); setStatusFilter('');
                                setSourceFilter(''); setReviewState('off'); setPinState('off');
                            }}
                        >
                            Clear filters
                        </Button>
                    )}
                    <Button onClick={() => setImporting(true)}>Import…</Button>
                    <OverflowMenu items={[
                        {
                            label: 'Export as CSV',
                            onClick: () => download(
                                placesToCsv(sorted, (id) => (id != null
                                    ? api.regionById.get(id) ?? '' : '')),
                                'places.csv', 'text/csv',
                            ),
                        },
                        {
                            label: 'Export as GeoJSON',
                            onClick: () => download(
                                placesToGeoJson(sorted, (id) => (id != null
                                    ? api.regionById.get(id) ?? '' : '')),
                                'places.geojson', 'application/geo+json',
                            ),
                        },
                        {
                            label: 'Export as KML (Google My Maps)',
                            onClick: () => download(
                                placesToKml(sorted, data?.trip.title ?? 'Honeymoon places'),
                                'places.kml', 'application/vnd.google-earth.kml+xml',
                            ),
                        },
                        { label: 'Assign regions by location', onClick: fileByLocation },
                    ]} />
                </div>
                {filing && (
                    <p className="rounded-xl bg-sky-50 px-2.5 py-1.5 text-[11px] text-sky-900">
                        {filing}
                    </p>
                )}
            </Card>

            {/* ---- Bulk bar ---- */}
            {selected.size > 0 && (
                <Card className="p-3 flex flex-wrap items-center gap-2 sticky top-2 z-10">
                    <span className="text-sm font-medium text-gray-700">{selected.size} selected</span>
                    <div className="flex-1" />
                    <SelectField
                        className="max-w-[10rem]"
                        value=""
                        onChange={(e) => { if (e.target.value) bulk({ status: e.target.value }); }}
                    >
                        <option value="">Set status…</option>
                        {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </SelectField>
                    {(data?.days ?? []).length > 0 && (
                        <MiniSelect
                            value=""
                            onChange={(e) => { if (e.target.value) addToDay(Number(e.target.value)); }}
                        >
                            <option value="">Add to day…</option>
                            {(data?.days ?? []).map((d) => (
                                <option key={d.id} value={d.id}>
                                    Day {d.day_number}{d.title ? ` — ${d.title}` : ''}
                                </option>
                            ))}
                        </MiniSelect>
                    )}
                    <BulkFieldMenu
                        fields={bulkFields}
                        onApply={(key, value) => bulk({ [key]: value })}
                        label="Change a field on all selected"
                    />
                    <Button onClick={() => bulk({ needs_review: false })}>Mark reviewed</Button>
                    <Button
                        tone="danger"
                        onClick={async () => {
                            const rows = [...selected]
                                .map((id) => api.placeById.get(id))
                                .filter((p) => p != null);
                            if (!rows.length) return;
                            if (!confirm(`Delete ${rows.length} place(s)? You can undo it.`)) return;
                            await api.removePlaces(rows);
                            setSelected(new Set());
                        }}
                    >
                        Delete
                    </Button>
                    <Button tone="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
                </Card>
            )}

            {/* ---- List ---- */}
            <Card>
                {sorted.length === 0 ? (
                    <div className="p-6 text-center">
                        <EmptyState
                            title={places.length ? 'No places match those filters' : 'No places yet'}
                            hint={places.length
                                ? 'Try clearing the filters.'
                                : 'Add one by hand, import a list, or load the bundled Bali and '
                                    + 'Singapore guide — 231 places, 126 of them already pinned.'}
                        />
                        {places.length === 0 && (
                            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                                <Button tone="primary" onClick={loadGuide} disabled={seeding}>
                                    {seeding ? 'Loading…' : 'Load the Bali guide'}
                                </Button>
                                <Button onClick={() => setImporting(true)}>Import a list…</Button>
                            </div>
                        )}
                        {seedNote && (
                            <p className="mt-2 text-xs text-gray-600">{seedNote}</p>
                        )}
                    </div>
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {sorted.map((place) => {
                            const onDays = api.dayOfPlace.get(place.id) ?? [];
                            const scheduled = onDays.length > 0;
                            return (
                                <li
                                    key={place.id}
                                    // Draggable straight onto a day card — the
                                    // point of the map's split view, and the
                                    // reason the day cards accept a native drop.
                                    draggable
                                    onDragStart={(event) => {
                                        event.dataTransfer.setData(PLACE_DRAG, String(place.id));
                                        event.dataTransfer.effectAllowed = 'copy';
                                    }}
                                    className={`flex items-center gap-3 px-3 hover:bg-gray-50
                                        ${dense ? 'py-1' : 'py-2.5'}`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected.has(place.id)}
                                        onChange={() => toggle(place.id)}
                                        className="w-4 h-4 rounded accent-accent shrink-0"
                                        aria-label={`Select ${place.name}`}
                                    />
                                    {/* The cover photo, when there is one: a
                                        shortlist of villas is much easier to read
                                        by picture than by name. Hidden in dense
                                        mode, which is for scanning names. */}
                                    {!dense && place.photos.length > 0 && (
                                        <div className="relative size-10 shrink-0 overflow-hidden
                                            rounded-lg bg-gray-100">
                                            <Image
                                                src={`/api/photos/${place.photos[0]}`}
                                                alt=""
                                                fill
                                                unoptimized
                                                className="object-cover"
                                            />
                                        </div>
                                    )}
                                    <button
                                        onClick={() => setViewing(place)}
                                        className="flex-1 min-w-0 text-left"
                                    >
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-medium text-gray-900 truncate">
                                                {place.name}
                                            </span>
                                            {!hasCoords(place) && (
                                                <span className="text-[10px] text-sky-700 bg-sky-50 rounded-full px-1.5 py-0.5">
                                                    no pin
                                                </span>
                                            )}
                                            {place.needs_review && (
                                                <span className="text-[10px] text-amber-800 bg-amber-50 rounded-full px-1.5 py-0.5">
                                                    ⚠ review
                                                </span>
                                            )}
                                            {scheduled && (
                                                <span className="text-[10px] text-emerald-800 bg-emerald-50 rounded-full px-1.5 py-0.5">
                                                    day {onDays.join(', ')}
                                                </span>
                                            )}
                                        </div>
                                        <div className={`flex items-center gap-1.5 flex-wrap
                                            ${dense ? 'hidden' : 'mt-1'}`}>
                                            <CategoryChip category={place.category} />
                                            <StatusChip status={place.status} />
                                            {place.region_id != null && (
                                                <span className="text-[11px] text-gray-400">
                                                    {api.regionById.get(place.region_id)}
                                                </span>
                                            )}
                                            <span className="text-[11px] text-gray-300">
                                                · {sourceLabel(place.source)}
                                            </span>
                                        </div>
                                    </button>
                                    {sort === 'distance' && distanceFrom && hasCoords(place) && (
                                        <span className="shrink-0 text-[11px] text-gray-400
                                            tabular-nums">
                                            {formatDistance(distanceKm(
                                                { lat: distanceFrom.lat as number,
                                                  lng: distanceFrom.lng as number },
                                                { lat: place.lat, lng: place.lng },
                                            ))}
                                        </span>
                                    )}
                                    <OverflowMenu
                                        items={[
                                            {
                                                label: 'Open details',
                                                onClick: () => setViewing(place),
                                            },
                                            {
                                                label: 'Edit',
                                                onClick: () => {
                                                    setEditing(place); setEditorOpen(true);
                                                },
                                            },
                                            ...STATUSES
                                                .filter((s) => s.key !== place.status)
                                                .map((s) => ({
                                                    label: `Mark ${s.label.toLowerCase()}`,
                                                    onClick: () => api.update('places', {
                                                        id: place.id, status: s.key as PlaceStatus,
                                                    }),
                                                })),
                                            ...(place.needs_review ? [{
                                                label: 'Pin looks right',
                                                onClick: () => api.update('places', {
                                                    id: place.id, needs_review: false,
                                                }),
                                            }] : []),
                                            {
                                                label: 'Delete',
                                                danger: true,
                                                // Undoable — including the link back
                                                // to any stop it was scheduled on.
                                                onClick: () => api.removePlaces([place]),
                                            },
                                        ]}
                                    />
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Card>

            {sorted.length > 0 && (
                <p className="text-[11px] text-gray-400 px-1">
                    Showing {sorted.length} of {places.length}.
                    {panel && ' Drag a row onto a day to schedule it.'}
                </p>
            )}

            <PlaceEditor
                api={api}
                place={editing}
                open={editorOpen}
                onClose={() => { setEditorOpen(false); setEditing(null); }}
            />

            <PlaceDrawer
                api={api}
                place={viewing ? api.placeById.get(viewing.id) ?? viewing : null}
                onClose={() => setViewing(null)}
                onEdit={(place) => { setViewing(null); setEditing(place); setEditorOpen(true); }}
            />

            <ImportPlaces api={api} open={importing} onClose={() => setImporting(false)} />
        </div>
    );
}
