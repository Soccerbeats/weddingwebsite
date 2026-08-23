'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeCategoryKey, setCategoryRegistry, titleCase } from '@/lib/honeymoon';
import type { Day, HoneymoonPayload, Place } from '@/lib/honeymoon';

/** The last delete, and how to put it back. */
export interface UndoOffer {
    label: string;
    restore: () => Promise<void>;
}

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

    /**
     * Write the stays shortlist's ranking — first id is rank 1.
     *
     * Its own call rather than `reorder`, because ranking writes `rank` and
     * reordering writes `sort_order`: one is "this is my favourite hotel", the
     * other is the order of the whole place library, and conflating them would
     * reshuffle two hundred places to move one stay up a list.
     */
    const rankPlaces = useCallback((ids: number[]) => run(
        () => fetch(`${BASE}/places`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rank: ids }),
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

    /* ---------------------------------------------------------------- */
    /* Undo                                                              */
    /* ---------------------------------------------------------------- */

    /**
     * Writes that don't refetch.
     *
     * Restoring a day means three inserts that are meaningless apart; refetching
     * between them would paint a day with no stops and then a day with half of
     * them. The caller refreshes once at the end.
     */
    const quietPost = useCallback(async (resource: Resource, body: unknown) => {
        const res = await fetch(`${BASE}/${resource}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('Restore failed');
        return res.json();
    }, []);

    const quietPatch = useCallback(async (resource: Resource, body: unknown) => {
        await fetch(`${BASE}/${resource}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    }, []);

    /**
     * Insert a row and hand it back, without refetching.
     *
     * `create` only reports success, but anything that has to attach children to
     * what it just made — duplicating a day, restoring one — needs the new id.
     */
    const createRow = useCallback(async (
        resource: Resource, body: Record<string, unknown>,
    ): Promise<{ id: number } | null> => {
        try {
            return await quietPost(resource, body);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Save failed');
            return null;
        }
    }, [quietPost]);

    /** Insert many rows in one transaction, without refetching. */
    const createMany = useCallback(async (
        resource: Resource, rows: Record<string, unknown>[],
    ): Promise<boolean> => {
        if (!rows.length) return true;
        try {
            await quietPost(resource, rows);
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Save failed');
            return false;
        }
    }, [quietPost]);

    const [undo, setUndo] = useState<UndoOffer | null>(null);
    const clearUndo = useCallback(() => setUndo(null), []);

    /**
     * Delete something, and offer to put it back.
     *
     * Every delete in this portal used to be final behind a `confirm()`, which
     * is the wrong trade: the dialog interrupts you every time to guard against
     * the once you were wrong, and when you *are* wrong it doesn't help at all.
     * An undo costs nothing when you meant it and saves the evening when you
     * didn't. It holds exactly the last delete, in memory, until the toast goes.
     */
    const withUndo = useCallback(async (
        label: string,
        remove: () => Promise<boolean>,
        restore: () => Promise<void>,
    ) => {
        const ok = await remove();
        if (!ok) return false;
        setUndo({
            label,
            restore: async () => {
                setUndo(null);
                try {
                    await restore();
                } catch (e) {
                    setError(e instanceof Error ? e.message : 'Could not undo that');
                }
                await refresh();
            },
        });
        return true;
    }, [refresh]);

    /**
     * Delete places and be able to put them back — stops and all.
     *
     * `place_id` is `ON DELETE SET NULL`, so deleting a scheduled place demotes
     * its stops to plain text. Restoring the place would otherwise leave those
     * stops orphaned forever, which is a quieter kind of data loss than the one
     * you just undid. So the old links are captured first and re-pointed at the
     * new rows, and the same is done for any day whose base it was.
     */
    const removePlaces = useCallback(async (places: Place[]) => {
        if (!places.length) return false;
        const ids = places.map((p) => p.id);
        const idSet = new Set(ids);
        const days = data?.days ?? [];
        const stopsByPlace = new Map<number, number[]>();
        for (const day of days) {
            for (const stop of day.stops) {
                if (stop.place_id != null && idSet.has(stop.place_id)) {
                    const list = stopsByPlace.get(stop.place_id) ?? [];
                    list.push(stop.id);
                    stopsByPlace.set(stop.place_id, list);
                }
            }
        }
        const basesByPlace = new Map<number, number[]>();
        for (const day of days) {
            if (day.base_place_id != null && idSet.has(day.base_place_id)) {
                const list = basesByPlace.get(day.base_place_id) ?? [];
                list.push(day.id);
                basesByPlace.set(day.base_place_id, list);
            }
        }

        const label = places.length === 1
            ? `Deleted ${places[0].name}`
            : `Deleted ${places.length} places`;

        return withUndo(
            label,
            () => (ids.length === 1
                ? remove('places', ids[0])
                : removeMany('places', ids)),
            async () => {
                const payload = places.map(({ id, ...rest }) => { void id; return rest; });
                const body = await quietPost('places', payload);
                const created: { id: number }[] = body?.created ?? [];
                for (const [index, place] of places.entries()) {
                    const newId = created[index]?.id;
                    if (newId == null) continue;
                    for (const stopId of stopsByPlace.get(place.id) ?? []) {
                        await quietPatch('stops', { id: stopId, place_id: newId });
                    }
                    for (const dayId of basesByPlace.get(place.id) ?? []) {
                        await quietPatch('days', { id: dayId, base_place_id: newId });
                    }
                }
            },
        );
    }, [data?.days, withUndo, remove, removeMany, quietPost, quietPatch]);

    /** Delete a day, and be able to put it back with its stops and travel legs. */
    const removeDay = useCallback(async (day: Day) => withUndo(
        `Deleted day ${day.day_number}`,
        () => remove('days', day.id),
        async () => {
            const created = await quietPost('days', {
                day_number: day.day_number,
                title: day.title ?? '',
                base_place_id: day.base_place_id,
                notes: day.notes ?? '',
            });
            const dayId = created?.id;
            if (dayId == null) return;
            if (day.stops.length) {
                await quietPost('stops', day.stops.map(({ id, day_id, ...rest }) => {
                    void id; void day_id;
                    return { ...rest, day_id: dayId };
                }));
            }
            if (day.travel.length) {
                await quietPost('travel', day.travel.map(({ id, day_id, ...rest }) => {
                    void id; void day_id;
                    return { ...rest, day_id: dayId };
                }));
            }
        },
    ), [withUndo, remove, quietPost]);

    /** Delete one ordinary row — a stop, a note, a to-do — reversibly. */
    const removeRow = useCallback(async (
        resource: Resource, row: { id: number }, label: string,
    ) => withUndo(
        label,
        () => remove(resource, row.id),
        async () => {
            const { id, ...rest } = row;
            void id;
            await quietPost(resource, rest);
        },
    ), [withUndo, remove, quietPost]);

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

    /** Which day each scheduled place is on, so a badge can say more than "scheduled". */
    const dayOfPlace = useMemo(() => {
        const map = new Map<number, number[]>();
        const note = (placeId: number, dayNumber: number) => {
            const list = map.get(placeId) ?? [];
            if (!list.includes(dayNumber)) list.push(dayNumber);
            map.set(placeId, list);
        };
        for (const day of data?.days ?? []) {
            for (const stop of day.stops) if (stop.place_id != null) note(stop.place_id, day.day_number);
            if (day.base_place_id != null) note(day.base_place_id, day.day_number);
        }
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
        refresh, create, update, reorder, rankPlaces, remove, removeMany, createRegion, createCategory,
        removePlaces, removeDay, removeRow, undo, clearUndo, createRow, createMany,
        placeById, regionById, scheduledPlaceIds, dayOfPlace,
        clearError: () => setError(''),
    };
}

export type HoneymoonApi = ReturnType<typeof useHoneymoon>;
