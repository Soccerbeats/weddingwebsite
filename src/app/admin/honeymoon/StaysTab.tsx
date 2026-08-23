'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    RATINGS, cleanListingTitle, formatPerNight, isStayUrl, nameFromStayUrl, priceValue,
    stayUrlsFromText,
    type Place, type PlaceStatus,
} from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import PlaceEditor from './PlaceEditor';
import LinkPreview from './LinkPreview';
import {
    Button, Card, EmptyState, InlineText, MiniSelect, OverflowMenu, StatusChip, TextArea,
} from './ui';

type SortKey = 'added' | 'price' | 'name' | 'status';

const SORTS: { key: SortKey; label: string }[] = [
    { key: 'added', label: 'Recently added' },
    { key: 'price', label: 'Price: low first' },
    { key: 'name', label: 'Name: A → Z' },
    { key: 'status', label: 'Status: booked first' },
];

const SORT_KEY = 'honeymoon.stays.sort';

/** Booked outranks shortlisted outranks idea, for the status sort. */
const STATUS_RANK: Record<PlaceStatus, number> = { booked: 3, shortlisted: 2, idea: 1 };

/**
 * Candidate places to stay.
 *
 * These are ordinary places with category `stay`; this tab is a shortlist view
 * over them, because comparing accommodation is a different job from finding a
 * waterfall — you want the links, the prices and a yes/no side by side.
 *
 * Booking.com answers an ordinary server-side fetch with a bot challenge, but
 * serves the full Open Graph block to link-preview crawlers — so /api/admin/
 * fetch-meta can pull a real name and a photo. The URL slug is the fallback for
 * anywhere that gives us nothing.
 */
export default function StaysTab({ api }: { api: HoneymoonApi }) {
    const { data } = api;
    const [bulk, setBulk] = useState('');
    const [adding, setAdding] = useState(false);
    const [fetching, setFetching] = useState(0);
    const [filter, setFilter] = useState<'all' | 'yes' | 'no' | 'unrated'>('all');
    /**
     * Newest first by default: a shortlist is worked from the top, and the thing
     * you just pasted in is the thing you want to look at. Remembered per
     * browser like the itinerary's view — read after mount, since the server has
     * no localStorage and seeding state from it would break hydration.
     */
    const [sort, setSort] = useState<SortKey>('added');
    useEffect(() => {
        const saved = localStorage.getItem(SORT_KEY);
        if (SORTS.some((s) => s.key === saved)) setSort(saved as SortKey);
    }, []);
    const chooseSort = (next: SortKey) => {
        setSort(next);
        localStorage.setItem(SORT_KEY, next);
    };
    const [preview, setPreview] = useState<Place | null>(null);
    const [editing, setEditing] = useState<Place | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);

    const places = useMemo(() => data?.places ?? [], [data]);
    const stays = useMemo(
        () => places.filter((p) => p.category === 'stay'),
        [places],
    );

    const shown = useMemo(() => {
        const rows = stays.filter((s) => {
            if (filter === 'all') return true;
            if (filter === 'unrated') return s.rating == null;
            return s.rating === filter;
        });

        /** Every sort falls back to this, so equal rows keep a stable order. */
        const byName = (a: Place, b: Place) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

        const sorted = [...rows];
        switch (sort) {
            case 'price':
                sorted.sort((a, b) => {
                    const pa = priceValue(a.price_note);
                    const pb = priceValue(b.price_note);
                    // Unpriced last in either case: a stay with no number on it
                    // is not "free", and floating it to the top of a cost sort
                    // would bury the cheapest real option.
                    if (pa == null && pb == null) return byName(a, b);
                    if (pa == null) return 1;
                    if (pb == null) return -1;
                    return pa - pb || byName(a, b);
                });
                break;
            case 'name':
                sorted.sort(byName);
                break;
            case 'status':
                sorted.sort((a, b) =>
                    (STATUS_RANK[b.status] ?? 0) - (STATUS_RANK[a.status] ?? 0) || byName(a, b));
                break;
            case 'added':
            default:
                // There is no created_at column, and adding one now would stamp
                // every existing row with the same backfilled time. The id is a
                // serial, so descending id *is* insertion order, newest first —
                // the same answer, with no migration and no lie about old rows.
                sorted.sort((a, b) => b.id - a.id);
                break;
        }
        return sorted;
    }, [stays, filter, sort]);

    const counts = useMemo(() => ({
        all: stays.length,
        yes: stays.filter((s) => s.rating === 'yes').length,
        no: stays.filter((s) => s.rating === 'no').length,
        unrated: stays.filter((s) => s.rating == null).length,
    }), [stays]);

    /**
     * Ask the server for a listing's preview data.
     * Returns nothing rather than throwing — a missing photo must never stop a
     * link being saved.
     */
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

    /** Turn a pasted block of links into one stay each. */
    const addLinks = async () => {
        const urls = stayUrlsFromText(bulk);
        if (!urls.length) return;
        setAdding(true);
        try {
            const existing = new Set(
                stays.flatMap((s) => s.links.map((l) => l.url)),
            );
            for (const url of urls) {
                if (existing.has(url)) continue;
                const meta = await previewOf(url);
                // The listing's own title beats the URL slug when we can get it:
                // "Hard Rock Hotel Bali" rather than "Hard Rock Bali".
                const name = cleanListingTitle(meta.title ?? '')
                    ?? nameFromStayUrl(url)
                    ?? 'Untitled stay';
                await api.create('places', {
                    name,
                    category: 'stay',
                    status: 'idea',
                    source: 'Added by me',
                    image_url: meta.image ?? '',
                    links: [{ label: isStayUrl(url) ? 'Booking' : 'Link', url }],
                });
            }
            setBulk('');
        } finally {
            setAdding(false);
        }
    };

    /** Backfill photos for stays saved before this existed, or whose link changed. */
    const missingImages = useMemo(
        () => stays.filter((s) => !s.image_url && s.links.length > 0),
        [stays],
    );

    const fetchMissingImages = async () => {
        setFetching(missingImages.length);
        try {
            for (const stay of missingImages) {
                const url = stay.links[0]?.url;
                if (!url) continue;
                const meta = await previewOf(url);
                if (meta.image) await api.update('places', { id: stay.id, image_url: meta.image });
                setFetching((n) => n - 1);
            }
        } finally {
            setFetching(0);
        }
    };

    const stayLink = (place: Place) =>
        place.links.find((l) => isStayUrl(l.url))?.url ?? place.links[0]?.url ?? null;

    return (
        <div className="space-y-3">
            {/* ---- Paste links ---- */}
            <Card className="p-3">
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                    Paste booking links — one per line, or several at once
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
                    placeholder="https://www.booking.com/hotel/id/…"
                />
                <div className="flex items-center justify-between gap-2 mt-2">
                    <p className="text-[11px] text-gray-400">
                        The name is read from the link; price and notes are yours to add.
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
                        onClick={() => setFilter(key)}
                        className={`rounded-full px-3 py-1.5 text-sm font-medium border transition
                            ${filter === key
                            ? 'bg-accent text-white border-transparent'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                        {label}
                    </button>
                ))}
                <div className="flex-1" />
                <MiniSelect
                    value={sort}
                    onChange={(e) => chooseSort(e.target.value as SortKey)}
                    aria-label="Sort the shortlist"
                    title="How the shortlist is ordered"
                >
                    {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </MiniSelect>
                {missingImages.length > 0 && (
                    <Button onClick={fetchMissingImages} disabled={fetching > 0}>
                        {fetching > 0
                            ? `Fetching… ${fetching} left`
                            : `Get photos for ${missingImages.length}`}
                    </Button>
                )}
            </div>

            {/* ---- Cards ---- */}
            {shown.length === 0 ? (
                <Card>
                    <EmptyState
                        title={stays.length ? 'Nothing matches that filter' : 'No places to stay yet'}
                        hint={stays.length
                            ? 'Try All.'
                            : 'Paste a Booking.com link above to start a shortlist.'}
                    />
                </Card>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3 items-start">
                    {shown.map((stay) => {
                        const link = stayLink(stay);
                        return (
                            <Card key={stay.id} className="overflow-hidden">
                                {stay.image_url && (
                                    // Plain <img>: the host is a third-party CDN, and
                                    // next/image would need every booking domain
                                    // whitelisted up front. no-referrer keeps the
                                    // admin URL out of their logs.
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={stay.image_url}
                                        alt={stay.name}
                                        referrerPolicy="no-referrer"
                                        loading="lazy"
                                        className="w-full h-40 object-cover bg-gray-100"
                                        onClick={() => setPreview(stay)}
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                    />
                                )}
                                <div className="p-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                        <InlineText
                                            value={stay.name}
                                            className="font-semibold text-gray-900 -ml-2"
                                            onCommit={(name) => api.update('places', { id: stay.id, name })}
                                        />
                                        {/* Only once it is more than an idea: a chip
                                            on every card would be noise, but a
                                            shortlist you cannot see the state of
                                            makes the status sort look arbitrary. */}
                                        {stay.status !== 'idea' && (
                                            <div className="mt-0.5">
                                                <StatusChip status={stay.status} />
                                            </div>
                                        )}
                                        <InlineText
                                            value={stay.price_note ?? ''}
                                            placeholder="Price per night — type 250"
                                            className="text-xs text-gray-500 -ml-2"
                                            onCommit={(price_note) => api.update('places', {
                                                id: stay.id,
                                                price_note: formatPerNight(
                                                    price_note, data?.trip.home_currency,
                                                ),
                                            })}
                                        />
                                    </div>
                                    <OverflowMenu
                                        items={[
                                            {
                                                label: 'Edit details',
                                                onClick: () => { setEditing(stay); setEditorOpen(true); },
                                            },
                                            ...(stay.rating ? [{
                                                label: 'Clear rating',
                                                onClick: () => api.update('places', {
                                                    id: stay.id, rating: '',
                                                }),
                                            }] : []),
                                            {
                                                label: 'Delete',
                                                danger: true,
                                                onClick: () => api.removePlaces([stay]),
                                            },
                                        ]}
                                    />
                                </div>

                                <InlineText
                                    multiline
                                    value={stay.description ?? ''}
                                    placeholder="Notes — what you liked, what put you off…"
                                    className="text-sm text-gray-600 -ml-2 mt-1"
                                    onCommit={(description) => api.update('places', {
                                        id: stay.id, description,
                                    })}
                                />

                                {/* Rating */}
                                <div className="flex flex-wrap items-center gap-1.5 mt-3">
                                    {RATINGS.map((r) => {
                                        const on = stay.rating === r.key;
                                        return (
                                            <button
                                                key={r.key}
                                                onClick={() => api.update('places', {
                                                    // Clicking the active rating clears it.
                                                    id: stay.id, rating: on ? '' : r.key,
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
                                    {link && (
                                        <Button onClick={() => setPreview(stay)}>Preview</Button>
                                    )}
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

            {/* Keyed on the listing so each preview mounts fresh — no reset logic,
                and the load/timeout state can't leak from one listing to the next. */}
            {preview && (
                <LinkPreview
                    key={preview.id}
                    title={preview.name}
                    url={stayLink(preview)}
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
