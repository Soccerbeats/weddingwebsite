'use client';

import { useMemo, useState } from 'react';
import {
    RATINGS, categoryMeta, cleanListingTitle, formatPrice, nameFromAnyUrl, stayUrlsFromText,
    type Place,
} from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import LinkPreview from './LinkPreview';
import PlaceEditor from './PlaceEditor';
import {
    Button, Card, CategorySelect, EmptyState, InlineText, OverflowMenu, TextArea,
} from './ui';

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
export default function ExcursionsTab({ api }: { api: HoneymoonApi }) {
    const { data } = api;
    const [bulk, setBulk] = useState('');
    const [adding, setAdding] = useState(false);
    const [rated, setRated] = useState<'all' | 'yes' | 'no' | 'unrated'>('all');
    const [typeFilter, setTypeFilter] = useState('');
    const [preview, setPreview] = useState<Place | null>(null);
    const [editing, setEditing] = useState<Place | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [fetching, setFetching] = useState(0);

    const places = useMemo(() => data?.places ?? [], [data]);
    const excursions = useMemo(() => places.filter((p) => p.is_excursion), [places]);

    const shown = useMemo(() => excursions.filter((e) => {
        if (typeFilter && e.category !== typeFilter) return false;
        if (rated === 'all') return true;
        if (rated === 'unrated') return e.rating == null;
        return e.rating === rated;
    }), [excursions, rated, typeFilter]);

    const counts = useMemo(() => ({
        all: excursions.length,
        yes: excursions.filter((e) => e.rating === 'yes').length,
        no: excursions.filter((e) => e.rating === 'no').length,
        unrated: excursions.filter((e) => e.rating == null).length,
    }), [excursions]);

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
            {/* ---- Paste links ---- */}
            <Card className="p-3">
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                    Paste any link — a tour, a class, a dive shop. One per line, or several at once.
                </label>
                <TextArea
                    rows={2}
                    value={bulk}
                    onChange={(e) => setBulk(e.target.value)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                        const text = e.dataTransfer.getData('text/uri-list')
                            || e.dataTransfer.getData('text');
                        if (!text) return;
                        e.preventDefault();
                        setBulk((prev) => (prev ? `${prev}\n${text.trim()}` : text.trim()));
                    }}
                    placeholder="https://…"
                />
                <div className="flex items-center justify-between gap-2 mt-2">
                    <p className="text-[11px] text-gray-400">
                        Name and photo come from the page where it offers them. Type and cost are yours.
                    </p>
                    <Button
                        tone="primary"
                        onClick={addLinks}
                        disabled={adding || !stayUrlsFromText(bulk).length}
                    >
                        {adding ? 'Adding…' : `Add ${stayUrlsFromText(bulk).length || ''}`.trim()}
                    </Button>
                </div>
            </Card>

            {/* ---- Filters ---- */}
            <div className="flex flex-wrap items-center gap-1.5">
                {([
                    ['all', `All ${counts.all}`],
                    ['yes', `👍 Interested ${counts.yes}`],
                    ['no', `👎 Not interested ${counts.no}`],
                    ['unrated', `Unrated ${counts.unrated}`],
                ] as const).map(([key, label]) => (
                    <button
                        key={key}
                        onClick={() => setRated(key)}
                        className={`rounded-full px-3 py-1.5 text-sm font-medium border transition
                            ${rated === key
                            ? 'bg-accent text-white border-transparent'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                        {label}
                    </button>
                ))}
                {types.length > 1 && types.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setTypeFilter(typeFilter === t.key ? '' : t.key)}
                        className={`rounded-full px-3 py-1.5 text-sm font-medium border transition
                            ${typeFilter === t.key
                            ? 'text-white border-transparent'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                        style={typeFilter === t.key ? { backgroundColor: t.color } : undefined}
                    >
                        {t.icon} {t.label}
                    </button>
                ))}
                <div className="flex-1" />
                {missingImages.length > 0 && (
                    <Button onClick={fetchMissingImages} disabled={fetching > 0}>
                        {fetching > 0 ? `Fetching… ${fetching} left` : `Get photos for ${missingImages.length}`}
                    </Button>
                )}
            </div>

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
                    {shown.map((item) => {
                        const link = linkOf(item);
                        return (
                            <Card key={item.id} className="overflow-hidden">
                                {item.image_url && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={item.image_url}
                                        alt={item.name}
                                        referrerPolicy="no-referrer"
                                        loading="lazy"
                                        className="w-full h-40 object-cover bg-gray-100 cursor-pointer"
                                        onClick={() => setPreview(item)}
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                    />
                                )}
                                <div className="p-4">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <InlineText
                                                value={item.name}
                                                className="font-semibold text-gray-900 -ml-2"
                                                onCommit={(name) => api.update('places', { id: item.id, name })}
                                            />
                                        </div>
                                        <OverflowMenu
                                            items={[
                                                {
                                                    label: 'Edit details',
                                                    onClick: () => { setEditing(item); setEditorOpen(true); },
                                                },
                                                ...(item.rating ? [{
                                                    label: 'Clear rating',
                                                    onClick: () => api.update('places', { id: item.id, rating: '' }),
                                                }] : []),
                                                {
                                                    label: 'Remove from excursions',
                                                    onClick: () => api.update('places', {
                                                        id: item.id, is_excursion: false,
                                                    }),
                                                },
                                                {
                                                    label: 'Delete',
                                                    danger: true,
                                                    onClick: () => api.removePlaces([item]),
                                                },
                                            ]}
                                        />
                                    </div>

                                    {/* What it is, and what it costs. */}
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                        <div>
                                            <label className="block text-[11px] font-semibold text-gray-400 mb-1">
                                                What it is
                                            </label>
                                            <CategorySelect
                                                value={item.category}
                                                places={places}
                                                onChange={(category) => api.update('places', {
                                                    id: item.id, category,
                                                })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-semibold text-gray-400 mb-1">
                                                Cost
                                            </label>
                                            <InlineText
                                                value={item.price_note ?? ''}
                                                placeholder="120, or 120 per person"
                                                className="text-sm"
                                                onCommit={(price_note) => api.update('places', {
                                                    id: item.id,
                                                    price_note: formatPrice(
                                                        price_note, data?.trip.home_currency,
                                                    ),
                                                })}
                                            />
                                        </div>
                                    </div>

                                    <InlineText
                                        multiline
                                        value={item.description ?? ''}
                                        placeholder="Notes — how long, what's included, when to book…"
                                        className="text-sm text-gray-600 -ml-2 mt-2"
                                        onCommit={(description) => api.update('places', {
                                            id: item.id, description,
                                        })}
                                    />

                                    <div className="flex flex-wrap items-center gap-1.5 mt-3">
                                        {RATINGS.map((r) => {
                                            const on = item.rating === r.key;
                                            return (
                                                <button
                                                    key={r.key}
                                                    onClick={() => api.update('places', {
                                                        id: item.id, rating: on ? '' : r.key,
                                                    })}
                                                    className={`rounded-full px-3 py-1 text-xs font-medium border transition
                                                        ${on
                                                        ? 'text-white border-transparent'
                                                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                                                    style={on ? { backgroundColor: r.color } : undefined}
                                                >
                                                    {r.icon} {r.label}
                                                </button>
                                            );
                                        })}
                                        <div className="flex-1" />
                                        {link && <Button onClick={() => setPreview(item)}>Preview</Button>}
                                    </div>

                                    {link && (
                                        <a
                                            href={link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block text-[11px] text-gray-400 hover:text-gray-700 mt-2 truncate"
                                        >
                                            {link}
                                        </a>
                                    )}
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            {preview && (
                <LinkPreview
                    key={preview.id}
                    title={preview.name}
                    url={linkOf(preview)}
                    rating={preview.rating}
                    onClose={() => setPreview(null)}
                    onRate={(rating) => api.update('places', { id: preview.id, rating })}
                />
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
