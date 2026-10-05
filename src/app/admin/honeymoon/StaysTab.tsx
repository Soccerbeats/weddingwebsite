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
    RATINGS, STATUSES, byRank, cleanListingTitle, hasCoords, isStayUrl, nameFromStayUrl, nightlyRate,
    stayUrlsFromText,
    type Place, type PlaceStatus,
} from '@/lib/honeymoon';
import { priceText } from '@/lib/honeymoonPlaceSheet';
import type { HoneymoonApi } from './useHoneymoon';
import { usePlaceSheet } from './PlaceSheetContext';
import CompareTable from './CompareTable';
import PriceWatch from './PriceWatch';
import LinkPreview from './LinkPreview';
import RateQueue from './RateQueue';
import {
    BulkFieldMenu, Button, Card, ColumnDivider, EmptyState, MiniSelect, OverflowMenu, SelectField, StatusChip,
    TextArea,
} from './ui';
import { FilterButton, FilterField } from './kit/FilterButton';
import { PlaceCard } from './kit/PlaceCard';
import { Segmented } from './kit/Segmented';
import { Sheet } from './kit/Sheet';
import { TabToolbar } from './kit/TabToolbar';

// Leaflet reaches for `window` on import, so the map is never in the server
// bundle. Same treatment as the map tab.
const TripMap = dynamic(() => import('./TripMap'), {
    ssr: false,
    loading: () => <div className="h-full w-full bg-gray-100 animate-pulse rounded-2xl" />,
});

type SortKey = 'rank' | 'added' | 'price' | 'name' | 'status';

/** Cards to compare them, ranking to put them in order. */
type View = 'cards' | 'ranking' | 'compare';

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
export default function StaysTab({ api, segmentSwitch }: {
    api: HoneymoonApi;
    segmentSwitch?: React.ReactNode;
}) {
    const { data } = api;
    /** What a price with no currency of its own is in. */
    const home = data?.trip.home_currency || 'USD';
    const [bulk, setBulk] = useState('');
    const [adding, setAdding] = useState(false);
    const [fetching, setFetching] = useState(0);
    /** How many listings are still to look up, and what the last run found. */
    const [locating, setLocating] = useState(0);
    const [located, setLocated] = useState<number | null>(null);
    const [filter, setFilter] = useState<'all' | 'yes' | 'mid' | 'no' | 'unrated' | 'removed'>('all');
    /** '' = every area, 'none' = the ones with no area set, otherwise a region id. */
    const [area, setArea] = useState<string>('');
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
        if (saved === 'ranking' || saved === 'cards' || saved === 'compare') setView(saved);
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
    const [triaging, setTriaging] = useState(false);
    /*
     * Multi-select, for the same reason the Places tab has it: which verbs you
     * get should not depend on which tab you happened to be looking at when you
     * decided to restatus six villas.
     */
    const [selected, setSelected] = useState<Set<number>>(new Set());
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
    const { openPlace } = usePlaceSheet();
    /** The paste box and the price watch, behind toolbar buttons. */
    const [pasting, setPasting] = useState(false);
    const [watching, setWatching] = useState(false);

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
            // Area first: it composes with the rating pills rather than replacing
            // them, so "Interested, in Ubud" is a question you can ask.
            if (area === 'none' && s.region_id != null) return false;
            if (area && area !== 'none' && String(s.region_id ?? '') !== area) return false;
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
                    const pa = nightlyRate(a);
                    const pb = nightlyRate(b);
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
    }, [stays, removed, filter, sort, area]);

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

    /**
     * The areas worth offering, with their counts.
     *
     * Only the ones that actually hold a stay in the list you are looking at —
     * the same rule the map's type dropdown follows. Offering all 224 regions
     * when six of them have a hotel in makes the control useless, and an option
     * that can only ever return nothing is a trap.
     *
     * The currently-selected area is kept even if it empties out, or choosing one
     * and then removing its last stay would leave the control showing a value it
     * no longer lists.
     */
    const areaOptions = useMemo(() => {
        const source = filter === 'removed' ? removed : stays;
        const byId = new Map<string, number>();
        let unset = 0;
        for (const s of source) {
            if (s.region_id == null) { unset += 1; continue; }
            const key = String(s.region_id);
            byId.set(key, (byId.get(key) ?? 0) + 1);
        }
        if (area && area !== 'none' && !byId.has(area)) byId.set(area, 0);
        const named = [...byId.entries()]
            .map(([key, n]) => ({
                key,
                label: `${api.regionById.get(Number(key)) ?? 'Unknown area'} ${n}`,
            }))
            .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
        return [
            { key: '', label: 'All areas' },
            ...named,
            ...(unset || area === 'none' ? [{ key: 'none', label: `No area set ${unset}` }] : []),
        ];
    }, [stays, removed, filter, area, api.regionById]);

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
        /** The JSON-LD extras: the chips that make a card worth reading. */
        starRating?: number | null;
        priceRange?: string;
        amenities?: string[];
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
                starRating: typeof body.starRating === 'number' ? body.starRating : null,
                priceRange: body.priceRange || undefined,
                amenities: Array.isArray(body.amenities) ? body.amenities : undefined,
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
            // Removed stays count too: pasting one's link again should not
            // create a second copy beside the one in the Removed bucket.
            const existing = new Set(
                [...stays, ...removed].flatMap((s) => s.links.map((l) => l.url)),
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
                    star_rating: meta.starRating ?? '',
                    price_range: meta.priceRange ?? '',
                    amenities: meta.amenities ?? [],
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
                if (meta.starRating != null && stay.star_rating == null) {
                    fields.star_rating = meta.starRating;
                }
                if (meta.priceRange && !stay.price_range) fields.price_range = meta.priceRange;
                if (meta.amenities?.length && !stay.amenities.length) {
                    fields.amenities = meta.amenities;
                }
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
        <TabToolbar
            left={(
                <>
                    {segmentSwitch}
                    {view === 'cards' && (
                        <Segmented
                            ariaLabel="Show which stays"
                            size="sm"
                            value={filter}
                            onChange={setFilter}
                            options={[
                                { key: 'all', label: 'All', count: counts.all },
                                { key: 'yes', label: '👍', count: counts.yes, title: 'Interested' },
                                { key: 'mid', label: '😐', count: counts.mid, title: 'Mid tier' },
                                { key: 'no', label: '👎', count: counts.no, title: 'Not interested' },
                                { key: 'unrated', label: 'Unrated', count: counts.unrated },
                                ...(counts.removed ? [{ key: 'removed' as const, label: '🗑', count: counts.removed, title: 'Removed' }] : []),
                            ]}
                        />
                    )}
                </>
            )}
            right={(
                <>
                    <Segmented
                        ariaLabel="Stays view"
                        size="sm"
                        value={view}
                        onChange={chooseView}
                        options={[
                            { key: 'cards', label: '▦ Cards' },
                            { key: 'ranking', label: '① Ranking' },
                            { key: 'compare', label: '⊞ Compare' },
                        ]}
                    />
                    {view === 'cards' && areaOptions.length > 2 && (
                        <FilterButton
                            active={area ? [{
                                key: 'area',
                                label: areaOptions.find((o) => o.key === area)?.label ?? 'Area',
                                clear: () => setArea(''),
                            }] : []}
                            onReset={() => setArea('')}
                        >
                            <FilterField label="Area">
                                <SelectField value={area} onChange={(e) => setArea(e.target.value)}>
                                    {areaOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                                </SelectField>
                            </FilterField>
                        </FilterButton>
                    )}
                    {view === 'cards' && (
                        <MiniSelect
                            value={sort}
                            onChange={(e) => chooseSort(e.target.value as SortKey)}
                            aria-label="Sort the shortlist"
                        >
                            {SORTS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                        </MiniSelect>
                    )}
                    <Button tone="primary" onClick={() => setPasting(true)}>+ Add stays</Button>
                    <OverflowMenu items={[
                        ...(stays.length > 0 ? [{ label: 'Watch the prices…', onClick: () => setWatching(true) }] : []),
                        ...(counts.unrated > 0 ? [{ label: `⚡ Rate ${counts.unrated} unrated`, onClick: () => setTriaging(true) }] : []),
                        ...(missingLocation.length > 0 && locating === 0 ? [{
                            label: `Get locations for ${missingLocation.length}`, onClick: fetchMissingLocations,
                        }] : []),
                        ...(missingImages.length > 0 && fetching === 0 ? [{
                            label: `Get photos for ${missingImages.length}`, onClick: fetchMissingImages,
                        }] : []),
                        ...(view === 'ranking' && stays.some((st) => st.rank != null)
                            ? [{ label: 'Clear the ranking', onClick: clearRanking }] : []),
                    ]} />
                </>
            )}
            below={(locating > 0 || fetching > 0 || (located != null && locating === 0) || (area && view === 'cards')) ? (
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                    {locating > 0 && <span>Looking up locations… {locating} left</span>}
                    {fetching > 0 && <span>Fetching photos… {fetching} left</span>}
                    {located != null && locating === 0 && (
                        <span>
                            {located > 0
                                ? `Found a location for ${located} stay${located === 1 ? '' : 's'}. They are on the map now.`
                                : 'No new locations found — open a stay and use Find to pin it by hand.'}
                        </span>
                    )}
                </div>
            ) : undefined}
        />

        <div ref={splitRef} className="flex flex-col xl:flex-row gap-3 items-stretch">
        {/* A container, not a media query: with a draggable divider the cards
            have to answer to the width of *this column*, not the window's — the
            same 1600px screen holds one column of cards or three depending on
            where you put the divider. */}
        <div className="@container/stays min-w-0 xl:flex-1 space-y-3">
            {selected.size > 0 && (
                <Card className="sticky top-2 z-10 flex flex-wrap items-center gap-2 p-3">
                    <span className="text-sm font-medium text-gray-700">
                        {selected.size} selected
                    </span>
                    <div className="flex-1" />
                    <BulkFieldMenu
                        fields={[
                            {
                                key: 'status',
                                label: 'Status',
                                options: STATUSES.map((entry) => ({
                                    value: entry.key, label: entry.label,
                                })),
                            },
                            {
                                key: 'rating',
                                label: 'Rating',
                                options: [
                                    ...RATINGS.map((entry) => ({
                                        value: entry.key, label: `${entry.icon} ${entry.label}`,
                                    })),
                                    { value: '', label: '— unrated —' },
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

            {/* ---- Ranking / compare / cards ---- */}
            {view === 'compare' ? (
                <Card className="p-3">
                    <CompareTable api={api} stays={shown} onPick={(place) => setPreview(place)} />
                </Card>
            ) : view === 'ranking' ? (
                <RankingList
                    stays={rankedRows}
                    currency={home}
                    pickedId={picked?.id ?? null}
                    onPick={pickFromList}
                    onReorder={applyRanking}
                    cardRefs={cardRefs}
                />
            ) : shown.length === 0 ? (
                <Card>
                    <EmptyState
                        title={stays.length || removed.length
                            ? 'Nothing matches that filter'
                            : 'No places to stay yet'}
                        // Name the filter that is actually hiding things, rather
                        // than saying "try All" when the area is the culprit.
                        hint={stays.length || removed.length
                            ? (area
                                ? 'No stays in that area with those ratings — try All areas.'
                                : 'Try All.')
                            : 'Paste a Booking.com link above to start a shortlist.'}
                    />
                </Card>
            ) : (
                <div className="grid grid-cols-1 @2xl/stays:grid-cols-2 @5xl/stays:grid-cols-3
                    gap-3 items-start">
                    {shown.map((stay) => (
                        <PlaceCard
                            key={stay.id}
                            place={stay}
                            active={picked?.id === stay.id}
                            selected={selected.has(stay.id)}
                            onToggleSelect={() => setSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(stay.id)) next.delete(stay.id); else next.add(stay.id);
                                return next;
                            })}
                            onShowOnMap={() => pickFromList(stay)}
                            cardRef={(node) => {
                                if (node) cardRefs.current.set(stay.id, node);
                                else cardRefs.current.delete(stay.id);
                            }}
                            menu={[
                                { label: 'Open', onClick: () => openPlace(stay.id) },
                                ...(stayLink(stay) ? [{ label: 'Preview the listing', onClick: () => setPreview(stay) }] : []),
                                // Removing is the ordinary action; deleting for good
                                // lives one deliberate step further on, in Removed.
                                stay.archived
                                    ? { label: 'Put back on the shortlist', onClick: () => api.patchPlace(stay.id, { archived: false }) }
                                    : { label: 'Remove from the shortlist', onClick: () => api.patchPlace(stay.id, { archived: true }) },
                                ...(stay.archived ? [{
                                    label: 'Delete for good', danger: true, onClick: () => api.removePlaces([stay]),
                                }] : []),
                            ]}
                        />
                    ))}
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
                    onRate={(rating) => api.patchPlace(preview.id, { rating })}
                />
            )}

            <RateQueue
                api={api}
                open={triaging}
                onClose={() => setTriaging(false)}
                title="Rate the stays"
                filter={(place) => place.category === 'stay' && !place.is_excursion}
            />

            <Sheet
                open={pasting}
                onClose={() => setPasting(false)}
                side="center"
                title={<h2 className="font-semibold text-gray-900">Add stays from links</h2>}
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
                        placeholder="https://www.booking.com/hotel/id/…  — one per line, or several at once"
                    />
                    <p className="text-[11px] text-gray-400">
                        The name, photo, address and pin are read from each listing; price and notes are yours.
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

            <Sheet
                open={watching}
                onClose={() => setWatching(false)}
                side="center"
                width="lg"
                title={<h2 className="font-semibold text-gray-900">Watch the prices</h2>}
            >
                <PriceWatch api={api} />
            </Sheet>
        </>
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
function RankingList({ stays, currency, pickedId, onPick, onReorder, cardRefs }: {
    stays: Place[];
    /** The trip's own currency, for any stay that does not name one. */
    currency: string;
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
                                currency={currency}
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

function RankRow({ stay, currency, position, picked, onPick, cardRefs }: {
    currency: string;
    stay: Place;
    position: number;
    picked: boolean;
    onPick: () => void;
    cardRefs: React.RefObject<Map<number, HTMLElement>>;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: stay.id });
    const price = nightlyRate(stay);
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
                {price != null ? priceText(stay, currency) : '—'}
            </span>
        </li>
    );
}
