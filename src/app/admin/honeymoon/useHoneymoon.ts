'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeCategoryKey, setCategoryRegistry, titleCase } from '@/lib/honeymoon';
import type { HoneymoonPayload, Place } from '@/lib/honeymoon';

export type Resource =
    'categories' | 'regions' | 'places' | 'days' | 'stops' | 'travel' | 'notes' | 'todos' | 'trip';

const BASE = '/api/admin/honeymoon';

/**
 * Owns the honeymoon portal's data and every mutation.
 *
 * Like the finance suite, mutations refetch the whole payload rather than
 * patching local state: moving a stop changes the map's route, the day's hop
 * distances and the place's scheduled badge all at once, and one request that
 * cannot drift beats three optimistic updates that can.
 */
export function useHoneymoon() {
    const [data, setData] = useState<HoneymoonPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(0);
    const inFlight = useRef(0);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch(BASE, { cache: 'no-store' });
            if (!res.ok) throw new Error('Failed to load honeymoon data');
            const payload: HoneymoonPayload = await res.json();
            // Publish before the state update so the first render that sees the
            // new places already resolves their colours and labels correctly.
            setCategoryRegistry(payload.categories);
            setData(payload);
            setError('');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load honeymoon data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const run = useCallback(async (fn: () => Promise<Response>) => {
        inFlight.current += 1;
        setBusy(inFlight.current);
        try {
            const res = await fn();
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || 'Save failed');
            }
            await refresh();
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Save failed');
            return false;
        } finally {
            inFlight.current -= 1;
            setBusy(inFlight.current);
        }
    }, [refresh]);

    const create = useCallback((resource: Resource, body: Record<string, unknown>) => run(
        () => fetch(`${BASE}/${resource}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }),
    ), [run]);

    const update = useCallback((resource: Resource, body: Record<string, unknown>) => run(
        () => fetch(`${BASE}/${resource}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }),
    ), [run]);

    const reorder = useCallback((resource: Resource, ids: number[]) => run(
        () => fetch(`${BASE}/${resource}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ids.map((id) => ({ id }))),
        }),
    ), [run]);

    const remove = useCallback((resource: Resource, id: number) => run(
        () => fetch(`${BASE}/${resource}?id=${id}`, { method: 'DELETE' }),
    ), [run]);

    /**
     * Create a region and hand back its id.
     *
     * `create` only reports success, but the editor has to select the region it
     * just made, so this one reads the inserted row.
     */
    const createRegion = useCallback(async (
        name: string, country?: string,
    ): Promise<number | null> => {
        try {
            const res = await fetch(`${BASE}/regions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Country matters: a region created without one used to make its
                // places invisible under any country filter.
                body: JSON.stringify({ name: name.trim(), country: country ?? '' }),
            });
            if (!res.ok) throw new Error('Could not add that region');
            const row = await res.json();
            await refresh();
            return typeof row?.id === 'number' ? row.id : null;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not add that region');
            return null;
        }
    }, [refresh]);

    /**
     * Create a category and hand back its key.
     * The key is derived once and never changes afterwards, so renaming the
     * label later cannot orphan the places already filed under it.
     */
    const createCategory = useCallback(async (label: string): Promise<string | null> => {
        const clean = label.trim();
        if (!clean) return null;
        const key = normalizeCategoryKey(clean);
        try {
            const res = await fetch(`${BASE}/categories`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    key,
                    label: titleCase(clean),
                    color: '#6b7280',
                    icon: '●',
                    sort_order: 999,
                }),
            });
            // A duplicate key just means it already exists, which is fine.
            if (!res.ok && res.status !== 500) throw new Error('Could not add that category');
            await refresh();
            return key;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not add that category');
            return null;
        }
    }, [refresh]);

    /** Delete a whole selection in one request rather than N. */
    const removeMany = useCallback((resource: Resource, ids: number[]) => run(
        () => fetch(`${BASE}/${resource}?ids=${ids.join(',')}`, { method: 'DELETE' }),
    ), [run]);

    /** Lookup used everywhere a stop needs to resolve to its pinned place. */
    const placeById = useMemo(() => {
        const map = new Map<number, Place>();
        for (const place of data?.places ?? []) map.set(place.id, place);
        return map;
    }, [data]);

    const regionById = useMemo(() => {
        const map = new Map<number, string>();
        for (const region of data?.regions ?? []) map.set(region.id, region.name);
        return map;
    }, [data]);

    /** Place ids already scheduled somewhere, so the library can mark them. */
    const scheduledPlaceIds = useMemo(() => {
        const set = new Set<number>();
        for (const day of data?.days ?? []) {
            for (const stop of day.stops) if (stop.place_id != null) set.add(stop.place_id);
            if (day.base_place_id != null) set.add(day.base_place_id);
        }
        return set;
    }, [data]);

    return {
        data, loading, error, saving: busy > 0,
        refresh, create, update, reorder, remove, removeMany, createRegion, createCategory,
        placeById, regionById, scheduledPlaceIds,
        clearError: () => setError(''),
    };
}

export type HoneymoonApi = ReturnType<typeof useHoneymoon>;
