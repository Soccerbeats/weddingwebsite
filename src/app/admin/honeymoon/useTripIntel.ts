'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { dateForDay, hasCoords, isoOf } from '@/lib/honeymoon';
import type { HoneymoonPayload, LatLng, Place } from '@/lib/honeymoon';
import { nominalZone, sunTimesLocal } from '@/lib/honeymoonSun';
import type { Hop } from '@/lib/honeymoonTimeline';

/** What the itinerary knows once it has asked the outside world. */
export interface DayIntel {
    weather: {
        kind: 'forecast' | 'climate';
        high: number | null;
        low: number | null;
        rain: number | null;
        rain_chance: number | null;
        label: string | null;
    } | null;
    sunrise: string | null;
    sunset: string | null;
}

const LOOKUP_KEY = 'honeymoon-live-lookups';

const lookupListeners = new Set<() => void>();

function subscribeLookups(callback: () => void) {
    lookupListeners.add(callback);
    return () => { lookupListeners.delete(callback); };
}

function readLookups(): boolean {
    try { return localStorage.getItem(LOOKUP_KEY) !== '0'; } catch { return true; }
}

/**
 * Road times and weather for the trip, fetched once and remembered.
 *
 * Both services are free and public, both are cached server-side, and neither is
 * allowed to matter: every value here starts null, and the itinerary renders
 * exactly as it did before while they are missing. The only thing that changes
 * when an answer lands is that a number gets more honest — a straight line
 * becomes a drive, a guess becomes a forecast.
 *
 * Lookups can be turned off per browser. On by default because the answer is
 * the point, off available because the demo instance and a metered connection
 * both have a reason not to.
 */
export function useTripIntel(data: HoneymoonPayload | null) {
    const [hops, setHops] = useState<Record<string, Hop>>({});
    /** Road geometry per travel leg id, for the map to draw. */
    const [legRoads, setLegRoads] = useState<Record<number, [number, number][]>>({});
    const [days, setDays] = useState<Record<number, DayIntel['weather']>>({});
    const [loading, setLoading] = useState(false);
    /** Keys already asked for, so a refetch of the payload does not re-ask. */
    const asked = useRef(new Set<string>());

    // Read through a store rather than an effect: the server has no
    // localStorage, so the first render must be the default and the stored
    // choice can only arrive after hydration.
    const enabled = useSyncExternalStore(subscribeLookups, readLookups, () => true);
    const setLookups = useCallback((next: boolean) => {
        try { localStorage.setItem(LOOKUP_KEY, next ? '1' : '0'); } catch { /* ignore */ }
        lookupListeners.forEach((listener) => listener());
    }, []);

    /** Consecutive pinned stops, per day: exactly the hops a day card draws. */
    const pairs = useMemo(() => {
        if (!data) return [];
        const byId = new Map<number, Place>(data.places.map((place) => [place.id, place]));
        const out: { key: string; from: Place; to: Place }[] = [];
        for (const day of data.days) {
            const pinned = day.stops
                .map((stop) => (stop.place_id != null ? byId.get(stop.place_id) ?? null : null));
            for (let i = 1; i < pinned.length; i += 1) {
                const from = pinned[i - 1];
                const to = pinned[i];
                if (!from || !to || !hasCoords(from) || !hasCoords(to)) continue;
                out.push({ key: `${from.id}:${to.id}`, from, to });
            }
        }
        // One entry per distinct pair: the same drive on three days is one lookup.
        const seen = new Set<string>();
        return out.filter((pair) => {
            if (seen.has(pair.key)) return false;
            seen.add(pair.key);
            return true;
        });
    }, [data]);

    /**
     * Ground legs with both ends pinned.
     *
     * Only ground: a flight has no road, and the map's arc is the honest drawing
     * of it. A car leg's interesting fact is which way the road goes — round the
     * coast or over the pass — and that is what the geometry shows.
     */
    const legPairs = useMemo(() => {
        if (!data) return [];
        const out: { key: string; id: number; from: LatLng; to: LatLng; mode: 'car' | 'foot' }[] = [];
        for (const day of data.days) {
            for (const leg of day.travel) {
                if (leg.mode === 'flight' || leg.mode === 'boat') continue;
                if (leg.from_lat == null || leg.from_lng == null
                    || leg.to_lat == null || leg.to_lng == null) continue;
                out.push({
                    key: `leg:${leg.id}`,
                    id: leg.id,
                    from: { lat: leg.from_lat, lng: leg.from_lng },
                    to: { lat: leg.to_lat, lng: leg.to_lng },
                    mode: leg.mode === 'walk' ? 'foot' : 'car',
                });
            }
        }
        return out;
    }, [data]);

    /** One weather point per day: where you are sleeping, on that date. */
    const points = useMemo(() => {
        if (!data?.trip.start_date) return [];
        const byId = new Map<number, Place>(data.places.map((place) => [place.id, place]));
        const out: { key: string; lat: number; lng: number; date: string; day: number }[] = [];
        for (const day of data.days) {
            const base = day.base_place_id != null ? byId.get(day.base_place_id) ?? null : null;
            if (!base || !hasCoords(base)) continue;
            const date = dateForDay(data.trip.start_date, day.day_number);
            if (!date) continue;
            out.push({
                key: `w:${day.day_number}`,
                lat: base.lat,
                lng: base.lng,
                date: isoOf(date),
                day: day.day_number,
            });
        }
        return out;
    }, [data]);

    useEffect(() => {
        if (!enabled) return;
        const fresh = pairs.filter((pair) => !asked.current.has(`r:${pair.key}`));
        const freshPoints = points.filter((point) => !asked.current.has(point.key));
        const freshLegs = legPairs.filter((leg) => !asked.current.has(leg.key));
        if (!fresh.length && !freshPoints.length && !freshLegs.length) return;

        let cancelled = false;
        for (const pair of fresh) asked.current.add(`r:${pair.key}`);
        for (const point of freshPoints) asked.current.add(point.key);
        for (const leg of freshLegs) asked.current.add(leg.key);

        const work: Promise<void>[] = [];

        if (fresh.length) {
            work.push((async () => {
                try {
                    const res = await fetch('/api/admin/honeymoon/routes', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            pairs: fresh.map((pair) => ({
                                key: pair.key,
                                from: { lat: pair.from.lat, lng: pair.from.lng },
                                to: { lat: pair.to.lat, lng: pair.to.lng },
                            })),
                        }),
                    });
                    if (!res.ok || cancelled) return;
                    const body = await res.json() as {
                        results?: { key: string; hop: Hop | null }[];
                    };
                    const next: Record<string, Hop> = {};
                    for (const row of body.results ?? []) if (row.hop) next[row.key] = row.hop;
                    if (Object.keys(next).length) setHops((prev) => ({ ...prev, ...next }));
                } catch { /* the estimate stands in; nothing to report */ }
            })());
        }

        if (freshLegs.length) {
            work.push((async () => {
                try {
                    const res = await fetch('/api/admin/honeymoon/routes', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            pairs: freshLegs.map((leg) => ({
                                key: String(leg.id),
                                from: leg.from,
                                to: leg.to,
                                mode: leg.mode,
                            })),
                        }),
                    });
                    if (!res.ok || cancelled) return;
                    const body = await res.json() as {
                        results?: { key: string; geometry: [number, number][] | null }[];
                    };
                    const next: Record<number, [number, number][]> = {};
                    for (const row of body.results ?? []) {
                        const id = Number(row.key);
                        if (Number.isFinite(id) && row.geometry?.length) next[id] = row.geometry;
                    }
                    if (Object.keys(next).length) setLegRoads((prev) => ({ ...prev, ...next }));
                } catch { /* the map draws the arc instead */ }
            })());
        }

        if (freshPoints.length) {
            work.push((async () => {
                try {
                    const res = await fetch('/api/admin/honeymoon/weather', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ points: freshPoints }),
                    });
                    if (!res.ok || cancelled) return;
                    const body = await res.json() as {
                        results?: { key: string; weather: DayIntel['weather'] }[];
                    };
                    const next: Record<number, DayIntel['weather']> = {};
                    for (const row of body.results ?? []) {
                        const day = Number(row.key.replace('w:', ''));
                        if (Number.isFinite(day) && row.weather) next[day] = row.weather;
                    }
                    if (Object.keys(next).length) setDays((prev) => ({ ...prev, ...next }));
                } catch { /* the card simply has no weather line */ }
            })());
        }

        // The flag is set inside the async run, not in the effect body: a
        // synchronous setState here would re-render before a single request had
        // even left, which is both pointless and what the compiler warns about.
        void (async () => {
            if (!cancelled) setLoading(true);
            await Promise.all(work);
            if (!cancelled) setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [enabled, pairs, points, legPairs]);

    /** The road time for a hop, or null so the caller can estimate. */
    const hopFor = useCallback((from: Place, to: Place): Hop | null => (
        hops[`${from.id}:${to.id}`] ?? null
    ), [hops]);

    /**
     * Weather and daylight for a day.
     *
     * Sun times are computed here rather than fetched — they are arithmetic —
     * using the base's longitude for the zone, which is right in the tropics and
     * at worst an hour out where a country has stretched its clock.
     */
    const intelFor = useCallback((dayNumber: number): DayIntel => {
        const point = points.find((entry) => entry.day === dayNumber);
        if (!point) return { weather: days[dayNumber] ?? null, sunrise: null, sunset: null };
        const sun = sunTimesLocal(point.lat, point.lng, point.date, nominalZone(point.lng));
        return {
            weather: days[dayNumber] ?? null,
            sunrise: sun.sunrise,
            sunset: sun.sunset,
        };
    }, [days, points]);

    /** The road a ground leg actually follows, when it has been looked up. */
    const roadFor = useCallback(
        (legId: number): [number, number][] | null => legRoads[legId] ?? null,
        [legRoads],
    );

    return { hopFor, intelFor, roadFor, loading, enabled, setLookups };
}

export type TripIntel = ReturnType<typeof useTripIntel>;
