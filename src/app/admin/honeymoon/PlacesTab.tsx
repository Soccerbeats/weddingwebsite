'use client';

import { useMemo, useState } from 'react';
import {
    STATUSES, categoriesOf, hasCoords, sourceLabel, sourcesOf,
    type Place, type PlaceStatus,
} from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import PlaceEditor from './PlaceEditor';
import {
    Button, Card, CategoryChip, EmptyState, OverflowMenu, SelectField, StatusChip, TextField,
    TriToggle, type TriState,
} from './ui';

/**
 * The place library — every candidate from the guide plus anything added by hand.
 *
 * This is the tab that has to stay usable at 200+ rows, so it leads with search
 * and filters rather than the list.
 */
export default function PlacesTab({ api }: { api: HoneymoonApi }) {
    const { data } = api;
    const [search, setSearch] = useState('');
    const [regionFilter, setRegionFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [reviewState, setReviewState] = useState<TriState>('off');
    const [pinState, setPinState] = useState<TriState>('off');
    const [sourceFilter, setSourceFilter] = useState('');
    const [editing, setEditing] = useState<Place | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
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

    return (
        <div className="space-y-3">
            {/* ---- Counts ---- */}
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
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
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
                    <Button onClick={() => bulk({ needs_review: false })}>Mark reviewed</Button>
                    <Button
                        tone="danger"
                        onClick={async () => {
                            const ids = [...selected];
                            const scheduled = ids.filter((id) => api.scheduledPlaceIds.has(id)).length;
                            const warning = scheduled
                                ? `Delete ${ids.length} place(s)? ${scheduled} of them are on your `
                                    + 'itinerary — those stops stay put and become plain text.'
                                : `Delete ${ids.length} place(s)?`;
                            if (!confirm(warning)) return;
                            await api.removeMany('places', ids);
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
                {filtered.length === 0 ? (
                    <EmptyState
                        title={places.length ? 'No places match those filters' : 'No places yet'}
                        hint={places.length
                            ? 'Try clearing the filters.'
                            : 'Add one by hand, or run npm run seed:honeymoon to load the Bali guide.'}
                    />
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {filtered.map((place) => {
                            const scheduled = api.scheduledPlaceIds.has(place.id);
                            return (
                                <li key={place.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50">
                                    <input
                                        type="checkbox"
                                        checked={selected.has(place.id)}
                                        onChange={() => toggle(place.id)}
                                        className="w-4 h-4 rounded accent-accent shrink-0"
                                        aria-label={`Select ${place.name}`}
                                    />
                                    <button
                                        onClick={() => { setEditing(place); setEditorOpen(true); }}
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
                                                    scheduled
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
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
                                    <OverflowMenu
                                        items={[
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
                                                onClick: () => {
                                                    const warning = scheduled
                                                        ? `${place.name} is on your itinerary. Deleting it leaves the stop in place as plain text. Continue?`
                                                        : `Delete ${place.name}?`;
                                                    if (confirm(warning)) api.remove('places', place.id);
                                                },
                                            },
                                        ]}
                                    />
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Card>

            {filtered.length > 0 && (
                <p className="text-[11px] text-gray-400 px-1">
                    Showing {filtered.length} of {places.length}.
                </p>
            )}

            <PlaceEditor
                api={api}
                place={editing}
                open={editorOpen}
                onClose={() => { setEditorOpen(false); setEditing(null); }}
            />
        </div>
    );
}
