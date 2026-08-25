'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
    DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    RATINGS, byRank, cleanListingTitle, formatPerNight, hasCoords, isStayUrl, nameFromStayUrl,
    priceValue, stayUrlsFromText,
    type Place, type PlaceStatus,
} from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import PlaceEditor from './PlaceEditor';
import LinkPreview from './LinkPreview';
import {
    Button, Card, ColumnDivider, CustomisableSelect, EmptyState, InlineText, ManageListModal,
    MiniSelect, OverflowMenu, StatusChip, TextArea,
} from './ui';

// Leaflet reaches for `window` on import, so the map is never in the server
// bundle. Same treatment as the map tab.
const TripMap = dynamic(() => import('./TripMap'), {
    ssr: false,
    loading: () => <div className="h-full w-full bg-gray-100 animate-pulse rounded-2xl" />,
});

type SortKey = 'rank' | 'added' | 'price' | 'name' | 'status';

/** Cards to compare them, ranking to put them in order. */
type View = 'cards' | 'ranking';

const VIEW_KEY = 'honeymoon.stays.view';
const MAP_WIDTH_KEY = 'honeymoon.stays.mapWidth';

/** Narrowest the map may be dragged, and the room the list keeps. */
const MIN_MAP = 260;
const MIN_LIST = 360;
/** The two-column layout only exists from xl up — below that the map stacks. */
const WIDE_QUERY = '(min-width: 1280px)';

const SORTS: { key: SortKey; label: string }[] = [
    { key: 'rank', label: 'My ranking' },
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
    /** How many listings are still to look up, and what the last run found. */
    const [locating, setLocating] = useState(0);
    const [located, setLocated] = useState<number | null>(null);
    const [filter, setFilter] = useState<'all' | 'yes' | 'mid' | 'no' | 'unrated' | 'removed'>('all');
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

    /**
     * Cards or ranking. Remembered like the sort, and for the same reason.
     *
     * The ranking view is one column of rows with a drag handle: comparing two
     * hotels is a job for cards side by side, but *ordering* them is a job for a
     * list you can drag, and trying to do the second with a wrapping grid means
     * dragging a card three positions to move it one.
     */
    const [view, setView] = useState<View>('cards');
    useEffect(() => {
        const saved = localStorage.getItem(VIEW_KEY);
        if (saved === 'ranking' || saved === 'cards') setView(saved);
    }, []);
    const chooseView = (next: View) => {
        setView(next);
        localStorage.setItem(VIEW_KEY, next);
        // The ranking is of the shortlist, and the pills are hidden in that view
        // — so leaving the Removed bucket selected would show the rejects as a
        // rankable list with no visible way back.
        if (next === 'ranking') setFilter((f) => (f === 'removed' ? 'all' : f));
    };
    const [preview, setPreview] = useState<Place | null>(null);
    /**
     * The stay being pointed at, and which side pointed at it.
     *
     * The side matters: a pick made in the list needs no scrolling — you are
     * already looking at the card — while a pick made on the map has to bring
     * its card to you. Storing where it came from is what keeps those apart
     * without the two sides fighting each other.
     */
    const [picked, setPicked] = useState<{ id: number; from: 'list' | 'map' } | null>(null);
    /** Card elements by stay id, so a map click can scroll to one. */
    const cardRefs = useRef(new Map<number, HTMLElement>());

    /**
     * How wide the map column is, and whether there is room for one beside the
     * list at all. Remembered per browser — how you split a screen is about
     * your screen, not about the trip.
     */
    const [mapWidth, setMapWidth] = useState(384);
    const [wide, setWide] = useState(false);
    const splitRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const saved = Number(localStorage.getItem(MAP_WIDTH_KEY));
        if (Number.isFinite(saved) && saved >= MIN_MAP) setMapWidth(saved);
    }, []);

    useEffect(() => {
        const mq = window.matchMedia(WIDE_QUERY);
        const apply = () => setWide(mq.matches);
        apply();
        mq.addEventListener('change', apply);
        return () => mq.removeEventListener('change', apply);
    }, []);

    /**
     * Drag the divider.
     *
     * Deltas rather than absolute positions, so the grab point never drifts from
     * the handle, and clamped against the list's minimum so the cards can always
     * be read. Dragging left makes the map bigger, which is why the sign flips.
     */
    const resizeMap = (dx: number) => setMapWidth((prev) => {
        const total = splitRef.current?.clientWidth ?? 1280;
        const max = Math.max(MIN_MAP, total - MIN_LIST - 12);
        const next = Math.min(max, Math.max(MIN_MAP, prev - dx));
        localStorage.setItem(MAP_WIDTH_KEY, String(next));
        return next;
    });
    const [editing, setEditing] = useState<Place | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    // The ✎ Edit / remove… option on the area picker opens this.
    const [managingRegions, setManagingRegions] = useState(false);

    const places = useMemo(() => data?.places ?? [], [data]);
    /**
     * The live shortlist. Removed stays are not in it at all — they are kept,
     * not shown: `All` means all the ones you are still considering, which is
     * what you mean when you look at a shortlist.
     */
    const stays = useMemo(
        () => places.filter((p) => p.category === 'stay' && !p.archived),
        [places],
    );
    const removed = useMemo(
        () => places.filter((p) => p.category === 'stay' && p.archived),
        [places],
    );

    const shown = useMemo(() => {
        // The Removed bucket is a different list, not a filter over the live one.
        const source = filter === 'removed' ? removed : stays;
        const rows = source.filter((s) => {
            if (filter === 'all' || filter === 'removed') return true;
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
            case 'rank':
                // byRank keeps the unranked tail in the order it arrived, which
                // here is newest-first — the same default the list has always
                // had, so an unranked shortlist looks unchanged.
                return byRank([...rows].sort((a, b) => b.id - a.id));
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
    }, [stays, removed, filter, sort]);

    /**
     * The ranking view's rows: every stay, in rank order.
     *
     * Deliberately not the filtered list. Ranking is a whole-shortlist activity
     * — dragging inside a filtered subset would renumber those rows 1..n and
     * leave the hidden ones holding stale numbers, so the filter pills step
     * aside in this view rather than quietly corrupting the order.
     */
    const ranking = useMemo(
        () => byRank([...stays].sort((a, b) => b.id - a.id)),
        [stays],
    );

    /**
     * The order on screen while a save is in flight.
     *
     * Held here rather than inside the list because the map's pin numbers read
     * from it too: two copies of "what order are these in" would show the list
     * renumbered and the map still stale for as long as the round trip takes.
     *
     * It stops being used the moment the server's own order agrees, or the set
     * of stays changes underneath — worked out during render, so it never
     * becomes a second source of truth.
     */
    const [pendingOrder, setPendingOrder] = useState<number[] | null>(null);
    const rankedRows = useMemo(() => {
        const byId = new Map(ranking.map((r) => [r.id, r]));
        const usable = pendingOrder
            && pendingOrder.length === ranking.length
            && pendingOrder.every((id) => byId.has(id))
            && pendingOrder.join(',') !== ranking.map((r) => r.id).join(',');
        if (!usable || !pendingOrder) return ranking;
        return pendingOrder.map((id) => byId.get(id)).filter((r): r is Place => r != null);
    }, [ranking, pendingOrder]);

    /**
     * Save a new ranking.
     *
     * Every row is written, not just the two that moved: the first drag on an
     * unranked shortlist has to give everything a number, or you end up with one
     * ranked stay and a tail of nulls that sorts arbitrarily.
     */
    const applyRanking = (ids: number[]) => {
        setPendingOrder(ids);
        return api.rankPlaces(ids);
    };

    /**
     * The number to draw inside each pin, while ranking.
     *
     * Only in that view: in the card view the rank is on the card, and putting
     * digits in every circle would be noise on a map whose job there is "where
     * is this one".
     */
    const pinLabels = useMemo(() => {
        if (view !== 'ranking') return undefined;
        return new Map(rankedRows.map((stay, index) => [stay.id, String(index + 1)]));
    }, [view, rankedRows]);

    const clearRanking = async () => {
        const ranked = stays.filter((s) => s.rank != null);
        if (!ranked.length) return;
        if (!confirm(`Clear the ranking on ${ranked.length} stay(s)?`)) return;
        await api.update('places', { ids: ranked.map((s) => s.id), rank: null });
    };

    /**
     * What the map draws: the stays that have somewhere to be drawn.
     *
     * Deliberately every pinned stay rather than only the filtered ones — the
     * map is there to answer "where are these, relative to each other", and a
     * map that empties out when you tick 👍 Interested cannot. The filter's job
     * is the list; the map highlights rather than hides.
     */
    const mapped = useMemo(() => stays.filter(hasCoords), [stays]);

    /**
     * Frame all the stays — on arrival, and whenever the set of them changes.
     *
     * Keyed on the ids rather than a count, so locating one stay and deleting
     * another in the same breath still re-frames. Not on every data change: the
     * viewport is yours once you have panned it, and re-fitting on each
     * keystroke in a notes field would be unusable.
     */
    const mappedKey = mapped.map((s) => s.id).join(',');
    const [fitSignal, setFitSignal] = useState(0);
    useEffect(() => {
        setFitSignal((n) => n + 1);
    }, [mappedKey]);

    /** Clicking a photo points the map at that stay; clicking it again lets go. */
    const pickFromList = (stay: Place) => setPicked((prev) => (
        prev?.id === stay.id ? null : { id: stay.id, from: 'list' }
    ));

    /**
     * Clicking a pin brings its card to you.
     *
     * If the current filter hides that stay there would be no card to scroll
     * to, so the filter gives way: you asked for that one specifically, and
     * silently doing nothing is the worst of the three options.
     */
    const pickFromMap = (id: number) => {
        if (!stays.some((s) => s.id === id)) return;
        if (!shown.some((s) => s.id === id)) setFilter('all');
        setPicked({ id, from: 'map' });
    };

    // Scroll to the card a map click chose, once there is a card to scroll to.
    useEffect(() => {
        if (!picked || picked.from !== 'map') return;
        cardRefs.current.get(picked.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [picked, shown]);

    const counts = useMemo(() => ({
        all: stays.length,
        yes: stays.filter((s) => s.rating === 'yes').length,
        mid: stays.filter((s) => s.rating === 'mid').length,
        no: stays.filter((s) => s.rating === 'no').length,
        unrated: stays.filter((s) => s.rating == null).length,
        removed: removed.length,
    }), [stays, removed]);

    interface Meta {
        title?: string;
        image?: string;
        address?: string;
        lat?: number | null;
        lng?: number | null;
    }

    /**
     * Ask the server for a listing's preview data.
     * Returns nothing rather than throwing — a missing photo must never stop a
     * link being saved.
     */
    const previewOf = async (url: string): Promise<Meta> => {
        try {
            const res = await fetch('/api/admin/fetch-meta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });
            if (!res.ok) return {};
            const body = await res.json();
            return {
                title: body.title || undefined,
                image: body.image || undefined,
                address: body.address || undefined,
                lat: typeof body.lat === 'number' ? body.lat : null,
                lng: typeof body.lng === 'number' ? body.lng : null,
            };
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
                    address: meta.address ?? '',
                    // The listing's own coordinates, so a pasted link is on the
                    // map immediately rather than after a round of geocoding.
                    ...(meta.lat != null && meta.lng != null
                        ? { lat: meta.lat, lng: meta.lng, needs_review: false }
                        : {}),
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

    /**
     * Stays whose listing could tell us where they are, and hasn't been asked.
     *
     * Every stay saved before the listing's address was read is in here — which
     * is why this is a button rather than something that only happens to new
     * links: the shortlist you already have is the one you want on the map.
     */
    const missingLocation = useMemo(
        () => stays.filter((s) => s.links.length > 0 && (!hasCoords(s) || !s.address)),
        [stays],
    );

    /**
     * Read the address and coordinates off each listing.
     *
     * Booking.com publishes both: a JSON-LD `Hotel` block with a full postal
     * address, and the map centre it drops its own pin on. A stay that gets
     * coordinates is marked reviewed — it is the listing's own location, not a
     * geocoder's guess at a name, so it belongs on the map straight away rather
     * than behind the map's unconfirmed filter.
     */
    const fetchMissingLocations = async () => {
        setLocating(missingLocation.length);
        let found = 0;
        try {
            for (const stay of missingLocation) {
                const url = stay.links.find((l) => isStayUrl(l.url))?.url ?? stay.links[0]?.url;
                if (!url) { setLocating((n) => n - 1); continue; }
                const meta = await previewOf(url);
                const fields: Record<string, unknown> = {};
                if (meta.address && !stay.address) fields.address = meta.address;
                if (meta.lat != null && meta.lng != null && !hasCoords(stay)) {
                    fields.lat = meta.lat;
                    fields.lng = meta.lng;
                    fields.needs_review = false;
                }
                if (Object.keys(fields).length) {
                    await api.update('places', { id: stay.id, ...fields });
                    found += 1;
                }
                setLocating((n) => n - 1);
            }
            setLocated(found);
        } finally {
            setLocating(0);
        }
    };

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
        <>
        {/* Two columns for the whole tab, not just the list: the map has to fit
            inside the window. Put it beside only the cards and it starts halfway
            down the page, runs off the bottom, and a pin down there eats the
            click that should have selected it. */}
        <div ref={splitRef} className="flex flex-col xl:flex-row gap-3 items-stretch">
        {/* A container, not a media query: with a draggable divider the cards
            have to answer to the width of *this column*, not the window's — the
            same 1600px screen holds one column of cards or three depending on
            where you put the divider. */}
        <div className="@container/stays min-w-0 xl:flex-1 space-y-3">
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
                {/* The pills step aside in the ranking view: see `ranking`. */}
                {view === 'cards' && ([
                    ['all', `All ${counts.all}`],
                    ['yes', `👍 Interested ${counts.yes}`],
                    ['mid', `😐 Mid tier ${counts.mid}`],
                    ['no', `👎 Not interested ${counts.no}`],
                    ['unrated', `Unrated ${counts.unrated}`],
                    // Only once there is something in it: a bucket that is
                    // always empty is a button that does nothing, and it would
                    // sit there on every trip that never removes a stay.
                    ...(counts.removed ? [['removed', `🗑 Removed ${counts.removed}`] as const] : []),
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
                <ViewToggle view={view} onChange={chooseView} />
                {/* No sort control in the ranking view: the order *is* the
                    ranking, and offering to sort it by price would either lie or
                    make the next drag write nonsense. */}
                {view === 'cards' && (
                    <MiniSelect
                        value={sort}
                        onChange={(e) => chooseSort(e.target.value as SortKey)}
                        aria-label="Sort the shortlist"
                        title="How the shortlist is ordered"
                    >
                        {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </MiniSelect>
                )}
                {view === 'ranking' && stays.some((st) => st.rank != null) && (
                    <Button onClick={clearRanking}>Clear ranking</Button>
                )}
                {missingLocation.length > 0 && (
                    <Button
                        onClick={fetchMissingLocations}
                        disabled={locating > 0}
                        title="Read the address and map pin off each booking link, so these stays show on the map"
                    >
                        {locating > 0
                            ? `Looking up… ${locating} left`
                            : `Get locations for ${missingLocation.length}`}
                    </Button>
                )}
                {missingImages.length > 0 && (
                    <Button onClick={fetchMissingImages} disabled={fetching > 0}>
                        {fetching > 0
                            ? `Fetching… ${fetching} left`
                            : `Get photos for ${missingImages.length}`}
                    </Button>
                )}
            </div>

            {located != null && locating === 0 && (
                <p className="text-[11px] text-gray-500 px-1">
                    {located > 0
                        ? `Found a location for ${located} stay${located === 1 ? '' : 's'}. `
                            + 'They are on the map now.'
                        : 'No new locations found — those listings did not publish one. '
                            + 'Open a stay and use Find to pin it by hand.'}
                </p>
            )}

            {/* ---- Ranking ---- */}
            {view === 'ranking' ? (
                <RankingList
                    stays={rankedRows}
                    pickedId={picked?.id ?? null}
                    onPick={pickFromList}
                    onReorder={applyRanking}
                    cardRefs={cardRefs}
                />
            ) : shown.length === 0 ? (
                <Card>
                    <EmptyState
                        title={stays.length ? 'Nothing matches that filter' : 'No places to stay yet'}
                        hint={stays.length
                            ? 'Try All.'
                            : 'Paste a Booking.com link above to start a shortlist.'}
                    />
                </Card>
            ) : (
                <div className="grid grid-cols-1 @2xl/stays:grid-cols-2 @5xl/stays:grid-cols-3
                    gap-3 items-start">
                    {shown.map((stay) => {
                        const link = stayLink(stay);
                        const active = picked?.id === stay.id;
                        return (
                            <div
                                key={stay.id}
                                // The ring lives on a wrapper: Card owns its own
                                // border colour, and two same-specificity border
                                // classes leave the winner up to emission order.
                                ref={(node) => {
                                    if (node) cardRefs.current.set(stay.id, node);
                                    else cardRefs.current.delete(stay.id);
                                }}
                                className={`rounded-2xl transition
                                    ${active ? 'ring-2 ring-accent' : ''}`}
                            >
                            <Card className="overflow-hidden">
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
                                        title={hasCoords(stay)
                                            ? `Show ${stay.name} on the map`
                                            : `${stay.name} has no location yet`}
                                        // The photo points the map at this stay.
                                        // It used to open the listing preview;
                                        // that is what the Preview button below
                                        // is for, and pointing at the map is the
                                        // thing you do far more often.
                                        className="w-full h-40 object-cover bg-gray-100 cursor-pointer"
                                        onClick={() => pickFromList(stay)}
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                    />
                                )}
                                <div className="p-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline gap-1.5">
                                            {stay.rank != null && (
                                                <span
                                                    className="shrink-0 text-[11px] font-bold text-accent
                                                        tabular-nums"
                                                    title={`Ranked #${stay.rank} in your shortlist`}
                                                >
                                                    #{stay.rank}
                                                </span>
                                            )}
                                            <InlineText
                                                value={stay.name}
                                                className="font-semibold text-gray-900 -ml-2"
                                                onCommit={(name) => api.update('places', {
                                                    id: stay.id, name,
                                                })}
                                            />
                                        </div>
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
                                        {/* Where it is, and whether the map knows.
                                            "no pin" is the honest state of a stay
                                            that will not appear on the map yet. */}
                                        {!stay.image_url && hasCoords(stay) && (
                                            <button
                                                onClick={() => pickFromList(stay)}
                                                className="text-[11px] text-accent hover:underline px-2"
                                            >
                                                {active ? '◉ On the map' : '◎ Show on the map'}
                                            </button>
                                        )}
                                        {(stay.address || !hasCoords(stay)) && (
                                            <div className="flex items-center gap-1.5 flex-wrap px-2">
                                                {stay.address && (
                                                    <span className="text-[11px] text-gray-400 truncate">
                                                        📍 {stay.address}
                                                    </span>
                                                )}
                                                {!hasCoords(stay) && (
                                                    <span className="text-[10px] text-sky-700 bg-sky-50
                                                        rounded-full px-1.5 py-0.5 shrink-0">
                                                        no pin
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        {/*
                                          Which area it is in — Ubud, Seminyak, Canggu.
                                          It sits with the address and the pin because it
                                          answers the same question, and a stay's area is
                                          the thing you sort a shortlist by in your head
                                          long before you care what it costs.

                                          The same regions the rest of the portal uses, so
                                          one added here shows up on the map's filter and
                                          gets its own write-up on the Guide tab. Editing
                                          it inline rather than through the place editor is
                                          the point: tagging six hotels should not be six
                                          trips through a modal.
                                        */}
                                        <div className="mt-1.5 px-2">
                                            <CustomisableSelect
                                                compact
                                                label={`Area for ${stay.name}`}
                                                value={stay.region_id != null ? String(stay.region_id) : ''}
                                                placeholder="Ubud, Seminyak, Canggu…"
                                                options={[
                                                    { key: '', label: '— area not set —' },
                                                    ...(data?.regions ?? []).map((r) => ({
                                                        key: String(r.id),
                                                        label: r.name,
                                                    })),
                                                ]}
                                                onChange={(next) => api.update('places', {
                                                    id: stay.id,
                                                    region_id: next === '' ? null : Number(next),
                                                })}
                                                onCreate={async (typed) => {
                                                    // A region is a real row, so it must
                                                    // exist before it can be selected.
                                                    // Match an existing name rather than
                                                    // creating a near-duplicate.
                                                    const existing = (data?.regions ?? []).find(
                                                        (r) => r.name.toLowerCase() === typed.toLowerCase(),
                                                    );
                                                    if (existing) return String(existing.id);
                                                    const created = await api.createRegion(
                                                        typed, data?.trip.focus_country || '',
                                                    );
                                                    return created == null ? null : String(created);
                                                }}
                                                onManage={() => setManagingRegions(true)}
                                            />
                                        </div>
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
                                            /*
                                             * Removing is the ordinary action and deleting
                                             * is not offered here at all. You ruled a hotel
                                             * out for a reason, and "why did we say no to
                                             * that one?" comes back a fortnight later — so
                                             * the default keeps it. Permanent deletion lives
                                             * in the Removed bucket, one deliberate step
                                             * further on.
                                             */
                                            stay.archived
                                                ? {
                                                    label: 'Put back on the shortlist',
                                                    onClick: () => api.update('places', {
                                                        id: stay.id, archived: false,
                                                    }),
                                                }
                                                : {
                                                    label: 'Remove from the shortlist',
                                                    onClick: () => api.update('places', {
                                                        id: stay.id, archived: true,
                                                    }),
                                                },
                                            ...(stay.archived ? [{
                                                label: 'Delete for good',
                                                danger: true,
                                                onClick: () => api.removePlaces([stay]),
                                            }] : []),
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
                            </div>
                        );
                    })}
                </div>
            )}
            </div>

            {/* ---- The map ---- */}
            {/* Sticky, so the list scrolls past a map that stays put: the whole
                point is comparing a card against where it is. Below xl it drops
                under the list rather than squeezing both into half a screen. */}
            {wide && (
                <ColumnDivider
                    label="Resize the map"
                    onDrag={resizeMap}
                />
            )}

            <aside
                style={wide ? { width: mapWidth } : undefined}
                className="xl:shrink-0 xl:sticky xl:top-0 self-start"
            >
                <div className="h-[22rem] xl:h-[calc(100vh-15rem)] min-h-[18rem]">
                    {mapped.length === 0 ? (
                        <Card className="h-full flex items-center justify-center">
                            <EmptyState
                                title="No stays on the map yet"
                                hint={stays.length
                                    ? 'Press "Get locations" above and the shortlist puts itself on '
                                        + 'the map.'
                                    : 'Paste a booking link and its location comes with it.'}
                            />
                        </Card>
                    ) : (
                        <TripMap
                            places={mapped}
                            selectedId={picked?.id ?? null}
                            onSelect={pickFromMap}
                            fitSignal={fitSignal}
                            // A shortlist is small and every pin has to stay
                            // clickable: a "5" badge over Canggu would hide the
                            // one you just clicked a photo to find.
                            cluster={false}
                            panToSelected
                            pinLabels={pinLabels}
                            className="h-full w-full border border-gray-100 shadow-sm"
                        />
                    )}
                </div>
                <p className="text-[11px] text-gray-400 px-1 pt-1.5">
                    {mapped.length} of {stays.length} on the map
                    {mapped.length > 0 && ' · click a pin to jump to its card'}
                </p>
            </aside>
        </div>

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

            {/* Renaming an area keeps every place filed under it; deleting one
                leaves the places and clears their area. The counts include
                everything in the region, not just stays, because that is what
                the delete actually affects. */}
            <ManageListModal
                open={managingRegions}
                onClose={() => setManagingRegions(false)}
                title="Edit areas"
                hint="Renaming keeps every place in it. Deleting leaves the places but clears their area."
                items={(data?.regions ?? []).map((r) => {
                    const used = (data?.places ?? []).filter((p) => p.region_id === r.id).length;
                    return {
                        id: r.id,
                        label: r.name,
                        detail: used ? `${used} place${used === 1 ? '' : 's'}` : 'unused',
                        warn: used
                            ? `Delete "${r.name}"? ${used} place(s) stay but lose their area.`
                            : `Delete "${r.name}"?`,
                    };
                })}
                onRename={(id, name) => api.update('regions', { id, name })}
                onDelete={(id) => api.remove('regions', id)}
            />
        </>
    );
}

/** Cards to compare stays, ranking to put them in order. */
function ViewToggle({ view, onChange }: { view: View; onChange: (view: View) => void }) {
    const options: { key: View; label: string }[] = [
        { key: 'cards', label: '▦ Cards' },
        { key: 'ranking', label: '① Ranking' },
    ];
    return (
        <div className="shrink-0 inline-flex rounded-full border border-gray-200 bg-white p-0.5">
            {options.map((opt) => (
                <button
                    key={opt.key}
                    onClick={() => onChange(opt.key)}
                    aria-pressed={view === opt.key}
                    className={`rounded-full px-3 py-1 text-sm font-medium transition
                        ${view === opt.key ? 'bg-accent text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}

/**
 * The shortlist as an ordered list you can drag.
 *
 * One column of thin rows rather than the card grid: ordering things is a job
 * for a list, and dragging inside a wrapping grid means moving a card three
 * positions to shift it one. The order is optimistic — the rows move under your
 * hand and the ranking is written behind them — because a drag that waits for a
 * round trip before it lands feels broken.
 */
function RankingList({ stays, pickedId, onPick, onReorder, cardRefs }: {
    stays: Place[];
    pickedId: number | null;
    onPick: (stay: Place) => void;
    onReorder: (ids: number[]) => void;
    cardRefs: React.RefObject<Map<number, HTMLElement>>;
}) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        // Touch needs a hold, or the page cannot be scrolled past the list.
        useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    );

    // Already in the order to draw — including the optimistic one mid-save, which
    // the tab owns so the map's pin numbers can read the same list.
    const rows = stays;

    if (!stays.length) {
        return (
            <Card>
                <EmptyState
                    title="Nothing to rank yet"
                    hint="Paste a booking link above, then drag the rows into the order you like them."
                />
            </Card>
        );
    }

    const onDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const ids = rows.map((s) => s.id);
        const from = ids.indexOf(Number(active.id));
        const to = ids.indexOf(Number(over.id));
        if (from < 0 || to < 0) return;
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        onReorder(ids);
    };

    return (
        <Card className="overflow-hidden">
            <p className="text-[11px] text-gray-400 px-3 pt-2.5">
                Drag a row by its ⠿ handle. Every stay is here, whatever the filters say —
                a ranking is the whole shortlist or it is nothing.
            </p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={rows.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                    <ul className="divide-y divide-gray-100 mt-1.5">
                        {rows.map((stay, index) => (
                            <RankRow
                                key={stay.id}
                                stay={stay}
                                position={index + 1}
                                picked={pickedId === stay.id}
                                onPick={() => onPick(stay)}
                                cardRefs={cardRefs}
                            />
                        ))}
                    </ul>
                </SortableContext>
            </DndContext>
        </Card>
    );
}

function RankRow({ stay, position, picked, onPick, cardRefs }: {
    stay: Place;
    position: number;
    picked: boolean;
    onPick: () => void;
    cardRefs: React.RefObject<Map<number, HTMLElement>>;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: stay.id });
    const price = priceValue(stay.price_note);
    const rating = RATINGS.find((r) => r.key === stay.rating);

    return (
        <li
            ref={(node) => {
                setNodeRef(node);
                // Shared with the card view, so a click on the map scrolls to
                // whichever row is showing this stay right now.
                if (node) cardRefs.current?.set(stay.id, node);
                else cardRefs.current?.delete(stay.id);
            }}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            // No vertical padding: the photo is the tallest thing in the row, so
            // with none it defines the row's height and sits flush against both
            // edges. Everything shorter is centred against it.
            className={`flex items-stretch gap-2.5 pr-3 bg-white
                ${isDragging ? 'opacity-60' : ''} ${picked ? 'ring-2 ring-inset ring-accent' : ''}`}
        >
            <button
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500
                    touch-none pl-2 pr-1 shrink-0"
                aria-label={`Drag ${stay.name} to reorder the ranking`}
            >
                ⠿
            </button>
            {/* The position on screen, not the stored rank: mid-drag they differ,
                and the number under your hand has to be the one you are aiming at. */}
            <span className="w-6 shrink-0 self-center text-sm font-bold text-accent tabular-nums
                text-right">
                {position}
            </span>
            {stay.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={stay.image_url}
                    alt={stay.name}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    onClick={onPick}
                    title={`Show ${stay.name} on the map`}
                    // Twice the width at the same 96px height, so the photo is
                    // the biggest thing it can be without making every row
                    // taller. That is a 3:1 window onto a 3:2 photo, so
                    // object-cover keeps the middle band and crops the sky and
                    // the floor — the part of a hotel picture worth seeing.
                    //
                    // It steps back to 144px once the list itself is under 42rem
                    // (drag the map wide enough and it gets there): a 288px photo
                    // in a 360px column leaves nothing for the name.
                    // Unrounded because it touches the row's top and bottom, and
                    // a rounded corner there shows a notch of row behind it.
                    className="w-36 @2xl/stays:w-72 h-24 object-cover bg-gray-100 shrink-0
                        cursor-pointer"
                    onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                />
            ) : (
                // Same footprint, so the names line up whether or not a listing
                // gave us a photo.
                <div className="w-36 @2xl/stays:w-72 h-24 bg-gray-50 shrink-0" />
            )}
            <button onClick={onPick} className="min-w-0 flex-1 self-center text-left py-2">
                <div className="text-sm font-medium text-gray-900 truncate">{stay.name}</div>
                {/* The price is the right-hand column, where it lines up and can
                    be compared down the list; repeating it here would just be
                    the same number twice. */}
                <div className="text-[11px] text-gray-400 truncate">
                    {stay.address || 'no address yet'}
                    {!hasCoords(stay) ? ' · no pin' : ''}
                </div>
            </button>
            {rating && (
                <span
                    className="shrink-0 self-center text-[11px] font-medium"
                    style={{ color: rating.color }}
                    title={rating.label}
                >
                    {rating.icon}
                </span>
            )}
            {stay.status !== 'idea' && (
                <span className="shrink-0 self-center"><StatusChip status={stay.status} /></span>
            )}
            <span className="shrink-0 self-center text-xs text-gray-500 tabular-nums w-20
                text-right">
                {price != null ? stay.price_note : '—'}
            </span>
        </li>
    );
}
