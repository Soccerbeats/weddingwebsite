'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isDemoClient } from '@/lib/demoClient';
import { normalizeCategoryKey, setCategoryRegistry, titleCase } from '@/lib/honeymoon';
import type { Day, HoneymoonPayload, Place } from '@/lib/honeymoon';

/** The last delete, and how to put it back. */
export interface UndoOffer {
    label: string;
    restore: () => Promise<void>;
}

export type Resource =
    'categories' | 'regions' | 'places' | 'days' | 'stops' | 'travel' | 'notes' | 'todos' | 'trip'
    | 'bookings' | 'documents' | 'comments' | 'views' | 'rates' | 'journeys';

/** How many undos are kept. Ten is about as far back as anyone remembers. */
const UNDO_DEPTH = 10;

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
    /**
     * The payload as it is right now, for the optimistic path.
     *
     * A ref as well as state because an optimistic write has to read the current
     * payload, apply its change and keep the original to roll back to — and two
     * taps in the same tick would both read the same stale closure otherwise.
     */
    const dataRef = useRef<HoneymoonPayload | null>(null);
    const commit = useCallback((next: HoneymoonPayload | null) => {
        dataRef.current = next;
        setData(next);
    }, []);

    /**
     * A save that came back 401.
     *
     * The admin session lasts two hours and planning sessions run longer, so
     * this is a normal end to an afternoon rather than an error. The request is
     * kept so signing in again can finish it instead of asking you to remember
     * what you were doing.
     */
    const [sessionExpired, setSessionExpired] = useState(false);
    const pending = useRef<(() => Promise<unknown>) | null>(null);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch(BASE, { cache: 'no-store' });
            if (!res.ok) throw new Error('Failed to load honeymoon data');
            const payload: HoneymoonPayload = await res.json();
            // Publish before the state update so the first render that sees the
            // new places already resolves their colours and labels correctly.
            setCategoryRegistry(payload.categories);
            dataRef.current = payload;
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
            if (res.status === 401) {
                // Hold the request, not just the news of it: signing back in
                // replays this exact call, so nothing typed is retyped.
                pending.current = fn;
                setSessionExpired(true);
                return false;
            }
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || 'Save failed');
            }
            /*
             * On the demo instance, don't refetch.
             *
             * The write was dropped by the middleware, so a refetch would return
             * the seeded data and snap every controlled field — a status
             * dropdown, a rating, a toggle — straight back to where it was, half
             * a second after someone changed it. Skipping it leaves what they
             * did on screen until they navigate or refresh, which is the point
             * of the demo.
             *
             * Nothing else changes: the write still went nowhere, and the next
             * page load is pristine.
             */
            if (!(await isDemoClient())) await refresh();
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
     * A write you see land before the server has heard about it.
     *
     * For the hot paths only — a rating pill, a done tick, a stop's time, a drag
     * — where the round trip is a whole-payload refetch and nine queries deep,
     * and the honest-but-slow model is the difference between snappy and
     * sluggish on a phone. `apply` edits the payload locally; the PATCH goes out
     * behind it; a quiet refetch reconciles; a failure puts the old payload
     * back and says so. Everything else still takes the plain path, because a
     * rollback is only cheap when the change was small.
     */
    const optimistic = useCallback(async (
        resource: Resource,
        // Unknown rather than a record: a reorder's body is an array of ids, and
        // the route reads the shape to decide what the write means.
        body: unknown,
        apply: (payload: HoneymoonPayload) => HoneymoonPayload,
    ): Promise<boolean> => {
        const before = dataRef.current;
        if (before) commit(apply(before));
        try {
            const res = await fetch(`${BASE}/${resource}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.status === 401) {
                if (before) commit(before);
                pending.current = () => fetch(`${BASE}/${resource}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                setSessionExpired(true);
                return false;
            }
            if (!res.ok) throw new Error('Save failed');
            // The demo drops writes, so a refetch there would snap the pill back.
            if (!(await isDemoClient())) await refresh();
            return true;
        } catch (e) {
            if (before) commit(before);
            setError(e instanceof Error ? e.message : 'Save failed');
            return false;
        }
    }, [commit, refresh]);

    /*
     * The hot paths, each as one call that patches locally and saves behind.
     *
     * Named per row type rather than one generic helper taking a mutator,
     * because the mutator is the part that is easy to get subtly wrong — a stop
     * lives inside a day, a rating has to survive a refetch — and there is
     * exactly one right version of each.
     */
    const patchPlace = useCallback((id: number, fields: Record<string, unknown>) => optimistic(
        'places', { id, ...fields },
        (payload) => ({
            ...payload,
            places: payload.places.map(
                (place) => (place.id === id ? { ...place, ...fields } as Place : place),
            ),
        }),
    ), [optimistic]);

    const patchStop = useCallback((id: number, fields: Record<string, unknown>) => optimistic(
        'stops', { id, ...fields },
        (payload) => ({
            ...payload,
            days: payload.days.map((day) => ({
                ...day,
                stops: day.stops.map((stop) => (stop.id === id ? { ...stop, ...fields } : stop)),
            })),
        }),
    ), [optimistic]);

    const patchLeg = useCallback((id: number, fields: Record<string, unknown>) => optimistic(
        'travel', { id, ...fields },
        (payload) => ({
            ...payload,
            days: payload.days.map((day) => ({
                ...day,
                travel: day.travel.map((leg) => (leg.id === id ? { ...leg, ...fields } : leg)),
            })),
        }),
    ), [optimistic]);

    const patchTodo = useCallback((id: number, fields: Record<string, unknown>) => optimistic(
        'todos', { id, ...fields },
        (payload) => ({
            ...payload,
            todos: payload.todos.map((todo) => (todo.id === id ? { ...todo, ...fields } : todo)),
        }),
    ), [optimistic]);

    /**
     * A drop that stays where you dropped it.
     *
     * Reordering wrote `sort_order` and then waited for a nine-query refetch, so
     * a dragged stop snapped back to its old place for a beat before landing.
     * The local reorder is the same rule the server applies — array index
     * becomes `sort_order` — so the reconciliation is a no-op when it lands.
     */
    const reorderStops = useCallback((dayId: number, ids: number[]) => optimistic(
        'stops', ids.map((id) => ({ id })),
        (payload) => ({
            ...payload,
            days: payload.days.map((day) => (day.id !== dayId ? day : {
                ...day,
                stops: ids
                    .map((id, index) => {
                        const stop = day.stops.find((s) => s.id === id);
                        return stop ? { ...stop, sort_order: index } : null;
                    })
                    .filter((stop): stop is NonNullable<typeof stop> => stop != null),
            })),
        }),
    ), [optimistic]);

    /**
     * Many rows, each with its own fields, in one request.
     *
     * `update` with `{ ids }` writes the same value to every row, which is the
     * wrong shape for applying a range of days, filling in twenty stays'
     * coordinates or timing each stop of a day — those were one request and one
     * refetch per row.
     */
    const updateMany = useCallback((
        resource: Resource, rows: Record<string, unknown>[],
    ) => run(
        () => fetch(`${BASE}/${resource}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows }),
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
            // Already a row? Then it is simply selected — no request at all.
            if (data?.categories.some((c) => c.key === key)) return key;
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
            // 409 is the API saying the key exists (a race with another tab),
            // which is fine. Anything else is a real failure and says so —
            // this used to treat every 500 as "duplicate, carry on".
            if (!res.ok && res.status !== 409) throw new Error('Could not add that category');
            await refresh();
            return key;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not add that category');
            return null;
        }
    }, [refresh, data?.categories]);

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
        const res = await fetch(`${BASE}/${resource}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        // A failed re-link during an undo is data loss that nothing else would
        // report — surface it rather than swallowing the status.
        if (!res.ok) throw new Error('Restore did not finish — a link could not be put back');
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

    /*
     * A stack, not a slot.
     *
     * One undo was the right first move — it made deletes reversible without a
     * confirm on every one — but the moment you trust it you reach for it twice.
     * The most recent offer is the one the toast shows; the rest stay reachable
     * with ⌘Z until they are used or the stack rolls past them.
     */
    const [undos, setUndos] = useState<UndoOffer[]>([]);
    const undo = undos.length ? undos[undos.length - 1] : null;
    const clearUndo = useCallback(() => setUndos((list) => list.slice(0, -1)), []);
    const clearUndoStack = useCallback(() => setUndos([]), []);

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
        const offer: UndoOffer = {
            label,
            restore: async () => {
                // Drop this offer only — anything undone before it stays undoable.
                setUndos((list) => list.filter((entry) => entry !== offer));
                try {
                    await restore();
                } catch (e) {
                    setError(e instanceof Error ? e.message : 'Could not undo that');
                }
                await refresh();
            },
        };
        setUndos((list) => [...list, offer].slice(-UNDO_DEPTH));
        return true;
    }, [refresh]);

    /** ⌘Z: put back the most recent thing, whatever tab it happened on. */
    const undoLast = useCallback(async () => {
        const top = undos[undos.length - 1];
        if (top) await top.restore();
    }, [undos]);

    /**
     * Sign in again and finish the save that was refused.
     *
     * Returns false on a wrong password so the modal can say so and stay open.
     */
    const reauthenticate = useCallback(async (password: string): Promise<boolean> => {
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });
            if (!res.ok) return false;
            setSessionExpired(false);
            setError('');
            const retry = pending.current;
            pending.current = null;
            if (retry) await retry();
            await refresh();
            return true;
        } catch {
            return false;
        }
    }, [refresh]);

    /** Give up on the refused save and stop asking. */
    const dismissSessionExpiry = useCallback(() => {
        pending.current = null;
        setSessionExpired(false);
    }, []);

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

    /**
     * Delete a day, and be able to put it back with its stops and travel legs.
     *
     * The remaining days are renumbered to close the gap, exactly as dragging
     * one does — otherwise deleting day 2 of 4 left days 1, 3, 4 with day 3
     * still on the third date and the calendar one day short. Undo re-inserts
     * the day at its old position by reordering again.
     */
    const removeDay = useCallback(async (day: Day) => withUndo(
        `Deleted day ${day.day_number}`,
        async () => {
            const ok = await remove('days', day.id);
            if (!ok) return false;
            const rest = (data?.days ?? []).filter((d) => d.id !== day.id).map((d) => d.id);
            if (rest.length) await reorder('days', rest);
            return true;
        },
        async () => {
            // Append, then splice back into place: day_number is UNIQUE and the
            // old number now belongs to a neighbour.
            const created = await quietPost('days', {
                title: day.title ?? '',
                base_place_id: day.base_place_id,
                notes: day.notes ?? '',
            });
            const dayId = created?.id;
            if (dayId == null) return;
            const ids = (data?.days ?? []).filter((d) => d.id !== day.id).map((d) => d.id);
            ids.splice(Math.max(0, day.day_number - 1), 0, dayId);
            await quietPatch('days', ids.map((id) => ({ id })));
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
    ), [withUndo, remove, reorder, quietPost, quietPatch, data?.days]);

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
        refresh, create, update, updateMany, optimistic, reorder, rankPlaces, remove, removeMany,
        patchPlace, patchStop, patchLeg, patchTodo, reorderStops,
        createRegion, createCategory,
        removePlaces, removeDay, removeRow, undo, undos, clearUndo, clearUndoStack, undoLast,
        createRow, createMany,
        sessionExpired, reauthenticate, dismissSessionExpiry,
        placeById, regionById, scheduledPlaceIds, dayOfPlace,
        clearError: () => setError(''),
    };
}

export type HoneymoonApi = ReturnType<typeof useHoneymoon>;
