'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    RATINGS, cleanListingTitle, formatPerNight, isStayUrl, nameFromStayUrl, stayUrlsFromText,
    type Place, type PlaceRating,
} from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import PlaceEditor from './PlaceEditor';
import {
    Button, Card, EmptyState, InlineText, Modal, OverflowMenu, TextArea,
} from './ui';

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
    const [preview, setPreview] = useState<Place | null>(null);
    const [editing, setEditing] = useState<Place | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);

    const places = useMemo(() => data?.places ?? [], [data]);
    const stays = useMemo(
        () => places.filter((p) => p.category === 'stay'),
        [places],
    );

    const shown = useMemo(() => stays.filter((s) => {
        if (filter === 'all') return true;
        if (filter === 'unrated') return s.rating == null;
        return s.rating === filter;
    }), [stays, filter]);

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
                                                onClick: () => {
                                                    if (confirm(`Delete ${stay.name}?`)) {
                                                        api.remove('places', stay.id);
                                                    }
                                                },
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
            <StayPreview
                key={preview?.id ?? 'none'}
                place={preview}
                url={preview ? stayLink(preview) : null}
                onClose={() => setPreview(null)}
                onRate={(rating) => {
                    if (preview) api.update('places', { id: preview.id, rating });
                }}
            />

            <PlaceEditor
                api={api}
                place={editing}
                open={editorOpen}
                onClose={() => { setEditorOpen(false); setEditing(null); }}
            />
        </div>
    );
}

/**
 * Preview a listing without leaving the portal.
 *
 * Booking.com currently sends `frame-ancestors 'none'` in *report-only* mode, so
 * framing works today but is one config flip away from not working. The frame is
 * therefore treated as best-effort: if it hasn't reported a load shortly after
 * opening, the fallback and the open-in-a-tab button take over. The button is
 * always there regardless.
 */
function StayPreview({ place, url, onClose, onRate }: {
    place: Place | null;
    url: string | null;
    onClose: () => void;
    onRate: (rating: PlaceRating | '') => void;
}) {
    const [loaded, setLoaded] = useState(false);
    const [gaveUp, setGaveUp] = useState(false);

    const open = place != null && url != null;

    // Patience clock only — the component is keyed by listing, so it always
    // mounts fresh and there is no previous state to clear.
    useEffect(() => {
        const timer = setTimeout(() => setGaveUp(true), 6000);
        return () => clearTimeout(timer);
    }, []);

    if (!open) return null;

    return (
        <Modal open onClose={onClose} title={place.name} wide>
            <div className="space-y-3">
                <div className="relative rounded-2xl overflow-hidden border border-gray-200 bg-gray-50">
                    <iframe
                        src={url}
                        title={place.name}
                        className="w-full h-[60vh]"
                        onLoad={() => setLoaded(true)}
                        // Same-origin is deliberately withheld: this is a third-party
                        // page and it has no business touching this admin session.
                        sandbox="allow-scripts allow-popups allow-forms"
                        referrerPolicy="no-referrer"
                    />
                    {!loaded && gaveUp && (
                        <div className="absolute inset-0 bg-white flex items-center justify-center p-6">
                            <div className="text-center max-w-sm">
                                <p className="text-sm font-medium text-gray-700">
                                    This site won&apos;t display inside the portal
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                    Booking sites increasingly block being embedded. Open it in a
                                    tab instead — your notes and rating stay here.
                                </p>
                                <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-block mt-3 rounded-full bg-accent text-white
                                        px-4 py-1.5 text-sm font-medium hover:opacity-90"
                                >
                                    Open on the booking site ↗
                                </a>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {RATINGS.map((r) => (
                        <button
                            key={r.key}
                            onClick={() => { onRate(place.rating === r.key ? '' : r.key); onClose(); }}
                            className={`rounded-full px-3 py-1.5 text-sm font-medium border transition
                                ${place.rating === r.key
                                ? 'text-white border-transparent'
                                : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'}`}
                            style={place.rating === r.key ? { backgroundColor: r.color } : undefined}
                        >
                            {r.icon} {r.label}
                        </button>
                    ))}
                    <div className="flex-1" />
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-accent hover:underline"
                    >
                        Open in a tab ↗
                    </a>
                </div>
            </div>
        </Modal>
    );
}
