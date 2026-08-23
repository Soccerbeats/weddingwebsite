/**
 * Honeymoon portal — shared types and pure helpers.
 *
 * Everything in here is side-effect free so it can be imported from a server
 * route, a client component, or a verification script without dragging in a
 * database connection.
 */

export type PlaceStatus = 'idea' | 'shortlisted' | 'booked';

/**
 * Where a suggestion came from — a free-text label, not an enum.
 *
 * It started as 'guide' | 'manual', which stopped being enough the moment a
 * second batch of suggestions arrived from a different person. Keeping it open
 * means the next list someone sends can be labelled without a migration, and
 * the filter dropdown is built from the values actually present rather than a
 * hardcoded set.
 */
export type PlaceSource = string;

/** How you feel about a candidate stay. Null means not yet judged. */
export type PlaceRating = 'yes' | 'no' | null;

export const RATINGS: { key: 'yes' | 'no'; label: string; icon: string; color: string }[] = [
    { key: 'yes', label: 'Interested', icon: '👍', color: '#059669' },
    { key: 'no', label: 'Not interested', icon: '👎', color: '#be123c' },
];

export const SOURCE_YOUTUBE = 'YouTube Travel Guide';
export const SOURCE_AMY = "Amy's Suggestions";
export const SOURCE_MANUAL = 'Added by me';

/** Legacy values, still possible in a database seeded before sources existed. */
const LEGACY_SOURCE_LABELS: Record<string, string> = {
    guide: SOURCE_YOUTUBE,
    manual: SOURCE_MANUAL,
};

export function sourceLabel(source: string | null | undefined): string {
    if (!source) return SOURCE_MANUAL;
    return LEGACY_SOURCE_LABELS[source] ?? source;
}

/** Distinct sources present, for building a filter dropdown. */
export function sourcesOf(places: { source: string }[]): string[] {
    const seen = new Set<string>();
    for (const place of places) seen.add(sourceLabel(place.source));
    return [...seen].sort((a, b) => a.localeCompare(b));
}
export type TravelMode = 'flight' | 'boat' | 'car' | 'train' | 'walk';

/** A link attached to a place — a website, a booking page, an Instagram. */
export interface PlaceLink {
    label: string;
    url: string;
}

export interface Region {
    id: number;
    name: string;
    country: string;
    description: string | null;
    center_lat: number | null;
    center_lng: number | null;
    sort_order: number;
}

export interface Place {
    id: number;
    region_id: number | null;
    name: string;
    category: string;
    lat: number | null;
    lng: number | null;
    address: string | null;
    description: string | null;
    status: PlaceStatus;
    price_note: string | null;
    links: PlaceLink[];
    photos: string[];
    source: PlaceSource;
    needs_review: boolean;
    /** Interested / not interested. Used by the Stays and Excursions shortlists. */
    rating: PlaceRating;
    /**
     * Shows on the Excursions tab.
     *
     * A flag rather than a category, because an excursion's *type* is the thing
     * you want to record freely — a cooking class, a dive, a temple tour — and
     * tying the tab to one category would drop anything you re-typed.
     */
    is_excursion: boolean;
    /** Preview image scraped from the listing's Open Graph tags. */
    image_url: string | null;
    /**
     * Country override for this one place. Empty means "whatever its region
     * says" — most places should inherit, and only the odd one out needs this.
     */
    country: string;
    sort_order: number;
}

export interface Stop {
    id: number;
    day_id: number;
    place_id: number | null;
    custom_label: string | null;
    start_time: string | null;
    notes: string | null;
    sort_order: number;
}

export interface TravelLeg {
    id: number;
    day_id: number;
    mode: TravelMode;
    from_text: string | null;
    to_text: string | null;
    depart_time: string | null;
    arrive_time: string | null;
    confirmation_ref: string | null;
    notes: string | null;
}

export interface Day {
    id: number;
    day_number: number;
    title: string | null;
    base_place_id: number | null;
    notes: string | null;
    stops: Stop[];
    travel: TravelLeg[];
}

export interface GuideNote {
    id: number;
    title: string;
    body: string;
    category: string | null;
    /** Same provenance label as a place carries. */
    source: string | null;
    sort_order: number;
}

/** A checklist item — visas, jabs, insurance, the things that aren't places. */
export interface TodoItem {
    id: number;
    text: string;
    done: boolean;
    /** What happened when you ticked it — the booking ref, the outcome, the why. */
    result: string | null;
    category: string | null;
    due_on: string | null;
    sort_order: number;
}

export interface Trip {
    id: number;
    title: string;
    start_date: string | null;
    /**
     * Last day of the trip.
     *
     * Kept alongside the day rows rather than derived from them, because the two
     * answer different questions: `end_date` is when you fly home — a decision —
     * while the day rows are how much of it you have planned. Setting the range
     * reconciles the rows to it, so they agree unless you are mid-edit.
     */
    end_date: string | null;
    home_currency: string;
    notes: string | null;
    /**
     * Persisted country filter. Empty means every country.
     *
     * Stored on the trip rather than in the browser so it survives a refresh, a
     * new login and a different device — it is a decision about the trip, not a
     * per-session view preference.
     */
    focus_country: string;
}

export interface HoneymoonPayload {
    trip: Trip;
    todos: TodoItem[];
    categories: CategoryRow[];
    regions: Region[];
    places: Place[];
    days: Day[];
    notes: GuideNote[];
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

/**
 * Pin colours are chosen to stay distinguishable against OSM's beige-and-green
 * raster tiles — nothing pale, nothing that reads as a road or a park.
 */
export const CATEGORIES = [
    { key: 'stay', label: 'Stay', color: '#7c3aed', icon: '🛏️' },
    { key: 'beach_club', label: 'Beach Club', color: '#0891b2', icon: '🏖️' },
    { key: 'bar', label: 'Bar', color: '#be123c', icon: '🍸' },
    { key: 'nightlife', label: 'Nightlife', color: '#9333ea', icon: '🎧' },
    { key: 'restaurant', label: 'Restaurant', color: '#ea580c', icon: '🍽️' },
    { key: 'cafe', label: 'Cafe', color: '#a16207', icon: '☕' },
    { key: 'waterfall', label: 'Waterfall', color: '#0284c7', icon: '💦' },
    { key: 'beach', label: 'Beach', color: '#f59e0b', icon: '🏝️' },
    { key: 'hiking', label: 'Hiking', color: '#65a30d', icon: '🥾' },
    { key: 'nature', label: 'Nature', color: '#15803d', icon: '🌿' },
    { key: 'temple', label: 'Temple', color: '#b45309', icon: '🛕' },
    { key: 'attraction', label: 'Attraction', color: '#059669', icon: '📍' },
    { key: 'activity', label: 'Activity', color: '#16a34a', icon: '🎯' },
    { key: 'spa', label: 'Spa', color: '#db2777', icon: '💆' },
    { key: 'beauty', label: 'Hair & Nails', color: '#e11d48', icon: '💅' },
    { key: 'gym', label: 'Gym', color: '#4d7c0f', icon: '🏋️' },
    { key: 'cowork', label: 'Cowork', color: '#475569', icon: '💻' },
    { key: 'shop', label: 'Shopping', color: '#c026d3', icon: '🛍️' },
    { key: 'transport', label: 'Transport', color: '#334155', icon: '✈️' },
    { key: 'misc', label: 'Other', color: '#6b7280', icon: '•' },
] as const;

export type CategoryKey = typeof CATEGORIES[number]['key'];

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key) as unknown as string[];

export interface CategoryMeta {
    key: string;
    label: string;
    color: string;
    icon: string;
}

/** A category as stored — the built-ins are seeded rows, so all are editable. */
export interface CategoryRow extends CategoryMeta {
    id: number;
    sort_order: number;
}

/**
 * The live category list, published by the data hook whenever the payload
 * loads.
 *
 * Categories became editable rows, so every colour and label lookup has to
 * consult the database rather than the constant below. Threading the list into
 * `categoryMeta` would mean a prop through every marker, chip and legend in the
 * portal; a single registry the hook updates keeps those call sites unchanged.
 * It is set from an async callback, never during render, and there is exactly
 * one hook instance on the page.
 */
let REGISTRY: Map<string, CategoryMeta> | null = null;
let REGISTRY_ORDER: CategoryMeta[] = [];

export function setCategoryRegistry(rows: CategoryMeta[] | null | undefined) {
    if (!rows || !rows.length) { REGISTRY = null; REGISTRY_ORDER = []; return; }
    REGISTRY = new Map(rows.map((r) => [r.key, r]));
    REGISTRY_ORDER = rows;
}

const CATEGORY_BY_KEY = new Map<string, CategoryMeta>(
    CATEGORIES.map((c) => [c.key as string, { ...c } as CategoryMeta]),
);

/** Stable key for a typed category name, so "Hot Springs" and "hot springs" agree. */
export function normalizeCategoryKey(input: string): string {
    return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function titleCase(value: string): string {
    return value
        .split(' ')
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

/**
 * A colour for a category nobody predefined.
 *
 * Derived from the name so it is stable across reloads and distinct between
 * categories — a custom category that changed colour on every render would be
 * useless as a map legend. Fixed saturation and lightness keep it readable
 * against OSM's beige-and-green tiles, same as the built-in palette.
 */
function colorForCustom(key: string): string {
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    return `hsl(${hash % 360}, 62%, 42%)`;
}

/**
 * Metadata for a category, built-in or custom.
 *
 * An unknown key is a category someone typed, not a mistake, so it keeps its own
 * name and gets a stable colour rather than collapsing into "Other".
 */
export function categoryMeta(key: string): CategoryMeta {
    const live = REGISTRY?.get(key);
    if (live) return live;
    const known = CATEGORY_BY_KEY.get(key);
    if (known) return known;
    const trimmed = (key ?? '').trim();
    if (!trimmed) return CATEGORY_BY_KEY.get('misc')!;
    return {
        key: trimmed,
        label: titleCase(trimmed),
        color: colorForCustom(trimmed),
        icon: '●',
    };
}

/**
 * Every category worth offering: the stored list, plus anything a place still
 * refers to that has since been deleted — so a filter can always reach it.
 */
export function categoriesOf(places: { category: string }[]): CategoryMeta[] {
    const base: CategoryMeta[] = REGISTRY_ORDER.length
        ? REGISTRY_ORDER
        : CATEGORIES.map((c) => ({ ...c } as CategoryMeta));
    const known = new Set(base.map((c) => c.key));

    const orphans = new Map<string, CategoryMeta>();
    for (const place of places) {
        const key = place.category;
        if (!key || known.has(key) || orphans.has(key)) continue;
        orphans.set(key, categoryMeta(key));
    }

    return [...base, ...[...orphans.values()].sort((a, b) => a.label.localeCompare(b.label))];
}

export const STATUSES: { key: PlaceStatus; label: string; color: string }[] = [
    { key: 'idea', label: 'Idea', color: '#94a3b8' },
    { key: 'shortlisted', label: 'Shortlisted', color: '#f59e0b' },
    { key: 'booked', label: 'Booked', color: '#059669' },
];

export const TRAVEL_MODES: { key: TravelMode; label: string; icon: string }[] = [
    { key: 'flight', label: 'Flight', icon: '✈️' },
    { key: 'boat', label: 'Boat', icon: '⛴️' },
    { key: 'car', label: 'Car', icon: '🚗' },
    { key: 'train', label: 'Train', icon: '🚆' },
    { key: 'walk', label: 'Walk', icon: '🚶' },
];

/* ------------------------------------------------------------------ */
/* Geo                                                                 */
/* ------------------------------------------------------------------ */

export interface LatLng { lat: number; lng: number }

/**
 * True when a value is a usable coordinate pair.
 *
 * Generic so `places.filter(hasCoords)` keeps returning Places with their
 * coordinates narrowed to non-null, rather than collapsing to a bare lat/lng.
 */
export function hasCoords<T extends { lat: number | null; lng: number | null }>(
    p: T,
): p is T & { lat: number; lng: number } {
    return typeof p.lat === 'number' && typeof p.lng === 'number'
        && Number.isFinite(p.lat) && Number.isFinite(p.lng);
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Great-circle distance in kilometres.
 *
 * This is deliberately NOT driving distance. On Bali's single-lane roads the
 * real journey is often twice that, so the number exists to catch a plan that
 * pairs a Canggu beach club with a North Bali waterfall — not to promise an ETA.
 */
export function distanceKm(a: LatLng, b: LatLng): number {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(km: number): string {
    if (km < 1) return `${Math.round(km * 1000)} m`;
    if (km < 10) return `${km.toFixed(1)} km`;
    return `${Math.round(km)} km`;
}

/**
 * Bounding box for a set of points, padded so pins never sit on the map edge.
 * Returns null when there is nothing to frame — callers fall back to a default
 * view rather than zooming to null island.
 */
export function boundsOf(points: LatLng[]): [[number, number], [number, number]] | null {
    if (!points.length) return null;
    let minLat = points[0].lat, maxLat = points[0].lat;
    let minLng = points[0].lng, maxLng = points[0].lng;
    for (const p of points) {
        if (p.lat < minLat) minLat = p.lat;
        if (p.lat > maxLat) maxLat = p.lat;
        if (p.lng < minLng) minLng = p.lng;
        if (p.lng > maxLng) maxLng = p.lng;
    }
    // A single pin has zero extent; give it a small box so fitBounds doesn't
    // slam to max zoom.
    if (minLat === maxLat && minLng === maxLng) {
        return [[minLat - 0.02, minLng - 0.02], [maxLat + 0.02, maxLng + 0.02]];
    }
    return [[minLat, minLng], [maxLat, maxLng]];
}

/**
 * Is a point inside a polygon? Ray casting, treating lng as x and lat as y.
 *
 * Used by the map's lasso select. Safe here because a hand-drawn loop around
 * some pins never spans the antimeridian or a pole — the cases where naive
 * planar treatment of lat/lng breaks down.
 *
 * The `>` / `<=` asymmetry on the vertical test is deliberate: it counts a
 * vertex exactly once when the ray passes through it, so a pin sitting exactly
 * on a drawn line doesn't flicker in and out of the selection.
 */
export function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
    if (polygon.length < 3) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const yi = polygon[i].lat, xi = polygon[i].lng;
        const yj = polygon[j].lat, xj = polygon[j].lng;
        const straddles = (yi > point.lat) !== (yj > point.lat);
        if (!straddles) continue;
        const crossingLng = ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
        if (point.lng < crossingLng) inside = !inside;
    }
    return inside;
}

/** Places with coordinates that fall inside a drawn loop. */
export function placesInPolygon(places: Place[], polygon: LatLng[]): number[] {
    if (polygon.length < 3) return [];
    return places
        .filter(hasCoords)
        .filter((p) => pointInPolygon({ lat: p.lat, lng: p.lng }, polygon))
        .map((p) => p.id);
}

/* ------------------------------------------------------------------ */
/* Accommodation links                                                 */
/* ------------------------------------------------------------------ */

/** Hosts whose URLs carry a usable property name in the path. */
const STAY_HOSTS = /booking\.com|airbnb\.[a-z.]+|agoda\.com|expedia\.[a-z.]+|hotels\.com/i;

/**
 * The country a place actually counts as.
 *
 * Its own value wins, then its region's. A place can sit outside any region — or
 * in a region nobody gave a country — and then it has no country at all, which
 * the map treats as "unknown" rather than "somewhere else".
 */
export function effectiveCountry(
    place: { country?: string; region_id: number | null },
    regionCountry: Map<number, string>,
): string {
    const own = (place.country ?? '').trim();
    if (own) return own;
    return regionCountry.get(place.region_id ?? -1) ?? '';
}

/** Every country in play, from regions and from per-place overrides. */
export function countriesInUse(
    regions: { country: string }[],
    places: { country?: string }[],
): string[] {
    const seen = new Set<string>();
    for (const r of regions) if (r.country?.trim()) seen.add(r.country.trim());
    for (const p of places) if (p.country?.trim()) seen.add(p.country.trim());
    return [...seen].sort((a, b) => a.localeCompare(b));
}

export function isStayUrl(url: string): boolean {
    return /^https?:\/\//i.test(url) && STAY_HOSTS.test(url);
}

/**
 * Derive a property name from a booking URL.
 *
 * Booking.com blocks server-side page fetches with a bot challenge, so there is
 * no title or image to scrape — but the slug in the path is the property name,
 * which is enough to save a link without typing the name by hand.
 *
 *   /hotel/id/hard-rock-bali.en-gb.html  ->  "Hard Rock Bali"
 */
export function nameFromStayUrl(url: string): string | null {
    let slug: string | null = null;

    const booking = url.match(/\/hotel\/[a-z]{2}\/([^/?#]+)/i);
    if (booking) {
        slug = booking[1]
            .replace(/\.html?$/i, '')
            // Strip a trailing locale like ".en-gb" or ".pt-br".
            .replace(/\.[a-z]{2}(-[a-z]{2})?$/i, '');
    } else {
        const airbnb = url.match(/\/rooms\/(?:plus\/)?(\d+)/i);
        if (airbnb) return `Airbnb ${airbnb[1]}`;
    }

    if (!slug) return null;
    const words = slug.split(/[-_]+/).filter(Boolean);
    if (!words.length) return null;
    // A slug that is only digits is an id, not a name.
    if (words.every((w) => /^\d+$/.test(w))) return null;

    return words
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

/**
 * Tidy a listing's Open Graph title into a property name.
 *
 * Booking.com titles read "Desa Hay Canggu, Canggu (updated prices 2026)" —
 * the property name, then the town, then a marketing suffix. The head before
 * the first comma is the name; everything after is noise on a card.
 */
export function cleanListingTitle(title: string): string | null {
    if (!title) return null;
    const head = title
        .replace(/\(updated prices?[^)]*\)/i, '')
        .replace(/\s*[–—-]\s*(Booking\.com|Updated \d{4}).*$/i, '')
        .split(',')[0]
        .trim();
    return head.length >= 2 ? head : null;
}

/** Symbols for the currencies a honeymoon is plausibly priced in. */
const CURRENCY_SYMBOLS: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', AUD: 'A$', CAD: 'C$', SGD: 'S$', NZD: 'NZ$',
};

export function currencySymbol(code: string | null | undefined): string {
    if (!code) return '$';
    return CURRENCY_SYMBOLS[code.toUpperCase()] ?? `${code.toUpperCase()} `;
}

/**
 * Tidy a nightly rate typed into a stay card: "250" becomes "$250 per night".
 *
 * Deliberately conservative. Anything that isn't a plain number is returned
 * untouched, because price notes elsewhere in the library read like
 * "~500k IDR entry" and rewriting those as dollars would be worse than useless.
 * Re-running it on its own output is a no-op, which matters because the field
 * commits on blur as well as on Enter.
 */
function formatAmount(raw: string, currency: string | null | undefined, suffix: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return '';

    const symbol = currencySymbol(currency);

    // Strip only what we ourselves add: our currency symbol, a bare $, thousands
    // separators, and our own trailing suffix in its usual spellings. A foreign
    // symbol left behind means this isn't ours to reformat.
    const stripped = trimmed
        .replace(/\s*(per\s*night|\/\s*night|p\/?n)\s*$/i, '')
        .replace(new RegExp(`^${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '')
        .replace(/^\$/, '')
        .replace(/,/g, '')
        .trim();

    if (!/^\d+(\.\d+)?$/.test(stripped)) return trimmed;

    const value = Number(stripped);
    if (!Number.isFinite(value)) return trimmed;

    // Keep cents only when they were typed; "$250.00" reads worse.
    const hasCents = stripped.includes('.') && !/\.0+$/.test(stripped);
    const shown = value.toLocaleString('en-US', {
        minimumFractionDigits: hasCents ? 2 : 0,
        maximumFractionDigits: 2,
    });

    return `${symbol}${shown}${suffix}`;
}

export function formatPerNight(raw: string, currency?: string | null): string {
    return formatAmount(raw, currency, ' per night');
}

/**
 * A plain price, for things that aren't priced by the night.
 *
 * No suffix is appended: an excursion might be per person, per couple or per
 * boat, and inventing one would put words in your mouth. Type "120 per person"
 * and it is left exactly as typed, like any other free text.
 */
export function formatPrice(raw: string, currency?: string | null): string {
    return formatAmount(raw, currency, '');
}

/**
 * Read a number back out of a price note, for totalling on the dashboard.
 *
 * Returns null for anything without a plain figure — "ask at the desk" is not
 * zero, and counting it as zero would quietly understate a total. The caller is
 * expected to say how many entries it could actually price.
 */
export function priceValue(note: string | null | undefined): number | null {
    if (!note) return null;
    const match = note.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    if (!match) return null;
    const value = Number(match[0]);
    return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * A usable name for any link, booking site or not.
 *
 * Falls back through the shapes that actually carry a name: a booking slug, then
 * the last meaningful path segment, then the hostname. Something readable always
 * beats "Untitled", since the whole point is to recognise it in a list later.
 */
export function nameFromAnyUrl(url: string): string | null {
    const booking = nameFromStayUrl(url);
    if (booking) return booking;

    try {
        const parsed = new URL(url);
        const segments = parsed.pathname.split('/').filter(Boolean);
        for (const segment of [...segments].reverse()) {
            const cleaned = decodeURIComponent(segment)
                .replace(/\.(html?|php|aspx)$/i, '')
                .replace(/[-_+]+/g, ' ')
                .trim();
            // Skip ids and locale stubs — they name nothing.
            if (cleaned.length < 3 || /^\d+$/.test(cleaned)) continue;
            return titleCase(cleaned).slice(0, 80);
        }
        return titleCase(parsed.hostname.replace(/^www\./, '').split('.')[0]);
    } catch {
        return null;
    }
}

/** Split a pasted block into one candidate URL per line. */
export function stayUrlsFromText(text: string): string[] {
    const seen = new Set<string>();
    return text
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter((t) => /^https?:\/\//i.test(t))
        .filter((t) => (seen.has(t) ? false : (seen.add(t), true)));
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

/**
 * Real calendar date for a day number, or null while the trip has no start date.
 *
 * Built from UTC parts on purpose: `new Date('2026-09-01')` parses as UTC
 * midnight, and adding days in local time would slide the date backwards for
 * anyone west of Greenwich.
 */
export function dateForDay(startDate: string | null, dayNumber: number): Date | null {
    if (!startDate) return null;
    const parsed = new Date(`${startDate}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return null;
    parsed.setUTCDate(parsed.getUTCDate() + (dayNumber - 1));
    return parsed;
}

/** One `YYYY-MM-DD` as "Sat, Sep 12". UTC, so it never drifts by a timezone. */
export function formatDate(date: string | null | undefined): string | null {
    if (!date) return null;
    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
    });
}

export function formatDayDate(startDate: string | null, dayNumber: number): string | null {
    const date = dateForDay(startDate, dayNumber);
    if (!date) return null;
    return date.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
    });
}

export interface CalendarCell {
    /** UTC midnight of the date this cell shows. */
    date: Date;
    /** `YYYY-MM-DD`, stable enough to be a React key. */
    key: string;
    /** Day of the month, 1-31. */
    dayOfMonth: number;
    /** False for the leading/trailing days borrowed from the neighbouring month. */
    inMonth: boolean;
    /** The trip day that falls on this date, or null if the trip isn't on yet. */
    dayNumber: number | null;
}

export interface CalendarMonth {
    /** `YYYY-MM`. */
    key: string;
    /** "September 2026". */
    label: string;
    /** Whole weeks, Sunday-first — always a multiple of 7. */
    cells: CalendarCell[];
}

/**
 * One month as full Sunday-first week grids.
 *
 * A calendar has to show the days *around* its subject as well as the subject
 * itself — that is the whole point of looking at one — so the month is padded
 * out to whole weeks and the borrowed days are marked rather than dropped.
 *
 * All arithmetic is on UTC parts, matching `dateForDay`: these are calendar
 * dates, not instants, and doing it in local time would shift the whole grid by
 * a day for anyone west of Greenwich.
 *
 * `dayNumberOf` decides what, if anything, each date means — trip day numbers
 * for the itinerary view, nothing at all for a blank date picker.
 */
export function monthMatrix(
    year: number,
    month: number,
    dayNumberOf: (date: Date) => number | null = () => null,
): CalendarMonth {
    const monthStart = new Date(Date.UTC(year, month, 1));
    const monthEnd = new Date(Date.UTC(year, month + 1, 0));

    const gridStart = new Date(monthStart);
    gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());
    const gridEnd = new Date(monthEnd);
    gridEnd.setUTCDate(gridEnd.getUTCDate() + (6 - gridEnd.getUTCDay()));

    const cells: CalendarCell[] = [];
    for (
        const day = new Date(gridStart);
        day.getTime() <= gridEnd.getTime();
        day.setUTCDate(day.getUTCDate() + 1)
    ) {
        cells.push({
            date: new Date(day),
            key: isoOf(day),
            dayOfMonth: day.getUTCDate(),
            inMonth: day.getUTCMonth() === monthStart.getUTCMonth(),
            dayNumber: dayNumberOf(day),
        });
    }

    return {
        key: `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}`,
        label: monthStart.toLocaleDateString('en-US', {
            month: 'long', year: 'numeric', timeZone: 'UTC',
        }),
        cells,
    };
}

/** `YYYY-MM-DD` for a UTC date — the shape every date column and key uses. */
export function isoOf(date: Date): string {
    return date.toISOString().slice(0, 10);
}

/** Today as `YYYY-MM-DD`, read off UTC parts so it matches every stored date. */
export function todayIso(now: Date = new Date()): string {
    return isoOf(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

/** Whole days from one date to another, both `YYYY-MM-DD`. Null if either is unparseable. */
export function daysBetween(from: string | null, to: string | null): number | null {
    if (!from || !to) return null;
    const a = new Date(`${from}T00:00:00Z`);
    const b = new Date(`${to}T00:00:00Z`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
    return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** `YYYY-MM-DD` a number of days after another. */
export function addDays(date: string, days: number): string {
    const parsed = new Date(`${date}T00:00:00Z`);
    parsed.setUTCDate(parsed.getUTCDate() + days);
    return isoOf(parsed);
}

/**
 * Every month the trip touches, as full Sunday-first week grids.
 *
 * Thin wrapper over `monthMatrix` that numbers the trip's own days.
 */
export function calendarMonths(startDate: string | null, dayCount: number): CalendarMonth[] {
    const first = dateForDay(startDate, 1);
    const last = dateForDay(startDate, dayCount);
    if (!first || !last || dayCount < 1) return [];

    const dayNumberOf = (date: Date) => {
        const offset = Math.round((date.getTime() - first.getTime()) / 86_400_000);
        return offset >= 0 && offset < dayCount ? offset + 1 : null;
    };

    const months: CalendarMonth[] = [];
    const cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
    const stop = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1));
    while (cursor.getTime() <= stop.getTime()) {
        months.push(monthMatrix(cursor.getUTCFullYear(), cursor.getUTCMonth(), dayNumberOf));
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return months;
}

/* ------------------------------------------------------------------ */
/* Trip range                                                          */
/* ------------------------------------------------------------------ */

export interface RangePlan {
    /** Normalised, so dragging right-to-left still means what you meant. */
    start: string;
    end: string;
    /** Nights on the trip — 1 for a day trip, never less. */
    length: number;
    /** Day numbers to create, in order. */
    add: number[];
    /**
     * Day numbers that would fall past the end of the new range.
     *
     * They are *not* deleted — shortening a trip must never throw away a day
     * you have planned. They are named so the UI can flag them and let you move
     * their stops or put the dates back.
     */
    beyond: number[];
    /** True when only the dates move: nothing to add and nothing left outside. */
    shiftOnly: boolean;
}

/**
 * What setting a date range would do to the day rows.
 *
 * Pure on purpose, and non-destructive by design: a shorter range adds nothing
 * and removes nothing, it just leaves a tail of days outside the trip for the
 * UI to flag. Returning a plan rather than performing one keeps the arithmetic
 * testable without a database.
 */
export function planRange(
    from: string,
    to: string,
    existingDayNumbers: number[],
): RangePlan {
    const [start, end] = daysBetween(from, to)! < 0 ? [to, from] : [from, to];
    const length = Math.max(1, (daysBetween(start, end) ?? 0) + 1);

    const have = new Set(existingDayNumbers);
    const add: number[] = [];
    for (let n = 1; n <= length; n += 1) if (!have.has(n)) add.push(n);
    const beyond = existingDayNumbers.filter((n) => n > length).sort((a, b) => a - b);

    return { start, end, length, add, beyond, shiftOnly: !add.length && !beyond.length };
}

/**
 * How many days the trip's saved dates cover, or null without a full range.
 *
 * One-based, like the day numbers it is compared against: a start and end on the
 * same date is a one-day trip, not a zero-day one.
 */
export function tripLength(start: string | null, end: string | null): number | null {
    const between = daysBetween(start, end);
    if (between == null) return null;
    return Math.max(1, between + 1);
}

/**
 * Which of these days sit past the end of the trip's dates.
 *
 * The itinerary is allowed to be longer than the dates — that is what happens
 * the moment you shorten a trip you have already planned, and losing the plan
 * would be far worse than being out of range for a while. This is what the red
 * flags on those days are driven from.
 *
 * A trip with no end date has nothing to be outside of, so nothing is flagged.
 */
export function daysBeyondRange(
    dayNumbers: number[], start: string | null, end: string | null,
): number[] {
    const length = tripLength(start, end);
    if (length == null) return [];
    return dayNumbers.filter((n) => n > length).sort((a, b) => a - b);
}

/* ------------------------------------------------------------------ */
/* Calendar export                                                     */
/* ------------------------------------------------------------------ */

export interface IcsEvent {
    uid: string;
    summary: string;
    description?: string;
    location?: string;
    /** `YYYY-MM-DD` for an all-day event. */
    date: string;
    /** `HH:MM`. Both present makes it a timed event; absent makes it all-day. */
    start?: string;
    end?: string;
}

/** Escape per RFC 5545: backslash, semicolon, comma and newline are syntax. */
function icsText(value: string): string {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n');
}

/**
 * Fold to 75 octets per RFC 5545, continuing with a leading space.
 *
 * Ignoring this is the classic way to produce a file that imports fine into one
 * calendar app and silently truncates in another.
 */
function icsFold(line: string): string {
    if (line.length <= 75) return line;
    const parts = [line.slice(0, 75)];
    let rest = line.slice(75);
    while (rest.length > 74) {
        parts.push(` ${rest.slice(0, 74)}`);
        rest = rest.slice(74);
    }
    if (rest) parts.push(` ${rest}`);
    return parts.join('\r\n');
}

/**
 * A valid iCalendar file for a list of events.
 *
 * `stamp` is passed in rather than read from the clock so the output is
 * reproducible and testable — the same trip always exports the same bytes.
 */
export function buildIcs(events: IcsEvent[], stamp: string, calendarName = 'Honeymoon'): string {
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Wedding Website//Honeymoon Portal//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:${icsText(calendarName)}`,
    ];

    for (const event of events) {
        const compact = event.date.replace(/-/g, '');
        lines.push('BEGIN:VEVENT');
        lines.push(`UID:${event.uid}`);
        lines.push(`DTSTAMP:${stamp}`);
        if (event.start) {
            const end = event.end && event.end > event.start
                ? event.end
                // No end time given: an hour is a better guess than a zero-length
                // event, which some calendars refuse to draw at all.
                : addHour(event.start);
            lines.push(`DTSTART:${compact}T${event.start.replace(':', '')}00`);
            lines.push(`DTEND:${compact}T${end.replace(':', '')}00`);
        } else {
            // All-day events are exclusive at the end, hence the +1 day.
            lines.push(`DTSTART;VALUE=DATE:${compact}`);
            lines.push(`DTEND;VALUE=DATE:${addDays(event.date, 1).replace(/-/g, '')}`);
        }
        lines.push(`SUMMARY:${icsText(event.summary)}`);
        if (event.description) lines.push(`DESCRIPTION:${icsText(event.description)}`);
        if (event.location) lines.push(`LOCATION:${icsText(event.location)}`);
        lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    // CRLF throughout: the spec requires it, and Outlook enforces it.
    return `${lines.map(icsFold).join('\r\n')}\r\n`;
}

function addHour(time: string): string {
    const [h, m] = time.split(':').map(Number);
    const hour = Math.min(23, (h ?? 0) + 1);
    return `${String(hour).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`;
}

/**
 * The trip as calendar events.
 *
 * One all-day event per day carrying its stops in the description — that is the
 * thing you want on the phone when you wake up — plus a timed event for every
 * travel leg and every stop that has a time, which are the things you can
 * actually be late for.
 */
export function tripEvents(
    trip: { start_date: string | null; title: string },
    days: Day[],
    placeName: (id: number) => string | undefined,
): IcsEvent[] {
    if (!trip.start_date) return [];
    const events: IcsEvent[] = [];

    for (const day of days) {
        const date = dateForDay(trip.start_date, day.day_number);
        if (!date) continue;
        const iso = isoOf(date);
        const label = (stop: Stop) =>
            stop.custom_label || (stop.place_id != null ? placeName(stop.place_id) : '') || 'Stop';

        const lines = day.stops.map((stop) => {
            const time = stop.start_time ? `${formatTime(stop.start_time)} — ` : '• ';
            return `${time}${label(stop)}`;
        });
        if (day.notes) lines.push('', day.notes);

        events.push({
            uid: `honeymoon-day-${day.id}@wedding`,
            summary: `Day ${day.day_number}${day.title ? ` — ${day.title}` : ''}`,
            description: lines.join('\n'),
            date: iso,
        });

        for (const leg of day.travel) {
            const mode = TRAVEL_MODES.find((m) => m.key === leg.mode)?.label ?? 'Travel';
            const route = [leg.from_text, leg.to_text].filter(Boolean).join(' → ');
            events.push({
                uid: `honeymoon-travel-${leg.id}@wedding`,
                summary: `${mode}${route ? `: ${route}` : ''}`,
                description: leg.confirmation_ref ? `Ref ${leg.confirmation_ref}` : undefined,
                date: iso,
                start: leg.depart_time ?? undefined,
                end: leg.arrive_time ?? undefined,
            });
        }

        for (const stop of day.stops) {
            if (!stop.start_time) continue;
            events.push({
                uid: `honeymoon-stop-${stop.id}@wedding`,
                summary: label(stop),
                description: stop.notes ?? undefined,
                date: iso,
                start: stop.start_time,
            });
        }
    }

    return events;
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

export interface SearchHit {
    kind: 'place' | 'note' | 'todo' | 'day' | 'region';
    id: number;
    label: string;
    /** Where it lives, shown under the label. */
    detail: string;
    /** Lower is better. */
    score: number;
}

/**
 * Rank a term across everything in the portal.
 *
 * Prefix matches beat contained matches, and a hit in a title beats a hit in a
 * body — searching "ubud" should surface the Ubud region and the day called
 * Ubud before a restaurant whose description happens to mention it.
 */
function scoreOf(term: string, title: string, body = ''): number | null {
    const t = title.toLowerCase();
    if (t === term) return 0;
    if (t.startsWith(term)) return 1;
    if (t.includes(term)) return 2;
    if (body.toLowerCase().includes(term)) return 4;
    return null;
}

export function searchHoneymoon(
    term: string,
    data: {
        places: Place[];
        notes: GuideNote[];
        todos: TodoItem[];
        days: Day[];
        regions: Region[];
    },
    limit = 12,
): SearchHit[] {
    const needle = term.trim().toLowerCase();
    if (needle.length < 2) return [];
    const hits: SearchHit[] = [];

    for (const place of data.places) {
        const score = scoreOf(needle, place.name, `${place.description ?? ''} ${place.address ?? ''}`);
        if (score != null) {
            hits.push({
                kind: 'place',
                id: place.id,
                label: place.name,
                detail: categoryMeta(place.category).label,
                score,
            });
        }
    }
    for (const region of data.regions) {
        const score = scoreOf(needle, region.name, region.description ?? '');
        if (score != null) {
            hits.push({ kind: 'region', id: region.id, label: region.name, detail: region.country || 'Region', score });
        }
    }
    for (const note of data.notes) {
        const score = scoreOf(needle, note.title, note.body);
        if (score != null) {
            hits.push({ kind: 'note', id: note.id, label: note.title, detail: note.category || 'Guide', score });
        }
    }
    for (const todo of data.todos) {
        const score = scoreOf(needle, todo.text, todo.result ?? '');
        if (score != null) {
            hits.push({
                kind: 'todo',
                id: todo.id,
                label: todo.text,
                detail: todo.done ? 'Done' : (todo.category || 'To do'),
                score,
            });
        }
    }
    for (const day of data.days) {
        const stops = day.stops.map((s) => s.custom_label ?? '').join(' ');
        const score = scoreOf(needle, day.title || `Day ${day.day_number}`, `${day.notes ?? ''} ${stops}`);
        if (score != null) {
            hits.push({
                kind: 'day',
                id: day.id,
                label: `Day ${day.day_number}${day.title ? ` — ${day.title}` : ''}`,
                detail: `${day.stops.length} stop${day.stops.length === 1 ? '' : 's'}`,
                score,
            });
        }
    }

    hits.sort((a, b) => a.score - b.score || a.label.localeCompare(b.label));

    /*
     * Give every kind a seat before filling by score.
     *
     * There are two hundred places and a dozen to-dos, so a plain score sort
     * hands the whole list to places: searching "ubud" buried the *to-do* called
     * "Book Ubud driver" under eleven places whose names begin with Ubud. One
     * best hit per kind first, then the rest in score order — the top result is
     * still the best match, but a search can no longer hide a whole category.
     */
    const seen = new Set<SearchHit>();
    const spread: SearchHit[] = [];
    for (const kind of ['place', 'day', 'note', 'todo', 'region'] as SearchHit['kind'][]) {
        const best = hits.find((h) => h.kind === kind);
        if (best) { spread.push(best); seen.add(best); }
    }
    spread.sort((a, b) => a.score - b.score || a.label.localeCompare(b.label));
    for (const hit of hits) if (!seen.has(hit)) spread.push(hit);
    return spread.slice(0, limit);
}

/** "9:30 AM" from a stored "09:30" — blank input stays blank. */
export function formatTime(value: string | null): string {
    if (!value) return '';
    const [h, m] = value.split(':');
    const hour = Number(h);
    if (!Number.isFinite(hour)) return value;
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const display = hour % 12 === 0 ? 12 : hour % 12;
    return `${display}:${m ?? '00'} ${suffix}`;
}

/* ------------------------------------------------------------------ */
/* Itinerary maths                                                     */
/* ------------------------------------------------------------------ */

/**
 * Consecutive stop-to-stop hops for one day, skipping stops with no pin.
 * Used to surface "next stop: 47 km" under the itinerary.
 */
export function dayHops(stops: Stop[], placeById: Map<number, Place>): { fromIndex: number; km: number }[] {
    const hops: { fromIndex: number; km: number }[] = [];
    let previous: { index: number; point: LatLng } | null = null;

    stops.forEach((stop, index) => {
        const place = stop.place_id == null ? undefined : placeById.get(stop.place_id);
        if (!place || !hasCoords(place)) return;
        const point = { lat: place.lat, lng: place.lng };
        if (previous) hops.push({ fromIndex: previous.index, km: distanceKm(previous.point, point) });
        previous = { index, point };
    });

    return hops;
}

/** Longest single hop on a day, for the "this day is spread out" warning. */
export const SPREAD_WARNING_KM = 40;
