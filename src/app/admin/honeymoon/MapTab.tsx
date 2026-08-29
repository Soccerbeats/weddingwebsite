'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
    STATUSES, categoriesOf, categoryMeta, countriesInUse, dayColor, effectiveCountry, formatDayDate,
    hasCoords, legEnds, reviewToggleFor, sourceLabel, sourcesOf, travelModeMeta,
    type Day, type Place, type PlaceStatus,
} from '@/lib/honeymoon';
import { useTripIntel } from './useTripIntel';
import { useLocalPref } from './useLocalPref';
import { MAP_LAYERS, type MapLayerKey } from './TripMap';
import type { HoneymoonApi } from './useHoneymoon';
import ItineraryTab from './ItineraryTab';
import PlacesTab from './PlacesTab';
import PlaceEditor from './PlaceEditor';
import {
    BulkFieldMenu, Button, CategoryChip, ColumnDivider, EmptyState, MiniSelect, SelectField,
    StatusChip,
} from './ui';

// Leaflet must never be part of the server bundle — it reaches for `window` on
// import. This is the only place the map is loaded.
const TripMap = dynamic(() => import('./TripMap'), {
    ssr: false,
    loading: () => <div className="h-full w-full bg-gray-100 animate-pulse rounded-2xl" />,
});

const SPLIT_KEY = 'honeymoon.map.split';
const WIDTHS_KEY = 'honeymoon.map.splitWidths';

/** Narrowest a side column may be dragged, and the width the map keeps. */
const MIN_PANEL = 240;
const MIN_MAP = 320;
/** Side columns only exist from lg up — below that the map takes the screen. */
const WIDE_QUERY = '(min-width: 1024px)';

/**
 * Full-height map view.
 *
 * The map fills every pixel the shell gives it and nothing on this tab scrolls;
 * the filter row is fixed above it and everything else floats over the map
 * rather than stealing height from it: the legend bottom-left, the itinerary
 * top-left, and the tools top-right — fit, split, add, measure and lasso, with
 * whatever the armed tool needs stacked underneath them in the same column.
 *
 * There is no separate boundary tool. Drawing a region's outline and lassoing
 * the pins inside it are the same gesture, so the lasso hands its loop back and
 * saving it as an area is one control in the lasso's own menu.
 *
 * Split view (the ⊞ button) puts the itinerary down the left and the place
 * library down the right, each a single column, with the map still holding the
 * middle. It is the three tabs at once for the planning you can only do with all
 * three in view — dragging a place onto a day while watching where it actually
 * is. Both dividers drag, so any one of the three can be given the room.
 */
export default function MapTab({ api }: { api: HoneymoonApi }) {
    const { data } = api;
    /*
     * Road geometry for the ground legs.
     *
     * Shares the itinerary's cache — the same coordinate pair asked for twice is
     * one request and, after the first time, no request at all.
     */
    const intel = useTripIntel(data);
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

    /*
     * Base map, pin colouring and the tools.
     *
     * The layer and the colouring are remembered per browser — they are how you
     * like to read a map, not facts about the trip. The tools are not: measuring
     * or lassoing is a thing you are doing right now, and coming back to a map
     * that eats your clicks would be baffling.
     */
    const [layer, setLayer] = useLocalPref<MapLayerKey>('hm-map-layer', 'streets');
    const [colourBy, setColourBy] = useLocalPref<'category' | 'region'>(
        'hm-map-colour', 'category',
    );
    const [tool, setTool] = useState<'none' | 'measure'>('none');

    // Lasso
    const [selectMode, setSelectMode] = useState(false);
    const [lassoed, setLassoed] = useState<Set<number>>(new Set());
    /**
     * The last loop drawn, kept so it can be saved as a region's boundary.
     *
     * There used to be a separate "draw an area" tool that collected vertices
     * click by click. It was a second way to draw the same shape, worse at it —
     * so the lasso now hands back its loop and saving it is one control inside
     * the lasso's own menu.
     */
    const [lassoLoop, setLassoLoop] = useState<{ lat: number; lng: number }[] | null>(null);
    const [boundaryNote, setBoundaryNote] = useState('');
    const [showItinerary, setShowItinerary] = useState(false);
    /**
     * Whether the itinerary overlay is expanded.
     *
     * Starts collapsed every time the overlay is switched on: what you asked for
     * by pressing 🗓 is the *routes on the map*, and a panel that immediately
     * covers the top-left corner of them is in the way of the thing it is
     * describing. The corner keeps a button instead, and opening it is one click
     * whenever you do want to read the stops in order.
     */
    const [routeListOpen, setRouteListOpen] = useState(false);
    // Bumped only on purpose — never by a filter. See TripMap's fit effect.
    const [fitSignal, setFitSignal] = useState(0);
    /**
     * What the next fit should frame: one day's stops, or null for everything.
     *
     * Kept beside the signal rather than inside it because the two say different
     * things — the signal is "re-frame now", this is "on what".
     */
    const [fitPoints, setFitPoints] = useState<{ lat: number; lng: number }[] | null>(null);

    /**
     * Split view, and how wide each side column is.
     *
     * Both are remembered per browser rather than saved with the trip: how you
     * like to lay out a screen is about your screen, and the person planning on
     * a laptop shouldn't reshuffle the desktop's layout. Read after mount — the
     * server has no localStorage, and seeding state from it directly renders one
     * layout on the server and another on the client.
     */
    const [split, setSplit] = useState(false);
    // 400/340: the width at which a stop row shows a full place name rather
    // than truncating it, and a place row fits its chips on two lines.
    const [widths, setWidths] = useState({ left: 400, right: 340 });
    const [wide, setWide] = useState(false);
    const areaRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (localStorage.getItem(SPLIT_KEY) === '1') setSplit(true);
        const saved = localStorage.getItem(WIDTHS_KEY);
        if (!saved) return;
        try {
            const parsed = JSON.parse(saved) as { left?: number; right?: number };
            const left = Number(parsed.left);
            const right = Number(parsed.right);
            if (Number.isFinite(left) && Number.isFinite(right)) {
                setWidths({ left: Math.max(MIN_PANEL, left), right: Math.max(MIN_PANEL, right) });
            }
        } catch { /* a corrupt entry just means the defaults */ }
    }, []);

    // Three columns need a desktop. Below lg the button is gone and the map has
    // the screen to itself, whatever was last saved.
    useEffect(() => {
        const mq = window.matchMedia(WIDE_QUERY);
        const apply = () => setWide(mq.matches);
        apply();
        mq.addEventListener('change', apply);
        return () => mq.removeEventListener('change', apply);
    }, []);

    const showPanels = split && wide;

    const toggleSplit = () => setSplit((on) => {
        localStorage.setItem(SPLIT_KEY, on ? '0' : '1');
        return !on;
    });

    /**
     * Drag one divider.
     *
     * Deltas rather than absolute positions, so the grab point never drifts from
     * the handle, and each column is clamped against the *other* one so the map
     * can always be squeezed down to MIN_MAP but never out of existence.
     */
    const resize = (side: 'left' | 'right', dx: number) => setWidths((prev) => {
        const total = areaRef.current?.clientWidth ?? 1280;
        const other = side === 'left' ? prev.right : prev.left;
        // Two dividers' worth of gutter, so the clamp matches what is on screen.
        const max = Math.max(MIN_PANEL, total - other - MIN_MAP - 24);
        const next = Math.min(max, Math.max(MIN_PANEL, prev[side] + (side === 'left' ? dx : -dx)));
        const merged = { ...prev, [side]: next };
        localStorage.setItem(WIDTHS_KEY, JSON.stringify(merged));
        return merged;
    });

    const places = useMemo(() => data?.places ?? [], [data]);
    const days = useMemo(() => data?.days ?? [], [data]);
    const regions = useMemo(() => data?.regions ?? [], [data]);

    /** The saved country filter — a trip setting, not a session preference. */
    const country = data?.trip.focus_country ?? '';

    // Includes per-place overrides, so a country only a single place claims is
    // still selectable.
    const countries = useMemo(() => countriesInUse(regions, places), [regions, places]);

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
            /*
             * Removed stays are off the map entirely — that is most of the point
             * of removing one. No toggle to bring them back either: the shortlist
             * is where you decide what is still in the running, and a map option
             * to show the rejects would put them back in the way of the decision
             * the map exists to help with.
             *
             * The day-view branch above is deliberately not filtered this way: a
             * place you actually scheduled still draws its route, exactly as an
             * unconfirmed pin does once it is on a day.
             */
            if (p.archived) return false;
            // Additive: off hides the unconfirmed, on shows everything.
            if (!showUnconfirmed && p.needs_review) return false;
            // Exclude only places known to be somewhere *else*. A place whose
            // country is simply unknown — no region, or a region created without
            // one — stays visible: a filter that silently drops unclassified data
            // loses things you can't see to go and fix.
            if (country) {
                const its = effectiveCountry(p, countryOfRegion);
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
        // A new destination frames the whole destination, not the day you were
        // last looking at.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFitPoints(null);
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
            color: dayColor(day.day_number),
            label: `Day ${day.day_number}${day.title ? ` — ${day.title}` : ''}`,
        });
        if (selectedDay) return [forDay(selectedDay)].filter((r) => r.points.length > 0);
        if (!showItinerary) return [];
        return days.map(forDay).filter((r) => r.points.length > 0);
    }, [selectedDay, showItinerary, days, pointsForDay]);

    /**
     * Fly the map to one day, from the itinerary column beside it.
     *
     * Two things happen, because either alone is half an answer: the viewport
     * moves to that day's stops, and — if the routes aren't drawn — the itinerary
     * overlay is switched on, so what you jumped to arrives with its line and
     * numbered order rather than as an anonymous cluster of pins.
     *
     * The other pins stay where they are: this moves the map, it does not filter
     * it. Narrowing to a single day is what the day dropdown is for, and losing
     * the surrounding pins would take away the context that makes "is this stop
     * miles from the others?" answerable at a glance.
     */
    const focusDay = useCallback((day: Day) => {
        const points = pointsForDay(day);
        if (!points.length) return;
        setFitPoints(points.map((p) => ({ lat: p.lat, lng: p.lng })));
        if (dayFilter === '') {
            setShowItinerary(true);
        } else {
            // Already in single-day mode: point that at this day instead. Flying
            // to stops the day filter has taken off the map would land on an
            // empty sea.
            setDayFilter(String(day.id));
        }
        setFitSignal((n) => n + 1);
    }, [pointsForDay, dayFilter]);

    /**
     * Travel legs to draw, from the same days as the routes.
     *
     * A leg only appears once both ends have been looked up — half a leg is a
     * line to nowhere. They follow the itinerary overlay rather than having a
     * toggle of their own: "show me the days" and "show me how I get between
     * them" are one question.
     */
    const legs = useMemo(() => {
        const forDay = (day: Day) => day.travel.flatMap((leg) => {
            const ends = legEnds(leg);
            if (!ends) return [];
            const meta = travelModeMeta(leg.mode);
            const route = [leg.from_text, leg.to_text].filter(Boolean).join(' → ');
            return [{
                id: leg.id,
                from: ends.from,
                to: ends.to,
                color: meta.color,
                dash: meta.dash,
                curve: meta.curve,
                icon: meta.icon,
                // Drawn along the road when a router has answered, which turns
                // a bowed line into "you go round the coast, not over the pass".
                road: intel.roadFor(leg.id),
                label: [
                    meta.label,
                    route,
                    `Day ${day.day_number}`,
                    leg.depart_time ?? '',
                    leg.arrive_day_offset > 0
                        ? `lands +${leg.arrive_day_offset} day${leg.arrive_day_offset === 1 ? '' : 's'}`
                        : '',
                ].filter(Boolean).join(' · '),
            }];
        });
        if (selectedDay) return forDay(selectedDay);
        if (!showItinerary) return [];
        return days.flatMap(forDay);
    }, [selectedDay, showItinerary, days, intel]);

    /**
     * A colour per region, for the "which area is this in" question.
     *
     * Only the fill changes; the icon stays the category's, because a pin whose
     * shape means nothing is a dot. Colours come from a fixed wheel so the same
     * region keeps its colour between visits.
     */
    const pinColors = useMemo(() => {
        if (colourBy !== 'region') return undefined;
        const wheel = [
            '#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2',
            '#65a30d', '#dc2626', '#4f46e5', '#0d9488',
        ];
        const colourOf = new Map<number, string>();
        (data?.regions ?? []).forEach((region, index) => {
            colourOf.set(region.id, wheel[index % wheel.length]);
        });
        const map = new Map<number, string>();
        for (const place of visible) {
            map.set(place.id, place.region_id != null
                ? colourOf.get(place.region_id) ?? '#6b7280'
                : '#9ca3af');
        }
        return map;
    }, [colourBy, data?.regions, visible]);

    /**
     * Save the lassoed loop as a region's boundary.
     *
     * A freehand loop is far denser than a boundary needs to be — a slow drag
     * across Bali is a few hundred points — so it is thinned to at most 120
     * before it is stored. That is well past the resolution anything reads it
     * at: the boundary decides which side of a line a pin falls on, and no pin
     * is placed to the metre.
     */
    const saveBoundary = async (regionId: number) => {
        const loop = lassoLoop;
        if (!loop || loop.length < 3 || !Number.isFinite(regionId)) return;
        const step = Math.ceil(loop.length / 120);
        const thinned = step > 1 ? loop.filter((_, i) => i % step === 0) : loop;
        if (thinned.length < 3) return;
        const ok = await api.update('regions', { id: regionId, boundary: thinned });
        if (!ok) { setBoundaryNote('Could not save that boundary.'); return; }
        setBoundaryNote(
            `Saved as the boundary of ${api.regionById.get(regionId) ?? 'that area'}. `
            + '“Assign regions by location” on the Places tab now files pins into it '
            + 'exactly, instead of guessing by nearest centre.',
        );
        setLassoLoop(null);
    };

    const pinnedCount = visible.filter(hasCoords).length;
    const unpinnedCount = visible.length - pinnedCount;
    /** Pins on screen whose country nobody has set — the ones worth classifying. */
    const unclassified = useMemo(
        () => (country
            ? visible.filter((p) => hasCoords(p) && !effectiveCountry(p, countryOfRegion)).length
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

    /**
     * The day the itinerary column should scroll to.
     *
     * Clicking a pin already answers "where is this?"; the day it belongs to is
     * the other half of the same question, and the column beside the map is
     * where the answer lives. A place on several days scrolls to the first —
     * the day you get there.
     *
     * Carries the click's timestamp so clicking the same pin again scrolls back
     * to its day rather than doing nothing because the id has not changed.
     */
    const [revealDay, setRevealDay] = useState<{ id: number; at: number } | null>(null);
    const selectPlace = useCallback((id: number | null) => {
        setSelectedId(id);
        if (id == null) { setRevealDay(null); return; }
        const dayNumbers = api.dayOfPlace.get(id);
        const first = dayNumbers?.length ? Math.min(...dayNumbers) : null;
        const day = first == null
            ? null
            : (api.data?.days ?? []).find((row) => row.day_number === first);
        // Nothing to scroll to for a place that is not on the itinerary yet;
        // the pin is still selected, and the panel stays where it was rather
        // than jumping somewhere arbitrary.
        setRevealDay(day ? { id: day.id, at: Date.now() } : null);
    }, [api.dayOfPlace, api.data]);

    const resetFilters = () => {
        setRegionFilter(''); setCategoryFilter(''); setStatusFilter('');
        setDayFilter(''); setShowUnconfirmed(false); setSourceFilter('');
    };

    /**
     * Every field worth setting on a whole selection at once.
     *
     * Options come from the data, not a hard-coded list, so a category or region
     * you invent is bulk-appliable the moment it exists. Status stays on the bar
     * as well: it is the one people reach for constantly, and one click beats
     * two. Name, notes and coordinates are deliberately absent — they describe a
     * single place, and writing one value across a selection would destroy them.
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
                ...regions.map((r) => ({
                    value: r.id, label: r.country ? `${r.name} · ${r.country}` : r.name,
                })),
            ],
        },
        {
            key: 'country',
            label: 'Country',
            options: [
                { value: '', label: '— from region —' },
                ...countries.map((c) => ({ value: c, label: c })),
            ],
        },
        {
            key: 'status',
            label: 'Status',
            options: STATUSES.map((s) => ({ value: s.key, label: s.label })),
        },
        {
            key: 'source',
            label: 'Source',
            options: sourcesOf(places).map((s) => ({ value: s, label: s })),
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
                { value: 'yes', label: '👍 Interested' },
                { value: 'mid', label: '😐 Mid tier' },
                { value: 'no', label: '👎 Not interested' },
                { value: '', label: '— unrated —' },
            ],
        },
    ], [data?.categories, regions, countries, places]);

    /** Bulk action over the lassoed set — same verbs as the Places tab. */
    const bulk = async (fields: Record<string, unknown>) => {
        if (!lassoed.size) return;
        await api.update('places', { ids: [...lassoed], ...fields });
        setLassoed(new Set());
    };

    /**
     * Which way the confirmed/unconfirmed button points for this selection.
     *
     * Derived rather than a mode you set, so the button always describes what it
     * is about to do to the pins actually in the loop.
     */
    const review = useMemo(
        () => reviewToggleFor(
            [...lassoed].map((id) => api.placeById.get(id)).filter((p) => p != null),
        ),
        [lassoed, api.placeById],
    );

    /**
     * Confirm the selection, or put it back to unconfirmed.
     *
     * Marking pins unconfirmed while they are hidden would make them vanish the
     * instant you clicked — the map only draws unconfirmed pins when asked — so
     * asking is done for you. Watching forty pins disappear is not feedback.
     */
    const toggleReview = async () => {
        if (review.needsReview) setShowUnconfirmed(true);
        await bulk({ needs_review: review.needsReview });
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
        // One transaction for the whole selection, then one refetch — not a
        // create and a full reload per place.
        if (toAdd.length) {
            await api.createMany('stops', toAdd.map((place_id) => ({ day_id: dayId, place_id })));
            await api.refresh();
        }
        setLassoed(new Set());
        setSelectMode(false);
    };

    const bulkDelete = async () => {
        const ids = [...lassoed];
        if (!ids.length) return;
        // The confirm stays for a lasso: "116 places" is worth reading twice,
        // even with an undo behind it.
        if (!confirm(`Delete ${ids.length} place(s)? You can undo it.`)) return;
        const rows = ids.map((id) => api.placeById.get(id)).filter((p) => p != null);
        await api.removePlaces(rows);
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
                        onClick={() => { setShowItinerary((v) => !v); setRouteListOpen(false); }}
                        disabled={!!selectedDay || days.length === 0}
                        title="Overlay each day's stops, in order"
                        className={`shrink-0 rounded-2xl px-2.5 py-1.5 text-sm font-medium border transition
                            disabled:opacity-40 ${showItinerary
                            ? 'bg-slate-900 border-slate-900 text-white'
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                    >
                        {showItinerary ? '🗓 On' : '🗓 Itinerary'}
                    </button>
                    <MiniSelect
                        value={layer}
                        onChange={(e) => setLayer(e.target.value as MapLayerKey)}
                        aria-label="Base map"
                        title="Satellite for beaches, terrain for waterfalls"
                    >
                        {MAP_LAYERS.map((entry) => (
                            <option key={entry.key} value={entry.key}>{entry.label}</option>
                        ))}
                    </MiniSelect>
                    <MiniSelect
                        value={colourBy}
                        onChange={(e) => setColourBy(e.target.value as 'category' | 'region')}
                        aria-label="Colour the pins by"
                        title="Colour pins by what they are, or by which area they are in"
                    >
                        <option value="category">Colour: type</option>
                        <option value="region">Colour: area</option>
                    </MiniSelect>
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
                        {legs.length > 0 && (
                            <span className="text-sky-700">
                                {' '}· {legs.length} travel leg{legs.length === 1 ? '' : 's'}
                            </span>
                        )}
                    </p>
                    <button onClick={resetFilters} className="text-xs text-gray-400 hover:text-gray-700">
                        Reset
                    </button>
                </div>

            </div>

            {/* ---- Map, with a column either side of it in split view ---- */}
            <div ref={areaRef} className="flex-1 min-h-0 flex items-stretch">
                {showPanels && (
                    <>
                        <SidePanel
                            title="Itinerary"
                            href="/admin/honeymoon/itinerary"
                            width={widths.left}
                        >
                            <ItineraryTab
                                api={api}
                                panel
                                onFocusDay={focusDay}
                                revealDay={revealDay}
                            />
                        </SidePanel>
                        <ColumnDivider
                            label="Resize the itinerary column"
                            onDrag={(dx) => resize('left', dx)}
                        />
                    </>
                )}

                {/* The map keeps the middle and takes whatever the columns leave. */}
                <div className="relative flex-1 min-h-0 min-w-0">
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
                        legs={legs}
                        selectedId={selectedId}
                        onSelect={selectPlace}
                        fitSignal={fitSignal}
                        fitPoints={fitPoints}
                        layer={layer}
                        pinColors={pinColors}
                        measureMode={tool === 'measure'}
                        selectMode={selectMode}
                        selectedIds={lassoed}
                        onLassoSelect={(ids, additive, loop) => {
                            setLassoLoop(loop);
                            setBoundaryNote('');
                            setLassoed((prev) => {
                                const next = additive ? new Set(prev) : new Set<number>();
                                for (const id of ids) next.add(id);
                                return next;
                            });
                        }}
                        className="h-full w-full border border-gray-100 shadow-sm"
                    />
                )}

                {/* ---- The tools, floating top-right ---- */}
                {/* Every tool lives here, over the map, the way the legend lives
                    bottom-left: they act on the map, so they belong on it rather
                    than in a filter row that is about which pins are shown.

                    One column, so nothing up here ever overlaps: the buttons, then
                    whichever tool is armed, then the selected place. */}
                <div className="absolute top-3 right-3 z-[500] flex flex-col items-end gap-2
                    max-w-[calc(100%-1.5rem)] max-h-[calc(100%-1.5rem)]">
                    <div className="bg-white/95 backdrop-blur rounded-2xl shadow-lg
                        border border-gray-200 px-2 py-1.5
                        flex flex-wrap items-center justify-end gap-1.5">
                        <button
                            onClick={() => { setFitPoints(null); setFitSignal((n) => n + 1); }}
                            title="Frame everything currently shown"
                            className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium
                                border border-gray-200 bg-gray-50 text-gray-600
                                hover:bg-gray-100 transition"
                        >
                            ⤢ Fit
                        </button>
                        {/* Desktop only: three columns in 900px would leave nothing
                            worth calling a map. */}
                        {wide && (
                            <button
                                onClick={toggleSplit}
                                title="Itinerary on the left, places on the right, map in the middle — drag the dividers to resize"
                                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium
                                    border transition ${split
                                    ? 'bg-slate-900 border-slate-900 text-white'
                                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                            >
                                {split ? '⊞ Split on' : '⊞ Split'}
                            </button>
                        )}
                        <button
                            onClick={() => { setEditing(null); setEditorOpen(true); }}
                            title="Add a place"
                            className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium
                                border border-transparent bg-accent text-white
                                hover:opacity-90 transition"
                        >
                            + Add
                        </button>
                        {/* Measuring and lassoing both own the map's pointer, so
                            arming either disarms the other rather than leaving two
                            tools fighting over the same click. */}
                        <button
                            onClick={() => {
                                setTool(tool === 'measure' ? 'none' : 'measure');
                                setSelectMode(false);
                            }}
                            title="Click two points for the distance and bearing between them"
                            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium
                                border transition ${tool === 'measure'
                                ? 'bg-slate-900 border-slate-900 text-white'
                                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                        >
                            📏 Measure
                        </button>
                        <button
                            onClick={() => {
                                if (selectMode) { setLassoed(new Set()); setLassoLoop(null); }
                                setSelectMode((v) => !v);
                                setTool('none');
                                setBoundaryNote('');
                            }}
                            title="Drag a loop round the pins you want — then act on them, or save the loop as an area"
                            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium
                                border transition ${selectMode
                                ? 'bg-slate-900 border-slate-900 text-white'
                                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                        >
                            {selectMode ? '◯ Lasso on' : '◯ Lasso'}
                        </button>
                    </div>

                    {/* Saving a boundary closes the menu it was saved from — the loop
                        is gone once it belongs to an area — so the confirmation is a
                        row of the column rather than a line inside that menu. */}
                    {boundaryNote && (
                        <p className="w-[min(18rem,100%)] rounded-2xl bg-violet-700/95 backdrop-blur
                            px-3 py-2 text-[11px] text-white shadow-lg">
                            {boundaryNote}
                        </p>
                    )}

                    {tool === 'measure' && (
                        <p className="w-[min(16rem,100%)] rounded-2xl bg-slate-900/95 backdrop-blur
                            px-3 py-2 text-[11px] text-white shadow-lg">
                            Click two points on the map for the distance and bearing. A third
                            click starts again.
                        </p>
                    )}

                    {selectMode && !lassoed.size && !lassoLoop && (
                        <p className="w-[min(16rem,100%)] rounded-2xl bg-slate-900/95 backdrop-blur
                            px-3 py-2 text-[11px] text-white shadow-lg">
                            Drag a loop round the pins you want — hold Shift to add to what is
                            already picked. The loop can also be saved as an area.
                        </p>
                    )}

                    {/* ---- The lasso's own menu, hanging under its button ---- */}
                    {/* It used to float in the middle of the top edge, which put it
                        nowhere near the tool that opened it and on top of whatever
                        you had just lassoed. Under the button is where a menu goes. */}
                    {selectMode && (lassoed.size > 0 || lassoLoop) && (
                        <div className="w-[min(20rem,100%)] bg-white/95 backdrop-blur rounded-2xl
                            shadow-lg border border-gray-200 px-3 py-2
                            flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-gray-700 pl-1">
                                {lassoed.size
                                    ? `${lassoed.size} selected`
                                    : 'Loop drawn — no pins inside it'}
                            </span>

                            {/* A loop round empty water is still a boundary worth
                                saving, but "Mark reviewed" on nothing is not an offer
                                worth making. */}
                            {lassoed.size > 0 && (
                                <>
                                    <MiniSelect
                                        value=""
                                        onChange={(e) => {
                                            if (e.target.value) {
                                                bulk({ status: e.target.value as PlaceStatus });
                                            }
                                        }}
                                    >
                                        {/* A native select is sized by its widest option, so
                                            these are abbreviated — the full words live in
                                            the Places tab. */}
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
                                    <BulkFieldMenu
                                        fields={bulkFields}
                                        onApply={(key, value) => bulk({ [key]: value })}
                                        label="Change a field on all selected"
                                    />
                                    <Button
                                        className="!px-3"
                                        onClick={toggleReview}
                                        title={review.needsReview
                                            ? `Put all ${review.confirmed} back to unconfirmed`
                                            : `Confirm ${review.unconfirmed} unconfirmed pin`
                                                + `${review.unconfirmed === 1 ? '' : 's'}`}
                                    >
                                        {review.label}
                                    </Button>
                                    <Button className="!px-3" tone="danger" onClick={bulkDelete}>
                                        Delete
                                    </Button>
                                </>
                            )}

                            <Button
                                className="!px-3"
                                tone="ghost"
                                onClick={() => { setLassoed(new Set()); setLassoLoop(null); }}
                            >
                                Clear
                            </Button>

                            {/* ---- The loop itself, as an area ---- */}
                            {/* This is the whole of what "draw an area" used to be. It
                                was a separate tool with its own click-by-click way of
                                drawing the same shape; now the loop you already drew is
                                the boundary, and this is where you say whose. */}
                            {lassoLoop && regions.length > 0 && (
                                <div className="w-full border-t border-gray-100 pt-2
                                    flex flex-wrap items-center gap-2">
                                    <span className="text-[11px] text-gray-500">
                                        Or make this loop an area:
                                    </span>
                                    <MiniSelect
                                        value=""
                                        onChange={(e) => {
                                            if (e.target.value) saveBoundary(Number(e.target.value));
                                        }}
                                        aria-label="Save this loop as an area's boundary"
                                    >
                                        <option value="">Save as area…</option>
                                        {regions.map((region) => (
                                            <option key={region.id} value={region.id}>
                                                {region.name}{region.boundary ? ' (replace)' : ''}
                                            </option>
                                        ))}
                                    </MiniSelect>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ---- The selected place, under the tools ---- */}
                    {/* A row of the same column rather than its own corner: the tools
                        are up here now, and two things claiming the top-right would
                        cover each other. Scrolls inside the column's height cap. */}
                    {selected && (
                        <div className="w-[min(22rem,100%)] min-h-0 overflow-auto
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
                                        onClick={() => selectPlace(null)}
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

                {/* ---- What happens each day, while the overlay is on ---- */}
                {/* Collapsed: a pill in the top-left corner, carrying the day
                    count so it still says how much is on screen.

                    left-14 rather than left-3 for both states: Leaflet's zoom
                    buttons own that corner, and the panel used to cover the +
                    so you could not zoom in while reading the days. */}
                {showItinerary && routes.length > 0 && !routeListOpen && (
                    <button
                        onClick={() => setRouteListOpen(true)}
                        title="Show the stops of each day, in order"
                        className="absolute top-3 left-14 z-[500] inline-flex items-center gap-1.5
                            bg-white/95 backdrop-blur rounded-2xl shadow-lg border border-gray-200
                            px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900
                            hover:bg-white transition"
                    >
                        <span aria-hidden>🗓</span>
                        Itinerary
                        <span className="text-gray-400 tabular-nums">
                            {routes.length} day{routes.length === 1 ? '' : 's'}
                        </span>
                        <span className="text-gray-300" aria-hidden>▸</span>
                    </button>
                )}
                {showItinerary && routes.length > 0 && routeListOpen && (
                    <div className="absolute top-3 left-14 z-[500] w-[min(20rem,45%)]
                        max-h-[70%] overflow-auto bg-white/95 backdrop-blur rounded-2xl
                        shadow-lg border border-gray-200 p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">
                                Itinerary
                            </p>
                            <button
                                onClick={() => setRouteListOpen(false)}
                                title="Minimise back to the corner"
                                aria-label="Minimise the itinerary list"
                                className="text-gray-300 hover:text-gray-700 leading-none px-1 -mr-1"
                            >
                                &minus;
                            </button>
                        </div>
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

                </div>

                {showPanels && (
                    <>
                        <ColumnDivider
                            label="Resize the places column"
                            onDrag={(dx) => resize('right', dx)}
                        />
                        <SidePanel
                            title="Places"
                            href="/admin/honeymoon/places"
                            width={widths.right}
                        >
                            <PlacesTab api={api} panel />
                        </SidePanel>
                    </>
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

/**
 * One of the two columns beside the map.
 *
 * Deliberately not a card: the tab inside it already renders its own cards, and
 * a panel-shaped box around them reads as a box in a box. All this adds is a
 * label, a way out to the full tab, and its own scrollbar — the columns scroll
 * independently, which is the whole point of having the map pinned between them.
 */
function SidePanel({ title, href, width, children }: {
    title: string;
    href: string;
    width: number;
    children: React.ReactNode;
}) {
    return (
        <section
            style={{ width }}
            className="shrink-0 min-w-0 h-full flex flex-col"
            aria-label={title}
        >
            <header className="shrink-0 flex items-baseline justify-between gap-2 px-1 pb-1.5">
                <h2 className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">
                    {title}
                </h2>
                <Link
                    href={href}
                    className="text-[11px] text-gray-400 hover:text-gray-700 shrink-0"
                    title={`Open the full ${title.toLowerCase()} tab`}
                >
                    Full tab ↗
                </Link>
            </header>
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-0.5 pb-1">
                {children}
            </div>
        </section>
    );
}
