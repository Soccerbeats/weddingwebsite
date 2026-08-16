/**
 * Honeymoon portal — shared types and pure helpers.
 *
 * Everything in here is side-effect free so it can be imported from a server
 * route, a client component, or a verification script without dragging in a
 * database connection.
 */

export type PlaceStatus = 'idea' | 'shortlisted' | 'booked';
export type PlaceSource = 'guide' | 'manual';
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
    sort_order: number;
}

export interface Trip {
    id: number;
    title: string;
    start_date: string | null;
    home_currency: string;
    notes: string | null;
}

export interface HoneymoonPayload {
    trip: Trip;
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

const CATEGORY_BY_KEY = new Map(CATEGORIES.map((c) => [c.key as string, c]));

export function categoryMeta(key: string) {
    return CATEGORY_BY_KEY.get(key) ?? CATEGORY_BY_KEY.get('misc')!;
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

export function formatDayDate(startDate: string | null, dayNumber: number): string | null {
    const date = dateForDay(startDate, dayNumber);
    if (!date) return null;
    return date.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
    });
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
