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

/**
 * How you feel about a candidate stay. Null means not yet judged.
 *
 * `mid` sits between the two: the shortlist is mostly made of places that are
 * neither a yes nor a no, and forcing those into one or the other loses the
 * distinction you actually wanted to record.
 */
export type PlaceRating = 'yes' | 'mid' | 'no' | null;

/** In the order they are shown, which is why `mid` is in the middle. */
export const RATINGS: {
    key: Exclude<PlaceRating, null>; label: string; icon: string; color: string;
}[] = [
    { key: 'yes', label: 'Interested', icon: '👍', color: '#059669' },
    { key: 'mid', label: 'Mid tier', icon: '😐', color: '#d97706' },
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
/**
 * Rows in ranking order: ranked first, ascending, then everything unranked.
 *
 * The tail keeps the order it arrived in, so looking at a shortlist through this
 * lens does not silently re-sort the part of it you have not ranked yet.
 */
export function byRank<T extends { rank: number | null }>(rows: T[]): T[] {
    const ranked = rows.filter((r) => r.rank != null)
        .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
    return [...ranked, ...rows.filter((r) => r.rank == null)];
}

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
    /**
     * A drawn outline, so "which region is this place in" can be answered by
     * geometry rather than by a dropdown. Null for the regions you never drew —
     * those still match on nearest centre.
     */
    boundary: LatLng[] | null;
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
    /** Removed from the shortlist, but kept. Hidden from the maps and the
     *  ordinary buckets; only the Removed bucket shows it. */
    archived: boolean;
    /** Preview image scraped from the listing's Open Graph tags. */
    image_url: string | null;
    /**
     * Country override for this one place. Empty means "whatever its region
     * says" — most places should inherit, and only the odd one out needs this.
     */
    country: string;
    /**
     * Where this stay sits in the shortlist's ranking — 1 is your favourite.
     *
     * Null means unranked, which is every stay until you drag one. Deliberately
     * not `sort_order`: that decides the order of the whole place library, and
     * ranking six hotels must not reshuffle two hundred places.
     */
    rank: number | null;
    sort_order: number;
    /**
     * Real money, beside the free-text `price_note` it replaces.
     *
     * The note stays — "about 1.2m IDR a night, breakfast in" is worth keeping —
     * but only a number can be added up, and the trip total is what the budget
     * needs. `cost_per` says what the number is per, so nights times rate is a
     * sum and not a guess.
     */
    cost: number | null;
    cost_currency: string | null;
    cost_per: CostPer;
    /** OSM's own `opening_hours` string, exactly as the geocoder returned it. */
    opening_hours: string | null;
    /** "sunset", "avoid weekends" — shown when you schedule it. */
    best_time: string | null;
    /**
     * Who liked it: `{ "Austin": "yes", "Heaven": "no" }`.
     *
     * `rating` remains the shared verdict — everything that already reads it
     * keeps working — and this is what makes a disagreement visible instead of
     * letting the last person to tap decide.
     */
    ratings: Record<string, Exclude<PlaceRating, null>>;
    /** Scraped from a listing's JSON-LD, alongside the name and the image. */
    star_rating: number | null;
    price_range: string | null;
    amenities: string[];
}

/** What a place's `cost` is per. */
export type CostPer = 'night' | 'person' | 'total';

export const COST_PER_LABELS: Record<CostPer, string> = {
    night: 'per night',
    person: 'per person',
    total: 'total',
};

export interface Stop {
    id: number;
    day_id: number;
    place_id: number | null;
    custom_label: string | null;
    start_time: string | null;
    notes: string | null;
    sort_order: number;
    /**
     * How long you plan to be there.
     *
     * Optional, and the timeline says so: without it a stop is a point in the
     * day, with it the day becomes a sequence that can be checked against the
     * clock. Nothing is invented for the ones you leave blank.
     */
    duration_minutes: number | null;
    /** Post-trip: what actually happened. */
    outcome: StopOutcome;
    favourite: boolean;
    journal: string | null;
    photos: string[];
}

/** Set once the trip is behind you — null while it is still a plan. */
export type StopOutcome = 'did' | 'skipped' | null;

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
    /**
     * Days between departure and arrival: 0 for the same day, 1 for a red-eye.
     *
     * An offset rather than a date, because a leg hangs off a day and the days
     * renumber whenever one is inserted or dragged. "One day after this one"
     * survives that; "the 14th" does not.
     */
    arrive_day_offset: number;
    /**
     * Where the leg starts and ends, once looked up.
     *
     * Nullable, and independent of the text: a leg is useful as "DPS → SIN,
     * 14:05" long before anyone pins it, so the text stays the thing you type
     * and these are what the map draws when they are there.
     */
    from_lat: number | null;
    from_lng: number | null;
    to_lat: number | null;
    to_lng: number | null;
    /**
     * Order within the day. Legs used to come back `ORDER BY id`, so a leg
     * added after the fact sorted last however early it departs.
     */
    sort_order: number;
    cost: number | null;
    cost_currency: string | null;
    booked_by: string | null;
    /**
     * IANA zones for the two ends — `Asia/Makassar`, `America/Chicago`.
     *
     * Times are stored as the local clock at each end, which is what a ticket
     * says and what you read at the airport. Without the zones a leg home looks
     * like it takes minus four hours; with them the real duration is arithmetic.
     */
    depart_tz: string | null;
    arrive_tz: string | null;
    flight_no: string | null;
    from_terminal: string | null;
    to_terminal: string | null;
    aircraft: string | null;
    /**
     * The journey this leg belongs to — the whole ticket.
     *
     * Null means a journey of one, which is what every leg entered before
     * journeys existed is. Nothing had to be migrated: the UI groups by
     * `journey_id ?? this leg alone`.
     */
    journey_id: number | null;
    /**
     * The dates the ticket states.
     *
     * `day_id` still decides which day card draws the leg and
     * `arrive_day_offset` still says how many days it spans — those are what the
     * itinerary, the calendar file and the print sheet read. These two are the
     * input those are derived from: type the dates off the confirmation and the
     * placement follows, instead of choosing a day number by hand.
     */
    depart_date: string | null;
    arrive_date: string | null;
}

/**
 * A journey: one ticket, however many legs.
 *
 * SAN → SEA → SIN → DPS is one thing you booked, with one reference and one
 * price, and entering it as three day-filed legs was the wrong shape for both
 * the data and the person typing it.
 */
export interface Journey {
    id: number;
    title: string;
    kind: TravelMode;
    notes: string | null;
    sort_order: number;
    created_at: string | null;
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
    /** What the note is about, so the itinerary can surface it in context. */
    region_id: number | null;
    place_id: number | null;
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
    /** A task to do before you go, or a thing to put in a bag. */
    kind: TodoKind;
    /** Whose bag, or whose job. */
    person: string | null;
    /** "Book the Ubud driver" belongs to the Ubud day. */
    place_id: number | null;
    day_id: number | null;
}

export type TodoKind = 'task' | 'packing';

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
    /** What you mean to spend, against which the real total is measured. */
    budget: number | null;
    /**
     * The two of you, comma-separated — "Austin, Heaven".
     *
     * Used for per-person ratings, packing lists and the shared link's greeting.
     * Free text because a honeymoon has exactly the names it has.
     */
    partner_names: string;
    /** Emergency numbers, embassy, insurer, the driver's WhatsApp. */
    info: TripInfo;
    time_format: '12h' | '24h';
    distance_unit: 'km' | 'mi';
    /**
     * Which half of the trip's life it is in.
     *
     * `planning` is the shortlists and the map; `travelling` puts Today first;
     * `after` turns the itinerary into a journal. One field rather than dates,
     * so it stays yours to decide — a trip is not over because a date passed.
     */
    phase: TripPhase;
}

export type TripPhase = 'planning' | 'travelling' | 'after';

/** Free-form sections on the trip: the things you need at 2am, not at leisure. */
export interface TripInfo {
    emergency?: string;
    embassy?: string;
    insurance?: string;
    contacts?: string;
    medical?: string;
    money?: string;
    [key: string]: string | undefined;
}

/**
 * A booking: the paperwork behind `status: booked`.
 *
 * Exactly one of `place_id`, `travel_id` and `stop_id` is set — a stay or an
 * excursion hangs off its place, a flight off its leg, a dinner table off the
 * stop that is the dinner.
 */
export interface Booking {
    id: number;
    place_id: number | null;
    travel_id: number | null;
    stop_id: number | null;
    /** A ticket covers a whole journey: one reference for every leg on it. */
    journey_id: number | null;
    kind: BookingKind;
    provider: string | null;
    confirmation: string | null;
    url: string | null;
    contact: string | null;
    check_in: string | null;
    check_out: string | null;
    check_in_time: string | null;
    check_out_time: string | null;
    cost: number | null;
    cost_currency: string | null;
    cost_paid: number | null;
    /** Money owed by this date; the dashboard counts down to it. */
    deposit_due_on: string | null;
    /** After this date, cancelling costs you. The one date worth an alarm. */
    cancel_by: string | null;
    party_size: number | null;
    dress_code: string | null;
    paid: boolean;
    /** Filenames in the photos volume — a PDF, a screenshot of the email. */
    documents: string[];
    notes: string | null;
    created_at: string | null;
}

export type BookingKind = 'stay' | 'excursion' | 'travel' | 'table' | 'other';

export const BOOKING_KINDS: { key: BookingKind; label: string }[] = [
    { key: 'stay', label: 'Stay' },
    { key: 'excursion', label: 'Excursion' },
    { key: 'travel', label: 'Travel' },
    { key: 'table', label: 'Table' },
    { key: 'other', label: 'Other' },
];

/** A file you would be sorry to be without at a border. */
export interface TripDocument {
    id: number;
    name: string;
    kind: DocumentKind;
    path: string;
    place_id: number | null;
    travel_id: number | null;
    person: string | null;
    expires_on: string | null;
    notes: string | null;
    created_at: string | null;
}

export type DocumentKind = 'passport' | 'visa' | 'insurance' | 'ticket'
    | 'vaccination' | 'reservation' | 'other';

export const DOCUMENT_KINDS: { key: DocumentKind; label: string; icon: string }[] = [
    { key: 'passport', label: 'Passport', icon: '🛂' },
    { key: 'visa', label: 'Visa', icon: '📄' },
    { key: 'insurance', label: 'Insurance', icon: '🩺' },
    { key: 'ticket', label: 'Ticket', icon: '🎫' },
    { key: 'vaccination', label: 'Vaccination', icon: '💉' },
    { key: 'reservation', label: 'Reservation', icon: '📌' },
    { key: 'other', label: 'Other', icon: '📎' },
];

/** A short note on a place, from one of you to the other. */
export interface PlaceComment {
    id: number;
    place_id: number;
    author: string;
    body: string;
    created_at: string | null;
}

/** A named set of filters on a tab. */
export interface SavedView {
    id: number;
    name: string;
    tab: string;
    filters: Record<string, unknown>;
    sort_order: number;
}

/** A read-only link handed to someone who is not the admin. */
export interface ShareLink {
    id: number;
    token: string;
    label: string;
    scope: ShareScope;
    expires_on: string | null;
    revoked: boolean;
    created_at: string | null;
    last_seen_at: string | null;
}

export type ShareScope = 'today' | 'itinerary' | 'all';

/** One stored exchange rate. `manual` means you set it and a fetch must not. */
export interface CurrencyRate {
    id: number;
    pair: string;
    rate: number;
    manual: boolean;
    fetched_at: string | null;
}

/**
 * A price read off a listing on a date.
 *
 * Only the two most recent per place travel in the payload: "up 12% since the
 * 3rd" needs exactly two numbers, and a shortlist that has been checked weekly
 * for two months does not need eighty rows on every page load.
 */
export interface PriceCheck {
    place_id: number;
    amount: number | null;
    currency: string | null;
    price_note: string | null;
    checked_at: string | null;
}

/** A frozen trip, listed without its payload — those are large. */
export interface TripArchiveMeta {
    id: number;
    name: string;
    created_at: string | null;
    /** Rough size, so a list of snapshots says something about each. */
    places: number;
    days: number;
}

export interface HoneymoonPayload {
    trip: Trip;
    journeys: Journey[];
    todos: TodoItem[];
    categories: CategoryRow[];
    regions: Region[];
    places: Place[];
    days: Day[];
    notes: GuideNote[];
    bookings: Booking[];
    documents: TripDocument[];
    comments: PlaceComment[];
    views: SavedView[];
    rates: CurrencyRate[];
    shares: ShareLink[];
    price_checks: PriceCheck[];
    archives: TripArchiveMeta[];
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

/**
 * How each mode is drawn on the map, as well as named.
 *
 * `curve` is how far the arc bows out from the straight line, as a fraction of
 * its length: a flight bows the most because that is what reads as "flew over
 * this", and a walk is nearly straight because it is a hundred metres and
 * pretending otherwise would be a lie about the route. `dash` keeps every leg
 * visibly *not* a road — a leg is a hop between two points, not a path anyone
 * drove — while still telling the modes apart.
 */
export const TRAVEL_MODES: {
    key: TravelMode; label: string; icon: string; color: string; dash: string; curve: number;
}[] = [
    { key: 'flight', label: 'Flight', icon: '✈️', color: '#0369a1', dash: '2 8', curve: 0.28 },
    { key: 'boat', label: 'Boat', icon: '⛴️', color: '#0891b2', dash: '6 6', curve: 0.2 },
    { key: 'car', label: 'Car', icon: '🚗', color: '#b45309', dash: '10 6', curve: 0.10 },
    { key: 'train', label: 'Train', icon: '🚆', color: '#6d28d9', dash: '12 4 2 4', curve: 0.10 },
    { key: 'walk', label: 'Walk', icon: '🚶', color: '#4d7c0f', dash: '1 6', curve: 0.05 },
];

/** The mode's drawing style, falling back to flight for anything unknown. */
export function travelModeMeta(mode: string) {
    return TRAVEL_MODES.find((m) => m.key === mode) ?? TRAVEL_MODES[0];
}

/** The day number a leg lands on, given the day it leaves. */
export function legArrivalDay(leg: { arrive_day_offset: number }, departureDay: number): number {
    return departureDay + Math.max(0, leg.arrive_day_offset || 0);
}

/** True for a leg that lands on a later day than it left. */
export function legIsOvernight(leg: { arrive_day_offset: number }): boolean {
    return (leg.arrive_day_offset || 0) > 0;
}

/**
 * Legs that *land* on a given day, having left on an earlier one.
 *
 * A red-eye belongs to the day it departs — that is the day you pack and leave
 * — but the day it lands is not empty, and an itinerary that says so only on the
 * departure day makes the arrival day look like a free morning. This is what the
 * itinerary, the calendar and the print sheet all read to say "you land here".
 */
export function arrivalsOn(days: Day[], dayNumber: number): { leg: TravelLeg; fromDay: Day }[] {
    const found: { leg: TravelLeg; fromDay: Day }[] = [];
    for (const day of days) {
        if (day.day_number >= dayNumber) continue;
        for (const leg of day.travel) {
            if (!legIsOvernight(leg)) continue;
            if (legArrivalDay(leg, day.day_number) === dayNumber) found.push({ leg, fromDay: day });
        }
    }
    return found;
}

/** Both ends of a leg, or null when either has not been looked up. */
export function legEnds(leg: TravelLeg): {
    from: { lat: number; lng: number }; to: { lat: number; lng: number };
} | null {
    if (leg.from_lat == null || leg.from_lng == null) return null;
    if (leg.to_lat == null || leg.to_lng == null) return null;
    return {
        from: { lat: leg.from_lat, lng: leg.from_lng },
        to: { lat: leg.to_lat, lng: leg.to_lng },
    };
}

/**
 * A leg as a curve, not a straight line.
 *
 * A quadratic Bézier whose control point is pushed out perpendicular to the
 * midpoint, sampled into `steps` segments — Leaflet draws polylines, so the
 * curve has to arrive as points. Two reasons it bows rather than going straight:
 * a straight line between two pins is indistinguishable from the day routes
 * already on the map, and two legs between the same pair of places (out on the
 * Monday, back on the Friday) would otherwise sit exactly on top of each other.
 *
 * The bow is always to the same side of the direction of travel, so an outbound
 * and a return leg arc away from each other and read as two journeys.
 *
 * Longitude is scaled by cos(latitude) while offsetting, so the arc looks like
 * an arc on a Mercator map instead of flattening out near the equator and
 * ballooning near the poles.
 */
export function arcPoints(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
    curve = 0.2,
    steps = 48,
): { lat: number; lng: number }[] {
    const midLat = (from.lat + to.lat) / 2;
    const midLng = (from.lng + to.lng) / 2;

    // The straight line, in degrees, with longitude squeezed to match latitude.
    const scale = Math.max(0.2, Math.cos((midLat * Math.PI) / 180));
    const dLat = to.lat - from.lat;
    const dLng = (to.lng - from.lng) * scale;
    const length = Math.hypot(dLat, dLng);

    // Two points in the same place have no direction to bow away from.
    if (length === 0) return [{ ...from }, { ...to }];

    // Perpendicular to the direction of travel, right-hand side.
    const offset = length * curve;
    const controlLat = midLat + (dLng / length) * offset;
    const controlLng = midLng - ((dLat / length) * offset) / scale;

    const points: { lat: number; lng: number }[] = [];
    const count = Math.max(2, Math.round(steps));
    for (let i = 0; i <= count; i += 1) {
        const t = i / count;
        const inverse = 1 - t;
        points.push({
            lat: inverse * inverse * from.lat + 2 * inverse * t * controlLat + t * t * to.lat,
            lng: inverse * inverse * from.lng + 2 * inverse * t * controlLng + t * t * to.lng,
        });
    }
    return points;
}

/**
 * Which way a confirmed/unconfirmed toggle should go for a selection.
 *
 * `needs_review` is the "I have not checked this pin" flag: a bulk-geocoded
 * guess reads exactly like a real location, so the map hides unconfirmed pins
 * until someone has looked. Confirming a lassoed area was already one click;
 * putting one *back* meant going through the ⋯ field menu, which is the wrong
 * amount of work for "actually, those are wrong".
 *
 * One button, and the selection decides the direction: if every place in it is
 * already confirmed the only move left is to un-confirm them; with even one
 * unconfirmed in there, confirming the lot is what you meant. Mixed selections
 * therefore confirm — the direction you are nearly always heading — and the
 * count is there so the label can say what will happen rather than implying it.
 */
export function reviewToggleFor(places: { needs_review: boolean }[]): {
    /** What to write to `needs_review` on all of them. */
    needsReview: boolean;
    unconfirmed: number;
    confirmed: number;
    label: string;
} {
    const unconfirmed = places.filter((place) => place.needs_review).length;
    const confirmed = places.length - unconfirmed;
    // An empty selection cannot be acted on anyway; "Mark reviewed" is the
    // resting label because it is the common direction.
    const needsReview = places.length > 0 && unconfirmed === 0;
    return {
        needsReview,
        unconfirmed,
        confirmed,
        label: needsReview ? 'Mark unconfirmed' : 'Mark reviewed',
    };
}

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
    USD: '$', EUR: '€', GBP: '£', AUD: 'A$', CAD: 'C$', SGD: 'S$', NZD: 'NZ$', IDR: 'Rp',
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
    const text = note.replace(/,/g, '');
    // Prefer the figure that is visibly money — "2 bed villa $300" is 300, not
    // 2 — and fall back to the first number when nothing is marked.
    const marked = text.match(/(?:[$€£]|Rp|A\$|C\$|S\$|NZ\$)\s*(\d+(?:\.\d+)?)/i)
        ?? text.match(/(\d+(?:\.\d+)?)\s*(?:USD|EUR|GBP|AUD|CAD|SGD|NZD|IDR|k\b)/i);
    const match = marked ? marked[1] : text.match(/-?\d+(\.\d+)?/)?.[0];
    if (!match) return null;
    const value = Number(match);
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
    /**
     * `YYYY-MM-DD` the event ends on, when that is not the day it started.
     *
     * Only meaningful with `start`/`end` times: an overnight flight's 06:20
     * arrival is on the next date, and without this it would be written as a
     * same-day event ending before it began.
     */
    endDate?: string;
    /** `HH:MM`. Both present makes it a timed event; absent makes it all-day. */
    start?: string;
    end?: string;
    /**
     * IANA zone for the times, when it is known.
     *
     * Without one, a phone reads the time as its *own* local time, so a flight at
     * 14:05 Bali time shows at 14:05 wherever the phone happens to be — which is
     * wrong by eight hours for most of the planning and by the wrong direction on
     * the way home. `TZID` is how a calendar is told.
     */
    tzid?: string;
    /** A link on the event: the booking page, the listing. */
    url?: string;
    /** `geo:` coordinates, which phones turn into a "directions" button. */
    geo?: { lat: number; lng: number };
    /** Minutes before the start to alarm. Only for timed events. */
    alarmMinutes?: number;
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
        // A zone turns "14:05" from "whatever the phone thinks" into a real
        // instant. Written as TZID on both ends, which is what phones read.
        const tz = event.tzid ? `;TZID=${event.tzid}` : '';
        if (event.start) {
            // A different end date makes any end time valid, including one
            // earlier in the clock than the start — that is what an overnight
            // flight is. Without one, an end that is not later than the start is
            // meaningless and gets the one-hour guess.
            const endsLater = !!event.endDate && event.endDate !== event.date;
            const end = event.end && (endsLater || event.end > event.start)
                ? event.end
                // No end time given: an hour is a better guess than a zero-length
                // event, which some calendars refuse to draw at all.
                : addHour(event.start);
            const endCompact = (endsLater ? event.endDate! : event.date).replace(/-/g, '');
            lines.push(`DTSTART${tz}:${compact}T${event.start.replace(':', '')}00`);
            lines.push(`DTEND${tz}:${endCompact}T${end.replace(':', '')}00`);
        } else {
            // All-day events are exclusive at the end, hence the +1 day.
            lines.push(`DTSTART;VALUE=DATE:${compact}`);
            lines.push(`DTEND;VALUE=DATE:${addDays(event.date, 1).replace(/-/g, '')}`);
        }
        lines.push(`SUMMARY:${icsText(event.summary)}`);
        if (event.description) lines.push(`DESCRIPTION:${icsText(event.description)}`);
        if (event.location) lines.push(`LOCATION:${icsText(event.location)}`);
        if (event.url) lines.push(`URL:${icsText(event.url)}`);
        // X-APPLE-STRUCTURED-LOCATION is what turns a coordinate into a
        // "directions" button on an iPhone; GEO is the standard field everything
        // else reads. Both, because the pair costs two lines.
        if (event.geo) {
            lines.push(`GEO:${event.geo.lat};${event.geo.lng}`);
            lines.push(
                'X-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-ADDRESS='
                + `${icsText(event.location ?? '')};X-APPLE-RADIUS=100;X-TITLE=`
                + `${icsText(event.summary)}:geo:${event.geo.lat},${event.geo.lng}`,
            );
        }
        // An alarm on a timed event only: "30 minutes before" a whole day is not
        // a useful thing to be told.
        if (event.start && event.alarmMinutes) {
            lines.push('BEGIN:VALARM');
            lines.push('ACTION:DISPLAY');
            lines.push(`DESCRIPTION:${icsText(event.summary)}`);
            lines.push(`TRIGGER:-PT${Math.round(event.alarmMinutes)}M`);
            lines.push('END:VALARM');
        }
        lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    // CRLF throughout: the spec requires it, and Outlook enforces it.
    return `${lines.map(icsFold).join('\r\n')}\r\n`;
}

/** `HH:MM` a number of minutes later, wrapping past midnight. */
export function addMinutes(time: string, minutes: number): string {
    const match = /^(\d{1,2}):(\d{2})$/.exec(time);
    if (!match) return time;
    const total = ((Number(match[1]) * 60 + Number(match[2]) + minutes) % 1440 + 1440) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function addHour(time: string): string {
    const [h, m] = time.split(':').map(Number);
    // A 23:xx start cannot end an hour later on the same date; 23:59 keeps the
    // event non-zero-length rather than making DTEND equal DTSTART.
    if ((h ?? 0) >= 23) return '23:59';
    return `${String((h ?? 0) + 1).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`;
}

/**
 * The trip as calendar events.
 *
 * One all-day event per day carrying its stops in the description — that is the
 * thing you want on the phone when you wake up — plus a timed event for every
 * travel leg and every stop that has a time, which are the things you can
 * actually be late for.
 */
/** Colours for overlaid day routes, one per day; wraps after sixteen. */
export const DAY_COLORS = [
    '#0f172a', '#be123c', '#0891b2', '#a16207', '#7c3aed', '#059669', '#ea580c', '#db2777',
    '#4d7c0f', '#0284c7', '#9333ea', '#b45309', '#15803d', '#e11d48', '#334155', '#c026d3',
];

export function dayColor(dayNumber: number): string {
    return DAY_COLORS[(Math.max(1, dayNumber) - 1) % DAY_COLORS.length];
}

export function tripEvents(
    trip: { start_date: string | null; title: string },
    days: Day[],
    placeName: (id: number) => string | undefined,
    placeAddress: (id: number) => string | undefined = () => undefined,
    /**
     * Optional extras, so an older caller keeps working unchanged.
     *
     * `place` gives the coordinates and first link for a stop; `alarmMinutes`
     * turns on reminders; `tzFor` supplies a zone per day, which is what makes a
     * timed event mean the same thing on a phone in another country.
     */
    extras: {
        place?: (id: number) => { lat: number | null; lng: number | null; url?: string } | undefined;
        alarmMinutes?: number;
        tzFor?: (dayNumber: number) => string | undefined;
    } = {},
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
            const arrivalDate = legIsOvernight(leg)
                ? dateForDay(trip.start_date, legArrivalDay(leg, day.day_number))
                : null;
            const nights = leg.arrive_day_offset || 0;
            events.push({
                uid: `honeymoon-travel-${leg.id}@wedding`,
                summary: `${mode}${route ? `: ${route}` : ''}`
                    + (nights > 0 ? ` (+${nights} day${nights === 1 ? '' : 's'})` : ''),
                description: [
                    leg.confirmation_ref ? `Ref ${leg.confirmation_ref}` : '',
                    leg.flight_no ?? '',
                    leg.from_terminal ? `From terminal ${leg.from_terminal}` : '',
                    leg.to_terminal ? `To terminal ${leg.to_terminal}` : '',
                ].filter(Boolean).join('\n') || undefined,
                date: iso,
                ...(arrivalDate ? { endDate: isoOf(arrivalDate) } : {}),
                start: leg.depart_time ?? undefined,
                end: leg.arrive_time ?? undefined,
                // The leg's own departure zone beats the day's: that is the
                // clock on the ticket.
                tzid: leg.depart_tz ?? extras.tzFor?.(day.day_number),
                // An hour before a flight is not enough warning; the alarm is
                // deliberately longer for travel than for a dinner.
                alarmMinutes: extras.alarmMinutes ? extras.alarmMinutes * 4 : undefined,
            });
        }

        for (const stop of day.stops) {
            if (!stop.start_time) continue;
            const address = stop.place_id != null ? placeAddress(stop.place_id) : undefined;
            const detail = stop.place_id != null ? extras.place?.(stop.place_id) : undefined;
            const geo = detail?.lat != null && detail.lng != null
                ? { lat: detail.lat, lng: detail.lng }
                : undefined;
            // A duration makes the event the right length instead of the
            // one-hour guess the builder falls back to.
            const end = stop.duration_minutes
                ? addMinutes(stop.start_time, stop.duration_minutes)
                : undefined;
            events.push({
                uid: `honeymoon-stop-${stop.id}@wedding`,
                summary: label(stop),
                description: stop.notes ?? undefined,
                location: address || undefined,
                date: iso,
                start: stop.start_time,
                end,
                geo,
                url: detail?.url,
                tzid: extras.tzFor?.(day.day_number),
                alarmMinutes: extras.alarmMinutes,
            });
        }
    }

    return events;
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

export interface SearchHit {
    kind: 'place' | 'note' | 'todo' | 'day' | 'region' | 'travel' | 'booking';
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
    // Last resort: a typo. Only for terms long enough that a near-match means
    // something — "ubd" should find Ubud, "ub" should not start guessing.
    if (term.length >= 4 && isNearMatch(term, t)) return 6;
    return null;
}

/**
 * Is one word a typo of another?
 *
 * A bounded edit distance: at most one substitution, insertion or deletion, and
 * only against whole words in the title. Cheap, and it covers the mistakes that
 * actually happen — a dropped letter, a doubled one, two swapped.
 */
export function isNearMatch(term: string, title: string): boolean {
    for (const word of title.split(/[^a-z0-9]+/i)) {
        if (word.length < 3) continue;
        if (withinOneEdit(term, word.toLowerCase())) return true;
    }
    return false;
}

function withinOneEdit(a: string, b: string): boolean {
    if (Math.abs(a.length - b.length) > 1) return false;
    if (a === b) return true;
    // Walk both, allowing exactly one divergence.
    let i = 0;
    let j = 0;
    let slack = 1;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) { i += 1; j += 1; continue; }
        if (!slack) return false;
        slack = 0;
        if (a.length === b.length) { i += 1; j += 1; }        // substitution
        else if (a.length > b.length) i += 1;                  // deletion from a
        else j += 1;                                          // insertion into a
    }
    return true;
}

export function searchHoneymoon(
    term: string,
    data: {
        places: Place[];
        notes: GuideNote[];
        todos: TodoItem[];
        days: Day[];
        regions: Region[];
        /** Optional: older callers (and the check script) do not pass these. */
        bookings?: Booking[];
    },
    limit = 12,
): SearchHit[] {
    const needle = term.trim().toLowerCase();
    if (needle.length < 2) return [];
    const hits: SearchHit[] = [];
    const placeNames = new Map(data.places.map((p) => [p.id, p.name]));

    for (const place of data.places) {
        // Everything written on a place is searchable, not just its name and
        // description: "AMK-9931" and "1.2m a night" are things people look for.
        const score = scoreOf(needle, place.name, [
            place.description ?? '', place.address ?? '', place.price_note ?? '',
            place.best_time ?? '', place.opening_hours ?? '',
            place.links.map((link) => `${link.label} ${link.url}`).join(' '),
        ].join(' '));
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
        const stops = day.stops
            .map((s) => `${s.custom_label ?? ''} ${s.notes ?? ''} `
                + `${s.place_id != null ? placeNames.get(s.place_id) ?? '' : ''}`)
            .join(' ');
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

        /*
         * Travel legs, which were not searchable at all.
         *
         * The thing you actually search for is a confirmation reference or an
         * airport code — "KX7QP2", "DPS" — and neither was indexed anywhere.
         */
        for (const leg of day.travel) {
            const label = [leg.from_text, leg.to_text].filter(Boolean).join(' → ')
                || travelModeMeta(leg.mode).label;
            const legScore = scoreOf(needle, label, [
                leg.confirmation_ref ?? '', leg.flight_no ?? '', leg.notes ?? '',
                leg.booked_by ?? '', leg.aircraft ?? '',
            ].join(' '));
            if (legScore != null) {
                hits.push({
                    kind: 'travel',
                    id: leg.id,
                    label: `${travelModeMeta(leg.mode).icon} ${label}`,
                    detail: `Day ${day.day_number}${leg.flight_no ? ` · ${leg.flight_no}` : ''}`,
                    score: legScore,
                });
            }
        }
    }

    for (const booking of data.bookings ?? []) {
        const name = booking.place_id != null
            ? placeNames.get(booking.place_id) ?? 'Booking'
            : booking.provider || 'Booking';
        const score = scoreOf(needle, `${name} ${booking.confirmation ?? ''}`, [
            booking.provider ?? '', booking.contact ?? '', booking.notes ?? '',
            booking.url ?? '',
        ].join(' '));
        if (score != null) {
            hits.push({
                kind: 'booking',
                id: booking.id,
                label: `${name}${booking.confirmation ? ` · ${booking.confirmation}` : ''}`,
                detail: booking.provider || 'Booking',
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
    for (const kind of
        ['place', 'day', 'note', 'todo', 'region', 'travel', 'booking'] as SearchHit['kind'][]) {
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
