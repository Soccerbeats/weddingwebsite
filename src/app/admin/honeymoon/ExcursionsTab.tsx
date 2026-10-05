'use client';

import { useMemo, useState } from 'react';
import {
    categoryMeta, cleanListingTitle, nameFromAnyUrl, stayUrlsFromText,
    type Place,
} from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import LinkPreview from './LinkPreview';
import RateQueue from './RateQueue';
import { usePlaceSheet } from './PlaceSheetContext';
import {
    BulkFieldMenu, Button, Card, EmptyState, OverflowMenu, SelectField, TextArea,
} from './ui';
import { FilterButton, FilterField } from './kit/FilterButton';
import { PlaceCard } from './kit/PlaceCard';
import { Segmented } from './kit/Segmented';
import { Sheet } from './kit/Sheet';
import { TabToolbar } from './kit/TabToolbar';

/**
 * Things to do — tours, classes, dives, day trips.
 *
 * Excursions are ordinary places carrying `is_excursion`, so one can also be
 * pinned on the map and dropped onto a day like anything else. The flag is
 * separate from the category on purpose: *what* an excursion is varies wildly
 * (a cooking class, a boat trip, a temple tour) and that is exactly the field
 * you want free, so tying the tab to a single category would lose anything you
 * re-typed.
 *
 * Any link works, not just booking sites. `/api/admin/fetch-meta` tries a normal
 * browser agent then a link-preview crawler, which is what gets a title and a
 * photo out of sites that stonewall an ordinary request.
 */
export default function ExcursionsTab({ api, segmentSwitch }: {
    api: HoneymoonApi;
    segmentSwitch?: React.ReactNode;
}) {
    const { data } = api;
    const [bulk, setBulk] = useState('');
    const [adding, setAdding] = useState(false);
    const [rated, setRated] = useState<
        'all' | 'yes' | 'mid' | 'no' | 'unrated' | 'removed'
    >('all');
    const [typeFilter, setTypeFilter] = useState('');
    const [preview, setPreview] = useState<Place | null>(null);
    const { openPlace } = usePlaceSheet();
    const [pasting, setPasting] = useState(false);
    const [fetching, setFetching] = useState(0);
    const [triaging, setTriaging] = useState(false);
    /** Multi-select, matching the Places and Stays tabs. */
    const [selected, setSelected] = useState<Set<number>>(new Set());

    const places = useMemo(() => data?.places ?? [], [data]);
    // Removed places stay out of the shortlist, as on the Stays tab.
    const excursions = useMemo(() => places.filter((p) => p.is_excursion && !p.archived), [places]);
    /*
     * Removed excursions, kept.
     *
     * "Remove" used to flip `is_excursion` off, which does not delete the place
     * but does make it vanish from the only tab that lists excursions — so a
     * dive you ruled out was findable solely by remembering its name. Archiving
     * matches Stays exactly: a Removed bucket you can restore from or empty for
     * good, and the same word meaning the same thing on both tabs.
     */
    const removed = useMemo(() => places.filter((p) => p.is_excursion && p.archived), [places]);

    const shown = useMemo(() => {
        const source = rated === 'removed' ? removed : excursions;
        return source.filter((e) => {
            if (typeFilter && e.category !== typeFilter) return false;
            if (rated === 'all' || rated === 'removed') return true;
            if (rated === 'unrated') return e.rating == null;
            return e.rating === rated;
        });
    }, [excursions, removed, rated, typeFilter]);

    const counts = useMemo(() => ({
        all: excursions.length,
        yes: excursions.filter((e) => e.rating === 'yes').length,
        mid: excursions.filter((e) => e.rating === 'mid').length,
        no: excursions.filter((e) => e.rating === 'no').length,
        unrated: excursions.filter((e) => e.rating == null).length,
        removed: removed.length,
    }), [excursions, removed]);

    /** The types actually in use here, so the filter reflects the list. */
    const types = useMemo(() => {
        const seen = new Map<string, ReturnType<typeof categoryMeta>>();
        for (const e of excursions) if (!seen.has(e.category)) seen.set(e.category, categoryMeta(e.category));
        return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
    }, [excursions]);

    /** Preview data for a link. Never throws — a missing photo can't block a save. */
    const previewOf = async (url: string): Promise<{ title?: string; image?: string }> => {
        try {
            const res = await fetch('/api/admin/fetch-meta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });
            if (!res.ok) return {};
            const body = await res.json();
            return { title: body.title || undefined, image: body.image || undefined };
        } catch {
            return {};
        }
    };

    const addLinks = async () => {
        const urls = stayUrlsFromText(bulk);
        if (!urls.length) return;
        setAdding(true);
        try {
            const existing = new Set(excursions.flatMap((e) => e.links.map((l) => l.url)));
            for (const url of urls) {
                if (existing.has(url)) continue;
                const meta = await previewOf(url);
                const name = cleanListingTitle(meta.title ?? '')
                    ?? nameFromAnyUrl(url)
                    ?? 'Untitled excursion';
                await api.create('places', {
                    name,
                    category: 'activity',
                    status: 'idea',
                    source: 'Added by me',
                    is_excursion: true,
                    image_url: meta.image ?? '',
                    links: [{ label: 'Link', url }],
                });
            }
            setBulk('');
        } finally {
            setAdding(false);
        }
    };

    const missingImages = useMemo(
        () => excursions.filter((e) => !e.image_url && e.links.length > 0),
        [excursions],
    );

    const fetchMissingImages = async () => {
        setFetching(missingImages.length);
        try {
            for (const item of missingImages) {
                const url = item.links[0]?.url;
                if (!url) continue;
                const meta = await previewOf(url);
                if (meta.image) await api.update('places', { id: item.id, image_url: meta.image });
                setFetching((n) => n - 1);
            }
        } finally {
            setFetching(0);
        }
    };

    const linkOf = (place: Place) => place.links[0]?.url ?? null;

    return (
        <div className="space-y-3">
            <TabToolbar
                left={(
                    <>
                        {segmentSwitch}
                        <Segmented
                            ariaLabel="Show which excursions"
                            size="sm"
                            value={rated}
                            onChange={setRated}
                            options={[
                                { key: 'all', label: 'All', count: counts.all },
                                { key: 'yes', label: '👍', count: counts.yes, title: 'Interested' },
                                { key: 'mid', label: '😐', count: counts.mid, title: 'Mid tier' },
                                { key: 'no', label: '👎', count: counts.no, title: 'Not interested' },
                                { key: 'unrated', label: 'Unrated', count: counts.unrated },
                                ...(counts.removed ? [{ key: 'removed' as const, label: '🗑', count: counts.removed, title: 'Removed' }] : []),
                            ]}
                        />
                    </>
                )}
                right={(
                    <>
                        {types.length > 1 && (
                            <FilterButton
                                active={typeFilter ? [{
                                    key: 'type', label: categoryMeta(typeFilter).label, clear: () => setTypeFilter(''),
                                }] : []}
                                onReset={() => setTypeFilter('')}
                            >
                                <FilterField label="What it is">
                                    <SelectField value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                                        <option value="">Every type</option>
                                        {types.map((t) => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
                                    </SelectField>
                                </FilterField>
                            </FilterButton>
                        )}
                        <Button tone="primary" onClick={() => setPasting(true)}>+ Add excursions</Button>
                        <OverflowMenu items={[
                            ...(counts.unrated > 0 ? [{ label: `⚡ Rate ${counts.unrated} unrated`, onClick: () => setTriaging(true) }] : []),
                            ...(missingImages.length > 0 && fetching === 0 ? [{
                                label: `Get photos for ${missingImages.length}`, onClick: fetchMissingImages,
                            }] : []),
                        ]} />
                    </>
                )}
                below={fetching > 0 ? <p className="text-[11px] text-gray-500">Fetching photos… {fetching} left</p> : undefined}
            />

            {selected.size > 0 && (
                <Card className="sticky top-2 z-10 flex flex-wrap items-center gap-2 p-3">
                    <span className="text-sm font-medium text-gray-700">
                        {selected.size} selected
                    </span>
                    <div className="flex-1" />
                    <BulkFieldMenu
                        fields={[
                            {
                                key: 'rating',
                                label: 'Rating',
                                options: [
                                    { value: 'yes', label: '👍 Interested' },
                                    { value: 'mid', label: '😐 Mid tier' },
                                    { value: 'no', label: '👎 Not interested' },
                                    { value: '', label: '— unrated —' },
                                ],
                            },
                            {
                                key: 'status',
                                label: 'Status',
                                options: [
                                    { value: 'idea', label: 'Idea' },
                                    { value: 'shortlisted', label: 'Shortlisted' },
                                    { value: 'booked', label: 'Booked' },
                                ],
                            },
                            {
                                key: 'region_id',
                                label: 'Area',
                                options: [
                                    { value: null, label: '— no area —' },
                                    ...(data?.regions ?? []).map((region) => ({
                                        value: region.id, label: region.name,
                                    })),
                                ],
                            },
                        ]}
                        onApply={async (key, value) => {
                            await api.update('places', { ids: [...selected], [key]: value });
                            setSelected(new Set());
                        }}
                        label="Change a field on all selected"
                    />
                    <Button
                        onClick={async () => {
                            await api.update('places', { ids: [...selected], archived: true });
                            setSelected(new Set());
                        }}
                    >
                        Remove from shortlist
                    </Button>
                    <Button tone="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
                </Card>
            )}

            {/* ---- Cards ---- */}
            {shown.length === 0 ? (
                <Card>
                    <EmptyState
                        title={excursions.length ? 'Nothing matches that filter' : 'No excursions yet'}
                        hint={excursions.length
                            ? 'Try All.'
                            : 'Paste a link above — a tour, a cooking class, a dive.'}
                    />
                </Card>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3 items-start">
                    {shown.map((item) => (
                        <PlaceCard
                            key={item.id}
                            place={item}
                            selected={selected.has(item.id)}
                            onToggleSelect={() => setSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                                return next;
                            })}
                            menu={[
                                { label: 'Open', onClick: () => openPlace(item.id) },
                                ...(linkOf(item) ? [{ label: 'Preview the page', onClick: () => setPreview(item) }] : []),
                                // Archive, not un-flag: see `removed`.
                                item.archived
                                    ? { label: 'Put back on the shortlist', onClick: () => api.patchPlace(item.id, { archived: false }) }
                                    : { label: 'Remove from the shortlist', onClick: () => api.patchPlace(item.id, { archived: true }) },
                                { label: 'Not an excursion', onClick: () => api.update('places', { id: item.id, is_excursion: false }) },
                                { label: 'Delete for good', danger: true, onClick: () => api.removePlaces([item]) },
                            ]}
                        />
                    ))}
                </div>
            )}

            {preview && (
                <LinkPreview
                    key={preview.id}
                    title={preview.name}
                    url={linkOf(preview)}
                    rating={preview.rating}
                    onClose={() => setPreview(null)}
                    onRate={(rating) => api.patchPlace(preview.id, { rating })}
                />
            )}

            <Sheet
                open={pasting}
                onClose={() => setPasting(false)}
                side="center"
                title={<h2 className="font-semibold text-gray-900">Add excursions from links</h2>}
            >
                <div className="space-y-2">
                    <TextArea
                        rows={4}
                        value={bulk}
                        onChange={(e) => setBulk(e.target.value)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                            const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text');
                            if (!text) return;
                            e.preventDefault();
                            setBulk((prev) => (prev ? `${prev}\n${text.trim()}` : text.trim()));
                        }}
                        placeholder="https://…  — a tour, a class, a dive shop. One per line."
                    />
                    <p className="text-[11px] text-gray-400">
                        Name and photo come from the page where it offers them. Type and cost are yours.
                    </p>
                    <div className="flex justify-end">
                        <Button
                            tone="primary"
                            onClick={async () => { await addLinks(); setPasting(false); }}
                            disabled={adding || !stayUrlsFromText(bulk).length}
                        >
                            {adding ? 'Adding…' : `Add ${stayUrlsFromText(bulk).length || ''}`.trim()}
                        </Button>
                    </div>
                </div>
            </Sheet>

            <RateQueue
                api={api}
                open={triaging}
                onClose={() => setTriaging(false)}
                title="Rate the excursions"
                filter={(place) => place.is_excursion}
            />

        </div>
    );
}
